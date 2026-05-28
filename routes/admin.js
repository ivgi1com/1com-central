'use strict';
const express  = require('express');
const router   = express.Router();
const db       = require('../db');
const { getCacheEntry } = require('../poller');
const { runCommand, parseSipDetail } = require('../ssh');
const { ACTIONS, executeAction, V } = require('../lib/tenantActions');

const NODE_ID_RE = /^\d+$/;

function getNode(nodeId) {
  return db.prepare('SELECT * FROM nodes WHERE id = ? AND enabled = 1').get(nodeId);
}

// GET /api/admin/nodes/:nodeId/tenants
router.get('/:nodeId/tenants', async (req, res) => {
  const { nodeId } = req.params;
  if (!NODE_ID_RE.test(nodeId)) return res.status(400).json({ error: 'Invalid node ID' });

  const node = getNode(parseInt(nodeId, 10));
  if (!node) return res.status(404).json({ error: 'Node not found' });

  // Use cached tenants if available and fresh
  const cached = getCacheEntry(parseInt(nodeId, 10));
  if (cached && Array.isArray(cached.tenants) && cached.tenants.length > 0) {
    return res.json({
      node: cached.name,
      nodeId: node.id,
      tenants: cached.tenants.map(name => ({ name })),
    });
  }

  // Live discovery via SSH
  try {
    const { stdout, stderr } = await runCommand(node, "asterisk -rx 'sip show peers' 2>/dev/null", 15000);
    if (stderr.includes('timeout')) return res.status(504).json({ error: 'Node timed out' });
    const { tenants } = parseSipDetail(stdout);
    return res.json({ node: node.name, nodeId: node.id, tenants: tenants.map(name => ({ name })) });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch tenants' });
  }
});

// GET /api/admin/nodes/:nodeId/tenants/:tenant  →  available actions manifest
router.get('/:nodeId/tenants/:tenant', (req, res) => {
  const { nodeId, tenant } = req.params;
  if (!NODE_ID_RE.test(nodeId)) return res.status(400).json({ error: 'Invalid node ID' });
  if (!V.tenant.test(tenant)) return res.status(400).json({ error: 'Invalid tenant name' });

  const node = getNode(parseInt(nodeId, 10));
  if (!node) return res.status(404).json({ error: 'Node not found' });

  const actions = [...ACTIONS.entries()].map(([name, a]) => ({
    name,
    label: a.label,
    category: a.category,
    description: a.description,
    params: a.params || [],
    destructive: a.destructive || false,
    tenantScoped: a.tenantScoped !== false,
  }));

  res.json({ node: node.name, nodeId: node.id, tenant, actions });
});

// POST /api/admin/nodes/:nodeId/tenants/:tenant/actions/:actionName
router.post('/:nodeId/tenants/:tenant/actions/:actionName', async (req, res) => {
  const { nodeId, tenant, actionName } = req.params;
  if (!NODE_ID_RE.test(nodeId)) return res.status(400).json({ error: 'Invalid node ID' });
  if (!V.tenant.test(tenant)) return res.status(400).json({ error: 'Invalid tenant name' });
  if (!ACTIONS.has(actionName)) return res.status(400).json({ error: 'Unknown action' });

  const node = getNode(parseInt(nodeId, 10));
  if (!node) return res.status(404).json({ error: 'Node not found' });

  const params = (req.body && req.body.params) ? req.body.params : {};
  const user   = (req.session && req.session.user) || 'admin';

  const result = await executeAction(node, tenant, actionName, params, user);
  res.status(result.error && !result.stdout ? 400 : 200).json(result);
});

module.exports = router;
