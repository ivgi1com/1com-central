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
