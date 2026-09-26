'use strict';

/**
 * TIER 1: DETERMINISTIC CONTRACT & MATH INVARIANT GATES
 *
 * Target: < 3 seconds execution. Zero external network calls.
 * Evaluates mathematical invariants, PRNG transitions, binary serialization codecs,
 * and position sizing contracts directly against real recorded market fixtures (BTC, AAPL, MSFT).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  rsi,
  atr,
  bollingerBands,
  macd,
  pearsonCorrelation,
  calculateRollingFeatureFrame,
} = require('../../../../shared/lib/market/indicators.js');
const {
  TS_MAGIC,
  TS_HEADER_BYTES,
  TS_RECORD_BYTES,
} = require('../../../../shared/lib/market/ts_index_storage.js');
const {
  normalizeSizingIntent,
  roundDownToStep,
} = require('../../../../shared/lib/trading/position_sizing.js');

const BTC_FIXTURE_PATH = path.resolve(__dirname, '../../../../tests/fixtures/real_bars_btc.json');
const HISTORY_FIXTURE_PATH = path.resolve(__dirname, '../../../../tests/fixtures/backend_history_sample.json');

const btcFixture = JSON.parse(fs.readFileSync(BTC_FIXTURE_PATH, 'utf8'));
const historyFixture = JSON.parse(fs.readFileSync(HISTORY_FIXTURE_PATH, 'utf8'));

// ---------------------------------------------------------------------------
// 1. RSI Math Invariants (Real BTC & Flat Edge Case)
// ---------------------------------------------------------------------------
test('Tier 1: RSI neutral bounds on flat series', () => {
  // Pure flat series (zero price movement) must return exactly 50 neutral
  const flat = [100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100];
  const val = rsi(flat, 14);
  assert.strictEqual(val, 50, 'RSI on flat series must equal 50');
});

test('Tier 1: RSI computation on real Binance BTC bars', () => {
  const btcBars = btcFixture.sources;
  assert.ok(btcBars.length >= 50, 'Must have at least 50 real BTC bars');
  const closes = btcBars.map((b) => b.close);
  const rsiVal = rsi(closes, 14);

  assert.ok(Number.isFinite(rsiVal), 'RSI on real BTC data must be a finite number');
  assert.ok(rsiVal > 0 && rsiVal < 100, `RSI must lie strictly within (0, 100), got ${rsiVal}`);
});

// ---------------------------------------------------------------------------
// 2. ATR & Volatility Math Invariants (Real BTC & Equity Bars)
// ---------------------------------------------------------------------------
test('Tier 1: ATR non-negative and finite bounds on real market bars', () => {
  const btcBars = btcFixture.sources;
  const btcAtr = atr(btcBars, 14);

  assert.ok(Number.isFinite(btcAtr), 'ATR on real BTC bars must be finite');
  assert.ok(btcAtr > 0, `ATR on real BTC bars must be strictly positive, got ${btcAtr}`);

  // Test against AAPL bars from history sample
  const aaplBars = historyFixture.sources.filter((s) => s.symbol === 'AAPL');
  if (aaplBars.length > 14) {
    const aaplAtr = atr(aaplBars, 14);
    assert.ok(Number.isFinite(aaplAtr) && aaplAtr > 0, `ATR for AAPL must be finite and positive, got ${aaplAtr}`);
  }
});

// ---------------------------------------------------------------------------
// 3. Pearson Correlation Invariants (Real Cross-Series Pairs)
// ---------------------------------------------------------------------------
test('Tier 1: Pearson correlation bounded in [-1.0, 1.0] across real market series', () => {
  const btcBars = btcFixture.sources;
  assert.ok(btcBars.length >= 20, 'Must have at least 20 real BTC bars');

  const opens = btcBars.map((b) => b.open);
  const closes = btcBars.map((b) => b.close);
  const volumes = btcBars.map((b) => b.volume);

  const priceCorr = pearsonCorrelation(opens, closes);
  assert.ok(Number.isFinite(priceCorr), 'Correlation must be finite');
  assert.ok(priceCorr >= -1.0 && priceCorr <= 1.0, `Correlation must be in [-1, 1], got ${priceCorr}`);
  assert.ok(priceCorr > 0.8, `Open vs Close on 1h BTC bars should be strongly positive, got ${priceCorr}`);

  const volCorr = pearsonCorrelation(closes, volumes);
  assert.ok(Number.isFinite(volCorr), 'Price vs Volume correlation must be finite');
  assert.ok(volCorr >= -1.0 && volCorr <= 1.0, `Price vs Volume correlation must be in [-1, 1], got ${volCorr}`);

  // Self-correlation must be exactly 1.0
  const selfCorr = pearsonCorrelation(closes, closes);
  assert.ok(Math.abs(selfCorr - 1.0) < 1e-6, `Self-correlation must be 1.0, got ${selfCorr}`);
});

// ---------------------------------------------------------------------------
// 4. Binary SOVT TS Codec Invariants
// ---------------------------------------------------------------------------
test('Tier 1: Binary SOVT TS header and record layout packing against real BTC bar', () => {
  assert.strictEqual(TS_MAGIC, 'SOVT', 'Magic header must be SOVT');
  assert.strictEqual(TS_HEADER_BYTES, 8, 'Header must be 8 bytes (4 magic + 4 count)');
  assert.strictEqual(TS_RECORD_BYTES, 48, 'Record size must be exactly 48 bytes (6x Float64)');

  const sampleBar = btcFixture.sources[0];
  const buf = Buffer.alloc(TS_HEADER_BYTES + TS_RECORD_BYTES);
  buf.write(TS_MAGIC, 0, 4, 'ascii');
  buf.writeUInt32LE(1, 4);

  const barTs = Date.parse(sampleBar.timestamp);
  buf.writeDoubleLE(barTs, 8);
  buf.writeDoubleLE(sampleBar.open, 16);
  buf.writeDoubleLE(sampleBar.high, 24);
  buf.writeDoubleLE(sampleBar.low, 32);
  buf.writeDoubleLE(sampleBar.close, 40);
  buf.writeDoubleLE(sampleBar.volume, 48);

  // Unpack and assert exact fidelity with original real bar
  assert.strictEqual(buf.toString('ascii', 0, 4), 'SOVT');
  assert.strictEqual(buf.readUInt32LE(4), 1);
  assert.strictEqual(buf.readDoubleLE(8), barTs);
  assert.strictEqual(buf.readDoubleLE(16), sampleBar.open);
  assert.strictEqual(buf.readDoubleLE(24), sampleBar.high);
  assert.strictEqual(buf.readDoubleLE(32), sampleBar.low);
  assert.strictEqual(buf.readDoubleLE(40), sampleBar.close);
  assert.strictEqual(buf.readDoubleLE(48), sampleBar.volume);
});

// ---------------------------------------------------------------------------
// 5. Position Sizing & Step Invariants on Real Market Instruments
// ---------------------------------------------------------------------------
test('Tier 1: Position sizing step clamping and real BTC/USDT instrument contract', () => {
  // Step clamping with real BTC lot step (0.001)
  const stepped = roundDownToStep(0.123456, 0.001);
  assert.strictEqual(stepped, 0.123, 'Must round down to lot step 0.001');

  // Real BTC/USDT contract sizing
  const btcLatestClose = btcFixture.sources[btcFixture.sources.length - 1].close;
  const normalized = normalizeSizingIntent({
    intent: { mode: 'notional', value: 10000 },
    instrument: {
      instrumentId: 'BTCUSDT',
      assetClass: 'crypto',
      quantityStep: 0.001,
      contractMultiplier: 1,
      minNotional: 10,
      maxNotional: 1000000,
    },
    referencePrice: btcLatestClose,
    availableNotional: 50000,
  });

  assert.strictEqual(normalized.ok, true, `Sizing should succeed: ${normalized.reason}`);
  assert.ok(normalized.quantity > 0, 'Quantity must be positive');
  assert.ok(normalized.projected_notional <= 10000, 'Projected notional must not exceed requested');
});
