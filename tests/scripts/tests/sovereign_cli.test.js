const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const CLI_PATH = path.join(__dirname, '..', '..', '..', 'backend', 'cli', 'sovereign_cli.js');
const { mergeSnapshots, validateSnapshot } = require('../../../shared/lib/market/validation');
const { classifySupabaseError } = require('../../../shared/lib/supabase/errors');
const { commandLogin } = require('../../../backend/cli/commands/account/auth');
const auth = require('../../../backend/cli/lib/auth');
const {
  cryptoLimitForWindow,
  filterCandlesByWindow,
  historicalWindowFromArgs,
  buildTradeGatewayLaunch,
  currentPhaseLabel,
} = require('../../../backend/cli/sovereign_cli');
const {
  buildPolymarketActionChoices,
  buildPolymarketCategoryChoices,
  buildPolymarketMarketChoices,
  buildTokenChoicePrompt,
  deriveDefaultBuyPriceFromBook,
  hasPolymarketOrderbookDepth,
  minOrderSizeFromBook,
  normalizeLimitPriceInput,
  resolveOutcomeToken,
  renderPolymarketMarketDetails,
  renderPolymarketOrderbookDetails,
} = require('../../../backend/cli/commands/trade/trade');
const {
  fetchGoogleCustomSearchInterest,
  fetchPredictionInterestSignal,
  polymarketTimeframeFromOptions,
  parsePolymarketTokenIds,
  polymarketMarketRecord,
  polymarketPriceHistoryRecords,
  parseStooqCsv,
  redactUrl,
  dedupePreferredMarketQuotes,
  collectIngestSkipChecks,
  loadExternalQuoteInputs,
  loadExternalQuoteProvider,
  parseCsvTable,
  unresolvedProviderErrors,
} = require('../../../backend/scripts/data_ops/ingest_market_data');
const {
  normalizeExternalQuotePayload,
  normalizeExternalQuotePayloadWithReport,
  normalizeSymbol,
  selectPreferredQuoteRecords,
} = require('../../../shared/lib/market/quote_router');

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
  const p = path.join(__dirname, '..', '..', 'fixtures', 'test', 'fixtures', `${name}.json`);
  if (!fs.existsSync(p)) {
    // Fallback for transition phase: create if missing for some tests
    return null;
  }
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function parseCliJsonOutput(stdout) {
  const cleaned = String(stdout || '').replace(/\u001b\[[0-9;]*m/g, '');
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`Unable to locate JSON payload in CLI output:\n${cleaned}`);
  }
  return JSON.parse(cleaned.slice(start, end + 1));
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

test('supabase network errors are classified into a friendly message', () => {
  const error = new TypeError('fetch failed', {
    cause: { code: 'EACCES', message: 'permission denied' },
  });

  const message = classifySupabaseError(error, 'sign in to Supabase');
  dumpVisibility('supabase network errors are classified into a friendly message', { message });
  assert.match(message, /Unable to sign in to Supabase/i);
  assert.doesNotMatch(message, /fetch failed/i);
  assert.doesNotMatch(message, /EACCES/i);
});

test('login command reports supabase connectivity problems without a raw stack trace', async () => {
  const original = {
    isSupabaseConfigured: auth.isSupabaseConfigured,
    loadSession: auth.loadSession,
    isSessionValid: auth.isSessionValid,
    refreshSession: auth.refreshSession,
    getAuthenticatedUser: auth.getAuthenticatedUser,
    loginWithCredentials: auth.loginWithCredentials,
  };
  const captured = { errors: [], logs: [] };
  const originalError = console.error;
  const originalLog = console.log;

  auth.isSupabaseConfigured = () => true;
  auth.getAuthenticatedUser = async () => {
    throw new Error('Unable to reach Supabase auth. Check network access, the Supabase URL, and the publishable key.');
  };
  auth.loginWithCredentials = async () => {
    throw new Error('should not be reached');
  };
  console.error = (...args) => captured.errors.push(args.join(' '));
  console.log = (...args) => captured.logs.push(args.join(' '));

  try {
    const exitCode = await commandLogin(['login', '--email', 'user@example.com', '--password', 'secret']);
    dumpVisibility('login command reports supabase connectivity problems without a raw stack trace', {
      exitCode,
      errors: captured.errors,
      logs: captured.logs,
    });
    assert.equal(exitCode, 1);
    assert.ok(captured.errors.some((line) => /Unable to reach Supabase auth/i.test(line)));
    assert.ok(captured.errors.every((line) => !/fetch failed|EACCES|AggregateError/i.test(line)));
  } finally {
    auth.isSupabaseConfigured = original.isSupabaseConfigured;
    auth.loadSession = original.loadSession;
    auth.isSessionValid = original.isSessionValid;
    auth.refreshSession = original.refreshSession;
    auth.getAuthenticatedUser = original.getAuthenticatedUser;
    auth.loginWithCredentials = original.loginWithCredentials;
    console.error = originalError;
    console.log = originalLog;
  }
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
  assert.match(phase, /Phase 9: Strategic Intelligence & TUI Integration - ACTIVE/i);
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
  assert.ok(
    launch.args.some((value) => /backend[\\/]gateway[\\/]src[\\/]index\.ts/.test(value)) ||
    launch.args.some((value) => /backend[\\/]cli[\\/]lib[\\/]run_trade_gateway\.js/.test(value))
  );
  assert.ok(launch.args.some((value) => /balance/.test(String(value))));
});

test('polymarket timeframe labels match requested price-history fidelity', () => {
  dumpVisibility('polymarket timeframe labels match requested price-history fidelity', {});
  assert.equal(polymarketTimeframeFromOptions({ interval: '1d', fidelity: 1440 }), '1d');
  assert.equal(polymarketTimeframeFromOptions({ interval: 'max', fidelity: 60 }), '1h');
  assert.equal(polymarketTimeframeFromOptions({ interval: 'max', fidelity: 15 }), '15m');
});

test('polymarket market browser exposes operator-friendly category defaults', () => {
  const choices = buildPolymarketCategoryChoices();
  assert.equal(Array.isArray(choices), true);
  assert.equal(choices[0].value, 'crypto');
  assert.match(choices[0].label, /Recommended/);
  assert.ok(choices.some((choice) => choice.value === '__custom__'));
});

test('polymarket market browser builds concise market labels and detailed output', () => {
  const markets = [{
    question: 'Will Bitcoin hit $150k by June 30, 2026?',
    volume: 19823596.559,
  }];
  const choices = buildPolymarketMarketChoices(markets);
  assert.equal(choices.length, 1);
  assert.match(choices[0].label, /Bitcoin hit \$150k/);
  assert.match(choices[0].label, /vol 19,823,597/);

  const detail = renderPolymarketMarketDetails(
    { category: 'crypto' },
    {
      section: 'Bitcoin',
      question: 'Will Bitcoin hit $150k by June 30, 2026?',
      slug: 'bitcoin-150k-june-30-2026',
      condition_id: '0xcondition',
      volume: 19823596.559,
      liquidity: 2500000,
      active: true,
      closed: false,
      tokens: [
        { outcome: 'Yes', token_id: 'token-yes' },
        { outcome: 'No', token_id: 'token-no' },
      ],
    }
  );
  assert.match(detail, /Polymarket Market Detail/);
  assert.match(detail, /Category: crypto/);
  assert.match(detail, /Outcomes:/);
  assert.match(detail, /token-yes/);
  assert.doesNotMatch(detail, /Slug:/);
  assert.match(detail, /Use Market action to inspect orderbook, history, or place orders\./);
});

test('polymarket action choices expose buy and research actions for yes/no markets', () => {
  const market = {
    tokens: [
      { outcome: 'Yes', token_id: 'yes-token' },
      { outcome: 'No', token_id: 'no-token' },
    ],
  };
  const choices = buildPolymarketActionChoices(market);
  assert.ok(choices.some((choice) => choice.value === 'orderbook'));
  assert.ok(choices.some((choice) => choice.value === 'price_history'));
  assert.ok(choices.some((choice) => choice.value === 'buy_yes'));
  assert.ok(choices.some((choice) => choice.value === 'buy_no'));
  assert.equal(resolveOutcomeToken(market, 'yes').token_id, 'yes-token');
  assert.equal(resolveOutcomeToken(market, 'no').token_id, 'no-token');
});

test('polymarket orderbook helpers render best prices and derive a default buy price', () => {
  const snapshot = {
    tokenId: 'yes-token',
    book: {
      bids: [
        { price: '0.01', size: '1000' },
        { price: '0.41', size: '125' },
      ],
      asks: [
        { price: '0.99', size: '1000' },
        { price: '0.43', size: '80' },
      ],
    },
  };
  assert.equal(deriveDefaultBuyPriceFromBook(snapshot), 0.43);
  const rendered = renderPolymarketOrderbookDetails(
    { question: 'Will Bitcoin hit $150k by June 30, 2026?' },
    snapshot
  );
  assert.match(rendered, /Best bid: 0.41 x 125/);
  assert.match(rendered, /Best ask: 0.43 x 80/);
  assert.match(rendered, /Near-spread bids:/);
  assert.match(rendered, /Near-spread asks:/);
  assert.ok(rendered.indexOf('0.41 x 125') < rendered.indexOf('0.01 x 1000'));
  assert.ok(rendered.indexOf('0.43 x 80') < rendered.indexOf('0.99 x 1000'));
});

test('polymarket limit price parser accepts decimal and percent shorthand', () => {
  assert.deepEqual(normalizeLimitPriceInput('0.40', 0.99, 0.01), { ok: true, price: 0.4 });
  assert.deepEqual(normalizeLimitPriceInput('.40', 0.99, 0.01), { ok: true, price: 0.4 });
  assert.deepEqual(normalizeLimitPriceInput('40%', 0.99, 0.01), { ok: true, price: 0.4 });
  assert.deepEqual(normalizeLimitPriceInput('40', 0.99, 0.01), { ok: true, price: 0.4 });
  assert.deepEqual(normalizeLimitPriceInput('', 0.99, 0.01), { ok: true, price: 0.99 });
  assert.equal(normalizeLimitPriceInput('0.', 0.99, 0.01).reason, 'incomplete_decimal');
});

test('polymarket order entry reads min order size from orderbook', () => {
  assert.equal(minOrderSizeFromBook({ book: { min_order_size: '5' } }), 5);
  assert.equal(minOrderSizeFromBook({ book: { min_order_size: '0' } }), 0);
  assert.equal(minOrderSizeFromBook({ book: {} }), 0);
});

test('polymarket order entry blocks empty orderbook depth', () => {
  assert.equal(hasPolymarketOrderbookDepth({ book: { bids: [], asks: [] } }), false);
  assert.equal(hasPolymarketOrderbookDepth({ book: { bids: [{ price: '0.11', size: '10' }], asks: [] } }), true);
  assert.equal(hasPolymarketOrderbookDepth({ book: { bids: [], asks: [{ price: '0.12', size: '10' }] } }), true);
});

test('polymarket token chooser exposes explicit yes/no token ids', () => {
  const choices = buildTokenChoicePrompt({
    tokens: [
      { outcome: 'Yes', token_id: 'yes-token' },
      { outcome: 'No', token_id: 'no-token' },
    ],
  });
  assert.equal(choices.length, 2);
  assert.match(choices[0].label, /Yes/);
  assert.equal(choices[0].value, 'yes-token');
});

test('polymarket market records preserve clob token ids for historical lookup', () => {
  const market = {
    id: '123',
    conditionId: '0xabc',
    question: 'Will the Fed cut rates in 2026?',
    updatedAt: '2026-06-04T00:00:00.000Z',
    volume: '1000.25',
    liquidity: '500.5',
    clobTokenIds: '["111","222"]',
    lastTradePrice: '0.42',
  };
  const record = polymarketMarketRecord('fed_rate_cut_prob', market, 'https://gamma-api.polymarket.com/markets');
  dumpVisibility('polymarket market records preserve clob token ids for historical lookup', { market, record });
  assert.deepEqual(parsePolymarketTokenIds(market), ['111', '222']);
  assert.equal(record.provider, 'polymarket');
  assert.equal(record.symbol, 'fed_rate_cut_prob');
  assert.equal(record.condition_id, '0xabc');
  assert.equal(record.value, 0.42);
  assert.deepEqual(record.clob_token_ids, ['111', '222']);
});

test('polymarket price history normalizes to prediction market candles', () => {
  const market = {
    id: '123',
    condition_id: '0xabc',
    question: 'Will the Fed cut rates in 2026?',
  };
  const payload = {
    history: [
      { t: 1780531200, p: 0.4 },
      { t: 1780534800, p: 0.45 },
    ],
  };
  const records = polymarketPriceHistoryRecords(
    'fed_rate_cut_prob',
    market,
    '111',
    payload,
    { interval: 'max', fidelity: 60 },
    'https://clob.polymarket.com/prices-history?market=111&interval=max&fidelity=60'
  );
  dumpVisibility('polymarket price history normalizes to prediction market candles', { payload, records });
  assert.equal(records.length, 2);
  assert.equal(records[0].provider, 'polymarket');
  assert.equal(records[0].timeframe, '1h');
  assert.equal(records[0].market_id, '123');
  assert.equal(records[0].token_id, '111');
  assert.equal(records[0].close, 0.4);
  const normalizedMarketRecords = polymarketPriceHistoryRecords(
    'fed_rate_cut_prob',
    { market_id: 'normalized-123', condition_id: '0xabc', question: market.question },
    '111',
    payload,
    { interval: 'max', fidelity: 60 },
    'https://clob.polymarket.com/prices-history?market=111&interval=max&fidelity=60'
  );
  assert.equal(normalizedMarketRecords[0].market_id, 'normalized-123');
  const snapshot = {
    mode: 'backtest_history',
    fetched_at: '2026-06-04T00:00:00.000Z',
    sources: records,
  };
  const { report, usableSources } = validateSnapshot(snapshot);
  assert.equal(report.ok, true);
  assert.equal(usableSources.length, 2);
});

test('CLI backtest refuses stale live input by default', () => {
  const fixture = loadFixture('stale_live');
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sovereign-cli-'));
  const input = path.join(tempDir, 'stale-live.json');
  fs.writeFileSync(input, JSON.stringify(fixture), 'utf8');

  const result = spawnSync(process.execPath, [
    CLI_PATH,
    'bt',
    '--input',
    input,
    '--json',
  ], { encoding: 'utf8' });

  assert.equal(result.status, 1);
  const payload = JSON.parse(result.stdout);
  assert.ok(
    /Data-quality validation failed:/.test(payload.error) ||
    /fetch failed/.test(payload.error),
    payload.error,
  );
  if (/Data-quality validation failed:/.test(payload.error)) {
    assert.match(payload.error, /2 stale records/);
  }
  dumpVisibility('CLI backtest refuses stale live input by default', { fixture, payload });
});

test('research commands refuse stale live input by default', () => {
  const fixture = loadFixture('stale_live');
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sovereign-research-'));
  const input = path.join(tempDir, 'stale-live.json');
  fs.writeFileSync(input, JSON.stringify(fixture), 'utf8');

  for (const command of ['features', 'models', 'optimize']) {
    const result = spawnSync(process.execPath, [
      CLI_PATH,
      command,
      '--input',
      input,
      '--json',
    ], { encoding: 'utf8' });

    assert.equal(result.status, 1);
    const payload = parseCliJsonOutput(result.stdout);
    assert.ok(
      /failed data-quality validation/.test(payload.error) ||
      /fetch failed/.test(payload.error),
      payload.error,
    );
    dumpVisibility('research commands refuse stale live input by default', { command, payload });
  }
});

test('optimize fails fast when the current slice has no usable features', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sovereign-optimize-'));
  const input = path.join(tempDir, 'empty-snapshot.json');
  fs.writeFileSync(input, JSON.stringify({
    mode: 'provider_history',
    fetched_at: '2026-06-02T00:00:00.000Z',
    sources: [],
    backfill_windows: [],
  }), 'utf8');

  const result = spawnSync(process.execPath, [
    CLI_PATH,
    'optimize',
    '--strategy',
    'config/strategies/defensive_rotation.yaml',
    '--input',
    input,
    '--json',
  ], { encoding: 'utf8' });

  assert.equal(result.status, 1);
  const payload = parseCliJsonOutput(result.stdout);
  assert.match(payload.error, /Optimization input has no usable features in the current slice/);
  assert.doesNotMatch(payload.error, /Refreshing provider history/i);
  assert.doesNotMatch(payload.error, /Failed to load equities/i);
  dumpVisibility('optimize fails fast when the current slice has no usable features', { payload });
});

test('strategy command creates a validated yaml plan file', () => {
  const registryPath = path.join(__dirname, '..', '..', '..', 'config', 'trading', 'strategies.yaml');
  const registryBackup = fs.readFileSync(registryPath, 'utf8');
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'strategy-config-'));
  const target = path.join(tempDir, 'my_strategy.yaml');
  try {
    const result = spawnSync(process.execPath, [
      CLI_PATH,
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
      CLI_PATH,
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
      CLI_PATH,
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
  assert.equal(normalizeSymbol('BTCUSDT', 'crypto'), 'BTCUSDT');

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
    CLI_PATH,
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
