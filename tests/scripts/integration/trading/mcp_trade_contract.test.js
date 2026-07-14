const assert = require('node:assert/strict');
const test = require('node:test');

const { extractJsonPayload } = require('../../../../dist/mcp_server/lib/bridge.js');
const { trade } = require('../../../../dist/mcp_server/tools/trade.js');
const { placePolymarketOrder } = require('../../../../dist/mcp_server/tools/polymarket.js');

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
