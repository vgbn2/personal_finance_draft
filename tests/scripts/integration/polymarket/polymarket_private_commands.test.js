const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

require('ts-node').register({
  transpileOnly: true,
  skipProject: true,
  experimentalResolver: true,
  compilerOptions: {
    module: 'CommonJS', moduleResolution: 'node', target: 'ES2020', esModuleInterop: true,
    ignoreDeprecations: '6.0',
  },
});

const {
  collectPolymarketPortfolio,
  runPolymarketPrivateReadCommand,
} = require('../../../../backend/gateway/src/commands/polymarket_private.ts');

function adapter(overrides = {}) {
  return {
    isConfigured: () => true,
    getSignerAddress: async () => '0xsigner',
    getAccountIdentity: () => ({ funderAddress: '0xfunder', signatureType: 2 }),
    getCollateralStatus: async () => ({ balance: 25, allowance: 10, asset_type: 'COLLATERAL' }),
    getPortfolioBalance: async () => ({ pUSD: 25 }),
    getOpenOrders: async () => [{ symbol: 'YES', quantity: 1, averagePrice: 0.4, marketValue: 0.4, unrealizedPl: 0 }],
    getPositions: async () => [{ symbol: 'A market… YES', quantity: 2, averagePrice: 0.4, marketValue: 1, unrealizedPl: 0.2 }],
    getTradePagination: () => ({ pages_fetched: 1, trades_fetched: 2, page_cap: 10, truncated: false }),
    ...overrides,
  };
}

function fixture(subcommand, options = {}) {
  const calls = [];
  const factoryOptions = [];
  const adapters = options.adapters || [];
  let factoryCalls = 0;
  const factory = (factoryOption) => {
    factoryOptions.push(factoryOption);
    const selected = adapters[factoryCalls] || options.adapter || adapter();
    factoryCalls += 1;
    return selected;
  };
  return {
    calls,
    factoryOptions,
    context: {
      args: ['polymarket', subcommand, ...(options.args || []), ...(options.useJson === false ? [] : ['--json'])],
      env: options.env || {},
      factory,
      output: {
        log(...values) { calls.push(['log', ...values]); },
        error(...values) { calls.push(['error', ...values]); },
      },
      useJson: options.useJson !== false,
    },
  };
}

test('portfolio supports configured and unconfigured read adapters without execution methods', async () => {
  const configured = await collectPolymarketPortfolio(() => adapter());
  assert.equal(configured.ok, true);
  assert.deepEqual(configured.balance, { pUSD: 25 });
  assert.equal(configured.positions.length, 1);

  const unconfigured = await collectPolymarketPortfolio(() => adapter({ isConfigured: () => false }));
  assert.deepEqual(unconfigured, {
    ok: false,
    configured: false,
    error: 'Polymarket credentials not set (POLYMARKET_API_KEY / _SECRET / _PASSPHRASE / _PRIVATE_KEY)',
  });
});

test('debug and auth-health preserve successful and staged failure projections', async () => {
  const debug = fixture('debug');
  assert.equal(await runPolymarketPrivateReadCommand('debug', debug.context), true);
  const debugPayload = JSON.parse(debug.calls[0][1]);
  assert.equal(debugPayload.walletMode, 'POLY_GNOSIS_SAFE');
  assert.equal(debugPayload.positionCount, 1);

  const health = fixture('auth-health', {
    adapter: adapter({
      getOpenOrders: async () => { throw new Error('open order fixture failure'); },
    }),
    env: {
      POLYMARKET_PRIVATE_KEY: 'present', POLYMARKET_API_KEY: 'present',
      POLYMARKET_API_SECRET: 'present', POLYMARKET_API_PASSPHRASE: 'present',
    },
  });
  await runPolymarketPrivateReadCommand('auth-health', health.context);
  const healthPayload = JSON.parse(health.calls[0][1]);
  assert.equal(healthPayload.ok, false);
  assert.equal(healthPayload.likelyFailureStage, 'open_orders');
  assert.equal(healthPayload.stages.collateral.ok, true);
  assert.equal(healthPayload.stages.positions.ok, true);
});

test('auth-health absent credentials remains a successful command with not_configured payload', async () => {
  const health = fixture('auth-health', { adapter: adapter({ isConfigured: () => false }) });
  assert.equal(await runPolymarketPrivateReadCommand('auth-health', health.context), true);
  const payload = JSON.parse(health.calls[0][1]);
  assert.equal(payload.configured, false);
  assert.equal(payload.likelyFailureStage, 'not_configured');
});

test('collateral, modes, and probe propagate typed funder and signature options in candidate order', async () => {
  const collateral = fixture('collateral-probe', {
    args: ['--address', '0xoverride', '--signature-type', '3'],
  });
  await runPolymarketPrivateReadCommand('collateral-probe', collateral.context);
  assert.equal(collateral.factoryOptions[0].funderAddress, '0xoverride');
  assert.equal(collateral.factoryOptions[0].signatureType, 3);

  const env = { PROXY_ADDRESS: '0xproxy', DEPOSIT_ADDRESS: '0xdeposit' };
  const modes = fixture('modes', { env, args: ['--collateral-only'] });
  await runPolymarketPrivateReadCommand('modes', modes.context);
  assert.deepEqual(modes.factoryOptions.slice(1).map((option) => [option.signatureType, option.funderAddress]), [
    [0, undefined], [1, '0xproxy'], [2, '0xdeposit'],
  ]);

  const probe = fixture('probe', { args: ['--address', '0xtarget'] });
  await runPolymarketPrivateReadCommand('probe', probe.context);
  assert.deepEqual(probe.factoryOptions.slice(1).map((option) => option.signatureType), [1, 2]);
  assert.ok(probe.factoryOptions.slice(1).every((option) => option.funderAddress === '0xtarget'));
});

test('probe missing address, topology, and trace stay fixture-only and deterministic', async () => {
  const missing = fixture('probe');
  await runPolymarketPrivateReadCommand('probe', missing.context);
  assert.match(missing.calls[0][1], /Missing --address/);

  const topology = fixture('topology', { env: { PROXY_ADDRESS: '0xproxy' } });
  await runPolymarketPrivateReadCommand('topology', topology.context);
  const topologyPayload = JSON.parse(topology.calls[0][1]);
  assert.equal(topologyPayload.roles.signer, '0xsigner');
  assert.equal(topologyPayload.roles.proxy, '0xproxy');

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'polymarket-trace-'));
  const csvPath = path.join(tempDir, 'export-0x1111111111111111111111111111111111111111.csv');
  fs.writeFileSync(csvPath, [
    'Chain Name,Hash,Status,Action,Token,From,To,From Info,To Info',
    'Polygon,0xhash,Success,Transfer,USDC,0x1111111111111111111111111111111111111111,0x2222222222222222222222222222222222222222,,solver',
  ].join('\n'));
  const trace = fixture('trace', { args: ['--csv', csvPath] });
  await runPolymarketPrivateReadCommand('trace', trace.context);
  const tracePayload = JSON.parse(trace.calls[0][1]);
  assert.equal(tracePayload.rowCount, 1);
  assert.deepEqual(tracePayload.recommendedProbeAddresses, ['0x2222222222222222222222222222222222222222']);

  const investigate = fixture('investigate', { args: ['--csv', csvPath, '--limit', '1'] });
  await runPolymarketPrivateReadCommand('investigate', investigate.context);
  const investigatePayload = JSON.parse(investigate.calls[0][1]);
  assert.equal(investigatePayload.summary.candidateCount, 1);
  assert.equal(investigatePayload.probe.probes.length, 1);
});

test('unknown private subcommands are left to execution/public command owners', async () => {
  const unknown = fixture('buy');
  assert.equal(await runPolymarketPrivateReadCommand('buy', unknown.context), false);
  assert.deepEqual(unknown.calls, []);
});
