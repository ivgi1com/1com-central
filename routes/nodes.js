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
