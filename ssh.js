const { Client } = require('ssh2');
const fs = require('fs');

let _privateKey = null;
function getPrivateKey() {
  if (_privateKey) return _privateKey;
  const keyPath = process.env.SSH_KEY_PATH || '/root/.ssh/id_rsa';
  try {
    _privateKey = fs.readFileSync(keyPath);
    return _privateKey;
  } catch {
    return null;
  }
}

function parseActiveCalls(stdout) {
  const n = parseInt(stdout.trim(), 10);
  return isNaN(n) ? 0 : n;
}

function parseSipDetail(stdout) {
  const countMatch = stdout.match(/^(\d+)\s+sip peers/im);
  const sip_peers = countMatch ? parseInt(countMatch[1], 10) : 0;
  const tenantSet = new Set();
  for (const m of stdout.matchAll(/^(\d+)[-_]([^\s/]+)\//gm)) {
    tenantSet.add(m[2]);
  }
  return { sip_peers, tenants: [...tenantSet].sort() };
}

function parseLoadAvg(stdout) {
  const trimmed = stdout.trim();
  if (!trimmed) return '0.00';
  return trimmed.split(/\s+/)[0];
}

function parseUptime(stdout) {
  const lines = stdout.trim().split('\n');
  return lines[1] || '';
}

function parseVersion(stdout) {
  const match = stdout.match(/Asterisk\s+([\d.]+)/i);
  return match ? match[1] : null;
}

function parseMemory(stdout) {
  const parts = stdout.trim().split(/\s+/);
  if (parts.length < 7 || parts[0] !== 'Mem:') return { mem_total_mb: null, mem_used_mb: null, mem_avail_mb: null };
  const total = parseInt(parts[1], 10);
  const used = parseInt(parts[2], 10);
  const avail = parseInt(parts[6], 10);
  if (isNaN(total) || isNaN(used) || isNaN(avail)) return { mem_total_mb: null, mem_used_mb: null, mem_avail_mb: null };
  return { mem_total_mb: total, mem_used_mb: used, mem_avail_mb: avail };
}

function parseCpu(stdout) {
  const match = stdout.match(/(\d+(?:\.\d+))\s*id/);
  if (!match) return null;
  const idle = parseFloat(match[1]);
  return Math.round((100 - idle) * 10) / 10;
}

function parseDisk(stdout) {
  const parts = stdout.trim().split(/\s+/);
  if (parts.length < 5) return { disk_use_pct: null, disk_avail: null };
  const pctStr = parts[4];
  const pct = parseInt(pctStr, 10);
  if (isNaN(pct)) return { disk_use_pct: null, disk_avail: null };
  return { disk_use_pct: pct, disk_avail: parts[3] };
}

function isAsteriskRunning(stdout) {
  const s = stdout.toLowerCase().trim();
  return s.length > 0 && !s.includes('not running') && /asterisk/i.test(stdout);
}

const CMDS = [
  'asterisk -rx "core show channels count" 2>/dev/null | grep -oP "^\\d+" || echo 0',
  'asterisk -rx "sip show peers" 2>/dev/null || echo ""',
  'cat /proc/loadavg && uptime -p',
  'asterisk -rx "core show version" 2>/dev/null | head -1 || echo "not running"',
  'free -m | grep "^Mem:"',
  'top -bn1 2>/dev/null | grep -E "^[%]?Cpu"',
  'df -h / | tail -1',
];

function pollNode(node) {
  return new Promise((resolve) => {
    const result = {
      id: node.id,
      name: node.name,
      host: node.host,
      status: 'unreachable',
      active_calls: 0,
      sip_peers: 0,
      tenants: [],
      load_avg: null,
      uptime: null,
      asterisk_version: null,
      mem_total_mb: null,
      mem_used_mb: null,
      mem_avail_mb: null,
      cpu_pct: null,
      disk_use_pct: null,
      disk_avail: null,
      last_updated: new Date().toISOString(),
      error: null,
    };

    const privateKey = getPrivateKey();
    if (!privateKey) {
      result.error = 'SSH key not found or unreadable';
      return resolve(result);
    }

    const conn = new Client();

    const connectTimeout = setTimeout(() => {
      conn.destroy();
      result.error = 'connect timeout';
      resolve(result);
    }, 5000);

    conn.on('ready', () => {
      clearTimeout(connectTimeout);
      const outputs = [];
      let idx = 0;

      function runNext() {
        if (idx >= CMDS.length) {
          conn.end();
          const loadOut = outputs[2] || '';
          const versionOut = outputs[3] || '';
          result.active_calls = parseActiveCalls(outputs[0] || '0');
          Object.assign(result, parseSipDetail(outputs[1] || ''));
          result.load_avg = parseLoadAvg(loadOut);
          result.uptime = parseUptime(loadOut);
          result.asterisk_version = parseVersion(versionOut);
          result.status = isAsteriskRunning(versionOut) ? 'ok' : 'asterisk_down';
          Object.assign(result, parseMemory(outputs[4] || ''));
          result.cpu_pct = parseCpu(outputs[5] || '');
          Object.assign(result, parseDisk(outputs[6] || ''));
          return resolve(result);
        }

        conn.exec(CMDS[idx], (err, stream) => {
          if (err) {
            outputs.push('');
            idx++;
            return runNext();
          }
          let out = '';
          const cmdTimeout = setTimeout(() => stream.close(), 10000);
          stream.on('data', (d) => { out += d; });
          stream.stderr.on('data', () => {});
          stream.on('close', () => {
            clearTimeout(cmdTimeout);
            outputs.push(out);
            idx++;
            runNext();
          });
        });
      }

      runNext();
    });

    conn.on('error', (err) => {
      clearTimeout(connectTimeout);
      result.error = err.message;
      resolve(result);
    });

    conn.connect({
      host: node.host,
      username: node.ssh_user,
      privateKey,
      readyTimeout: 5000,
    });
  });
}

function runCommand(node, cmd, timeoutMs = 30000) {
  return new Promise((resolve) => {
    const out = { stdout: '', stderr: '', exitCode: -1 };
    const privateKey = getPrivateKey();
    if (!privateKey) return resolve({ ...out, stderr: 'SSH key not found' });

    const conn = new Client();
    const connTimer = setTimeout(() => {
      conn.destroy();
      resolve({ ...out, stderr: 'connect timeout' });
    }, 5000);

    conn.on('ready', () => {
      clearTimeout(connTimer);
      conn.exec(cmd, (err, stream) => {
        if (err) { conn.end(); return resolve({ ...out, stderr: err.message }); }
        const cmdTimer = setTimeout(() => {
          stream.close();
          conn.end();
          resolve({ ...out, stderr: 'command timeout', exitCode: 124 });
        }, timeoutMs);
        stream.on('data', (d) => { out.stdout += d; });
        stream.stderr.on('data', (d) => { out.stderr += d; });
        stream.on('close', (code) => {
          clearTimeout(cmdTimer);
          out.exitCode = code ?? 0;
          conn.end();
          resolve(out);
        });
      });
    });

    conn.on('error', (err) => {
      clearTimeout(connTimer);
      resolve({ ...out, stderr: err.message });
    });

    conn.connect({ host: node.host, username: node.ssh_user, privateKey, readyTimeout: 5000 });
  });
}

module.exports = { pollNode, runCommand, parseActiveCalls, parseSipDetail, parseLoadAvg, parseUptime, parseVersion, isAsteriskRunning, parseMemory, parseCpu, parseDisk };
