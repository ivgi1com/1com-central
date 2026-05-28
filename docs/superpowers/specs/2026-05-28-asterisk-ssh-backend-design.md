# Step 2: Asterisk SSH Backend — Design Spec

**Date:** 2026-05-28  
**Status:** Approved

---

## Context

Step 1 established a Sneat Bootstrap 5 dashboard shell served by Express + PM2 with ApexCharts loaded. Step 2 adds the backend that makes the dashboard live: an SSH poller that collects real-time Asterisk metrics from 50 Linux nodes and exposes them via Express API routes. The frontend polls the API every 30s and renders a status table + bar chart.

---

## Architecture & Data Flow

```
SQLite (nodes table)
  └─ id, name, host, ssh_user, enabled
       │
       ▼
Background Poller (runs every 30s in Express process)
  ├─ loads enabled nodes from DB
  ├─ SSH into all N nodes in parallel (Promise.all)
  │   └─ per node: 4 shell commands via ssh2
  │       ├─ asterisk -rx "core show channels concise"  → active calls
  │       ├─ asterisk -rx "sip show peers"              → registrations
  │       ├─ cat /proc/loadavg && uptime -p             → load/uptime
  │       └─ asterisk -rx "core show version"           → version + status
  └─ stores results in memory cache (Map keyed by node ID)
       │
       ▼
Express API
  ├─ GET /api/nodes          → returns full cache as JSON
  ├─ GET /api/nodes/:id      → single node from cache
  ├─ POST /api/nodes         → add node to DB
  ├─ DELETE /api/nodes/:id   → remove node from DB
  └─ GET /api/nodes/:id/refresh → force re-poll single node
       │
       ▼
Frontend (public/js/dashboard.js)
  ├─ polls GET /api/nodes every 30s
  ├─ renders status table (one row per node)
  └─ renders ApexCharts bar chart (active calls per node)
```

---

## File Structure

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `db.js` | SQLite init + schema |
| Create | `ssh.js` | SSH into one node, run 4 commands, return metrics object |
| Create | `poller.js` | Background interval, parallel SSH, in-memory cache |
| Create | `routes/nodes.js` | Express router for all /api/nodes routes |
| Modify | `server.js` | Mount routes, start poller, load .env |
| Create | `public/js/dashboard.js` | Fetch /api/nodes, render table + ApexCharts |
| Modify | `public/index.html` | Add dashboard.js script tag, add chart/table containers |
| Create | `.env.example` | Documents SSH_KEY_PATH (not committed) |
| Create | `test/ssh.test.js` | Unit tests for SSH output parsing |
| Create | `test/poller.test.js` | Cache logic tests |
| Create | `test/nodes.route.test.js` | API route tests |

---

## Database Schema

```sql
CREATE TABLE IF NOT EXISTS nodes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  host       TEXT NOT NULL,
  ssh_user   TEXT NOT NULL DEFAULT 'root',
  enabled    INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

SQLite file path: `./data/dashboard.db` (created at startup, excluded from git via `.gitignore`).

---

## SSH Commands & Parsing

SSH library: `ssh2` npm package. One connection per node per poll cycle. Commands run sequentially on a single connection.

```js
// Commands run on each node
'asterisk -rx "core show channels concise" | grep -c "^" || echo 0'
// → parse as integer (subtract 1 for header line if present)

'asterisk -rx "sip show peers" | grep -c "^[a-zA-Z]" || echo 0'
// → parse as integer

'cat /proc/loadavg && uptime -p'
// → first field of /proc/loadavg = 1-min load avg; uptime -p = human string

'asterisk -rx "core show version" 2>/dev/null | head -1 || echo "not running"'
// → contains "Asterisk X.Y.Z" or "not running"
```

**Cache entry shape:**
```json
{
  "id": 1,
  "name": "ast-node-01",
  "host": "10.0.0.1",
  "status": "ok",
  "active_calls": 12,
  "sip_peers": 45,
  "load_avg": "0.42",
  "uptime": "14 days",
  "asterisk_version": "18.15.0",
  "last_updated": "2026-05-28T10:00:00.000Z",
  "error": null
}
```

**Node status values:**
- `"ok"` — SSH succeeded, Asterisk running
- `"asterisk_down"` — SSH succeeded, Asterisk not responding
- `"unreachable"` — SSH failed (timeout, auth error, host down)

**SSH config:**
```js
{
  host: node.host,
  username: node.ssh_user,
  privateKey: fs.readFileSync(process.env.SSH_KEY_PATH || '/root/.ssh/id_rsa'),
  readyTimeout: 5000,  // 5s connect timeout
}
```

---

## API Routes

All routes under `/api/nodes`, mounted in `server.js`.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/nodes` | Return full cache array |
| GET | `/api/nodes/:id` | Return single node from cache |
| POST | `/api/nodes` | Add node to DB: `{ name, host, ssh_user? }` |
| DELETE | `/api/nodes/:id` | Disable node in DB (soft delete) |
| GET | `/api/nodes/:id/refresh` | Force immediate re-poll of one node |

---

## Frontend

**`public/js/dashboard.js`** — plain ES2020, no bundler.

- On load: calls `refresh()` immediately, then `setInterval(refresh, 30_000)`
- `refresh()` fetches `/api/nodes`, calls `renderTable(data)` and `renderChart(data)`
- Table: one row per node — name, host, status badge, active calls, SIP peers, load avg, uptime, version
- Status badge colors: `ok` → green (`badge-success`), `asterisk_down` → yellow (`badge-warning`), `unreachable` → red (`badge-danger`)
- Chart: ApexCharts bar chart, active calls per node, updates on each refresh
- Stale indicator: if `last_updated` is >90s ago, row gets a grey "stale" badge

**`public/index.html` additions:**
- `<div id="nodes-table-container">` — table mount point in existing Sneat card
- `<div id="calls-chart">` — chart mount point
- `<script src="/js/dashboard.js">` — after ApexCharts CDN tag

---

## Error Handling & Resilience

- Per-node failures are isolated — one unreachable node never blocks others
- SSH connect timeout: 5s. Per-command timeout: 10s. Max per node: 15s total
- Poller catches all errors per-node and stores `{ status: 'unreachable', error: message }`
- If poller itself throws, it logs and reschedules — never crashes Express
- `/api/nodes` returns `[]` if cache is empty (first start, no nodes yet)
- Frontend shows "No nodes configured" message when array is empty
- `.env` missing: server logs warning, falls back to `/root/.ssh/id_rsa`

---

## Environment

`.env` file (not committed):
```
SSH_KEY_PATH=/root/.ssh/id_rsa
```

`.env.example` (committed):
```
SSH_KEY_PATH=/root/.ssh/id_rsa
```

Add `data/` and `.env` to `.gitignore`.

---

## Testing

- `test/ssh.test.js` — unit tests for SSH output parsers (no real SSH; mock command output strings)
- `test/poller.test.js` — cache Map behavior, parallel execution with mocked `pollNode`
- `test/nodes.route.test.js` — supertest API tests with in-memory SQLite (`:memory:`)
