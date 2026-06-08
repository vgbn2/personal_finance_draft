const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const REPO_ROOT = path.join(__dirname, '..', '..');
const SCRIPT = path.join(REPO_ROOT, 'scripts', 'classify_strategy_assets.js');
const { classifyStrategyAssetMode } = require('../../shared/lib/strategy_registry');
const { inspectStrategyFile } = require('../../backend/cli/commands/strategy');

test('strategy asset mode helper separates single, multi-asset, and portfolio management', () => {
  const singleAsset = classifyStrategyAssetMode({
    name: 'single_asset_probe',
    universe: ['SPY'],
    lane: 'single_asset',
    role: 'strategy',
  });
  const multiAsset = classifyStrategyAssetMode(inspectStrategyFile('config/strategies/mean_reversion.yaml'));
  const portfolioManagement = classifyStrategyAssetMode(inspectStrategyFile('config/strategies/global_equity_rotation.yaml'));

  assert.equal(singleAsset, 'single_asset');
  assert.equal(multiAsset, 'multi_asset_strategy');
  assert.equal(portfolioManagement, 'portfolio_management');
});

test('classification script filters portfolio-management strategies and reports asset mode', () => {
  const portfolioResult = spawnSync(process.execPath, [
    SCRIPT,
    '--json',
    '--strategy',
    'config/strategies/global_equity_rotation.yaml',
  ], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });

  assert.equal(portfolioResult.status, 0, portfolioResult.stderr || portfolioResult.stdout);
  const portfolioPayload = JSON.parse(portfolioResult.stdout);
  assert.equal(portfolioPayload.count, 1);
  assert.equal(portfolioPayload.strategies[0].asset_mode, 'portfolio_management');

  const filteredResult = spawnSync(process.execPath, [
    SCRIPT,
    '--json',
    '--mode',
    'portfolio_management',
    '--strategy',
    'config/strategies/mean_reversion.yaml',
  ], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });

  assert.equal(filteredResult.status, 0, filteredResult.stderr || filteredResult.stdout);
  const filteredPayload = JSON.parse(filteredResult.stdout);
  assert.equal(filteredPayload.count, 0);
  assert.equal(filteredPayload.total, 1);
});
