'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const {
  buildTradeGatewayLaunch,
  classifyGatewayEnvironmentSurface,
  classifyMcpCliCapability,
  spawnResultHasFatalError,
  stripFlagValue,
} = require('../../../shared/lib/runtime/backend_bridge');

/**
 * TEST: buildTradeGatewayLaunch strips --pin unconditionally (session-59 fix --
 * the original cf4f7026 fix only stripped --pin at the commandTrade call site;
 * this covers all 8 callers of buildTradeGatewayLaunch, including any future one).
 */

test('buildTradeGatewayLaunch never lets --pin or its value reach the spawned argv', () => {
  const launch = buildTradeGatewayLaunch(['sell', 'AAPL', '10', 'market', '--live', '--pin', 'SECRET999']);
  assert.ok(!launch.args.includes('--pin'), '--pin flag itself must not appear in the spawned argv');
  assert.ok(!launch.args.includes('SECRET999'), 'the PIN value must not appear in the spawned argv');
});

test('buildTradeGatewayLaunch leaves args untouched when no --pin is present', () => {
  const launch = buildTradeGatewayLaunch(['positions', '--json']);
  assert.ok(launch.args.includes('positions'));
  assert.ok(launch.args.includes('--json'));
});

test('gateway command classifier covers every gateway command branch and fails closed', () => {
  const cases = [
    [['balance', '--json'], 'gateway_public'],
    [['balance', '--live', '--json'], 'gateway_account'],
    [['positions', '--json'], 'gateway_account'],
    [['aggregate_portfolio', '--json'], 'gateway_account'],
    [['buy', 'AAPL', '1'], 'execution'],
    [['sell', 'AAPL', '1'], 'execution'],
    [['process', 'orders.json'], 'execution'],
    [['bot', 'status'], 'execution'],
    [['polymarket', 'markets'], 'gateway_public'],
    [['polymarket', 'events'], 'gateway_public'],
    [['polymarket', 'orderbook'], 'gateway_public'],
    [['polymarket', 'price-history'], 'gateway_public'],
    [['polymarket', 'paper-run'], 'gateway_public'],
    [['polymarket', 'history', 'backfill'], 'gateway_public'],
    [['polymarket', 'trace'], 'gateway_public'],
    [['polymarket', 'portfolio'], 'gateway_account'],
    [['polymarket', 'balance'], 'gateway_account'],
    [['polymarket', 'debug'], 'gateway_account'],
    [['polymarket', 'auth-health'], 'gateway_account'],
    [['polymarket', 'collateral-probe'], 'gateway_account'],
    [['polymarket', 'modes'], 'gateway_account'],
    [['polymarket', 'investigate'], 'gateway_account'],
    [['polymarket', 'probe'], 'gateway_account'],
    [['polymarket', 'topology'], 'gateway_account'],
    [['polymarket', 'derive-creds'], 'execution'],
    [['polymarket', 'buy'], 'execution'],
    [['polymarket', 'sell'], 'execution'],
  ];
  for (const [args, expected] of cases) {
    assert.equal(classifyGatewayEnvironmentSurface(args), expected, args.join(' '));
  }
  assert.throws(
    () => classifyGatewayEnvironmentSurface(['unknown']),
    (error) => error.code === 'environment_surface_unclassified',
  );
  assert.throws(
    () => classifyGatewayEnvironmentSurface(['polymarket', 'unknown']),
    (error) => error.code === 'environment_surface_unclassified',
  );
});

test('gateway launcher projects secrets by capability without mutating the parent', () => {
  const parent = {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    FRED_API_KEY: 'provider-secret',
    POLYMARKET_PRIVATE_KEY: 'account-secret',
    SOVEREIGN_TRADE_PIN: '123456',
    SOVEREIGN_EXECUTION_AUTHORIZED: 'false',
  };
  const before = { ...parent };
  const publicLaunch = buildTradeGatewayLaunch(['polymarket', 'markets'], { environment: parent });
  const accountLaunch = buildTradeGatewayLaunch(['polymarket', 'portfolio'], { environment: parent });
  const executionLaunch = buildTradeGatewayLaunch(['buy', 'AAPL', '1'], {
    environment: parent,
    env: { SOVEREIGN_EXECUTION_AUTHORIZED: 'true' },
  });

  assert.equal(publicLaunch.surface, 'gateway_public');
  assert.equal(publicLaunch.env.POLYMARKET_PRIVATE_KEY, undefined);
  assert.equal(accountLaunch.surface, 'gateway_account');
  assert.equal(accountLaunch.env.POLYMARKET_PRIVATE_KEY, 'account-secret');
  assert.equal(accountLaunch.env.SOVEREIGN_EXECUTION_AUTHORIZED, undefined);
  assert.equal(executionLaunch.surface, 'execution');
  assert.equal(executionLaunch.env.POLYMARKET_PRIVATE_KEY, 'account-secret');
  assert.equal(executionLaunch.env.SOVEREIGN_EXECUTION_AUTHORIZED, 'true');
  assert.equal(executionLaunch.env.SOVEREIGN_TRADE_PIN, undefined);
  assert.equal(executionLaunch.env.SOVEREIGN_SKIP_DOTENV, '1');
  assert.equal(executionLaunch.env.SOVEREIGN_SKIP_LOCAL_ENV, '1');
  assert.equal(Object.isFrozen(executionLaunch.env), true);
  assert.deepEqual(parent, before);
});

test('MCP capability classifier denies account and live children before spawn', () => {
  assert.equal(classifyMcpCliCapability(['status']), 'cached_read');
  assert.equal(classifyMcpCliCapability(['auto-trade']), 'execution');
  assert.equal(classifyMcpCliCapability(['trade', 'balance']), 'cached_read');
  assert.equal(classifyMcpCliCapability(['trade', 'balance', '--live']), 'account_read');
  assert.equal(classifyMcpCliCapability(['trade', 'aggregate_portfolio']), 'account_read');
  assert.equal(classifyMcpCliCapability(['polymarket', 'portfolio']), 'account_read');
  assert.equal(classifyMcpCliCapability(['polymarket', 'derive-creds']), 'execution');
  assert.equal(classifyMcpCliCapability(['trade', 'buy', 'AAPL', '1', '--live']), 'execution');
  assert.equal(classifyMcpCliCapability(['polymarket', 'buy', 'token', '1', '--live']), 'execution');
});

test('projected gateway child cannot repopulate stripped secrets from an env file', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sovereign-env-projection-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const envFile = path.join(root, 'poison.env');
  fs.writeFileSync(envFile, 'FRED_API_KEY=dotenv-poison\nPOLYMARKET_PRIVATE_KEY=account-poison\n');
  const launch = buildTradeGatewayLaunch(['polymarket', 'markets'], {
    environment: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      SOVEREIGN_ENV_FILE: envFile,
    },
  });
  const probe = spawnSync(process.execPath, ['-e', [
    "require('./shared/lib/runtime/env');",
    'process.stdout.write(JSON.stringify({',
    'provider: process.env.FRED_API_KEY || null,',
    'account: process.env.POLYMARKET_PRIVATE_KEY || null,',
    'skip: process.env.SOVEREIGN_SKIP_LOCAL_ENV',
    '}));',
  ].join('')], {
    cwd: path.resolve(__dirname, '..', '..', '..'),
    encoding: 'utf8',
    env: launch.env,
  });

  if (probe.error && !probe.stdout && !probe.stderr) {
    t.skip(`nested child process unavailable: ${probe.error.code || probe.error.message}`);
    return;
  }
  assert.equal(probe.status, 0, probe.stderr);
  assert.deepEqual(JSON.parse(probe.stdout), {
    provider: null,
    account: null,
    skip: '1',
  });
});

test('every direct gateway spawn consumes the classified launch environment', () => {
  const callerPaths = [
    'backend/cli/commands/operational/status.js',
    'backend/cli/commands/trade/trade.js',
    'backend/cli/commands/trade/trade_polymarket.js',
  ];
  let launches = 0;
  for (const callerPath of callerPaths) {
    const source = fs.readFileSync(path.resolve(__dirname, '..', '..', '..', callerPath), 'utf8');
    const spawnBlocks = source.match(/spawnSync\(launch\.command,\s*launch\.args,\s*\{[\s\S]*?\n\s*\}\);/g) || [];
    launches += spawnBlocks.length;
    for (const block of spawnBlocks) {
      assert.match(block, /\benv:\s*launch\.env\b/, callerPath);
    }
  }
  assert.equal(launches, 6, 'update the gateway spawn inventory when adding or removing direct callers');

  const gatewaySource = fs.readFileSync(
    path.resolve(__dirname, '..', '..', '..', 'backend/gateway/src/index.ts'),
    'utf8',
  );
  assert.doesNotMatch(gatewaySource, /dotenv\/config/);
  assert.match(gatewaySource, /environment_surface_required/);
});

test('repeated poisoned-parent projections stay isolated across surfaces', () => {
  const parent = {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    FRED_API_KEY: 'provider-poison',
    POLYMARKET_PRIVATE_KEY: 'account-poison',
    SOVEREIGN_TRADE_PIN: 'pin-poison',
    SOVEREIGN_EXECUTION_AUTHORIZED: 'false',
    UNCLASSIFIED_SENTINEL: 'unknown-poison',
  };
  const before = { ...parent };
  for (let index = 0; index < 250; index += 1) {
    const publicLaunch = buildTradeGatewayLaunch(['polymarket', 'markets'], { environment: parent });
    const accountLaunch = buildTradeGatewayLaunch(['polymarket', 'portfolio'], { environment: parent });
    const executionLaunch = buildTradeGatewayLaunch(['buy', 'AAPL', '1'], {
      environment: parent,
      env: { SOVEREIGN_EXECUTION_AUTHORIZED: 'true' },
    });
    assert.equal(publicLaunch.env.FRED_API_KEY, undefined);
    assert.equal(publicLaunch.env.POLYMARKET_PRIVATE_KEY, undefined);
    assert.equal(accountLaunch.env.FRED_API_KEY, undefined);
    assert.equal(accountLaunch.env.POLYMARKET_PRIVATE_KEY, 'account-poison');
    assert.equal(accountLaunch.env.SOVEREIGN_EXECUTION_AUTHORIZED, undefined);
    assert.equal(executionLaunch.env.SOVEREIGN_EXECUTION_AUTHORIZED, 'true');
    assert.equal(executionLaunch.env.SOVEREIGN_TRADE_PIN, undefined);
    assert.equal(executionLaunch.env.UNCLASSIFIED_SENTINEL, undefined);
  }
  assert.deepEqual(parent, before);
});

test('stripFlagValue is the same canonical export used by backend/cli/lib/utils.js', () => {
  const { stripFlagValue: utilsStripFlagValue } = require('../../../backend/cli/lib/utils.js');
  assert.equal(utilsStripFlagValue, stripFlagValue, 'utils.js must re-export the shared/lib/runtime implementation, not a duplicate');
});

test('spawn result errors are non-fatal when the child returned an exit status', () => {
  const postRunError = new Error('spawnSync sovereign_wealth EPERM');

  assert.equal(spawnResultHasFatalError({ error: postRunError, status: 0 }), false);
  assert.equal(spawnResultHasFatalError({ error: postRunError, status: 1 }), false);
  assert.equal(spawnResultHasFatalError({ error: postRunError, status: null }), true);
});
