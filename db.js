const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);

const db = new Database(path.join(dataDir, 'dashboard.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS nodes (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,
    host       TEXT NOT NULL,
    ssh_user   TEXT NOT NULL DEFAULT 'root',
    enabled    INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS audit_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    ts          TEXT NOT NULL DEFAULT (datetime('now')),
    user        TEXT NOT NULL DEFAULT 'admin',
    node_id     INTEGER NOT NULL,
    tenant      TEXT NOT NULL DEFAULT '',
    action      TEXT NOT NULL,
    params      TEXT NOT NULL DEFAULT '{}',
    exit_code   INTEGER,
    duration_ms INTEGER
  )
`);

module.exports = db;
