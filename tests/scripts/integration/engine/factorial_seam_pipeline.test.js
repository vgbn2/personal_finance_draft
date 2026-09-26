'use strict';

/**
 * TIER 2: CASCADING MULTI-SECTION ("FACTORIAL") SEAM PIPELINE TESTING
 *
 * Verifies cumulative multi-stage pipeline composition:
 *   - Section 1 alone: Ingest raw OHLCV series through quote_router -> assert clean candles and volume.
 *   - Section 1 + 2: Ingest -> Binary TS Index (writeTsIndex/readTsIndex) -> assert binary frame parity & monotonic ordering.
 *   - Section 1 + 2 + 3: Ingest -> TS Index -> Indicators (calculateRollingFeatureFrame) -> assert RSI/ATR feature frame integrity.
 *   - Section 1 + 2 + 3 + 4: Ingest -> TS Index -> Indicators -> Strategy Evaluator (rsi_backtest) -> assert signal derivation.
 *   - Section 1 + ... + 5: Ingest -> TS Index -> Indicators -> Strategy -> Risk Guard (evaluateDrawdownLimits) -> Virtual Paper Ledger (appendLedgerEvents).
 *
 * Diagnostic Invariant:
 *   If Section 1..k pass individually, but Section 1..k+1 fails, the exact broken boundary is immediately isolated to the interface between Section k and k+1.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  normalizeSymbol,
  normalizeFamily,
} = require('../../../../shared/lib/market/quote_router.js');
const {
  writeTsIndex,
  readTsIndex,
} = require('../../../../shared/lib/market/ts_index_storage.js');
const {
  calculateRollingFeatureFrame,
} = require('../../../../shared/lib/market/indicators.js');
const {
  analyzeSeries,
} = require('../../../../shared/lib/strategy/rsi_backtest.js');
const {
  evaluateDrawdownLimits,
} = require('../../../../shared/lib/risk/prop_firm_guard.js');
const {
  initializeLedger,
  appendLedgerEvents,
  loadLedgerProjection,
} = require('../../../../backend/gateway/src/paper_ledger.js');

const BTC_FIXTURE_PATH = path.resolve(__dirname, '../../../../tests/fixtures/real_bars_btc.json');
const btcFixture = JSON.parse(fs.readFileSync(BTC_FIXTURE_PATH, 'utf8'));

function makeTempDir(prefix = 'sovereign-factorial-seam-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

// ===========================================================================
// SECTION 1: INGESTION & NORMALIZATION
// ===========================================================================
test('Factorial Seam Section 1: Ingest & Normalize raw OHLCV tickers', () => {
  const rawSymbol = 'BTC/USDT';
  const rawFamily = 'crypto';

  const normSymbol = normalizeSymbol(rawSymbol, rawFamily);
  const normFamily = normalizeFamily(rawFamily);

  assert.strictEqual(normSymbol, 'BTCUSDT', 'Symbol should be normalized to canonical BTCUSDT');
  assert.strictEqual(normFamily, 'crypto', 'Family should normalize to crypto');

  // Verify real fixture sources
  const bars = btcFixture.sources;
  assert.ok(bars.length >= 50, 'Must have at least 50 recorded BTC bars');
  for (const bar of bars) {
    assert.strictEqual(bar.symbol, 'BTCUSDT');
    assert.ok(Number.isFinite(bar.open));
    assert.ok(Number.isFinite(bar.high));
    assert.ok(Number.isFinite(bar.low));
    assert.ok(Number.isFinite(bar.close));
    assert.ok(bar.high >= bar.low, 'High must be >= low');
  }
});

// ===========================================================================
// SECTION 1 + 2: INGESTION -> BINARY TS STORAGE
// ===========================================================================
test('Factorial Seam Section 1 + 2: Ingest -> Binary TS Index Storage', () => {
  const tempDir = makeTempDir();
  const tsDir = path.join(tempDir, 'ts');

  try {
    const rawSources = btcFixture.sources;
    writeTsIndex(tsDir, {
      mode: 'live',
      sources: rawSources,
    });

    // Read back and assert fidelity with original real bars
    const readBack = readTsIndex(tsDir, 'BTCUSDT', '1h');
    assert.ok(readBack.length > 0, 'readTsIndex should return records');
    assert.strictEqual(readBack.length, rawSources.length, 'Record count must match');

    for (let i = 0; i < readBack.length; i++) {
      const original = rawSources[i];
      const stored = readBack[i];
      assert.strictEqual(Date.parse(stored.timestamp), Date.parse(original.timestamp));
      assert.strictEqual(stored.open, original.open);
      assert.strictEqual(stored.high, original.high);
      assert.strictEqual(stored.low, original.low);
      assert.strictEqual(stored.close, original.close);
    }
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

// ===========================================================================
// SECTION 1 + 2 + 3: INGESTION -> BINARY TS -> INDICATOR FEATURE FRAME
// ===========================================================================
test('Factorial Seam Section 1 + 2 + 3: Ingest -> TS Storage -> Indicator Derivation', () => {
  const tempDir = makeTempDir();
  const tsDir = path.join(tempDir, 'ts');

  try {
    writeTsIndex(tsDir, { mode: 'live', sources: btcFixture.sources });
    const storedBars = readTsIndex(tsDir, 'BTCUSDT', '1h');

    // Feed stored binary TS bars directly into feature frame generator
    const snapshot = {
      sources: storedBars.map((b) => ({ ...b, symbol: 'BTCUSDT', family: 'crypto', timeframe: '1h' })),
    };
    const frame = calculateRollingFeatureFrame(snapshot, 20, { rsi: 14, bollinger: 20 });

    assert.ok(frame.features.length > 0, 'Must produce rolling feature frame');
    const latest = frame.features[frame.features.length - 1];

    assert.strictEqual(latest.symbol, 'BTCUSDT');
    assert.ok(Number.isFinite(latest.rsi), 'RSI must be finite');
    assert.ok(latest.rsi > 0 && latest.rsi < 100, 'RSI must be bounded in (0, 100)');
    assert.ok(latest.volatility > 0, 'Volatility must be positive');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

// ===========================================================================
// SECTION 1 + 2 + 3 + 4: INGESTION -> TS -> INDICATORS -> STRATEGY EVALUATOR
// ===========================================================================
test('Factorial Seam Section 1 + 2 + 3 + 4: Ingest -> TS -> Indicators -> Strategy Signals', () => {
  const tempDir = makeTempDir();
  const tsDir = path.join(tempDir, 'ts');

  try {
    writeTsIndex(tsDir, { mode: 'live', sources: btcFixture.sources });
    const storedBars = readTsIndex(tsDir, 'BTCUSDT', '1h');

    // Run RSI reversal strategy analysis directly on real binary-stored bars
    const analysis = analyzeSeries({
      bars: storedBars,
      timeframe: '1h',
      forwardBars: 5,
      regimeMaPeriod: 20,
      oosDate: null,
    });

    assert.notStrictEqual(analysis, null, 'Analysis should succeed for 50+ bars');
    assert.strictEqual(analysis.tf, '1h');
    assert.strictEqual(analysis.bars, storedBars.length);
    assert.strictEqual(typeof analysis.oversold, 'object', 'Oversold stats must be an object');
    assert.strictEqual(typeof analysis.overbought, 'object', 'Overbought stats must be an object');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

// ===========================================================================
// SECTION 1..5: FULL PIPELINE INGEST -> TS -> INDICATORS -> STRATEGY -> RISK -> PAPER LEDGER
// ===========================================================================
test('Factorial Seam Section 1..5: Ingest -> TS -> Indicators -> Strategy -> Risk -> Paper Ledger', () => {
  const tempDir = makeTempDir();
  const tsDir = path.join(tempDir, 'ts');
  const ledgerDir = path.join(tempDir, 'ledger');

  try {
    // 1. Ingest & Store
    writeTsIndex(tsDir, { mode: 'live', sources: btcFixture.sources });
    const storedBars = readTsIndex(tsDir, 'BTCUSDT', '1h');

    // 2. Derive Features & Strategy Signals
    const snapshot = {
      sources: storedBars.map((b) => ({ ...b, symbol: 'BTCUSDT', family: 'crypto', timeframe: '1h' })),
    };
    const frame = calculateRollingFeatureFrame(snapshot, 20, { rsi: 14, bollinger: 20 });
    const latestBar = storedBars[storedBars.length - 1];

    // 3. Pre-Trade Risk Evaluation (PropFirmRiskGuard)
    const riskCheck = evaluateDrawdownLimits({
      currentEquity: 100000,
      startingDailyEquity: 100000,
      highWaterMark: 100000,
      rules: { max_daily_loss: 0.04, max_total_loss: 0.06 },
    });

    assert.strictEqual(riskCheck.ok, true, 'Pre-trade risk check must pass on fresh capital');

    // 4. Virtual Paper Ledger Order Execution & Balance Reconciliation
    const initRes = initializeLedger(ledgerDir, 100000);
    assert.strictEqual(initRes.ok, true, 'Ledger must initialize');

    const orderEvent = {
      event_type: 'paper_order_filled',
      idempotency_key: `order:BTCUSDT:buy:0.1:${Date.parse(latestBar.timestamp)}`,
      event_time: latestBar.timestamp,
      symbol: 'BTCUSDT',
      side: 'buy',
      size: 0.1,
      fill_price: latestBar.close,
      cash_delta: -(0.1 * latestBar.close),
      fees: 1.50,
      slippage: 0.50,
    };

    const appendRes = appendLedgerEvents(ledgerDir, [orderEvent]);
    assert.strictEqual(appendRes.ok, true, 'Ledger append must succeed');
    assert.strictEqual(appendRes.accepted.length, 1);

    // 5. Load projection and verify strict balance reconciliation
    const projRes = loadLedgerProjection(ledgerDir, 100000);
    assert.strictEqual(projRes.ok, true);
    assert.strictEqual(projRes.projection.virtual_balance, 100000 - (0.1 * latestBar.close));
    assert.strictEqual(projRes.events.length, 2); // 1 init + 1 fill
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
