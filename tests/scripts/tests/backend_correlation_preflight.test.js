const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { writeTsIndex } = require('../../../shared/lib/market/validation');
const {
  locateBackendBinary,
  _test,
} = require('../../../backend/cli/commands/tools/backend');

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'sovereign-corr-preflight-'));
}

function bar(symbol, date, close) {
  return {
    family: 'crypto',
    provider: 'fixture',
    symbol,
    timeframe: '5m',
    timestamp: `${date}T00:00:00.000Z`,
    open: close,
    high: close + 1,
    low: close - 1,
    close,
    volume: 1000,
  };
}

function datedBars(symbol, startDate, count, startClose) {
  const start = Date.parse(`${startDate}T00:00:00.000Z`);
  const out = [];
  for (let i = 0; i < count; i++) {
    const date = new Date(start + i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    out.push(bar(symbol, date, startClose + i));
  }
  return out;
}

function writeFixtureTs(tsDir, records) {
  writeTsIndex(tsDir, { mode: 'test', sources: records });
}

test('correlation preflight reports no-overlap without falling back to cache', () => {
  const dir = tempDir();
  const tsDir = path.join(dir, 'ts');
  const historyDir = path.join(dir, 'cache');
  fs.mkdirSync(historyDir, { recursive: true });
  writeFixtureTs(tsDir, [
    ...datedBars('AAA', '2026-01-01', 35, 100),
    ...datedBars('BBB', '2026-03-01', 35, 200),
  ]);

  const focused = _test.buildFocusedSnapshot(
    new Set(['AAA', 'BBB']),
    '5m',
    [{ symbol: 'AAA', family: 'crypto' }, { symbol: 'BBB', family: 'crypto' }],
    false,
    { tsIndexPath: tsDir, historyPath: historyDir },
  );

  assert.equal(focused.ok, false);
  assert.equal(focused.code, 'no_common_correlation_dates');
  assert.equal(focused.engine, 'sovereign_cli_preflight');
  assert.equal(focused.quality.coverage.AAA.dates, 35);
  assert.equal(focused.quality.coverage.BBB.dates, 35);
  assert.deepEqual(focused.quality.blockers, ['AAA', 'BBB']);
  assert.equal(focused.tmpPath, undefined);
});

test('correlation preflight can drop blockers and keep an overlapping focused snapshot', () => {
  const dir = tempDir();
  const tsDir = path.join(dir, 'ts');
  const historyDir = path.join(dir, 'cache');
  fs.mkdirSync(historyDir, { recursive: true });
  writeFixtureTs(tsDir, [
    ...datedBars('AAA', '2026-01-01', 40, 100),
    ...datedBars('BBB', '2026-01-10', 40, 200),
    ...datedBars('CCC', '2026-04-01', 40, 300),
  ]);

  const focused = _test.buildFocusedSnapshot(
    new Set(['AAA', 'BBB', 'CCC']),
    '5m',
    [
      { symbol: 'AAA', family: 'crypto' },
      { symbol: 'BBB', family: 'crypto' },
      { symbol: 'CCC', family: 'crypto' },
    ],
    false,
    { tsIndexPath: tsDir, historyPath: historyDir, dropNonOverlap: true },
  );

  assert.ok(focused.tmpPath);
  assert.deepEqual(focused.symbols, ['AAA', 'BBB']);
  assert.deepEqual(focused.droppedSymbols, ['CCC']);
  assert.equal(focused.coverage.CCC.first, '2026-04-01');

  const payload = JSON.parse(fs.readFileSync(focused.tmpPath, 'utf8'));
  assert.equal(payload.mode, 'focused_correlation');
  assert.equal(new Set(payload.sources.map((r) => r.symbol)).size, 2);
  fs.unlinkSync(focused.tmpPath);
});

test('overlapping focused snapshot remains consumable by the C++ correlation engine', { skip: !locateBackendBinary() }, () => {
  const dir = tempDir();
  const tsDir = path.join(dir, 'ts');
  const historyDir = path.join(dir, 'cache');
  fs.mkdirSync(historyDir, { recursive: true });
  writeFixtureTs(tsDir, [
    ...datedBars('AAA', '2026-01-01', 40, 100),
    ...datedBars('BBB', '2026-01-01', 40, 200),
  ]);

  const focused = _test.buildFocusedSnapshot(
    new Set(['AAA', 'BBB']),
    '5m',
    [{ symbol: 'AAA', family: 'crypto' }, { symbol: 'BBB', family: 'crypto' }],
    false,
    { tsIndexPath: tsDir, historyPath: historyDir },
  );
  assert.ok(focused.tmpPath);

  const result = spawnSync(locateBackendBinary(), [
    'correlation',
    '--symbols', 'AAA,BBB',
    '--timeframe', '5m',
    '--input', focused.tmpPath,
    '--max-bars', '100',
    '--method', 'pearson-returns',
    '--json',
  ], { encoding: 'utf8', cwd: path.join(__dirname, '..', '..', '..') });

  fs.unlinkSync(focused.tmpPath);
  assert.equal(result.status, 0);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ok, true);
  assert.deepEqual(payload.labels, ['AAA', 'BBB']);
  assert.equal(payload.input.replace(/\\/g, '/'), focused.tmpPath.replace(/\\/g, '/'));
});

test('correlation preflight human output names blockers and coverage', () => {
  const rendered = _test.renderCorrelationPreflightError({
    ok: false,
    code: 'no_common_correlation_dates',
    error: 'No common 5m dates across selected symbols.',
    symbols: ['MATICUSDT', 'POLUSDT'],
    quality: {
      blockers: ['MATICUSDT', 'POLUSDT'],
      hint: 'Try removing: MATICUSDT, POLUSDT',
      coverage: {
        MATICUSDT: { dates: 1000, first: '2021-12-16', last: '2024-09-10' },
        POLUSDT: { dates: 638, first: '2024-09-13', last: '2026-06-12' },
      },
    },
  });

  assert.match(rendered, /Correlation preflight failed/);
  assert.match(rendered, /Blockers: MATICUSDT, POLUSDT/);
  assert.match(rendered, /2024-09-10/);
  assert.match(rendered, /--drop-non-overlap/);
});
