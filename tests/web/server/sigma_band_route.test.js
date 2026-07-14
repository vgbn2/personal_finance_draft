const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { handle, computeSigmaBand } = require('../../../backend/api/server/routes/market/sigma_band');

function withoutFetchedAt(payload) {
  const { fetched_at, ...rest } = payload || {};
  return rest;
}

test('handle() ignores a caller-supplied "input" path (path-read oracle closed)', () => {
  const maliciousInput = path.resolve(__dirname, '..', '..', '..', 'package.json');

  const withInput = withoutFetchedAt(handle({ symbol: 'AAPL', timeframe: '1d', input: maliciousInput }));
  const withoutInput = withoutFetchedAt(handle({ symbol: 'AAPL', timeframe: '1d' }));

  assert.deepEqual(withInput, withoutInput);
  assert.equal(withInput.input, undefined);
});

test('computeSigmaBand() computes real band stats from an injected fixture (code-only path, never reachable from query)', () => {
  const tmpFile = path.join(os.tmpdir(), `sigma_band_fixture_${process.pid}_${Date.now()}.json`);
  const sources = [];
  for (let i = 0; i < 25; i += 1) {
    sources.push({
      symbol: 'TESTSYM',
      timeframe: '1d',
      timestamp: new Date(Date.UTC(2026, 0, i + 1)).toISOString(),
      close: 100 + Math.sin(i / 2) * 5,
    });
  }
  fs.writeFileSync(tmpFile, JSON.stringify({ sources }), 'utf8');

  try {
    const result = computeSigmaBand({ symbol: 'TESTSYM', timeframe: '1d' }, { snapshotPath: tmpFile });

    assert.equal(result.ok, true);
    assert.equal(result.symbol, 'TESTSYM');
    assert.ok(Number.isFinite(result.current.upper));
    assert.ok(Number.isFinite(result.current.middle));
    assert.ok(Number.isFinite(result.current.lower));
    assert.ok(result.current.upper >= result.current.lower);
    assert.ok(['long', 'short', 'neutral'].includes(result.prediction.direction));
    assert.ok(Array.isArray(result.series) && result.series.length > 0);
  } finally {
    fs.unlinkSync(tmpFile);
  }
});

test('computeSigmaBand() ignores query.input even when called with both arguments', () => {
  const tmpFile = path.join(os.tmpdir(), `sigma_band_fixture_${process.pid}_${Date.now()}_b.json`);
  fs.writeFileSync(tmpFile, JSON.stringify({ sources: [] }), 'utf8');

  try {
    const result = computeSigmaBand({ symbol: 'TESTSYM', timeframe: '1d', input: '/etc/passwd' }, { snapshotPath: tmpFile });
    assert.equal(result.ok, false);
    assert.equal(result.error, 'insufficient_bars');
  } finally {
    fs.unlinkSync(tmpFile);
  }
});
