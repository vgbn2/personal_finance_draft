const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { historicalTailRisk, monteCarloStress, runBacktest } = require('../lib/backtest');
const { calculateRollingFeatureFrame, generateSampleBars, rsi } = require('../lib/indicators');
const { compareModels, modelCandidates } = require('../lib/models');
const { mergeSnapshots, validateSnapshot } = require('../lib/market_validation');
const {
  cryptoLimitForWindow,
  filterCandlesByWindow,
  historicalWindowFromArgs,
  buildCockpitModel,
  buildTradeGatewayLaunch,
  currentPhaseLabel,
  renderCockpit,
} = require('../cli/sovereign_cli');
const {
  fetchGoogleCustomSearchInterest,
  fetchPredictionInterestSignal,
  polymarketTimeframeFromOptions,
  parseStooqCsv,
  redactUrl,
  dedupePreferredMarketQuotes,
  collectIngestSkipChecks,
  loadExternalQuoteInputs,
  loadExternalQuoteProvider,
  parseCsvTable,
  unresolvedProviderErrors,
} = require('../data_ops/ingest_market_data');
const {
  normalizeExternalQuotePayload,
  normalizeExternalQuotePayloadWithReport,
  normalizeSymbol,
  selectPreferredQuoteRecords,
} = require('../lib/quote_router');

const BACKEND_HISTORY_FIXTURE = path.join(__dirname, '..', '..', 'test', 'fixtures', 'backend_history_sample.json');

/**
 * TEST UTILS
 */

function dumpVisibility(name, data) {
  const dir = process.env.SOVEREIGN_TEST_OUTPUT_DIR ||
    path.join(os.tmpdir(), 'sovereign-test-outputs');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const safeName = name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
  fs.writeFileSync(path.join(dir, safeName + '.json'), JSON.stringify(data, (key, val) => {
    if (typeof val === 'number' && !Number.isInteger(val)) {
      return Number(val.toFixed(3));
    }
    return val;
  }, 2), 'utf8');
}

function loadFixture(name) {
  const p = path.join(__dirname, '..', 'test', 'fixtures', `${name}.json`);
  if (!fs.existsSync(p)) {
    // Fallback for transition phase: create if missing for some tests
    return null;
  }
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

test('validator rejects undefined timestamps and null scalar values', () => {
  const snapshot = {
    mode: 'test',
    sources: [
      {
        family: 'weather',
        provider: 'nasa_power',
        location: 'us_gulf',
        timestamp: 'undefined-undefined-undefinedT00:00:00Z',
        temperature: null,
      },
      {
        family: 'prediction_market',
        provider: 'kalshi',
        symbol: 'fed_rate_cut_prob',
        timestamp: '2026-05-18T00:00:00.000Z',
        value: null,
      },
    ],
    errors: [],
  };

  const { report, usableSources } = validateSnapshot(snapshot);
  dumpVisibility('validator rejects undefined timestamps and null scalar values', { snapshot, report, usableSources });
  assert.equal(report.ok, false);
  assert.equal(report.rejected_records, 2);
  assert.equal(usableSources.length, 0);
  assert.ok(report.issues.some((issue) => issue.code === 'invalid_timestamp'));
  assert.ok(report.issues.some((issue) => issue.code === 'missing_value'));
});

test('validator rejects bad OHLC ordering', () => {
  const snapshot = {
    mode: 'test',
    sources: [
      {
        family: 'equities',
        provider: 'sample',
        symbol: 'SPY',
        timeframe: '1d',
        timestamp: '2026-05-18T00:00:00.000Z',
        open: 100,
        high: 99,
        low: 98,
        close: 101,
        volume: 10,
      },
    ],
    errors: [],
  };

  const { report } = validateSnapshot(snapshot);
  assert.equal(report.ok, false);
  dumpVisibility('validator rejects bad OHLC ordering', { snapshot, report });
  assert.ok(report.issues.some((issue) => issue.code === 'bad_ohlc_ordering'));
});

test('validator flags stale live market data', () => {
  const snapshot = {
    mode: 'live',
    fetched_at: '2026-05-18T00:00:00.000Z',
    sources: [
      {
        family: 'equities',
        provider: 'yahoo',
        symbol: 'SPY',
        timeframe: '1d',
        timestamp: '2026-05-12T20:00:00.000Z',
        open: 100,
        high: 101,
        low: 99,
        close: 100.5,
        volume: 1000,
      },
    ],
    errors: [],
  };

  const { report } = validateSnapshot(snapshot);
  dumpVisibility('validator flags stale live market data', { snapshot, report });
  assert.equal(report.ok, false);
  assert.equal(report.freshness.stale_records, 1);
  assert.ok(report.issues.some((issue) => issue.code === 'stale_record'));
});

test('validator rejects stale intraday FX quotes', () => {
  const snapshot = {
    mode: 'live',
    fetched_at: '2026-05-19T00:00:00.000Z',
    sources: [
      {
        family: 'fx',
        provider: 'headway_mt5',
        symbol: 'EURUSD',
        timeframe: 'tick',
        timestamp: '2024-08-23T16:58:59.000Z',
        open: 1.1,
        high: 1.2,
        low: 1.0,
        close: 1.15,
        volume: 0,
      },
    ],
    errors: [],
  };
  const { report } = validateSnapshot(snapshot);
  dumpVisibility('validator rejects stale intraday FX quotes', { snapshot, report });
  assert.equal(report.ok, false);
  assert.equal(report.freshness.stale_records, 1);
});

test('validator scores old historical rows without rejecting them as stale', () => {
  const snapshot = {
    mode: 'backtest_history',
    fetched_at: '2026-05-18T00:00:00.000Z',
    sources: [
      {
        family: 'prediction_market',
        provider: 'kalshi',
        symbol: 'fed_rate_cut_prob',
        market_id: 'KXTEST',
        timeframe: '1d',
        timestamp: '2025-05-18T00:00:00.000Z',
        open: 0.4,
        high: 0.6,
        low: 0.3,
        close: 0.55,
        volume: 5000,
        open_interest: 1000,
      },
    ],
    errors: [],
  };

  const { report, usableSources } = validateSnapshot(snapshot);
  dumpVisibility('validator scores old historical rows without rejecting them as stale', { snapshot, report, usableSources });
  assert.equal(report.ok, true);
  assert.equal(report.freshness.stale_records, 0);
  assert.equal(usableSources.length, 1);
  assert.equal(report.reliability.samples.length, 1);
  assert.ok(report.reliability.samples[0].score < 1);
});

test('validator accepts scalar and candle prediction market records', () => {
  const snapshot = {
    mode: 'backtest_history',
    fetched_at: '2026-05-18T00:00:00.000Z',
    sources: [
      {
        family: 'prediction_market',
        provider: 'kalshi',
        symbol: 'risk_off_spike',
        timestamp: '2026-05-18T00:00:00.000Z',
        value: 0.22,
      },
      {
        family: 'prediction_market',
        provider: 'polymarket',
        symbol: 'risk_off_spike',
        timeframe: '1h',
        timestamp: '2026-05-18T01:00:00.000Z',
        open: 0.2,
        high: 0.25,
        low: 0.18,
        close: 0.21,
        volume: 100,
      },
    ],
    errors: [],
  };

  const { report, usableSources } = validateSnapshot(snapshot);
  dumpVisibility('validator accepts scalar and candle prediction market records', { snapshot, report, usableSources });
  assert.equal(report.ok, true);
  assert.equal(usableSources.length, 2);
});

test('stooq csv parser accepts daily bars', () => {
  const csv = 'Date,Open,High,Low,Close,Volume\n2026-05-15,100,101,99,100.5,12345\n2026-05-16,100.5,102,100,101.25,22222\n';
  const rows = parseStooqCsv(csv);
  dumpVisibility('stooq csv parser accepts daily bars', { csv, rows });
  assert.equal(rows.length, 2);
  assert.equal(rows[0].close, 100.5);
});

test('NASA POWER CSV parser skips prose date lines and reads the data header', () => {
  const csv = [
    '-BEGIN HEADER-',
    'Dates (month/day/year): 05/12/2026 through 05/18/2026 in LST',
    '-END HEADER-',
    'YEAR,MO,DY,T2M,T2M_MAX,T2M_MIN,PRECTOTCORR,WS10M,ALLSKY_SFC_SW_DWN',
    '2026,5,16,25.78,26.29,25.28,0.14,5.2,-999.0',
  ].join('\n');
  const rows = parseCsvTable(csv);
  dumpVisibility('NASA POWER CSV parser skips prose date lines and reads the data header', { csv, rows });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].YEAR, '2026');
  assert.equal(rows[0].MO, '5');
  assert.equal(rows[0].DY, '16');
});

test('resolved fallback provider errors are removed from persisted quality errors', () => {
  const errors = [
    { provider: 'stooq', symbol: 'AAPL', message: 'Stooq CSV produced no usable candles' },
    { provider: 'weather', symbol: 'us_gulf', message: 'No weather provider resolved successfully' },
  ];
  const sources = [
    { family: 'equities', provider: 'yahoo', symbol: 'AAPL' },
  ];
  const unresolved = unresolvedProviderErrors(errors, sources);
  dumpVisibility('resolved fallback provider errors are removed from persisted quality errors', { errors, sources, unresolved });
  assert.equal(unresolved.length, 1);
  assert.equal(unresolved[0].provider, 'weather');
});

test('historical --days window is used for candles and crypto limits', () => {
  const originalNow = Date.now;
  Date.now = () => Date.parse('2026-05-18T00:00:00.000Z');
  try {
    const window = historicalWindowFromArgs(['--days', '2']);
    const candles = [
      { openTime: Date.parse('2026-05-15T00:00:00.000Z') },
      { openTime: Date.parse('2026-05-16T00:00:00.000Z') },
      { openTime: Date.parse('2026-05-17T00:00:00.000Z') },
    ];
    dumpVisibility('historical --days window is used for candles and crypto limits', { window, candles });
    assert.equal(window.days, 2);
    assert.deepEqual(filterCandlesByWindow(candles, window), candles.slice(1));
    assert.equal(cryptoLimitForWindow('1h', 2, 'binance'), 48);
    assert.equal(cryptoLimitForWindow('5m', 10, 'coinbase'), 300);
  } finally {
    Date.now = originalNow;
  }
});

test('status phase label comes from workspace state anchor', () => {
  const phase = currentPhaseLabel();
  dumpVisibility('status phase label comes from workspace state anchor', { phase });
  assert.match(phase, /Phase 5: Automated Execution & Risk Hardening/i);
});

test('cockpit render uses readable ASCII separators', () => {
  const model = buildCockpitModel();
  const rendered = renderCockpit(model);
  dumpVisibility('cockpit render uses readable ascii separators', { rendered });
  assert.equal(rendered.includes('â'), false);
  assert.match(rendered, /Phase:/);
  assert.match(rendered, /={10,}/);
});

test('trade gateway launch uses an available TypeScript runtime', () => {
  const launch = buildTradeGatewayLaunch(['balance']);
  dumpVisibility('trade gateway launch uses an available typescript runtime', launch);
  assert.ok(typeof launch.command === 'string' && launch.command.length > 0);
  assert.ok(
    launch.command === process.execPath ||
    /tsx(\.cmd)?$/i.test(launch.command) ||
    /cmd(\.exe)?$/i.test(launch.command) ||
    /powershell\.exe$/i.test(launch.command),
    `Unexpected trade launcher: ${launch.command}`
  );
  assert.ok(launch.args.some((value) => /execution_gateway[\\/]src[\\/]index\.ts/.test(value)));
  assert.ok(launch.args.some((value) => /balance/.test(String(value))));
});

test('polymarket timeframe labels match requested price-history fidelity', () => {
  dumpVisibility('polymarket timeframe labels match requested price-history fidelity', {});
  assert.equal(polymarketTimeframeFromOptions({ interval: '1d', fidelity: 1440 }), '1d');
  assert.equal(polymarketTimeframeFromOptions({ interval: 'max', fidelity: 60 }), '1h');
  assert.equal(polymarketTimeframeFromOptions({ interval: 'max', fidelity: 15 }), '15m');
});

test('CLI backtest refuses stale live input by default', () => {
  const fixture = loadFixture('stale_live');
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sovereign-cli-'));
  const input = path.join(tempDir, 'stale-live.json');
  fs.writeFileSync(input, JSON.stringify(fixture), 'utf8');

  const result = spawnSync(process.execPath, [
    path.join(__dirname, '..', 'cli', 'sovereign_cli.js'),
    'bt',
    '--input',
    input,
    '--json',
  ], { encoding: 'utf8' });

  assert.equal(result.status, 1);
  const payload = JSON.parse(result.stdout);
  assert.ok(
    /failed data-quality validation/.test(payload.error) ||
    /fetch failed/.test(payload.error),
    payload.error,
  );
  if (/failed data-quality validation/.test(payload.error)) {
    assert.match(payload.error, /stale_records=2/);
  }
  dumpVisibility('CLI backtest refuses stale live input by default', { fixture, payload });
});

test('cockpit model renders status, model, backtest, and portfolio cards', () => {
  const model = buildCockpitModel();
  dumpVisibility('cockpit model renders status, model, backtest, and portfolio cards', { model });
  assert.equal(model.title, 'Sovereign CLI Cockpit');
  assert.ok(Array.isArray(model.cards));
  assert.ok(model.cards.length >= 5);
  const rendered = renderCockpit(model);
  assert.match(rendered, /Sovereign CLI Cockpit/);
  assert.match(rendered, /Phase:/);
  assert.match(rendered, /System:/);
  assert.match(rendered, /Commands:/);
});

test('research commands refuse stale live input by default', () => {
  const fixture = loadFixture('stale_live');
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sovereign-research-'));
  const input = path.join(tempDir, 'stale-live.json');
  fs.writeFileSync(input, JSON.stringify(fixture), 'utf8');

  for (const command of ['features', 'models', 'optimize']) {
    const result = spawnSync(process.execPath, [
      path.join(__dirname, '..', 'cli', 'sovereign_cli.js'),
      command,
      '--input',
      input,
      '--json',
    ], { encoding: 'utf8' });

    assert.equal(result.status, 1);
    const payload = JSON.parse(result.stdout);
    assert.ok(
      /failed data-quality validation/.test(payload.error) ||
      /fetch failed/.test(payload.error),
      payload.error,
    );
    dumpVisibility('research commands refuse stale live input by default', { command, payload });
  }
});

test('backend status command reports missing C++ executable without crashing', () => {
  const result = spawnSync(process.execPath, [
    path.join(__dirname, '..', 'cli', 'sovereign_cli.js'),
    'backend',
    'status',
    '--json',
  ], { encoding: 'utf8' });

  assert.equal([0, 1].includes(result.status), true);
  const payload = JSON.parse(result.stdout);
  dumpVisibility('backend status command reports missing C++ executable without crashing', { payload });
  assert.equal(typeof payload.available, 'boolean');
  if (!payload.available) {
    assert.match(payload.error, /backend executable not found/i);
    assert.equal(Array.isArray(payload.searched), true);
  } else {
    assert.equal(payload.type, 'backend_status');
    assert.equal(payload.engine, 'sovereign_cpp_core');
  }
});

test('backend stats command exposes C++ performance metrics when executable is available', () => {
  const result = spawnSync(process.execPath, [
    path.join(__dirname, '..', 'cli', 'sovereign_cli.js'),
    'backend',
    'stats',
    '--equity',
    '100,110,105,120,90,95,130',
    '--json',
  ], { encoding: 'utf8' });

  assert.equal([0, 1].includes(result.status), true);
  const payload = JSON.parse(result.stdout);
  dumpVisibility('backend stats command exposes C++ performance metrics when executable is available', { payload });
  assert.equal(typeof payload.available, 'boolean');
  if (!payload.available) {
    assert.match(payload.error, /backend executable not found/i);
  } else {
    assert.equal(payload.type, 'backend_stats');
    assert.equal(payload.engine, 'sovereign_cpp_core');
    assert.equal(payload.ok, true);
    assert.equal(payload.observations, 7);
    assert.equal(payload.max_drawdown, 0.25);
    assert.equal(payload.drawdown.peak_index, 3);
    assert.equal(payload.drawdown.trough_index, 4);
  }
});

test('backend stats command fails closed without an equity curve source', () => {
  const result = spawnSync(process.execPath, [
    path.join(__dirname, '..', 'cli', 'sovereign_cli.js'),
    'backend',
    'stats',
    '--input',
    path.join(os.tmpdir(), 'missing-backtest-equity.json'),
    '--json',
  ], { encoding: 'utf8' });

  assert.equal(result.status, 1);
  const payload = JSON.parse(result.stdout);
  dumpVisibility('backend stats command fails closed without an equity curve source', { payload });
  assert.equal(payload.ok, false);
  assert.match(payload.error, /No equity curve found/);
});

test('backend data summary command exposes real cache OHLCV summary when executable is available', () => {
  const result = spawnSync(process.execPath, [
    path.join(__dirname, '..', 'cli', 'sovereign_cli.js'),
    'backend',
    'data',
    'summary',
    '--symbol',
    'AAPL',
    '--timeframe',
    '1d',
    '--max-bars',
    '5',
    '--input',
    BACKEND_HISTORY_FIXTURE,
    '--json',
  ], { encoding: 'utf8' });

  assert.equal([0, 1].includes(result.status), true);
  const payload = JSON.parse(result.stdout);
  dumpVisibility('backend data summary command exposes real cache OHLCV summary when executable is available', { payload });
  assert.equal(typeof payload.available, 'boolean');
  if (!payload.available) {
    assert.match(payload.error, /backend executable not found/i);
  } else {
    assert.equal(payload.type, 'market_data_summary');
    assert.equal(payload.engine, 'sovereign_cpp_core');
    assert.equal(payload.summary.symbol, 'AAPL');
    assert.equal(payload.summary.timeframe, '1d');
    assert.equal(payload.ok, true);
    assert.equal(payload.summary.bars, 4);
    assert.equal(payload.quality.rejected_records, 0);
  }
});

test('backend correlation command exposes C++ pearson matrix when executable is available', () => {
  const result = spawnSync(process.execPath, [
    path.join(__dirname, '..', 'cli', 'sovereign_cli.js'),
    'backend',
    'correlation',
    '--symbols',
    'AAPL,MSFT,SPX',
    '--timeframe',
    '1d',
    '--max-bars',
    '4',
    '--input',
    BACKEND_HISTORY_FIXTURE,
    '--json',
  ], { encoding: 'utf8' });

  assert.equal([0, 1].includes(result.status), true);
  const payload = JSON.parse(result.stdout);
  dumpVisibility('backend correlation command exposes C++ pearson matrix when executable is available', { payload });
  assert.equal(typeof payload.available, 'boolean');
  if (!payload.available) {
    assert.match(payload.error, /backend executable not found/i);
  } else {
    assert.equal(payload.type, 'correlation_matrix');
    assert.equal(payload.engine, 'sovereign_cpp_core');
    assert.equal(payload.ok, true);
    assert.deepEqual(payload.labels, ['AAPL', 'MSFT', 'SPX']);
    assert.equal(payload.observations, 4);
    assert.equal(payload.values.length, 3);
    assert.equal(payload.values[0][0], 1);
  }
});

test('backend universe command exposes cache symbol inventory when executable is available', () => {
  const result = spawnSync(process.execPath, [
    path.join(__dirname, '..', 'cli', 'sovereign_cli.js'),
    'backend',
    'universe',
    '--max-entries',
    '5',
    '--input',
    BACKEND_HISTORY_FIXTURE,
    '--json',
  ], { encoding: 'utf8' });

  assert.equal([0, 1].includes(result.status), true);
  const payload = JSON.parse(result.stdout);
  dumpVisibility('backend universe command exposes cache symbol inventory when executable is available', { payload });
  assert.equal(typeof payload.available, 'boolean');
  if (!payload.available) {
    assert.match(payload.error, /backend executable not found/i);
  } else {
    assert.equal(payload.type, 'market_universe');
    assert.equal(payload.engine, 'sovereign_cpp_core');
    assert.equal(Array.isArray(payload.entries), true);
    assert.equal(payload.entries.length, 3);
    assert.ok(payload.entries.some((entry) => entry.symbol === 'AAPL'));
    assert.equal(payload.quality.rejected_records, 0);
  }
});

test('backend integrity command summarizes live and historical cache health', () => {
  const result = spawnSync(process.execPath, [
    path.join(__dirname, '..', 'cli', 'sovereign_cli.js'),
    'backend',
    'integrity',
    '--history',
    BACKEND_HISTORY_FIXTURE,
    '--input',
    path.join(__dirname, '..', '..', 'data', 'cache', 'last_fetch.json'),
    '--json',
  ], { encoding: 'utf8' });

  assert.equal([0, 1].includes(result.status), true);
  const payload = JSON.parse(result.stdout);
  dumpVisibility('backend integrity command summarizes live and historical cache health', { payload });
  assert.equal(typeof payload.available, 'boolean');
  assert.equal(payload.type, 'backend_integrity');
  if (payload.available) {
    assert.equal(payload.engine, 'sovereign_cli_frontend');
    assert.equal(typeof payload.live_cache.ok, 'boolean');
    assert.equal(typeof payload.historical_cache.ok, 'boolean');
    assert.equal(typeof payload.universe.entries, 'number');
    assert.ok(Array.isArray(payload.universe.top_symbols));
    assert.equal(payload.historical_cache.total_records, 12);
    assert.ok(payload.universe.entries > 0);
    assert.equal(payload.ok, payload.live_cache.ok && payload.historical_cache.ok && payload.universe.ok);
  }
});

test('strategy command creates a validated yaml plan file', () => {
  const registryPath = path.join(__dirname, '..', '..', 'config', 'strategies.yaml');
  const registryBackup = fs.readFileSync(registryPath, 'utf8');
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'strategy-config-'));
  const target = path.join(tempDir, 'my_strategy.yaml');
  try {
    const result = spawnSync(process.execPath, [
      path.join(__dirname, '..', 'cli', 'sovereign_cli.js'),
      'strategy',
      'new',
      'My Strategy',
      '--kind',
      'event_driven',
      '--model',
      'cnn_event_v1',
      '--universe',
      'SPY,QQQ,AAPL',
      '--output',
      target,
      '--json',
    ], { encoding: 'utf8' });

    assert.equal(result.status, 0);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.strategy, 'my_strategy');
    assert.equal(payload.created, target);
    const text = fs.readFileSync(target, 'utf8');
    assert.match(text, /name: my_strategy/);
    assert.match(text, /kind: event_driven/);
    assert.match(text, /model: cnn_event_v1/);
    assert.match(text, /validation: strict/);
    assert.match(text, /require_walk_forward: true/);

    const listResult = spawnSync(process.execPath, [
      path.join(__dirname, '..', 'cli', 'sovereign_cli.js'),
      'strategy',
      'list',
      '--json',
    ], { encoding: 'utf8' });

    assert.equal(listResult.status, 0);
    const listPayload = JSON.parse(listResult.stdout);
    assert.equal(Array.isArray(listPayload.strategies), true);
    assert.equal(typeof listPayload.count, 'number');
    assert.equal(typeof listPayload.ok, 'boolean');
    assert.ok(listPayload.strategies.some((entry) => entry.path.includes('mean_reversion.yaml')));
    const created = listPayload.strategies.find((entry) => entry.path.includes('my_strategy.yaml'));
    assert.equal(created.ok, true);
    assert.equal(created.name, 'my_strategy');
    assert.equal(created.kind, 'event_driven');

    const validateResult = spawnSync(process.execPath, [
      path.join(__dirname, '..', 'cli', 'sovereign_cli.js'),
      'strategy',
      'validate',
      '--json',
    ], { encoding: 'utf8' });

    assert.equal(validateResult.status, 0);
    const validatePayload = JSON.parse(validateResult.stdout);
    assert.equal(validatePayload.ok, true);
    dumpVisibility('strategy command creates a validated yaml plan file', { payload, listPayload, validatePayload });
  } finally {
    fs.writeFileSync(registryPath, registryBackup, 'utf8');
  }
});

test('credential-bearing URLs are redacted before persistence or logging', () => {
  const redacted = redactUrl('https://example.test/path?api_key=fred-secret&key=google-secret&cx=cse-secret&q=rate');
  dumpVisibility('credential-bearing URLs are redacted before persistence or logging', { redacted });
  assert.equal(redacted.includes('fred-secret'), false);
  assert.equal(redacted.includes('google-secret'), false);
  assert.equal(redacted.includes('cse-secret'), false);
  assert.equal(redacted.includes('q=rate'), true);
  assert.equal((redacted.match(/REDACTED/g) || []).length, 3);
});

test('quote router normalizes symbols and prioritizes tier-one providers', () => {
  assert.equal(normalizeSymbol('AAPL.US', 'equities'), 'AAPL');
  assert.equal(normalizeSymbol('BTC-USD', 'crypto'), 'BTCUSDT');

  const records = normalizeExternalQuotePayload({
    ticks: [
      { provider: 'yahoo', family: 'equities', symbol: 'AAPL.US', timestamp: '2026-05-19T10:00:00Z', bid: 99.9, ask: 100.1 },
      { provider: 'mt5', family: 'equities', symbol: 'AAPL', timestamp: '2026-05-19T10:00:00Z', bid: 100.0, ask: 100.2 },
    ],
  }, 'mt5');

  const selected = selectPreferredQuoteRecords(records);
  dumpVisibility('quote router normalizes symbols and prioritizes tier-one providers', { records, selected });
  assert.equal(selected.length, 1);
  assert.equal(selected[0].provider, 'mt5');
});

test('external quote provider import reads local MT5/Webull-style export files', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'quote-import-'));
  const target = path.join(tempDir, 'mt5_quotes.json');
  fs.writeFileSync(target, JSON.stringify({
    ticks: [
      { family: 'equities', symbol: 'MSFT.US', timestamp: '2026-05-19T10:00:00Z', bid: 399.9, ask: 400.1 },
    ],
  }), 'utf8');

  const previous = process.env.MT5_QUOTES_PATH;
  process.env.MT5_QUOTES_PATH = target;
  try {
    const result = await loadExternalQuoteProvider('mt5');
    dumpVisibility('external quote provider import reads local MT5/Webull-style export files', { result });
    assert.equal(result.records.length, 1);
    assert.equal(result.records[0].symbol, 'MSFT');
    assert.equal(result.provider_check.status, 'ok');
    assert.equal(result.provider_check.input_rows, 1);
    assert.equal(result.provider_check.rejected_records, 0);
  } finally {
    if (previous === undefined) {
      delete process.env.MT5_QUOTES_PATH;
    } else {
      process.env.MT5_QUOTES_PATH = previous;
    }
  }
});

test('quote router drops malformed timestamps without rejecting the provider file', () => {
  const payload = {
    ticks: [
      { family: 'equities', symbol: 'AAPL.US', timestamp: 'not-a-date', bid: 100, ask: 100.2 },
      { family: 'equities', symbol: 'MSFT.US', timestamp: '2026-05-19T10:00:00Z', bid: 399.9, ask: 400.1 },
    ],
  };
  const records = normalizeExternalQuotePayload(payload, 'mt5');
  const normalization = normalizeExternalQuotePayloadWithReport(payload, 'mt5');

  dumpVisibility('quote router drops malformed timestamps without rejecting the provider file', { records, normalization });
  assert.equal(records.length, 1);
  assert.equal(records[0].symbol, 'MSFT');
  assert.equal(normalization.records.length, 1);
  assert.equal(normalization.report.input_rows, 2);
  assert.equal(normalization.report.rejected_records, 1);
  assert.equal(normalization.report.rejection_reasons.invalid_timestamp, 1);
  assert.equal(normalization.rejected[0].symbol, 'AAPL.US');
});

test('external quote provider check reports partially rejected import rows', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'quote-import-quality-'));
  const target = path.join(tempDir, 'mt5_quotes.json');
  fs.writeFileSync(target, JSON.stringify({
    ticks: [
      { family: 'equities', symbol: 'AAPL.US', timestamp: 'not-a-date', bid: 100, ask: 100.2 },
      { family: 'equities', symbol: 'MSFT.US', timestamp: '2026-05-19T10:00:00Z', bid: 399.9, ask: 400.1 },
    ],
  }), 'utf8');

  const previous = process.env.MT5_QUOTES_PATH;
  process.env.MT5_QUOTES_PATH = target;
  try {
    const result = await loadExternalQuoteProvider('mt5');
    dumpVisibility('external quote provider check reports partially rejected import rows', { result });
    assert.equal(result.records.length, 1);
    assert.equal(result.provider_check.status, 'ok');
    assert.equal(result.provider_check.quality, 'degraded');
    assert.equal(result.provider_check.input_rows, 2);
    assert.equal(result.provider_check.rejected_records, 1);
    assert.equal(result.provider_check.rejection_reasons.invalid_timestamp, 1);
    assert.equal(result.error, null);
  } finally {
    if (previous === undefined) {
      delete process.env.MT5_QUOTES_PATH;
    } else {
      process.env.MT5_QUOTES_PATH = previous;
    }
  }
});

test('snapshot merge keeps refreshed records and drops stale errors', () => {
  const base = {
    sources: [
      {
        family: 'equities',
        provider: 'mt5',
        symbol: 'AAPL',
        timeframe: 'tick',
        timestamp: '2026-05-19T10:00:00Z',
        close: 100,
      },
    ],
    errors: [{ family: 'quote_feeds', provider: 'mt5', message: 'old provider error' }],
  };
  const update = {
    sources: [
      {
        family: 'equities',
        provider: 'mt5',
        symbol: 'AAPL',
        timeframe: 'tick',
        timestamp: '2026-05-19T10:00:00Z',
        close: 101,
      },
      {
        family: 'equities',
        provider: 'webull',
        symbol: 'MSFT',
        timeframe: 'tick',
        timestamp: '2026-05-19T10:01:00Z',
        close: 200,
      },
    ],
    errors: [],
  };

  const merged = mergeSnapshots(base, update);
  dumpVisibility('snapshot merge keeps refreshed records and drops stale errors', { base, update, merged });
  assert.equal(merged.sources.length, 2);
  assert.equal(merged.errors.length, 0);
  assert.equal(merged.sources[0].symbol, 'AAPL');
  assert.equal(merged.sources[1].symbol, 'MSFT');
  assert.equal(merged.sources.find((record) => record.symbol === 'AAPL').close, 101);
});

test('loadExternalQuoteInputs reads enabled provider exports and returns provider checks', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'quote-inputs-'));
  const target = path.join(tempDir, 'mt5_quotes.json');
  fs.writeFileSync(target, JSON.stringify({
    ticks: [
      { family: 'equities', symbol: 'AAPL.US', timestamp: '2026-05-19T10:00:00Z', bid: 100, ask: 100.2 },
    ],
  }), 'utf8');

  const previousMt5 = process.env.MT5_QUOTES_PATH;
  process.env.MT5_QUOTES_PATH = target;
  try {
    const result = await loadExternalQuoteInputs({
      quote_feeds: {
        enabled: true,
        providers: ['mt5'],
      },
    });
    dumpVisibility('loadExternalQuoteInputs reads enabled provider exports and returns provider checks', { result });
    assert.equal(result.records.length, 1);
    assert.equal(result.provider_checks.length, 1);
    assert.equal(result.provider_checks[0].provider, 'mt5');
    assert.equal(result.provider_checks[0].status, 'ok');
    assert.equal(result.errors.length, 0);
    assert.equal(result.records[0].symbol, 'AAPL');
  } finally {
    if (previousMt5 === undefined) {
      delete process.env.MT5_QUOTES_PATH;
    } else {
      process.env.MT5_QUOTES_PATH = previousMt5;
    }
  }
});

test('ingest skip checks explain disabled and family-filtered paths', () => {
  const checks = collectIngestSkipChecks({
    quote_feeds: { enabled: false },
    equities: { enabled: true },
    macro_alt: { enabled: false },
    weather: { enabled: false },
  }, {
    equities_options: { enabled: false },
    stock_options: { enabled: true },
  }, 'equities');

  dumpVisibility('ingest skip checks explain disabled and family-filtered paths', { checks });
  assert.equal(checks.some((check) =>
    check.family === 'quote_feeds' &&
    check.status === 'skipped' &&
    check.reason === 'target_family_filter' &&
    check.target_family === 'equities'
  ), true);
  assert.equal(checks.some((check) =>
    check.family === 'weather' &&
    check.status === 'skipped' &&
    check.reason === 'target_family_filter'
  ), true);
  assert.equal(checks.some((check) =>
    check.family === 'equities' &&
    check.status === 'skipped'
  ), false);

  const disabledChecks = collectIngestSkipChecks({
    quote_feeds: { enabled: false },
    equities: { enabled: true },
    macro_alt: { enabled: false },
    weather: { enabled: false },
  }, {
    equities_options: { enabled: false },
    stock_options: { enabled: true },
  });
  assert.equal(disabledChecks.some((check) =>
    check.family === 'quote_feeds' &&
    check.reason === 'disabled_in_config'
  ), true);
  assert.equal(disabledChecks.some((check) =>
    check.family === 'weather' &&
    check.reason === 'disabled_in_config'
  ), true);
  assert.equal(disabledChecks.some((check) =>
    check.family === 'equities_options' &&
    check.reason === 'disabled_in_config'
  ), true);
});

test('quotes status command exposes configured quote imports without leaking paths', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'quote-status-'));
  const target = path.join(tempDir, 'mt5_quotes.json');
  fs.writeFileSync(target, JSON.stringify({
    ticks: [
      { family: 'equities', symbol: 'AAPL.US', timestamp: '2026-05-19T10:00:00Z', bid: 100, ask: 100.2 },
    ],
  }), 'utf8');
  const env = { ...process.env, SOVEREIGN_MT5_QUOTES_PATH: target, SOVEREIGN_DISABLE_MT5_AUTO_PATH: '1' };
  delete env.MT5_QUOTES_PATH;
  delete env.SOVEREIGN_WEBULL_QUOTES_PATH;
  delete env.WEBULL_QUOTES_PATH;

  const result = spawnSync(process.execPath, [
    path.join(__dirname, '..', 'cli', 'sovereign_cli.js'),
    'quotes',
    'status',
    '--json',
  ], {
    cwd: path.resolve(__dirname, '..'),
    encoding: 'utf8',
    env,
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  dumpVisibility('quotes status command exposes configured quote imports without leaking paths', { payload });
  assert.equal(payload.type, 'quote_sources');
  assert.equal(payload.ok, true);
  assert.equal(payload.records, 1);
  assert.equal(payload.providers.find((provider) => provider.provider === 'mt5').configured, true);
  assert.equal(payload.providers.find((provider) => provider.provider === 'mt5').env, 'SOVEREIGN_MT5_QUOTES_PATH');
  assert.equal(JSON.stringify(payload).includes(target), false);
  assert.equal(payload.symbols[0].symbol, 'AAPL');
});

test('dedupePreferredMarketQuotes keeps tier-one duplicates and leaves other records', () => {
  const input = [
    { family: 'equities', provider: 'yahoo', symbol: 'AAPL', timeframe: 'tick', timestamp: '2026-05-19T10:00:00Z', close: 99 },
    { family: 'equities', provider: 'mt5', symbol: 'AAPL', timeframe: 'tick', timestamp: '2026-05-19T10:00:00Z', close: 100 },
    { family: 'macro', provider: 'fred', series: 'CPI', timestamp: '2026-05-01T00:00:00Z', value: 1 },
  ];
  const result = dedupePreferredMarketQuotes(input);
  dumpVisibility('dedupePreferredMarketQuotes keeps tier-one duplicates and leaves other records', { input, result });
  assert.equal(result.records.length, 2);
  assert.equal(result.removed_records, 1);
  assert.equal(result.records.some((record) => record.provider === 'mt5'), true);
  assert.equal(result.records.some((record) => record.family === 'macro'), true);
});

test('google search interest helper requires credentials', async () => {
  const saved = {
    GOOGLE_API_KEY: process.env.GOOGLE_API_KEY,
    GOOGLE_CUSTOM_SEARCH_API_KEY: process.env.GOOGLE_CUSTOM_SEARCH_API_KEY,
    GOOGLE_CSE_ID: process.env.GOOGLE_CSE_ID,
    GOOGLE_CUSTOM_SEARCH_ENGINE_ID: process.env.GOOGLE_CUSTOM_SEARCH_ENGINE_ID,
  };
  delete process.env.GOOGLE_API_KEY;
  delete process.env.GOOGLE_CUSTOM_SEARCH_API_KEY;
  delete process.env.GOOGLE_CSE_ID;
  delete process.env.GOOGLE_CUSTOM_SEARCH_ENGINE_ID;
  try {
    dumpVisibility('google search interest helper requires credentials', { status: 'rejected' });
    await assert.rejects(() => fetchGoogleCustomSearchInterest('fed rate cut'), /not configured/);
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test('prediction interest wrapper is wired to google custom search', async () => {
  const saved = {
    GOOGLE_API_KEY: process.env.GOOGLE_API_KEY,
    GOOGLE_CUSTOM_SEARCH_API_KEY: process.env.GOOGLE_CUSTOM_SEARCH_API_KEY,
    GOOGLE_CSE_ID: process.env.GOOGLE_CSE_ID,
    GOOGLE_CUSTOM_SEARCH_ENGINE_ID: process.env.GOOGLE_CUSTOM_SEARCH_ENGINE_ID,
  };
  delete process.env.GOOGLE_API_KEY;
  delete process.env.GOOGLE_CUSTOM_SEARCH_API_KEY;
  delete process.env.GOOGLE_CSE_ID;
  delete process.env.GOOGLE_CUSTOM_SEARCH_ENGINE_ID;
  try {
    dumpVisibility('prediction interest wrapper is wired to google custom search', { status: 'rejected' });
    await assert.rejects(() => fetchPredictionInterestSignal('fed_rate_cut_prob'), /not configured/);
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test('indicators produce rolling feature rows from sample bars', () => {
  const frame = calculateRollingFeatureFrame(generateSampleBars('SPY', 40), 2, { rsi: 7, atr: 7, bollinger: 10 });
  dumpVisibility('indicators produce rolling feature rows from sample bars', { frame });
  assert.equal(frame.feature_count, 39);
  assert.equal(frame.indicator_periods.rsi, 7);
  assert.equal(frame.features.at(-1).symbol, 'SPY');
  assert.equal(typeof frame.features.at(-1).return_fast, 'number');
  assert.equal(typeof rsi(generateSampleBars('SPY', 20).map((bar) => bar.close), 14), 'number');
});

test('model comparison and backtest produce ranked, reproducible outputs', () => {
  const frame = calculateRollingFeatureFrame(generateSampleBars('SPY', 80), 2);
  const comparison = compareModels(frame);
  assert.equal(comparison.models.length, modelCandidates.length);
  assert.ok(comparison.models.length >= 10);
  assert.ok(comparison.families.includes('boosting'));
  assert.ok(comparison.families.includes('trees'));
  assert.ok(comparison.families.includes('neural'));
  assert.ok(comparison.winner);
  assert.equal(comparison.per_symbol_winners[0].symbol, 'SPY');
  assert.ok(comparison.per_symbol_winners[0].winner);
  assert.ok(comparison.models.some((model) => model.name === 'xgboost_ranker_v0'));
  assert.ok(comparison.models.some((model) => model.name === 'decision_tree_stump_v0'));

  const backtest = runBacktest(frame, {
    model: comparison.winner,
    horizon: 5,
    threshold: 0.55,
    costBps: 5,
    feeBps: 2,
    slippageBps: 3,
    tailAlpha: 0.05,
    monteCarloRuns: 150,
    timeframe: '1d',
  });
  dumpVisibility('model comparison and backtest produce ranked, reproducible outputs', { frame, comparison, backtest });
  assert.equal(typeof backtest.metrics.net_return, 'number');
  assert.equal(typeof backtest.metrics.max_drawdown, 'number');
  assert.ok(Object.prototype.hasOwnProperty.call(backtest.metrics, 'sharpe_ratio'));
  assert.ok(Object.prototype.hasOwnProperty.call(backtest.metrics, 'sortino_ratio'));
  assert.ok(Object.prototype.hasOwnProperty.call(backtest.metrics, 'win_rate'));
  assert.ok(Object.prototype.hasOwnProperty.call(backtest.metrics, 'expected_value'));
  assert.ok(Object.prototype.hasOwnProperty.call(backtest.metrics, 'tail_risk'));
  assert.ok(Object.prototype.hasOwnProperty.call(backtest.metrics, 'monte_carlo'));
  assert.equal(Array.isArray(backtest.trade_logs), true);
  assert.equal(backtest.trade_logs[0].provider, 'sample');
  assert.equal(backtest.trade_logs[0].fee_bps, 2);
  assert.equal(backtest.trade_logs[0].slippage_bps, 3);
  assert.equal(backtest.trade_logs[0].holding_period_bars, 5);
  assert.equal(backtest.timeframe, '1d');
  assert.equal(Array.isArray(backtest.trades), true);
});

test('tail risk and monte carlo helpers are deterministic', () => {
  const returns = [0.03, -0.02, 0.01, -0.05, 0.04, -0.01];
  const tailRisk = historicalTailRisk(returns, 0.05);
  const mcA = monteCarloStress(returns, { runs: 120, seed: 'demo' });
  const mcB = monteCarloStress(returns, { runs: 120, seed: 'demo' });
  dumpVisibility('tail risk and monte carlo helpers are deterministic', { tailRisk, mcA, mcB });
  assert.equal(tailRisk.alpha, 0.05);
  assert.ok(Number.isFinite(tailRisk.value_at_risk));
  assert.ok(Number.isFinite(tailRisk.expected_shortfall));
  assert.deepEqual(mcA, mcB);
  assert.equal(mcA.runs, 120);
});
