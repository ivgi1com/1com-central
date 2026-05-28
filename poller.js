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
