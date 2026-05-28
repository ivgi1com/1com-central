# 1COM Central

Asterisk SSH monitoring dashboard for 1com.co.il. Polls up to 50 Linux Asterisk nodes via SSH every 30s and renders metrics in a live Bootstrap 5 dashboard.

## Commands

```bash
npm start          # start server (port 3000)
npm test           # jest — 31 tests across 4 suites
git push origin main && git push origin <tag>   # deploy
```

## Architecture

```
SQLite (data/dashboard.db)  →  db.js
                               ↓
ssh.js (pollNode)          →  poller.js (30s interval, Map cache)
                               ↓
routes/nodes.js            →  server.js → public/js/dashboard.js
```

| File | Responsibility |
|---|---|
| `db.js` | better-sqlite3 instance; creates `nodes` table on startup |
| `ssh.js` | `pollNode(node)` — SSH into one node, run 4 commands, return metrics |
| `poller.js` | `startPoller` / `getCache` / `getCacheEntry` / `evictCache` / `refreshNode` |
| `routes/nodes.js` | Express router — all `/api/nodes` CRUD + refresh |
| `server.js` | Entry point — mounts routes, exposes `/api/version`, starts poller |
| `public/js/dashboard.js` | Fetches `/api/nodes` every 30s, renders table + ApexCharts bar chart |

## API

| Method | Path | Description |
|---|---|---|
| GET | `/api/version` | `{ version }` from package.json |
| GET | `/api/nodes` | All cached node metrics |
| GET | `/api/nodes/:id` | Single node from cache |
| POST | `/api/nodes` | Add node: `{ name, host, ssh_user? }` |
| DELETE | `/api/nodes/:id` | Soft-disable node (enabled=0) + evict cache |
| GET | `/api/nodes/:id/refresh` | Force re-poll single node |

## Node metrics shape

```json
{
  "id": 1, "name": "ast-01", "host": "10.0.0.1",
  "status": "ok",
  "active_calls": 12, "sip_peers": 45,
  "load_avg": "0.42", "uptime": "up 14 days",
  "asterisk_version": "18.15.0",
  "last_updated": "2026-05-28T10:00:00.000Z",
  "error": null
}
```

Status values: `ok` | `asterisk_down` | `unreachable`

## Environment

```bash
SSH_KEY_PATH=/root/.ssh/id_rsa   # path to private key used for all SSH connections
PORT=3000                         # optional, defaults to 3000
```

Copy `.env.example` → `.env` and set `SSH_KEY_PATH`.

SSH key is read once at module load and cached — no repeated disk I/O per poll.

## SSH commands per node

Run sequentially on a single connection per poll cycle:

```
asterisk -rx "core show channels count"   → active_calls
asterisk -rx "sip show peers" | grep -c  → sip_peers
cat /proc/loadavg && uptime -p            → load_avg + uptime
asterisk -rx "core show version"          → asterisk_version + status
```

Timeouts: 5s connect, 10s per command. Per-node failures are isolated — one down node never blocks others.

## Tests

```bash
npm test                              # all suites
npx jest test/ssh.test.js             # parser unit tests (16 tests)
npx jest test/poller.test.js          # cache logic (4 tests)
npx jest test/nodes.route.test.js     # API routes via supertest (9 tests + 2 from db mock)
```

All tests mock `db` and `ssh`/`poller` — no real SSH connections or disk I/O in tests.

## Key invariants

- `/:id/refresh` route **must** be registered before `/:id` in `routes/nodes.js` to prevent Express matching `"refresh"` as an id param.
- DELETE soft-deletes (`enabled=0`) and evicts the cache entry — it does not hard-delete.
- `runPoll` queries `WHERE enabled = 1` so disabled nodes are skipped automatically.
- SQLite file lives in `data/` (git-ignored). Created automatically on first start.
