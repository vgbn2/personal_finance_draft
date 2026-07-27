const assert = require('node:assert/strict');
const test = require('node:test');

const { extractJsonPayload } = require('../../../../dist/mcp_server/lib/bridge.js');
const { trade } = require('../../../../dist/mcp_server/tools/trade.js');
const { placePolymarketOrder } = require('../../../../dist/mcp_server/tools/polymarket.js');
const { backfill, buildBackfillAllArgs } = require('../../../../dist/mcp_server/tools/data.js');
const {
  buildMarketBiasArgs,
  buildCombinedAnalysisArgs,
  buildScorecardArgs,
  buildMarketSignalDecision,
} = require('../../../../dist/mcp_server/tools/research.js');

function parseToolText(result) {
  assert.ok(result);
  assert.ok(Array.isArray(result.content));
  assert.equal(result.content[0]?.type, 'text');
  return JSON.parse(result.content[0].text);
}

test('extractJsonPayload tolerates banner noise around JSON output', () => {
  const parsed = extractJsonPayload('booting...\n{\"ok\":true,\"value\":42}\n');
  assert.deepEqual(parsed, { ok: true, value: 42 });
});

test('mcp trade blocks live execution without confirm_live', async () => {
  const result = await trade({ action: 'buy', symbol: 'AAPL', qty: 1, live: true });
  assert.equal(result.isError, true);
  assert.match(parseToolText(result).error, /confirm_live=true/);
});

test('mcp polymarket blocks live execution without confirm_live', async () => {
  const result = await placePolymarketOrder({ token_id: '123', size: 1, live: true });
  assert.equal(result.isError, true);
  assert.match(parseToolText(result).error, /confirm_live=true/);
});

test('mcp polymarket live path requires explicit limit price', async () => {
  const result = await placePolymarketOrder({
    token_id: '123',
    size: 1,
    live: true,
    confirm_live: true,
  });
  assert.equal(result.isError, true);
  assert.match(parseToolText(result).error, /explicit limit price/);
});

test('mcp polymarket rejects max_cost_usdc breaches before CLI execution', async () => {
  const result = await placePolymarketOrder({
    token_id: '123',
    size: 10,
    price: 0.6,
    max_cost_usdc: 5,
    live: false,
  });
  assert.equal(result.isError, true);
  assert.match(parseToolText(result).error, /exceeds max_cost_usdc 5/);
});

test('mcp market bias stays on the cached CLI path', () => {
  assert.deepEqual(buildMarketBiasArgs({ symbol: 'btcusdt' }), [
    'bias', 'BTCUSDT', '--no-backfill',
  ]);
});

test('mcp scorecard is cached-only and fail-closed by default', () => {
  assert.deepEqual(buildScorecardArgs({
    family: 'crypto',
    timeframes: '1h,4h,1d',
    min_confidence: 0.55,
    top: 10,
    allow_degraded: false,
  }), [
    'scorecard', '--family', 'crypto', '--tf', '1h,4h,1d', '--min-conf', '0.55', '--top', '10', '--no-backfill', '--envelope',
  ]);
});

test('mcp combined analysis requires an exact asset id and stays cached-only', () => {
  assert.deepEqual(buildCombinedAnalysisArgs({
    asset_id: 'fx_pair:OTC:EURUSD',
    timeframes: '1h,4h,1d',
  }), [
    'combined', '--asset-id', 'fx_pair:OTC:EURUSD', '--tf', '1h,4h,1d', '--json',
  ]);
});

test('mcp backfill blocks cache writes without execute acknowledgement', async () => {
  const result = await backfill({ symbol: 'BTCUSDT', days: 30, timeframe: '1d', execute: false });
  assert.equal(result.isError, true);
  assert.match(parseToolText(result).error, /execute=true/);
});

test('mcp mass backfill is a preview unless execute is acknowledged', () => {
  const previewArgs = buildBackfillAllArgs({
    timeframes: '1d', days: 30, concurrency: 2, execute: false,
  });
  assert.ok(previewArgs.includes('--dry-run'));

  const executeArgs = buildBackfillAllArgs({
    timeframes: '1d', days: 30, concurrency: 2, execute: true,
  });
  assert.ok(!executeArgs.includes('--dry-run'));
});

test('mcp market signal fails closed on stale cache data', () => {
  const decision = buildMarketSignalDecision(
    'BTCUSDT',
    { timeframes: [{ fresh: false }] },
    { rows: [{ symbol: 'BTCUSDT', decision_state: 'eligible', bias: 'long', confidence: 0.8 }] },
  );
  assert.deepEqual(decision, {
    ok: false,
    decision: 'no_trade',
    symbol: 'BTCUSDT',
    reason: 'Cached bias data is missing or stale.',
  });
});

test('mcp market signal remains review-only when cached checks pass', () => {
  const decision = buildMarketSignalDecision(
    'BTCUSDT',
    { timeframes: [{ fresh: true }], aggregate: { direction: 'long' } },
    { rows: [{ symbol: 'BTCUSDT', decision_state: 'eligible', bias: 'long', confidence: 0.8 }] },
  );
  assert.equal(decision.decision, 'review_only');
  assert.equal(decision.direction, 'long');
  assert.match(decision.reason, /never places orders/);
});
