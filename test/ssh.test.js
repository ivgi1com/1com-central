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
