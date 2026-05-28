'use strict';
const db = require('../db');

const _insert = db.prepare(`
  INSERT INTO audit_log (user, node_id, tenant, action, params, exit_code, duration_ms)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

function log({ user = 'admin', nodeId, tenant = '', action, params = {}, exitCode, durationMs }) {
  try {
    _insert.run(user, nodeId, tenant, action, JSON.stringify(params), exitCode ?? null, durationMs ?? null);
  } catch (_) {}
}

module.exports = { log };
