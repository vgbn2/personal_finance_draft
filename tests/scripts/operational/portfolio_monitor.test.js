'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  buildAggregatedPortfolioSnapshot,
} = require('../../../backend/gateway/src/polymarket_portfolio.js');

const {
  DEFAULT_THRESHOLDS,
  loadRiskThresholds,
  buildRiskAssessment,
  runPortfolioMonitorCycle,
  portfolioMonitorExitCode,
} = require('../../../backend/cli/commands/operational/portfolio_monitor.js');

function snapshot(overrides = {}) {
  return {
    total_equity: 100000,
    total_usd: 60000,
    positions: [
      { symbol: 'AAPL', quantity: 100, averagePrice: 200, marketValue: 20000 },
      { symbol: 'BTCUSDT', quantity: 0.5, averagePrice: 40000, marketValue: 20000 },
    ],
    brokers: [
      { name: 'Alpaca (Paper)', status: 'connected' },
      { name: 'Gate.io', status: 'connected' },
    ],
    ...overrides,
  };
}

function legacySnapshot(overrides = {}) {
  return { ok: true, ...snapshot(overrides) };
}

function productionSnapshot(overrides = {}) {
  const live = buildAggregatedPortfolioSnapshot([
    {
      name: 'Alpaca (Live)',
      ok: true,
      balance: { USD: 30000, EQUITY: 50000 },
      positions: [{ symbol: 'AAPL', quantity: 100, averagePrice: 200, marketValue: 20000 }],
    },
    {
      name: 'Gate.io',
      ok: true,
      balance: { USDT: 30000, EQUITY: 50000 },
      positions: [{ symbol: 'BTCUSDT', quantity: 0.5, averagePrice: 40000, marketValue: 20000 }],
    },
  ], {
    ok: true,
    balance: { pUSD: 100 },
    positions: [{
      symbol: 'YES',
      quantity: 100,
      averagePrice: 0.5,
      marketValue: 50,
      lifecycle: 'active',
      valuationStatus: 'live_quote',
    }],
  });
  const livePaper = buildAggregatedPortfolioSnapshot([
    {
      name: 'Alpaca (Paper)',
      ok: true,
      balance: { USD: 800000, EQUITY: 900000 },
      positions: [{ symbol: 'PAPER', quantity: 10, averagePrice: 30000, marketValue: 300000 }],
    },
  ], null);

  return {
    live,
    live_paper: livePaper,
    paper: {
      name: 'Internal Paper Bot (Polymarket dry-run)',
      virtual_balance: 90,
      starting_balance: 100,
      open_positions: 1,
      open_cost: 10,
      equity_marked_at_cost: 100,
      positions: [{ token_id: 'paper-token', shares: 20, avg_price: 0.5 }],
    },
    ok: true,
    exit_code: 0,
    ...overrides,
  };
}

test('production aggregate envelope assesses the real-funds live bucket only', () => {
  const result = buildRiskAssessment(
    productionSnapshot(),
    { peak_equity: 95000 },
    DEFAULT_THRESHOLDS,
    Date.parse('2026-07-10T00:00:00Z'),
  );

  assert.equal(result.ok, true);
  assert.equal(result.status, 'healthy');
  assert.equal(result.portfolio_scope, 'live');
  assert.equal(result.equity, 100150);
  assert.equal(result.cash, 60100);
  assert.equal(result.gross_exposure, 40050);
  assert.equal(result.position_count, 3);
  assert.deepEqual(result.connected_brokers, ['Alpaca (Live)', 'Gate.io', 'Polymarket']);
});

test('legacy flat snapshot remains supported and advances persisted peak equity', () => {
  const result = buildRiskAssessment(legacySnapshot(), { peak_equity: 95000 }, DEFAULT_THRESHOLDS, Date.parse('2026-07-10T00:00:00Z'));

  assert.equal(result.ok, true);
  assert.equal(result.status, 'healthy');
  assert.equal(result.portfolio_scope, 'legacy_flat');
  assert.equal(result.peak_equity, 100000);
  assert.equal(result.drawdown, 0);
  assert.equal(result.gross_exposure, 40000);
  assert.equal(result.net_exposure, 40000);
  assert.deepEqual(result.connected_brokers, ['Alpaca (Paper)', 'Gate.io']);
  assert.deepEqual(result.breaches, []);
});

test('risk assessment reports position, gross, net, drawdown, and broker failures', () => {
  const thresholds = {
    max_position_notional: 10000,
    max_gross_exposure: 15000,
    max_net_exposure: 15000,
    max_drawdown: 0.10,
  };
  const result = buildRiskAssessment(legacySnapshot({
    total_equity: 80000,
    positions: [{ symbol: 'AAPL', quantity: 100, averagePrice: 200 }],
    brokers: [{ name: 'Alpaca (Live)', status: 'error', error: 'credentials missing' }],
  }), { peak_equity: 100000 }, thresholds);

  assert.equal(result.ok, false);
  assert.equal(result.status, 'breach');
  assert.equal(result.drawdown, 0.20);
  assert.deepEqual(
    new Set(result.breaches.map((breach) => breach.code)),
    new Set(['max_position_notional', 'max_gross_exposure', 'max_net_exposure', 'max_drawdown', 'broker_unavailable', 'no_connected_brokers']),
  );
});

test('broker failure alone is a warning and does not discard valid portfolio metrics', () => {
  const result = buildRiskAssessment(legacySnapshot({
    brokers: [
      { name: 'Alpaca (Paper)', status: 'connected' },
      { name: 'Gate.io', status: 'error', error: 'unconfigured' },
    ],
  }));

  assert.equal(result.ok, true);
  assert.equal(result.status, 'warning');
  assert.equal(result.breaches.length, 1);
  assert.equal(result.breaches[0].code, 'broker_unavailable');
});

test('incomplete production envelope fails closed instead of reporting zero exposure', () => {
  const payload = productionSnapshot();
  delete payload.paper;

  const result = buildRiskAssessment(payload);

  assert.equal(result.ok, false);
  assert.equal(result.status, 'error');
  assert.equal(result.error, 'invalid_aggregate_portfolio_schema');
  assert.deepEqual(result.breaches, [{ code: 'portfolio_unavailable', severity: 'critical' }]);
});

test('critical breaches and unavailable portfolios produce a nonzero monitor exit', () => {
  assert.equal(portfolioMonitorExitCode({ ok: true, status: 'healthy' }), 0);
  assert.equal(portfolioMonitorExitCode({ ok: false, status: 'breach' }), 1);
  assert.equal(portfolioMonitorExitCode({ ok: false, status: 'error' }), 1);
});

test('cycle converts a fetch exception into a structured critical error', async () => {
  const result = await runPortfolioMonitorCycle({
    fetchPortfolio: async () => { throw new Error('gateway timed out'); },
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, 'error');
  assert.equal(result.error, 'gateway timed out');
  assert.equal(result.breaches[0].code, 'portfolio_unavailable');
});

test('risk thresholds load YAML and allow positive environment overrides', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'portfolio-monitor-'));
  const configPath = path.join(dir, 'risk.yaml');
  fs.writeFileSync(configPath, [
    'risk:',
    '  max_position_notional: 111',
    '  max_gross_exposure: 222',
    '  max_net_exposure: 333',
    '  max_drawdown: 0.04',
  ].join('\n'));

  const result = loadRiskThresholds(configPath, {
    SOVEREIGN_MAX_GROSS_EXPOSURE: '444',
    SOVEREIGN_MAX_DRAWDOWN: '0.08',
  });
  assert.deepEqual(result, {
    max_position_notional: 111,
    max_gross_exposure: 444,
    max_net_exposure: 333,
    max_drawdown: 0.08,
  });
});
