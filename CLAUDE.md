# 1COM Central

Asterisk SSH monitoring dashboard for 1com.co.il. Polls up to 50 Linux Asterisk nodes via SSH every 30s and renders metrics in a live Bootstrap 5 dashboard. Includes a full tenant management flow with 22 PBX actions sourced from allScripts_v3.sh.

## Commands

```bash
npm start          # start server (port 3000)
npm test           # jest — 43 tests across 4 suites
git push origin main   # deploy to GitHub, then pull on server
```

## Architecture

```
SQLite (data/dashboard.db)  →  db.js
                               ↓
ssh.js (pollNode, runCommand) → poller.js (30s interval, Map cache)
                               ↓
routes/nodes.js            →  server.js → public/js/dashboard.js
routes/admin.js            ↗
lib/tenantActions.js       ↗
lib/auditLog.js            ↗
```

| File | Responsibility |
|---|---|
| `db.js` | better-sqlite3; creates `nodes` + `audit_log` tables on startup |
| `ssh.js` | `pollNode(node)` — 7-command poll; `runCommand(node, cmd)` — single on-demand command |
| `poller.js` | `startPoller` / `getCache` / `getCacheEntry` / `evictCache` / `refreshNode` |
| `routes/nodes.js` | Express router — all `/api/nodes` CRUD + refresh |
| `routes/admin.js` | Tenant discovery + action execution (`/api/admin/nodes/...`) |
| `lib/tenantActions.js` | 22 allowlisted actions mapped from allScripts_v3.sh; param validation; SSH execution |
| `lib/auditLog.js` | Writes every admin action to `audit_log` SQLite table |
| `server.js` | Entry point — session auth, login/logout, `requireAuth`, mounts routes, static assets public |
| `public/js/dashboard.js` | SPA hash router — dashboard, nodes, node detail, tenants, tenant dashboard |

## Navigation (SPA)

Hash-based routing — no page reloads:
- `#dashboard` — landing page with node summary table + active calls chart
- `#nodes` — full node list, click row → tenants
- `#node-{id}` — per-node system metrics (CPU, memory, disk, uptime)
- `#tenants/{nodeId}` — searchable tenant grid for a node
- `#tenant/{nodeId}/{tenantName}` — tenant dashboard with all action cards

## Authentication

Session-based single-admin login. Credentials in `.env`:

```bash
ADMIN_USER=admin
ADMIN_PASSWORD_HASH=<sha256 hex>   # node -e "require('crypto').createHash('sha256').update('pw').digest('hex')"
SESSION_SECRET=<random string>     # openssl rand -hex 32
```

- Static assets (`/assets`) are served publicly so the login page loads CSS without auth.
- All other routes require an authenticated session.
- `requireAuth` is bypassed in `NODE_ENV=test` so existing tests pass unchanged.
- Logout link in navbar: `href="logout"` (relative — resolves via `<base>` tag).

## API

| Method | Path | Description |
|---|---|---|
| GET | `/login` | Login page (unauthenticated) |
| POST | `/login` | Submit credentials |
| GET | `/logout` | Destroy session, redirect to login |
| GET | `/api/version` | `{ version }` from package.json |
| GET | `/api/nodes` | All cached node metrics |
| GET | `/api/nodes/:id` | Single node from cache |
| POST | `/api/nodes` | Add node: `{ name, host, ssh_user? }` |
| DELETE | `/api/nodes/:id` | Soft-disable node (enabled=0) + evict cache |
| GET | `/api/nodes/:id/refresh` | Force re-poll single node |
| GET | `/api/admin/nodes/:id/tenants` | Discover tenants (from cache or live SSH) |
| GET | `/api/admin/nodes/:id/tenants/:tenant` | Tenant info + available actions manifest |
| POST | `/api/admin/nodes/:id/tenants/:tenant/actions/:action` | Execute a tenant action |

All paths are prefixed with `BASE_PATH` when set.

## Tenant Actions (22 total)

Actions are defined in `lib/tenantActions.js` and mapped from `reference/allScripts_v3.sh`.

| Category | Actions |
|---|---|
| SIP & Extensions | `peers`, `blf`, `devstate`, `channels` |
| Unreachable | `unreachable`, `unreachable_history`, `unreachable_summary` |
| Queues | `queue` (param: queue#), `all_queues` |
| Logs | `log_search` (param: keyword), `log_search_history`, `monit_log` |
| Server | `server_status`, `verbose`, `channel_stats` |
| Email | `email_search` (param: email), `email_search_history` |
| Kamailio | `kamailio_search` (SSHes to 10.10.9.68) |
| Recordings | `recordings_search` (params: number, year, month; SSHes to 82.166.96.229) |
| Admin Actions ⚠️ | `change_ext_state` (param: ext), `reset_queues`, `clear_cache` |

Action POST body: `{ "params": { "keyword": "...", ... } }`
Action response: `{ success, node, tenant, action, stdout, stderr, exitCode, durationMs }`

Security: tenant name validated `/^[a-zA-Z0-9_.-]{1,64}$/`, action names allowlisted, params validated per type, all executions written to `audit_log`.

## Audit Log

Every action execution is logged to SQLite `audit_log`:
```
id, ts, user, node_id, tenant, action, params (JSON), exit_code, duration_ms
```

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
ADMIN_USER=admin                  # login username
ADMIN_PASSWORD_HASH=<sha256 hex>  # SHA-256 hex of password
SESSION_SECRET=<random>           # express-session signing secret
```

Copy `.env.example` → `.env` and set values.

SSH key is read once at module load and cached — no repeated disk I/O per poll.

## SSH commands per node (background poll)

Run sequentially on a single connection per poll cycle:

```
asterisk -rx "core show channels count"   → active_calls
asterisk -rx "sip show peers" | grep -c  → sip_peers + tenants
cat /proc/loadavg && uptime -p            → load_avg + uptime
asterisk -rx "core show version"          → asterisk_version + status
free -m | grep "^Mem:"                    → mem_total_mb, mem_used_mb, mem_avail_mb
top -bn1 | grep -E "^[%]?Cpu"            → cpu_pct
df -h / | tail -1                         → disk_use_pct, disk_avail
```

Timeouts: 5s connect, 10s per command. Per-node failures are isolated.

`runCommand(node, cmd, timeoutMs)` — separate function for on-demand single commands (admin actions, tenant discovery). 30s default timeout.

## Tests

```bash
npm test                              # all suites (43 tests)
npx jest test/ssh.test.js             # parser unit tests (26 tests)
npx jest test/poller.test.js          # cache logic (4 tests)
npx jest test/nodes.route.test.js     # API routes via supertest (11 tests)
npx jest test/server.test.js          # static file server (2 tests)
```

All tests mock `db` and `ssh`/`poller` — no real SSH connections or disk I/O in tests.
`requireAuth` is bypassed when `NODE_ENV=test` (Jest sets this automatically).

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
- Static assets served at `BASE_PATH/assets` are public (no auth) so the login page can load CSS.
- `ADMIN_PASSWORD_HASH` must be exactly 64 hex chars (32 bytes SHA-256); empty hash disables login.
- Tenant names must match `/^[a-zA-Z0-9_.-]{1,64}$/` — enforced in both `routes/admin.js` and `lib/tenantActions.js`.
- Action names must be in the `ACTIONS` Map in `lib/tenantActions.js` — any unknown name returns 400.
- `reference/` folder contains source scripts and assets — git-tracked but not served.
