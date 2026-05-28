# Asterisk SSH Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an SSH poller that SSHs into configured Linux Asterisk nodes every 30s, caches metrics in-memory, and exposes them via Express API routes with a live Bootstrap 5 / ApexCharts frontend.

**Architecture:** `db.js` owns the SQLite nodes table. `ssh.js` polls one node (4 commands, one SSH connection). `poller.js` runs them in parallel via `Promise.all`, stores results in a `Map`. `routes/nodes.js` exposes the cache + CRUD via `/api/nodes`. `server.js` mounts routes and starts the poller. `public/js/dashboard.js` polls `/api/nodes` every 30s and renders a table + bar chart.

**Tech Stack:** Node.js (CommonJS), Express 5, `ssh2`, `better-sqlite3`, `dotenv`, Jest + supertest

---

### Task 1: Install dependencies + bootstrap .env files

**Files:**
- Modify: `package.json` (via npm install)
- Modify: `.gitignore`
- Create: `.env.example`

- [ ] **Step 1: Install runtime dependencies**

```bash
npm install ssh2 better-sqlite3 dotenv
```

Expected output: 3 packages added, no errors. If you see a `node-gyp` build error for `better-sqlite3`, install Python + MSVC Build Tools and retry, or run on Linux.

- [ ] **Step 2: Add `data/` to .gitignore**

Open `.gitignore` and add:
```
data/
```

Full `.gitignore` after edit:
```
node_modules/
.env
*.log
data/
```

- [ ] **Step 3: Create `.env.example`**

```
SSH_KEY_PATH=/root/.ssh/id_rsa
```

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json .gitignore .env.example
git commit -m "chore: install ssh2, better-sqlite3, dotenv; update .gitignore"
```

---

### Task 2: Create db.js — SQLite init + schema

**Files:**
- Create: `db.js`

- [ ] **Step 1: Create `db.js`**

```js
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

module.exports = db;
```

- [ ] **Step 2: Verify it runs without error**

```bash
node -e "const db = require('./db'); console.log(db.prepare('SELECT name FROM sqlite_master WHERE type=?').all('table'));"
```

Expected output:
```
[ { name: 'nodes' } ]
```

- [ ] **Step 3: Commit**

```bash
git add db.js
git commit -m "feat: add SQLite db init with nodes table"
```

---

### Task 3: ssh.js — SSH client + output parsers (TDD)

**Files:**
- Create: `test/ssh.test.js`
- Create: `ssh.js`

- [ ] **Step 1: Write the failing tests**

Create `test/ssh.test.js`:

```js
const {
  parseActiveCalls,
  parseSipPeers,
  parseLoadAvg,
  parseUptime,
  parseVersion,
  isAsteriskRunning,
} = require('../ssh');

describe('parseActiveCalls', () => {
  test('parses leading integer', () => {
    expect(parseActiveCalls('12\n')).toBe(12);
  });
  test('returns 0 for empty output', () => {
    expect(parseActiveCalls('')).toBe(0);
  });
  test('returns 0 for non-numeric', () => {
    expect(parseActiveCalls('abc')).toBe(0);
  });
  test('parses "0" from echo fallback', () => {
    expect(parseActiveCalls('0\n')).toBe(0);
  });
});

describe('parseSipPeers', () => {
  test('parses count', () => {
    expect(parseSipPeers('45\n')).toBe(45);
  });
  test('returns 0 for non-numeric', () => {
    expect(parseSipPeers('')).toBe(0);
  });
});

describe('parseLoadAvg', () => {
  test('extracts first field from /proc/loadavg line', () => {
    expect(parseLoadAvg('0.42 0.35 0.28 1/123 456\nup 14 days')).toBe('0.42');
  });
  test('returns "0.00" for empty output', () => {
    expect(parseLoadAvg('')).toBe('0.00');
  });
});

describe('parseUptime', () => {
  test('extracts second line (uptime -p output)', () => {
    expect(parseUptime('0.42 0.35 0.28 1/123 456\nup 14 days, 2 hours')).toBe('up 14 days, 2 hours');
  });
  test('returns empty string if no second line', () => {
    expect(parseUptime('0.42 0.35 0.28')).toBe('');
  });
});

describe('parseVersion', () => {
  test('extracts version number from Asterisk output', () => {
    expect(parseVersion('Asterisk 18.15.0 built by root @ server')).toBe('18.15.0');
  });
  test('returns null when Asterisk not in output', () => {
    expect(parseVersion('not running')).toBeNull();
  });
  test('returns null for empty string', () => {
    expect(parseVersion('')).toBeNull();
  });
});

describe('isAsteriskRunning', () => {
  test('returns true when version string present', () => {
    expect(isAsteriskRunning('Asterisk 18.15.0 built by root')).toBe(true);
  });
  test('returns false for "not running"', () => {
    expect(isAsteriskRunning('not running')).toBe(false);
  });
  test('returns false for empty string', () => {
    expect(isAsteriskRunning('')).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests — verify they FAIL**

```bash
npx jest test/ssh.test.js
```

Expected: FAIL — `Cannot find module '../ssh'`

- [ ] **Step 3: Create `ssh.js`**

```js
const { Client } = require('ssh2');
const fs = require('fs');

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

    let privateKey;
    try {
      privateKey = fs.readFileSync(process.env.SSH_KEY_PATH || '/root/.ssh/id_rsa');
    } catch (e) {
      result.error = `SSH key not found: ${e.message}`;
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
```

- [ ] **Step 4: Run tests — verify they PASS**

```bash
npx jest test/ssh.test.js
```

Expected: PASS — all 13 tests green.

- [ ] **Step 5: Commit**

```bash
git add ssh.js test/ssh.test.js
git commit -m "feat: add ssh.js with pollNode and output parsers"
```

---

### Task 4: poller.js — background cache (TDD)

**Files:**
- Create: `test/poller.test.js`
- Create: `poller.js`

- [ ] **Step 1: Write the failing tests**

Create `test/poller.test.js`:

```js
jest.mock('../db', () => ({
  prepare: jest.fn((sql) => {
    if (sql.includes('SELECT * FROM nodes')) {
      return {
        all: jest.fn(() => [
          { id: 1, name: 'ast-01', host: '10.0.0.1', ssh_user: 'root' },
        ]),
      };
    }
    if (sql.includes('SELECT * FROM nodes WHERE id')) {
      return {
        get: jest.fn(() => ({ id: 1, name: 'ast-01', host: '10.0.0.1', ssh_user: 'root' })),
      };
    }
    return { all: jest.fn(() => []), get: jest.fn(() => null), run: jest.fn(() => ({})) };
  }),
}));

jest.mock('../ssh', () => ({
  pollNode: jest.fn(),
}));

const { pollNode } = require('../ssh');

let getCache, getCacheEntry, refreshNode;

beforeEach(() => {
  jest.resetModules();
  jest.mock('../db', () => ({
    prepare: jest.fn((sql) => {
      if (sql.includes('SELECT * FROM nodes WHERE id')) {
        return { get: jest.fn(() => ({ id: 1, name: 'ast-01', host: '10.0.0.1', ssh_user: 'root' })) };
      }
      return { all: jest.fn(() => [{ id: 1, name: 'ast-01', host: '10.0.0.1', ssh_user: 'root' }]) };
    }),
  }));
  jest.mock('../ssh', () => ({ pollNode: jest.fn() }));
  ({ getCache, getCacheEntry, refreshNode } = require('../poller'));
});

test('getCache returns empty array when nothing polled', () => {
  expect(getCache()).toEqual([]);
});

test('getCacheEntry returns undefined for unknown id', () => {
  expect(getCacheEntry(999)).toBeUndefined();
});

test('refreshNode calls pollNode and stores result in cache', async () => {
  const mockResult = {
    id: 1, name: 'ast-01', host: '10.0.0.1',
    status: 'ok', active_calls: 5, sip_peers: 10,
    load_avg: '0.42', uptime: 'up 2 days',
    asterisk_version: '18.15.0',
    last_updated: '2026-05-28T10:00:00.000Z',
    error: null,
  };
  require('../ssh').pollNode.mockResolvedValue(mockResult);

  const result = await refreshNode(1);

  expect(result).toEqual(mockResult);
  expect(getCacheEntry(1)).toEqual(mockResult);
  expect(getCache()).toHaveLength(1);
  expect(getCache()[0]).toEqual(mockResult);
});

test('refreshNode returns null when node not in db', async () => {
  jest.resetModules();
  jest.mock('../db', () => ({
    prepare: jest.fn(() => ({ get: jest.fn(() => null) })),
  }));
  jest.mock('../ssh', () => ({ pollNode: jest.fn() }));
  const { refreshNode: refresh } = require('../poller');

  const result = await refresh(999);
  expect(result).toBeNull();
});
```

- [ ] **Step 2: Run tests — verify they FAIL**

```bash
npx jest test/poller.test.js
```

Expected: FAIL — `Cannot find module '../poller'`

- [ ] **Step 3: Create `poller.js`**

```js
const db = require('./db');
const { pollNode } = require('./ssh');

const cache = new Map();

async function runPoll() {
  const nodes = db.prepare('SELECT * FROM nodes WHERE enabled = 1').all();
  const results = await Promise.all(
    nodes.map((n) =>
      pollNode(n).catch((err) => ({
        id: n.id,
        name: n.name,
        host: n.host,
        status: 'unreachable',
        active_calls: 0,
        sip_peers: 0,
        load_avg: null,
        uptime: null,
        asterisk_version: null,
        last_updated: new Date().toISOString(),
        error: err.message,
      }))
    )
  );
  for (const r of results) cache.set(r.id, r);
}

function startPoller() {
  runPoll().catch((err) => console.error('poller error:', err));
  setInterval(() => {
    runPoll().catch((err) => console.error('poller error:', err));
  }, 30_000);
}

function getCache() {
  return [...cache.values()];
}

function getCacheEntry(id) {
  return cache.get(Number(id));
}

async function refreshNode(id) {
  const node = db.prepare('SELECT * FROM nodes WHERE id = ?').get(Number(id));
  if (!node) return null;
  const result = await pollNode(node);
  cache.set(result.id, result);
  return result;
}

module.exports = { startPoller, getCache, getCacheEntry, refreshNode };
```

- [ ] **Step 4: Run tests — verify they PASS**

```bash
npx jest test/poller.test.js
```

Expected: PASS — all 4 tests green.

- [ ] **Step 5: Commit**

```bash
git add poller.js test/poller.test.js
git commit -m "feat: add background poller with in-memory cache"
```

---

### Task 5: routes/nodes.js + update server.js (TDD)

**Files:**
- Create: `test/nodes.route.test.js`
- Create: `routes/nodes.js`
- Modify: `server.js`

- [ ] **Step 1: Write the failing tests**

Create `test/nodes.route.test.js`:

```js
const cachedNode = {
  id: 1, name: 'ast-01', host: '10.0.0.1',
  status: 'ok', active_calls: 5, sip_peers: 10,
  load_avg: '0.42', uptime: 'up 2 days',
  asterisk_version: '18.15.0',
  last_updated: '2026-05-28T10:00:00.000Z',
  error: null,
};

jest.mock('../db', () => ({
  prepare: jest.fn((sql) => {
    if (sql.startsWith('INSERT')) {
      return { run: jest.fn(() => ({ lastInsertRowid: 2 })) };
    }
    if (sql.startsWith('UPDATE')) {
      return { run: jest.fn(() => ({})) };
    }
    return { run: jest.fn(() => ({})) };
  }),
}));

jest.mock('../poller', () => ({
  startPoller: jest.fn(),
  getCache: jest.fn(() => [cachedNode]),
  getCacheEntry: jest.fn((id) => (Number(id) === 1 ? cachedNode : undefined)),
  refreshNode: jest.fn(async (id) => (Number(id) === 1 ? cachedNode : null)),
}));

const request = require('supertest');
const app = require('../server');

describe('GET /api/nodes', () => {
  test('returns array of cached nodes', async () => {
    const res = await request(app).get('/api/nodes');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].name).toBe('ast-01');
  });
});

describe('GET /api/nodes/:id', () => {
  test('returns single node from cache', async () => {
    const res = await request(app).get('/api/nodes/1');
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(1);
  });

  test('returns 404 for unknown id', async () => {
    const res = await request(app).get('/api/nodes/999');
    expect(res.status).toBe(404);
  });
});

describe('POST /api/nodes', () => {
  test('creates node and returns 201 with id', async () => {
    const res = await request(app)
      .post('/api/nodes')
      .send({ name: 'ast-02', host: '10.0.0.2' });
    expect(res.status).toBe(201);
    expect(res.body.id).toBe(2);
    expect(res.body.name).toBe('ast-02');
    expect(res.body.ssh_user).toBe('root');
  });

  test('returns 400 when name is missing', async () => {
    const res = await request(app).post('/api/nodes').send({ host: '10.0.0.2' });
    expect(res.status).toBe(400);
  });

  test('returns 400 when host is missing', async () => {
    const res = await request(app).post('/api/nodes').send({ name: 'ast-02' });
    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/nodes/:id', () => {
  test('returns 204', async () => {
    const res = await request(app).delete('/api/nodes/1');
    expect(res.status).toBe(204);
  });
});

describe('GET /api/nodes/:id/refresh', () => {
  test('returns refreshed node', async () => {
    const res = await request(app).get('/api/nodes/1/refresh');
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(1);
  });

  test('returns 404 for unknown id', async () => {
    const res = await request(app).get('/api/nodes/999/refresh');
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run tests — verify they FAIL**

```bash
npx jest test/nodes.route.test.js
```

Expected: FAIL — `Cannot find module '../routes/nodes'` or 404 on all routes.

- [ ] **Step 3: Create `routes/nodes.js`**

```js
const { Router } = require('express');
const db = require('../db');
const { getCache, getCacheEntry, refreshNode } = require('../poller');

const router = Router();

router.get('/', (req, res) => {
  res.json(getCache());
});

router.get('/:id/refresh', async (req, res) => {
  const result = await refreshNode(req.params.id);
  if (!result) return res.status(404).json({ error: 'not found' });
  res.json(result);
});

router.get('/:id', (req, res) => {
  const entry = getCacheEntry(req.params.id);
  if (!entry) return res.status(404).json({ error: 'not found' });
  res.json(entry);
});

router.post('/', (req, res) => {
  const { name, host, ssh_user = 'root' } = req.body;
  if (!name || !host) return res.status(400).json({ error: 'name and host required' });
  const result = db.prepare('INSERT INTO nodes (name, host, ssh_user) VALUES (?, ?, ?)').run(name, host, ssh_user);
  res.status(201).json({ id: result.lastInsertRowid, name, host, ssh_user });
});

router.delete('/:id', (req, res) => {
  db.prepare('UPDATE nodes SET enabled = 0 WHERE id = ?').run(Number(req.params.id));
  res.status(204).send();
});

module.exports = router;
```

- [ ] **Step 4: Update `server.js`**

Replace the entire contents of `server.js`:

```js
require('dotenv').config();
const express = require('express');
const path = require('path');

const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/api/nodes', require('./routes/nodes'));

if (require.main === module) {
  require('./poller').startPoller();
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`Dashboard running on :${PORT}`));
}

module.exports = app;
```

- [ ] **Step 5: Run all tests — verify they PASS**

```bash
npx jest
```

Expected: PASS — all tests across all 3 test files green.

- [ ] **Step 6: Commit**

```bash
git add routes/nodes.js server.js test/nodes.route.test.js
git commit -m "feat: add /api/nodes routes and wire up poller in server.js"
```

---

### Task 6: Frontend — public/index.html + public/js/dashboard.js

**Files:**
- Modify: `public/index.html`
- Create: `public/js/dashboard.js`

- [ ] **Step 1: Add containers to `public/index.html`**

Locate the closing `</div>` of the second `<div class="row">` block (the one containing Order Statistics, Expense Overview, Transactions — at roughly line 1282). Insert the Asterisk dashboard section **before** the `<!-- / Content -->` comment:

Find this line:
```html
            </div>
            <!-- / Content -->
```

Replace it with:
```html
              <!-- Asterisk Nodes -->
              <div class="row mt-4">
                <div class="col-12 mb-4">
                  <div class="card">
                    <div class="card-header">
                      <h5 class="card-title m-0">Asterisk Node Status</h5>
                    </div>
                    <div class="card-body p-0">
                      <div id="nodes-table-container" class="p-3">
                        <p class="text-muted">Loading...</p>
                      </div>
                    </div>
                  </div>
                </div>
                <div class="col-12 mb-4">
                  <div class="card">
                    <div class="card-header">
                      <h5 class="card-title m-0">Active Calls per Node</h5>
                    </div>
                    <div class="card-body">
                      <div id="calls-chart"></div>
                    </div>
                  </div>
                </div>
              </div>
              <!--/ Asterisk Nodes -->
            </div>
            <!-- / Content -->
```

- [ ] **Step 2: Add dashboard.js script tag to `public/index.html`**

Find the last `<script>` tag before `</body>`:
```html
    <script async defer src="https://buttons.github.io/buttons.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/apexcharts"></script>
  </body>
```

Replace with:
```html
    <script async defer src="https://buttons.github.io/buttons.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/apexcharts"></script>
    <script src="/js/dashboard.js"></script>
  </body>
```

- [ ] **Step 3: Create `public/js/dashboard.js`**

```js
let chart = null;

async function refresh() {
  let nodes;
  try {
    const res = await fetch('/api/nodes');
    if (!res.ok) return;
    nodes = await res.json();
  } catch (_) {
    return;
  }
  renderTable(nodes);
  renderChart(nodes);
}

function isStale(lastUpdated) {
  return lastUpdated && Date.now() - new Date(lastUpdated).getTime() > 90_000;
}

function statusBadge(status, lastUpdated) {
  const stale = isStale(lastUpdated) ? ' <span class="badge bg-secondary ms-1">stale</span>' : '';
  if (status === 'ok') return `<span class="badge bg-success">ok</span>${stale}`;
  if (status === 'asterisk_down') return `<span class="badge bg-warning text-dark">asterisk down</span>${stale}`;
  return `<span class="badge bg-danger">unreachable</span>${stale}`;
}

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderTable(nodes) {
  const container = document.getElementById('nodes-table-container');
  if (!container) return;

  if (nodes.length === 0) {
    container.innerHTML = '<p class="text-muted p-3">No nodes configured. POST to /api/nodes to add one.</p>';
    return;
  }

  const rows = nodes
    .map(
      (n) => `
    <tr>
      <td>${esc(n.name)}</td>
      <td>${esc(n.host)}</td>
      <td>${statusBadge(n.status, n.last_updated)}</td>
      <td>${n.active_calls ?? '-'}</td>
      <td>${n.sip_peers ?? '-'}</td>
      <td>${n.load_avg ?? '-'}</td>
      <td>${n.uptime ? esc(n.uptime) : '-'}</td>
      <td>${n.asterisk_version ? esc(n.asterisk_version) : '-'}</td>
    </tr>`
    )
    .join('');

  container.innerHTML = `
    <table class="table table-hover align-middle mb-0">
      <thead class="table-light">
        <tr>
          <th>Name</th>
          <th>Host</th>
          <th>Status</th>
          <th>Active Calls</th>
          <th>SIP Peers</th>
          <th>Load Avg</th>
          <th>Uptime</th>
          <th>Version</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function renderChart(nodes) {
  const el = document.getElementById('calls-chart');
  if (!el) return;

  const series = [{ name: 'Active Calls', data: nodes.map((n) => n.active_calls ?? 0) }];
  const categories = nodes.map((n) => n.name);

  if (chart) {
    chart.updateOptions({ xaxis: { categories } });
    chart.updateSeries(series);
    return;
  }

  chart = new ApexCharts(el, {
    chart: { type: 'bar', height: 300, toolbar: { show: false } },
    series,
    xaxis: { categories },
    colors: ['#696cff'],
    plotOptions: { bar: { borderRadius: 4 } },
    dataLabels: { enabled: false },
  });
  chart.render();
}

refresh();
setInterval(refresh, 30_000);
```

- [ ] **Step 4: Run all tests one final time**

```bash
npx jest
```

Expected: all tests PASS. (dashboard.js has no unit tests — it's a plain-JS browser module.)

- [ ] **Step 5: Commit**

```bash
git add public/index.html public/js/dashboard.js
git commit -m "feat: add Asterisk nodes dashboard UI with table and bar chart"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Covered by |
|---|---|
| SQLite nodes table with schema | Task 2 `db.js` |
| SSH poller every 30s, parallel | Task 4 `poller.js` — `runPoll()` + `setInterval` |
| 4 SSH commands per node | Task 3 `ssh.js` — `CMDS` array |
| In-memory Map cache | Task 4 `poller.js` — `cache` Map |
| GET /api/nodes | Task 5 `routes/nodes.js` |
| GET /api/nodes/:id | Task 5 |
| POST /api/nodes | Task 5 |
| DELETE /api/nodes/:id (soft delete) | Task 5 |
| GET /api/nodes/:id/refresh | Task 5 |
| server.js: mount routes, start poller, load .env | Task 5 server.js update |
| `status: ok / asterisk_down / unreachable` | Task 3 `ssh.js` — `isAsteriskRunning` |
| 5s connect timeout, 10s per-command timeout | Task 3 `ssh.js` — `connectTimeout`, `cmdTimeout` |
| Per-node failure isolation | Task 4 `poller.js` — `.catch()` in Promise.all |
| Frontend: table with status badges | Task 6 `dashboard.js` — `renderTable` |
| Frontend: ApexCharts bar chart | Task 6 `dashboard.js` — `renderChart` |
| Stale indicator >90s | Task 6 `dashboard.js` — `isStale` |
| Refresh every 30s | Task 6 `dashboard.js` — `setInterval(refresh, 30_000)` |
| "No nodes configured" message | Task 6 `dashboard.js` — empty array check |
| .env.example | Task 1 |
| data/ in .gitignore | Task 1 |
| Unit tests for SSH parsers | Task 3 |
| Cache logic tests | Task 4 |
| API route tests with supertest | Task 5 |

**Placeholder scan:** No TBDs, no "implement later", all steps have complete code.

**Type consistency check:**
- `pollNode` returns the shape `{ id, name, host, status, active_calls, sip_peers, load_avg, uptime, asterisk_version, last_updated, error }` — consistent across `ssh.js`, `poller.js` error fallback, and the `cachedNode` fixture in tests.
- `getCacheEntry(id)` and `refreshNode(id)` both accept a raw id (string or number) and `Number(id)` it — consistent.
- Route `/:id/refresh` is registered **before** `/:id` in `routes/nodes.js` to prevent Express matching `refresh` as the id param.
