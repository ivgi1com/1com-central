const {
  parseActiveCalls,
  parseSipDetail,
  parseLoadAvg,
  parseUptime,
  parseVersion,
  isAsteriskRunning,
  parseMemory,
  parseCpu,
  parseDisk,
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

describe('parseSipDetail', () => {
  const sample = [
    'Name/username             Host                 Dyn Port   Status',
    '300-ophirlaw/300-ophirlaw 10.0.0.1              D  5060   OK (10 ms)',
    '300-altrav/300-altrav     10.0.0.1              D  5060   OK (15 ms)',
    '231-chabadnetanya/231-cha 10.0.0.1              D  5060   OK (20 ms)',
    '300_avrahamov/300_avraham 10.0.0.1              D  5060   OK (55 ms)',
    '4 sip peers [Monitored: 3 online, 1 offline Unmonitored: 0 online, 0 offline]',
  ].join('\n');

  test('parses count from summary line', () => {
    expect(parseSipDetail(sample).sip_peers).toBe(4);
  });
  test('returns unique sorted tenants, handles dash and underscore', () => {
    expect(parseSipDetail(sample).tenants).toEqual(['altrav', 'avrahamov', 'chabadnetanya', 'ophirlaw']);
  });
  test('returns 0 and empty tenants for empty string', () => {
    expect(parseSipDetail('')).toEqual({ sip_peers: 0, tenants: [] });
  });
  test('handles zero peers', () => {
    expect(parseSipDetail('0 sip peers [Monitored: 0 online, 0 offline Unmonitored: 0 online, 0 offline]'))
      .toEqual({ sip_peers: 0, tenants: [] });
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

describe('parseMemory', () => {
  test('parses free -m Mem: line', () => {
    expect(parseMemory('Mem:           7982       6234        123        456       1625       1748'))
      .toEqual({ mem_total_mb: 7982, mem_used_mb: 6234, mem_avail_mb: 1748 });
  });
  test('returns nulls for empty string', () => {
    expect(parseMemory('')).toEqual({ mem_total_mb: null, mem_used_mb: null, mem_avail_mb: null });
  });
  test('returns nulls for malformed line', () => {
    expect(parseMemory('Mem: 1024')).toEqual({ mem_total_mb: null, mem_used_mb: null, mem_avail_mb: null });
  });
});

describe('parseCpu', () => {
  test('parses %Cpu(s) format', () => {
    expect(parseCpu('%Cpu(s):  3.1 us,  0.4 sy,  0.0 ni, 96.4 id,  0.0 wa')).toBe(3.6);
  });
  test('parses Cpu(s) format without percent sign', () => {
    expect(parseCpu('Cpu(s):  5.0 us,  1.0 sy,  0.0 ni, 94.0 id')).toBe(6);
  });
  test('returns null for empty string', () => {
    expect(parseCpu('')).toBeNull();
  });
  test('returns null when no id field', () => {
    expect(parseCpu('some garbage line')).toBeNull();
  });
});

describe('parseDisk', () => {
  test('parses df -h tail line', () => {
    expect(parseDisk('/dev/sda1        50G   20G   27G  43% /'))
      .toEqual({ disk_use_pct: 43, disk_avail: '27G' });
  });
  test('returns nulls for empty string', () => {
    expect(parseDisk('')).toEqual({ disk_use_pct: null, disk_avail: null });
  });
  test('returns nulls for malformed line', () => {
    expect(parseDisk('bad line')).toEqual({ disk_use_pct: null, disk_avail: null });
  });
});
