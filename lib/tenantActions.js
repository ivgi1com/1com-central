'use strict';
const { runCommand } = require('../ssh');
const auditLog = require('./auditLog');

const V = {
  tenant:  /^[a-zA-Z0-9_.-]{1,64}$/,
  queue:   /^\d{1,10}$/,
  keyword: /^[a-zA-Z0-9@._:/\- ]{1,100}$/,
  email:   /^[a-zA-Z0-9@._+\-]{1,200}$/,
  ext:     /^\d{1,10}$/,
  year:    /^\d{4}$/,
  month:   /^(0?[1-9]|1[0-2])$/,
  number:  /^\d{1,20}$/,
};

// tenantScoped: false means the action runs node-wide; no tenant existence check
const ACTIONS = new Map([

  // ── SIP & Extensions ───────────────────────────────────────────────────────
  ['peers', {
    label: 'SIP Peers',
    category: 'SIP & Extensions',
    description: 'Show SIP peer status for this tenant',
    params: [],
    destructive: false,
    cmd: (t) => `asterisk -rx 'sip show peers' 2>/dev/null | grep -i '${t}'`,
  }],
  ['blf', {
    label: 'BLF State',
    category: 'SIP & Extensions',
    description: 'Show BLF/presence subscription state for tenant extensions',
    params: [],
    destructive: false,
    cmd: (t) => `asterisk -rx 'sip show subscriptions' 2>/dev/null | grep -i '${t}' | awk '{print $2,"| "$4,"state is "$5,"| Subscribe",$8}' | sed 's/state/BLF state/;s/^/| EXT:/;s/Idle/NOT_INUSE/'`,
  }],
  ['devstate', {
    label: 'Device State',
    category: 'SIP & Extensions',
    description: 'Show custom device state (realtime) for tenant extensions',
    params: [],
    destructive: false,
    cmd: (t) => `asterisk -rx 'devstate list' 2>/dev/null | grep -i '${t}' | awk '{print $3,$4,$5}' | sed 's/^.Custom:/| /g;s/..State/ | Extension Is /g'`,
  }],
  ['channels', {
    label: 'Active Channels',
    category: 'SIP & Extensions',
    description: 'Show active channel count and channel list for this tenant',
    params: [],
    destructive: false,
    cmd: (t) => `echo "Active channels:" && asterisk -rx 'core show channels concise' 2>/dev/null | grep -ic '${t}' && echo "---" && asterisk -rx 'core show channels concise' 2>/dev/null | grep -i '${t}' && echo "---" && asterisk -rx 'core show channels verbose' 2>/dev/null | grep -E 'active calls|active channels'`,
  }],

  // ── Unreachable ────────────────────────────────────────────────────────────
  ['unreachable', {
    label: 'Unreachable Now',
    category: 'Unreachable',
    description: 'Show recent unreachable/reachable events for this tenant',
    params: [],
    destructive: false,
    cmd: (t) => `grep -i '${t}' /var/log/asterisk/full 2>/dev/null | grep -i 'chable' | awk '{print $1,$2,$6,$9}' | sed 's/^\\[/| /;s/\\]../ | /' | tail -200`,
  }],
  ['unreachable_history', {
    label: 'Unreachable History',
    category: 'Unreachable',
    description: 'Unreachable events across last 4 days (all rotated logs)',
    params: [],
    destructive: false,
    cmd: (t) => `for f in /var/log/asterisk/full /var/log/asterisk/full.0 /var/log/asterisk/full.1 /var/log/asterisk/full.2; do [ -f "$f" ] && echo "=== $f ===" && grep -i '${t}' "$f" 2>/dev/null | grep -i 'chable' | awk '{print $1,$2,$6,$9}' | sed 's/^\\[/| /;s/\\]../ | /'; done`,
  }],
  ['unreachable_summary', {
    label: 'Unreachable Summary',
    category: 'Unreachable',
    description: 'Count of unreachable events per extension, sorted by frequency',
    params: [],
    destructive: false,
    cmd: (t) => `grep -i 'chable' /var/log/asterisk/full 2>/dev/null | grep -i '${t}' | sed 's/(.*/ /;s/Last.*//' | awk '{print $6,$9}' | grep -v Reachable | sort | uniq -c | awk '{print "| ext",$2,"was",$3,$1,"times |"}' | sort -rn`,
  }],

  // ── Queues ─────────────────────────────────────────────────────────────────
  ['queue', {
    label: 'Queue Status',
    category: 'Queues',
    description: 'Show detailed queue status: members, ringing, waiting, paused',
    params: [{ name: 'queue', label: 'Queue Number', validate: 'queue', placeholder: 'e.g. 100' }],
    destructive: false,
    cmd: (t, p) => `asterisk -rx 'queue show ${p.queue}' 2>/dev/null`,
  }],
  ['all_queues', {
    label: 'All Queues',
    category: 'Queues',
    description: 'Summary of all queues on this node',
    params: [],
    destructive: false,
    tenantScoped: false,
    cmd: () => `asterisk -rx 'queue show' 2>/dev/null | grep strategy | awk '{print $1,$2,$3,$4,$7,$8,$10,$11,$12,$13}' | sort -r -k3`,
  }],

  // ── Logs ───────────────────────────────────────────────────────────────────
  ['log_search', {
    label: 'Search Asterisk Log',
    category: 'Logs',
    description: 'Search current Asterisk log (scoped to tenant + keyword)',
    params: [{ name: 'keyword', label: 'Keyword', validate: 'keyword', placeholder: 'e.g. registration' }],
    destructive: false,
    cmd: (t, p) => `grep -i '${t}' /var/log/asterisk/full 2>/dev/null | grep -i '${p.keyword}' | tail -500`,
  }],
  ['log_search_history', {
    label: 'Search Log History',
    category: 'Logs',
    description: 'Search all rotated Asterisk logs for tenant + keyword',
    params: [{ name: 'keyword', label: 'Keyword', validate: 'keyword', placeholder: 'e.g. registration' }],
    destructive: false,
    cmd: (t, p) => `grep -i '${t}' /var/log/asterisk/full* 2>/dev/null | grep -i '${p.keyword}' | tail -500`,
  }],
  ['monit_log', {
    label: 'Monit Log',
    category: 'Logs',
    description: 'Last 50 lines of the Monit service monitor log',
    params: [],
    destructive: false,
    tenantScoped: false,
    cmd: () => `tail -50 /var/log/monit 2>/dev/null`,
  }],

  // ── Server ─────────────────────────────────────────────────────────────────
  ['server_status', {
    label: 'Server Status',
    category: 'Server',
    description: 'Asterisk version, uptime, active calls, inter-node connections',
    params: [],
    destructive: false,
    tenantScoped: false,
    cmd: () => [
      `asterisk -rx 'core show version' 2>/dev/null`,
      `echo "---"`,
      `uptime`,
      `echo "---"`,
      `asterisk -rx 'core show uptime' 2>/dev/null`,
      `echo "---"`,
      `asterisk -rx 'core show channels verbose' 2>/dev/null | grep -E 'active calls|active channels'`,
      `echo "---"`,
      `asterisk -rx 'sip show peers' 2>/dev/null | grep pbx | awk '{print $1,$2,$6,$7,$8,$9}'`,
    ].join(' && '),
  }],
  ['verbose', {
    label: 'Verbose Channels',
    category: 'Server',
    description: 'Full active channel listing for the entire node',
    params: [],
    destructive: false,
    tenantScoped: false,
    cmd: () => `asterisk -rx 'core show channels verbose' 2>/dev/null`,
  }],
  ['channel_stats', {
    label: 'Channel Stats',
    category: 'Server',
    description: 'Global SIP channel statistics sorted by traffic',
    params: [],
    destructive: false,
    tenantScoped: false,
    cmd: () => `asterisk -rx 'sip show channelstats' 2>/dev/null | sort -rk3`,
  }],

  // ── Email ──────────────────────────────────────────────────────────────────
  ['email_search', {
    label: 'Search Email Log',
    category: 'Email',
    description: "Search today's maillog for an email address",
    params: [{ name: 'email', label: 'Email Address', validate: 'email', placeholder: 'user@example.com' }],
    destructive: false,
    tenantScoped: false,
    cmd: (t, p) => `grep -i '${p.email}' /var/log/maillog 2>/dev/null | grep -v from | awk '{print $1,$2,$3,$4,$7,$8,$9,$12,$13,$14,$15,$16}' | tail -200`,
  }],
  ['email_search_history', {
    label: 'Email Log History',
    category: 'Email',
    description: 'Search all rotated maillogs for an email address',
    params: [{ name: 'email', label: 'Email Address', validate: 'email', placeholder: 'user@example.com' }],
    destructive: false,
    tenantScoped: false,
    cmd: (t, p) => `grep -i '${p.email}' /var/log/maillog* 2>/dev/null | grep -v from | awk '{print $1,$2,$3,$4,$7,$8,$9,$12,$13,$14,$15,$16}' | tail -200`,
  }],

  // ── Kamailio ───────────────────────────────────────────────────────────────
  ['kamailio_search', {
    label: 'Kamailio Lookup',
    category: 'Kamailio',
    description: 'Search Kamailio registrations for this tenant',
    params: [],
    destructive: false,
    cmd: (t) => `echo "/usr/local/sbin/kam_checkuser %${t}%" | ssh -T -o ConnectTimeout=10 -o StrictHostKeyChecking=no 10.10.9.68 2>/dev/null | grep -i '${t}' | sort | awk '{print $1,$2}' | sed 's/^/| /;s/sip:/ | IP: /;s/;transport=/:/'`,
  }],

  // ── Recordings ─────────────────────────────────────────────────────────────
  ['recordings_search', {
    label: 'Find Recordings',
    category: 'Recordings',
    description: 'Find recordings for this tenant by phone number and date',
    params: [
      { name: 'number', label: 'Phone Number', validate: 'number', placeholder: 'e.g. 0521234567' },
      { name: 'year',   label: 'Year',         validate: 'year',   placeholder: '2024' },
      { name: 'month',  label: 'Month',        validate: 'month',  placeholder: '5' },
    ],
    destructive: false,
    cmd: (t, p) => `echo "find /home/nfs/recordings/mirta/${t}/${p.year}/${p.month} -name '*${p.number}*'" | ssh -T -o ConnectTimeout=10 -o StrictHostKeyChecking=no support@82.166.96.229 2>/dev/null | sed 's|/home/nfs/recordings/mirta/||;s/-/ /g;s/_/ /g'`,
  }],

  // ── Admin Actions (destructive) ────────────────────────────────────────────
  ['change_ext_state', {
    label: 'Set Extension NOT_INUSE',
    category: 'Admin Actions',
    description: 'Force an extension device state to NOT_INUSE (clears stuck calls)',
    params: [{ name: 'ext', label: 'Extension Number', validate: 'ext', placeholder: 'e.g. 101' }],
    destructive: true,
    cmd: (t, p) => `asterisk -rx 'devstate change Custom:${t}_${p.ext} NOT_INUSE' 2>/dev/null`,
  }],
  ['reset_queues', {
    label: 'Reset All Queues',
    category: 'Admin Actions',
    description: 'Reset all queues on this node — clears all members and waiting callers',
    params: [],
    destructive: true,
    tenantScoped: false,
    cmd: () => `/usr/local/bin/reset_queues 2>/dev/null && echo "Queues reset."`,
  }],
  ['clear_cache', {
    label: 'Clear OS Cache',
    category: 'Admin Actions',
    description: 'Sync filesystem and drop Linux page cache (safe)',
    params: [],
    destructive: true,
    tenantScoped: false,
    cmd: () => `sync && echo 1 > /proc/sys/vm/drop_caches && echo "Cache cleared."`,
  }],
]);

function validateParams(action, params) {
  for (const p of (action.params || [])) {
    const val = params[p.name];
    if (!val) return `Missing required param: ${p.name}`;
    if (p.validate && V[p.validate] && !V[p.validate].test(val)) {
      return `Invalid value for ${p.label || p.name}`;
    }
  }
  return null;
}

async function executeAction(node, tenant, actionName, params = {}, user = 'admin') {
  const action = ACTIONS.get(actionName);
  if (!action) return { success: false, error: 'Unknown action' };

  if (!V.tenant.test(tenant)) return { success: false, error: 'Invalid tenant name' };

  const paramErr = validateParams(action, params);
  if (paramErr) return { success: false, error: paramErr };

  const cmd = action.cmd(tenant, params);
  const start = Date.now();
  const { stdout, stderr, exitCode } = await runCommand(node, cmd, 30000);
  const durationMs = Date.now() - start;

  auditLog.log({ user, nodeId: node.id, tenant, action: actionName, params, exitCode, durationMs });

  return {
    success: exitCode !== 124 && !stderr.includes('timeout'),
    node: node.name,
    tenant,
    action: actionName,
    stdout: stdout.trim(),
    stderr: stderr.trim(),
    exitCode,
    durationMs,
  };
}

module.exports = { ACTIONS, executeAction, V };
