jest.mock('../db', () => ({
  prepare: jest.fn((sql) => {
    if (sql.includes('SELECT * FROM nodes WHERE id')) {
      return { get: jest.fn(() => ({ id: 1, name: 'ast-01', host: '10.0.0.1', ssh_user: 'root' })) };
    }
    return { all: jest.fn(() => [{ id: 1, name: 'ast-01', host: '10.0.0.1', ssh_user: 'root' }]) };
  }),
}));

jest.mock('../ssh', () => ({ pollNode: jest.fn() }));

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
