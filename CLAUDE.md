# 1COM Central

Asterisk SSH monitoring dashboard for 1com.co.il. Polls up to 50 Linux Asterisk nodes via SSH every 30s and renders metrics in a live Bootstrap 5 dashboard.

## Commands

```bash
npm start          # start server (port 3000)
npm test           # jest — 41 tests across 4 suites
git push origin main   # deploy to GitHub, then pull on server
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
| `ssh.js` | `pollNode(node)` — SSH into one node, runs 7 commands, returns metrics |
| `poller.js` | `startPoller` / `getCache` / `getCacheEntry` / `evictCache` / `refreshNode` |
| `routes/nodes.js` | Express router — all `/api/nodes` CRUD + refresh |
| `server.js` | Entry point — mounts routes at `BASE_PATH`, exposes `/api/version`, starts poller |
| `public/js/dashboard.js` | SPA router (`#dashboard`, `#nodes`, `#node-{id}`), 30s auto-refresh per view |

## Navigation (SPA)

Hash-based routing — no page reloads:
- `#dashboard` — landing page with node summary table + active calls chart
- `#nodes` — full node list, each row clickable
- `#node-{id}` — per-node detail: CPU%, memory, disk/, load avg, uptime, Asterisk metrics

## API

| Method | Path | Description |
|---|---|---|
| GET | `/api/version` | `{ version }` from package.json |
| GET | `/api/nodes` | All cached node metrics |
| GET | `/api/nodes/:id` | Single node from cache |
| POST | `/api/nodes` | Add node: `{ name, host, ssh_user? }` |
| DELETE | `/api/nodes/:id` | Soft-disable node (enabled=0) + evict cache |
| GET | `/api/nodes/:id/refresh` | Force re-poll single node |

All paths are prefixed with `BASE_PATH` when set.

## Node metrics shape

```json
{
  "id": 1, "name": "ast-01", "host": "10.0.0.1",
  "status": "ok",
  "active_calls": 12, "sip_peers": 45,
  "load_avg": "0.42", "uptime": "up 14 days",
  "asterisk_version": "18.15.0",
  "mem_total_mb": 7982, "mem_used_mb": 6234, "mem_avail_mb": 1748,
  "cpu_pct": 3.6,
  "disk_use_pct": 43, "disk_avail": "27G",
  "last_updated": "2026-05-28T10:00:00.000Z",
  "error": null
}
```

Status values: `ok` | `asterisk_down` | `unreachable`

## Environment

```bash
SSH_KEY_PATH=/root/.ssh/id_rsa   # path to private key used for all SSH connections
PORT=3000                         # optional, defaults to 3000
BASE_PATH=/noc                    # subpath prefix (e.g. /noc) — omit for root deployment
```

Copy `.env.example` → `.env` and set values.

SSH key is read once at module load and cached — no repeated disk I/O per poll.

## SSH commands per node

Run sequentially on a single connection per poll cycle:

```
asterisk -rx "core show channels count"   → active_calls
asterisk -rx "sip show peers" | grep -c  → sip_peers
cat /proc/loadavg && uptime -p            → load_avg + uptime
asterisk -rx "core show version"          → asterisk_version + status
free -m | grep "^Mem:"                    → mem_total_mb, mem_used_mb, mem_avail_mb
top -bn1 | grep -E "^[%]?Cpu"            → cpu_pct
df -h / | tail -1                         → disk_use_pct, disk_avail
```

Timeouts: 5s connect, 10s per command. Per-node failures are isolated — one down node never blocks others.

## Tests

```bash
npm test                              # all suites (41 tests)
npx jest test/ssh.test.js             # parser unit tests (26 tests)
npx jest test/poller.test.js          # cache logic (4 tests)
npx jest test/nodes.route.test.js     # API routes via supertest (9 tests + 2 from db mock)
```

All tests mock `db` and `ssh`/`poller` — no real SSH connections or disk I/O in tests.

## Production deployment

- **Server:** pbx6webserver.1com.co.il (CentOS Stream 9)
- **URL:** https://pbx6webserver.1com.co.il/noc
- **App path:** `/opt/1com-central`
- **Process manager:** PM2 (id 3, name `1com-central`)
- **Web server:** Apache httpd — proxy config in `/etc/httpd/conf.d/ssl.conf`
- **Apache proxy rules:**
  ```apache
  ProxyPass        /noc  http://localhost:3000/noc
  ProxyPassReverse /noc  http://localhost:3000/noc
  ```

### Update procedure

```bash
cd /opt/1com-central
git pull origin main
npm install --omit=dev
pm2 restart 1com-central
```

## Key invariants

- `/:id/refresh` route **must** be registered before `/:id` in `routes/nodes.js` to prevent Express matching `"refresh"` as an id param.
- DELETE soft-deletes (`enabled=0`) and evicts the cache entry — it does not hard-delete.
- `runPoll` queries `WHERE enabled = 1` so disabled nodes are skipped automatically.
- SQLite file lives in `data/` (git-ignored). Created automatically on first start.
- `BASE_PATH` is injected into HTML at runtime by `server.js` via `<base>` tag + `window.BASE_PATH` — frontend never hardcodes the path.
