'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const {
  getOptionsAnalytics,
  getDeribitStatus,
  getOptionsAnalyticsSchema,
  getDeribitStatusSchema,
} = require('../../../dist/mcp_server/tools/options_analytics.js');
const { authorizeMcpTool } = require('../../../dist/mcp_server/lib/access_control.js');
const { CAPABILITIES } = require('../../../shared/lib/auth/access_policy.js');
const { createServicePrincipal } = require('../../../shared/lib/auth/service_principals.js');
const fs = require('node:fs');
const os = require('node:os');

test('mcp options analytics tool schemas validate parameters', () => {
  const analyticsArgs = getOptionsAnalyticsSchema.parse({ currency: 'BTC', include_smile: false });
  assert.equal(analyticsArgs.currency, 'BTC');
  assert.equal(analyticsArgs.include_smile, false);

  const deribitArgs = getDeribitStatusSchema.parse({ testnet: true });
  assert.equal(deribitArgs.testnet, true);
});

test('mcp getOptionsAnalytics returns structured Greeks and skew', async () => {
  const res = await getOptionsAnalytics({ currency: 'BTC', include_smile: true });
  assert.ok(res.content);
  assert.equal(res.content.length, 1);
  const data = JSON.parse(res.content[0].text);
  assert.equal(data.ok, true);
  assert.equal(data.currency, 'BTC');
  assert.ok(data.greeks);
  assert.equal(typeof data.greeks.net_delta_oi, 'number');
  assert.ok(data.skew);
  assert.equal(typeof data.skew.rr25, 'number');
});

test('mcp getDeribitStatus returns structured report', async () => {
  const res = await getDeribitStatus({ testnet: true });
  assert.ok(res.content);
  assert.equal(res.content.length, 1);
  const data = JSON.parse(res.content[0].text);
  assert.equal(data.broker, 'deribit');
  assert.equal(data.testnet, true);
  assert.ok(data.baseUrl.includes('test.deribit.com'));
});

test('mcp access control authorizes options tools with appropriate capabilities', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-options-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const registryPath = path.join(root, 'services.json');

  const viewer = createServicePrincipal({
    id: 'test-researcher',
    capabilities: [CAPABILITIES.RESEARCH_READ, CAPABILITIES.PORTFOLIO_READ],
  }, { path: registryPath });

  const env = {
    SOVEREIGN_SERVICE_PRINCIPALS_PATH: registryPath,
    SOVEREIGN_MCP_SERVICE_TOKEN: viewer.token,
  };

  const optAuth = authorizeMcpTool('get_options_analytics', {}, env);
  assert.equal(optAuth.allowed, true);

  const deribitAuth = authorizeMcpTool('get_deribit_status', {}, env);
  assert.equal(deribitAuth.allowed, true);
});
