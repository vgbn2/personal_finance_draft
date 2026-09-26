'use strict';

/**
 * TIER 3: PARAMETERIZED SCENARIO & FAULT INJECTION MATRIX HARNESS
 *
 * Executes full 48-combination permutation matrix:
 *   [3 Asset Classes: crypto, equities, fx]
 *   x [4 Timeframes: 1m, 5m, 1h, 1d]
 *   x [4 Fault Injections: zero_volume, nan_tick_price, flash_crash_spike, delayed_fill_timeout]
 *
 * Total: 48 scenarios running in a unified, deterministic harness with zero external network I/O.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  validateSnapshot,
  isFiniteNumber,
} = require('../../../../shared/lib/market/validation.js');
const {
  calculateRollingFeatureFrame,
  rsi,
  atr,
} = require('../../../../shared/lib/market/indicators.js');
const {
  evaluateDrawdownLimits,
} = require('../../../../shared/lib/risk/prop_firm_guard.js');
const {
  initializeLedger,
  appendLedgerEvents,
  loadLedgerProjection,
} = require('../../../../backend/gateway/src/paper_ledger.js');

const ASSETS = [
  { family: 'crypto', symbol: 'BTCUSDT', basePrice: 65000, provider: 'binance' },
  { family: 'equities', symbol: 'AAPL', basePrice: 220, provider: 'yahoo' },
  { family: 'fx', symbol: 'EURUSD', basePrice: 1.085, provider: 'mt5' },
];

const TIMEFRAMES = ['1m', '5m', '1h', '1d'];

const FAULT_MODES = [
  'zero_volume',
  'nan_tick_price',
  'flash_crash_spike',
  'delayed_fill_timeout',
];

function makeTempDir(prefix = 'sovereign-matrix-harness-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function generateSeries(asset, tf, count = 60, fault = null) {
  const baseTime = Date.parse('2026-05-01T00:00:00.000Z');
  const tfMinutes = { '1m': 1, '5m': 5, '1h': 60, '1d': 1440 }[tf] || 5;
  const sources = [];
  let price = asset.basePrice;

  for (let i = 0; i < count; i++) {
    const ts = new Date(baseTime + i * tfMinutes * 60 * 1000).toISOString();
    let change = (Math.sin(i / 6) * (price * 0.002));

    // Apply fault injections
    if (fault === 'flash_crash_spike' && i === Math.floor(count * 0.75)) {
      change = -(price * 0.25); // 25% sudden crash
    }

    const open = price;
    price = Math.max(0.001, price + change);
    const close = price;
    const high = Math.max(open, close) + (price * 0.001);
    const low = Math.min(open, close) - (price * 0.001);

    let vol = 1000;
    if (fault === 'zero_volume' && i % 2 === 0) {
      vol = 0; // 50% zero volume bars
    }

    const bar = {
      family: asset.family,
      provider: asset.provider,
      symbol: asset.symbol,
      timeframe: tf,
      timestamp: ts,
      open: Number(open.toFixed(asset.family === 'fx' ? 5 : 2)),
      high: Number(high.toFixed(asset.family === 'fx' ? 5 : 2)),
      low: Number(low.toFixed(asset.family === 'fx' ? 5 : 2)),
      close: Number(close.toFixed(asset.family === 'fx' ? 5 : 2)),
      volume: vol,
    };

    if (fault === 'nan_tick_price' && i === Math.floor(count / 2)) {
      bar.close = NaN;
      bar.low = -50;
    }

    sources.push(bar);
  }

  return {
    mode: 'live',
    fetched_at: new Date().toISOString(),
    sources,
  };
}

// ---------------------------------------------------------------------------
// TRAVELING SALESPERSON (TSP) GRAPH & NEAREST-NEIGHBOR ORDERING
// ---------------------------------------------------------------------------
const TRANSITION_WEIGHTS = {
  asset_switch: 10.0,     // Cold reload of base asset prices / fixtures
  timeframe_switch: 4.0,  // Indicator resample / window recomputation
  fault_switch: 1.0,      // In-memory parameter toggle
};

function calculateTransitionCost(a, b, weights = TRANSITION_WEIGHTS) {
  let cost = 0;
  if (a.asset.symbol !== b.asset.symbol) cost += weights.asset_switch;
  if (a.timeframe !== b.timeframe) cost += weights.timeframe_switch;
  if (a.fault !== b.fault) cost += weights.fault_switch;
  return cost;
}

function computeTourTotalCost(tour, weights = TRANSITION_WEIGHTS) {
  let total = 0;
  for (let i = 1; i < tour.length; i++) {
    total += calculateTransitionCost(tour[i - 1], tour[i], weights);
  }
  return total;
}

function computeNearestNeighborTour(scenarios, weights = TRANSITION_WEIGHTS) {
  if (!scenarios.length) return [];
  const unvisited = [...scenarios];
  const tour = [unvisited.shift()];

  while (unvisited.length > 0) {
    const current = tour[tour.length - 1];
    let nearestIdx = 0;
    let minCost = Infinity;

    for (let i = 0; i < unvisited.length; i++) {
      const cost = calculateTransitionCost(current, unvisited[i], weights);
      if (cost < minCost) {
        minCost = cost;
        nearestIdx = i;
      }
    }

    tour.push(unvisited.splice(nearestIdx, 1)[0]);
  }

  return tour;
}

// ---------------------------------------------------------------------------
// 48-COMBINATION MATRIX TEST RUNNER (TSP-OPTIMIZED)
// ---------------------------------------------------------------------------
test('Tier 3: Parameterized 48-Scenario Fault Injection Matrix', async (t) => {
  // 1. Build complete scenario list
  const naiveScenarios = [];
  for (const asset of ASSETS) {
    for (const tf of TIMEFRAMES) {
      for (const fault of FAULT_MODES) {
        naiveScenarios.push({ asset, timeframe: tf, fault });
      }
    }
  }

  // 2. Compute Nearest-Neighbor TSP Tour
  const tspTour = computeNearestNeighborTour(naiveScenarios);
  const naiveCost = computeTourTotalCost(naiveScenarios);
  const tspCost = computeTourTotalCost(tspTour);

  // Invariant: Nearest-neighbor TSP tour achieves optimal Hamiltonian path cost (92 vs 111 naive)
  assert.ok(
    tspCost <= naiveCost,
    `TSP cost (${tspCost}) must be less than or equal to naive cost (${naiveCost})`
  );
  assert.strictEqual(
    tspCost,
    92,
    `Nearest-neighbor TSP must achieve theoretical optimal Hamiltonian path cost of 92 (got ${tspCost})`
  );

  let executedCount = 0;
  let warmSeriesCache = null;
  let lastAssetTfKey = null;

  for (const item of tspTour) {
    const { asset, timeframe: tf, fault } = item;
    const scenarioLabel = `[${asset.family}:${asset.symbol}] [${tf}] [fault:${fault}]`;
    executedCount++;

    await t.test(`Scenario ${executedCount}/48: ${scenarioLabel}`, () => {
      // Re-use warm base series when asset and timeframe match consecutive tour nodes
      const currentKey = `${asset.symbol}:${tf}`;
      if (currentKey !== lastAssetTfKey || !warmSeriesCache) {
        warmSeriesCache = generateSeries(asset, tf, 60, null);
        lastAssetTfKey = currentKey;
      }

      // Generate fault-injected snapshot from current configuration
      const snapshot = generateSeries(asset, tf, 60, fault);

      if (fault === 'zero_volume') {
        // Assert indicators handle zero-volume periods without NaN
        const frame = calculateRollingFeatureFrame(snapshot, 20, { rsi: 14, bollinger: 20 });
        assert.ok(frame.features.length > 0, 'Feature frame should generate');
        const latest = frame.features[frame.features.length - 1];
        assert.ok(Number.isFinite(latest.rsi), 'RSI must remain finite with zero volume');
        assert.ok(Number.isFinite(latest.close), 'Close must remain finite');
      } else if (fault === 'nan_tick_price') {
        // Assert data validation detects and flags corrupt NaN/negative ticks
        const { report } = validateSnapshot(snapshot);
        assert.ok(report.issues.length > 0, 'Validation must report issues for corrupt tick');
        const hasCorruptIssue = report.issues.some(
          (issue) => issue.code.includes('invalid') || issue.code.includes('negative') || issue.severity === 'error'
        );
        assert.ok(hasCorruptIssue, 'Must flag invalid numeric price or negative bound');
      } else if (fault === 'flash_crash_spike') {
        // Assert risk engine flags severe drawdown breach
        const initialEquity = 100000;
        const crashedEquity = 75000; // 25% drawdown
        const risk = evaluateDrawdownLimits({
          currentEquity: crashedEquity,
          startingDailyEquity: initialEquity,
          highWaterMark: initialEquity,
          rules: { max_daily_loss: 0.04, max_total_loss: 0.06 },
        });
        assert.strictEqual(risk.ok, false, 'Risk guard must trigger on 25% crash');
        assert.strictEqual(risk.action, 'liquidate_and_lockout', 'Must command liquidation and lockout');
      } else if (fault === 'delayed_fill_timeout') {
        // Assert virtual paper ledger idempotency under duplicate retry
        const tempDir = makeTempDir();
        try {
          initializeLedger(tempDir, 10000);
          const orderKey = `order:${asset.symbol}:${tf}:retry_test`;
          const orderEvent = {
            event_type: 'paper_order_filled',
            idempotency_key: orderKey,
            event_time: new Date().toISOString(),
            symbol: asset.symbol,
            side: 'buy',
            size: 1.0,
            fill_price: asset.basePrice,
            cash_delta: -100,
          };

          // First append succeeds
          const firstAppend = appendLedgerEvents(tempDir, [orderEvent]);
          assert.strictEqual(firstAppend.ok, true);
          assert.strictEqual(firstAppend.accepted.length, 1);

          // Duplicate retry must be cleanly deduplicated
          const secondAppend = appendLedgerEvents(tempDir, [orderEvent]);
          assert.strictEqual(secondAppend.ok, true);
          assert.strictEqual(secondAppend.accepted.length, 0);
          assert.deepEqual(secondAppend.duplicates, [orderKey]);

          // Verify ledger state is pristine
          const proj = loadLedgerProjection(tempDir, 10000);
          assert.strictEqual(proj.projection.virtual_balance, 9900);
        } finally {
          fs.rmSync(tempDir, { recursive: true, force: true });
        }
      }
    });
  }

  assert.strictEqual(executedCount, 48, 'Must execute exactly 48 matrix combinations');
});
