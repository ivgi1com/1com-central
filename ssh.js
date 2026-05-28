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

function parseSipPeers(stdout) {
  const n = parseInt(stdout.trim(), 10);
  return isNaN(n) ? 0 : n;
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

function isAsteriskRunning(stdout) {
  const s = stdout.toLowerCase().trim();
  return s.length > 0 && !s.includes('not running') && /asterisk/i.test(stdout);
}

const CMDS = [
  'asterisk -rx "core show channels count" 2>/dev/null | grep -oP "^\\d+" || echo 0',
  'asterisk -rx "sip show peers" | grep -c "^[a-zA-Z]" || echo 0',
  'cat /proc/loadavg && uptime -p',
  'asterisk -rx "core show version" 2>/dev/null | head -1 || echo "not running"',
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
      load_avg: null,
      uptime: null,
      asterisk_version: null,
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
          result.sip_peers = parseSipPeers(outputs[1] || '0');
          result.load_avg = parseLoadAvg(loadOut);
          result.uptime = parseUptime(loadOut);
          result.asterisk_version = parseVersion(versionOut);
          result.status = isAsteriskRunning(versionOut) ? 'ok' : 'asterisk_down';
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

module.exports = { pollNode, parseActiveCalls, parseSipPeers, parseLoadAvg, parseUptime, parseVersion, isAsteriskRunning };
