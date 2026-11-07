'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { spawnSync } = require('node:child_process');

const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
const { CAPABILITIES } = require('../../../shared/lib/auth/access_policy.js');
const { createServicePrincipal } = require('../../../shared/lib/auth/service_principals.js');
const { TOOL_CAPABILITIES } = require('../../../dist/mcp_server/lib/access_control.js');

const REPO_ROOT = path.resolve(__dirname, '../../..');
const MCP_SERVER_DIR = path.join(REPO_ROOT, 'backend', 'mcp_server');
const MCP_ENTRYPOINT = path.join(REPO_ROOT, 'dist', 'mcp_server', 'index.js');

function ensureMcpBuild() {
  if (!fs.existsSync(MCP_ENTRYPOINT)) {
    const res = spawnSync('npm', ['run', 'build'], {
      cwd: MCP_SERVER_DIR,
      encoding: 'utf8',
    });
    assert.equal(res.status, 0, `MCP build failed: ${res.stderr || res.stdout}`);
  }
}

function setupTestEnvironment() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sovereign-mcp-contract-'));
  const regPath = path.join(tmpDir, 'services.json');

  const admin = createServicePrincipal({
    id: 'mcp-admin',
    capabilities: Object.values(CAPABILITIES),
  }, { path: regPath });

  const viewer = createServicePrincipal({
    id: 'mcp-viewer',
    capabilities: [CAPABILITIES.STATUS_READ, CAPABILITIES.DATA_READ, CAPABILITIES.RESEARCH_READ],
  }, { path: regPath });

  const operator = createServicePrincipal({
    id: 'mcp-operator',
    capabilities: [
      CAPABILITIES.STATUS_READ,
      CAPABILITIES.DATA_READ,
      CAPABILITIES.RESEARCH_READ,
      CAPABILITIES.RESEARCH_RUN,
      CAPABILITIES.PORTFOLIO_READ,
      CAPABILITIES.PAPER_OPERATE,
      CAPABILITIES.DATA_WRITE,
    ],
  }, { path: regPath });

  return {
    tmpDir,
    regPath,
    tokens: {
      admin: admin.token,
      viewer: viewer.token,
      operator: operator.token,
    },
    cleanup: () => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    },
  };
}

async function createMcpClient(token, regPath) {
  const env = {
    ...process.env,
    SOVEREIGN_SERVICE_PRINCIPALS_PATH: regPath,
  };
  if (token) {
    env.SOVEREIGN_MCP_SERVICE_TOKEN = token;
  } else {
    delete env.SOVEREIGN_MCP_SERVICE_TOKEN;
  }

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [MCP_ENTRYPOINT],
    env,
  });

  const client = new Client({ name: 'mcp-contract-tester', version: '1.0.0' }, { capabilities: {} });
  await client.connect(transport);
  return { client, transport };
}

test.before(() => {
  ensureMcpBuild();
});

test('MCP server rejects unauthenticated requests at identity gate', async (t) => {
  const envContext = setupTestEnvironment();
  t.after(() => envContext.cleanup());

  const { client } = await createMcpClient(null, envContext.regPath);
  t.after(async () => {
    await client.close();
  });

  await assert.rejects(
    async () => client.listTools(),
    (err) => {
      assert.match(err.message, /authentication_required/);
      return true;
    },
  );
});

test('MCP server exports all expected tools with valid JSON schemas', async (t) => {
  const envContext = setupTestEnvironment();
  t.after(() => envContext.cleanup());

  const { client } = await createMcpClient(envContext.tokens.admin, envContext.regPath);
  t.after(async () => {
    await client.close();
  });

  const toolList = await client.listTools();
  assert.ok(Array.isArray(toolList.tools), 'tools should be an array');
  assert.ok(toolList.tools.length >= 20, `Expected at least 20 tools, got ${toolList.tools.length}`);

  const exportedNames = new Set();

  for (const tool of toolList.tools) {
    assert.ok(tool.name && typeof tool.name === 'string', 'Tool must have a name');
    assert.ok(tool.description && typeof tool.description === 'string', `Tool ${tool.name} must have a description`);
    assert.ok(tool.inputSchema && typeof tool.inputSchema === 'object', `Tool ${tool.name} must have inputSchema`);
    assert.equal(tool.inputSchema.type, 'object', `Tool ${tool.name} schema type must be object`);
    assert.equal(typeof tool.inputSchema.properties, 'object', `Tool ${tool.name} schema properties must be defined`);

    exportedNames.add(tool.name);
    assert.ok(TOOL_CAPABILITIES[tool.name], `Tool ${tool.name} must be classified in access_control policy`);
  }

  const expectedCoreTools = [
    'get_system_status',
    'run_backtest',
    'get_market_universe',
    'trade',
    'get_portfolio',
    'backfill',
    'get_data_summary',
    'get_correlation',
    'get_data_availability',
    'get_sigma_bands',
    'get_indicators',
    'get_price',
    'get_market_bias',
    'get_scorecard',
    'get_market_signal',
    'get_combined_analysis',
    'backfill_family',
    'backfill_all',
    'get_polymarket_markets',
    'get_polymarket_portfolio',
    'place_polymarket_order',
    'explore_strategy',
    'get_options_analytics',
    'get_deribit_status',
  ];

  for (const expected of expectedCoreTools) {
    assert.ok(exportedNames.has(expected), `Expected tool ${expected} to be exported by MCP server`);
  }
});

test('MCP server enforces capability gate policies for scoped principals', async (t) => {
  const envContext = setupTestEnvironment();
  t.after(() => envContext.cleanup());

  const { client: viewerClient } = await createMcpClient(envContext.tokens.viewer, envContext.regPath);
  t.after(async () => {
    await viewerClient.close();
  });

  await assert.rejects(
    async () => viewerClient.callTool({
      name: 'trade',
      arguments: { action: 'buy', symbol: 'AAPL', qty: 1 },
    }),
    (err) => {
      assert.match(err.message, /insufficient_capability; required=paper\.operate/);
      return true;
    },
  );

  await assert.rejects(
    async () => viewerClient.callTool({
      name: 'backfill',
      arguments: { symbol: 'AAPL', days: 10, execute: true },
    }),
    (err) => {
      assert.match(err.message, /insufficient_capability; required=data\.write/);
      return true;
    },
  );

  await assert.rejects(
    async () => viewerClient.callTool({
      name: 'run_backtest',
      arguments: { symbol: 'SPY', days: 30 },
    }),
    (err) => {
      assert.match(err.message, /insufficient_capability; required=research\.run/);
      return true;
    },
  );

  const { client: operatorClient } = await createMcpClient(envContext.tokens.operator, envContext.regPath);
  t.after(async () => {
    await operatorClient.close();
  });

  await assert.rejects(
    async () => operatorClient.callTool({
      name: 'trade',
      arguments: { action: 'buy', symbol: 'AAPL', qty: 1, live: true, confirm_live: true },
    }),
    (err) => {
      assert.match(err.message, /insufficient_capability; required=paper\.operate,live\.execute/);
      return true;
    },
  );
});

test('MCP server enforces safety parameter gates for write and live orders', async (t) => {
  const envContext = setupTestEnvironment();
  t.after(() => envContext.cleanup());

  const { client } = await createMcpClient(envContext.tokens.admin, envContext.regPath);
  t.after(async () => {
    await client.close();
  });

  const backfillBlocked = await client.callTool({
    name: 'backfill',
    arguments: { symbol: 'AAPL', days: 5 },
  });
  assert.equal(backfillBlocked.isError, true);
  const backfillErr = JSON.parse(backfillBlocked.content[0].text);
  assert.equal(backfillErr.ok, false);
  assert.match(backfillErr.error, /set execute=true to acknowledge cache writes/);

  const tradeBlocked = await client.callTool({
    name: 'trade',
    arguments: { action: 'buy', symbol: 'AAPL', qty: 1, live: true },
  });
  assert.equal(tradeBlocked.isError, true);
  const tradeErr = JSON.parse(tradeBlocked.content[0].text);
  assert.equal(tradeErr.ok, false);
  assert.match(tradeErr.error, /confirm_live=true/);

  const polyBlocked = await client.callTool({
    name: 'place_polymarket_order',
    arguments: { token_id: 'test_outcome_123', size: 10, live: true },
  });
  assert.equal(polyBlocked.isError, true);
  const polyErr = JSON.parse(polyBlocked.content[0].text);
  assert.equal(polyErr.ok, false);
  assert.match(polyErr.error, /confirm_live=true/);

  const polyCapBlocked = await client.callTool({
    name: 'place_polymarket_order',
    arguments: { token_id: 'test_outcome_123', size: 10, price: 0.8, max_cost_usdc: 5 },
  });
  assert.equal(polyCapBlocked.isError, true);
  const polyCapErr = JSON.parse(polyCapBlocked.content[0].text);
  assert.equal(polyCapErr.ok, false);
  assert.match(polyCapErr.error, /exceeds max_cost_usdc 5/);
});

test('MCP server executes safe query tools against local fixtures and services', async (t) => {
  const envContext = setupTestEnvironment();
  t.after(() => envContext.cleanup());

  const { client } = await createMcpClient(envContext.tokens.admin, envContext.regPath);
  t.after(async () => {
    await client.close();
  });

  const optRes = await client.callTool({
    name: 'get_options_analytics',
    arguments: { currency: 'BTC', include_smile: true },
  });
  assert.notEqual(optRes.isError, true);
  const optData = JSON.parse(optRes.content[0].text);
  assert.equal(optData.ok, true);
  assert.equal(optData.currency, 'BTC');
  assert.equal(typeof optData.greeks?.net_delta_oi, 'number');

  const deribitRes = await client.callTool({
    name: 'get_deribit_status',
    arguments: { testnet: true },
  });
  assert.notEqual(deribitRes.isError, true);
  const deribitData = JSON.parse(deribitRes.content[0].text);
  assert.equal(deribitData.ok, true);
  assert.equal(deribitData.broker, 'deribit');
  assert.equal(deribitData.testnet, true);

  const statusRes = await client.callTool({
    name: 'get_system_status',
    arguments: {},
  });
  assert.notEqual(statusRes.isError, true);
  const statusData = JSON.parse(statusRes.content[0].text);
  assert.ok(statusData.phase || statusData.ok !== undefined, 'status response should contain system phase or ok flag');
});

test('MCP server validates resource contracts and error responses', async (t) => {
  const envContext = setupTestEnvironment();
  t.after(() => envContext.cleanup());

  const { client } = await createMcpClient(envContext.tokens.admin, envContext.regPath);
  t.after(async () => {
    await client.close();
  });

  const resList = await client.listResources();
  assert.ok(Array.isArray(resList.resources));
  assert.ok(resList.resources.length > 0);

  const lastFetchRes = await client.readResource({ uri: 'sovereign://reports/last-fetch' });
  assert.ok(lastFetchRes.contents?.length > 0);
  assert.equal(lastFetchRes.contents[0].uri, 'sovereign://reports/last-fetch');
  assert.equal(lastFetchRes.contents[0].mimeType, 'application/json');

  await assert.rejects(
    async () => client.readResource({ uri: 'sovereign://reports/unknown-report-xyz' }),
    (err) => {
      assert.match(err.message, /Report not found: unknown-report-xyz/);
      return true;
    },
  );
});

test('MCP server validates tool parameters and reports Zod validation errors', async (t) => {
  const envContext = setupTestEnvironment();
  t.after(() => envContext.cleanup());

  const { client } = await createMcpClient(envContext.tokens.admin, envContext.regPath);
  t.after(async () => {
    await client.close();
  });

  await assert.rejects(
    async () => client.callTool({
      name: 'get_options_analytics',
      arguments: { currency: 'INVALID_SYMBOL' },
    }),
    (err) => {
      assert.match(err.message, /Invalid arguments/);
      assert.match(err.message, /expected one of "BTC"|"ETH"|"SOL"/);
      return true;
    },
  );

  await assert.rejects(
    async () => client.callTool({
      name: 'trade',
      arguments: { action: 'invalid_action', symbol: 'BTCUSDT', qty: 1 },
    }),
    (err) => {
      assert.match(err.message, /Invalid arguments/);
      return true;
    },
  );

  await assert.rejects(
    async () => client.callTool({
      name: 'unregistered_tool_name',
      arguments: {},
    }),
    (err) => {
      assert.match(err.message, /unclassified_mcp_tool/);
      return true;
    },
  );
});
