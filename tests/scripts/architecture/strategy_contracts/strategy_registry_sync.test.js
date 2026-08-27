const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { syncStrategyRegistry, readStrategyRegistry } = require('../../../../backend/cli/commands/strategy');

function tempRepoLayout() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'strategy-sync-'));
  const strategyDir = path.join(root, 'config', 'strategies');
  const registryDir = path.join(root, 'config', 'trading');
  fs.mkdirSync(strategyDir, { recursive: true });
  fs.mkdirSync(registryDir, { recursive: true });

  fs.writeFileSync(path.join(registryDir, 'strategies.yaml'), [
    'strategies:',
    '  sample: {}',
    'promotion:',
    '  require_backtest: true',
    '  require_walk_forward: true',
    '  require_paper_trade: true',
    '  min_sharpe_ratio: 1.5',
    '  max_drawdown_limit: 0.15',
    '',
    'registry:',
    '  files:',
    '    - "config/strategies/existing.yaml"',
    '',
  ].join('\n'), 'utf8');

  fs.writeFileSync(path.join(strategyDir, 'existing.yaml'), [
    'name: existing',
    'kind: momentum',
    'family: equities',
    'lane: single_asset',
    'role: core',
    'status: draft',
    'enabled: true',
    'model: cnn_v3',
    'timeframe: 1d',
    'sections:',
    '  hypothesis: "Existing strategy"',
    '  universe:',
    '    - SPY',
    '  signals:',
    '    entry: "entry"',
    '    exit: "exit"',
    '  data:',
    '    required_sources:',
    '      - price_volume',
    '    validation: strict',
    '  features:',
    '    technical:',
    '      - return_fast',
    '    relative: []',
    '    orderflow: []',
    '    custom: []',
    '  indicators:',
    '    return_fast: true',
    '    return_slow: true',
    '    volatility: true',
    '    rsi: true',
    '    atr: true',
    '    bollinger: true',
    '  indicator_periods:',
    '    return_fast: 5',
    '    return_slow: 20',
    '    volatility: 20',
    '    rsi: 14',
    '    atr: 14',
    '    bollinger: 20',
    '  risk:',
    '    signal_threshold: 0.65',
    '    max_holding_days: 5',
    '    risk_weight: 0.4',
    '    fail_closed: true',
    '  promotion:',
    '    require_backtest: true',
    '    require_walk_forward: true',
    '    require_paper_trade: true',
    '    review_required: true',
    '  notes: []',
    '',
  ].join('\n'), 'utf8');

  fs.writeFileSync(path.join(strategyDir, 'fresh_ai.yaml'), [
    'name: fresh_ai',
    'kind: momentum',
    'family: equities',
    'lane: single_asset',
    'role: core',
    'status: draft',
    'enabled: true',
    'model: cnn_v3',
    'timeframe: 1d',
    'sections:',
    '  hypothesis: "AI-written strategy that should be synced into the registry"',
    '  universe:',
    '    - SPY',
    '  signals:',
    '    entry: "entry"',
    '    exit: "exit"',
    '  data:',
    '    required_sources:',
    '      - price_volume',
    '    validation: strict',
    '  features:',
    '    technical:',
    '      - return_fast',
    '    relative: []',
    '    orderflow: []',
    '    custom: []',
    '  indicators:',
    '    return_fast: true',
    '    return_slow: true',
    '    volatility: true',
    '    rsi: true',
    '    atr: true',
    '    bollinger: true',
    '  indicator_periods:',
    '    return_fast: 5',
    '    return_slow: 20',
    '    volatility: 20',
    '    rsi: 14',
    '    atr: 14',
    '    bollinger: 20',
    '  risk:',
    '    signal_threshold: 0.65',
    '    max_holding_days: 5',
    '    risk_weight: 0.4',
    '    fail_closed: true',
    '  promotion:',
    '    require_backtest: true',
    '    require_walk_forward: true',
    '    require_paper_trade: true',
    '    review_required: true',
    '  notes: []',
    '',
  ].join('\n'), 'utf8');

  fs.writeFileSync(path.join(strategyDir, 'broken.yaml'), [
    'name: broken',
    'kind: momentum',
    'status: draft',
    'enabled: true',
    'model: cnn_v3',
    '',
  ].join('\n'), 'utf8');

  return {
    root,
    strategyDir,
    registryPath: path.join(registryDir, 'strategies.yaml'),
  };
}

test('strategy registry sync adds valid unregistered YAML files and skips invalid ones', () => {
  const layout = tempRepoLayout();

  try {
    const before = readStrategyRegistry({ registryPath: layout.registryPath });
    assert.deepEqual(before, ['config/strategies/existing.yaml']);

    const summary = syncStrategyRegistry({
      repoRoot: layout.root,
      strategyDir: layout.strategyDir,
      registryPath: layout.registryPath,
    });

    assert.equal(summary.before, 1);
    assert.equal(summary.after, 2);
    assert.deepEqual(summary.added, ['config/strategies/fresh_ai.yaml']);
    assert.equal(summary.skipped.length, 1);
    assert.equal(summary.skipped[0].path, 'config/strategies/broken.yaml');

    const registryText = fs.readFileSync(layout.registryPath, 'utf8');
    assert.match(registryText, /config\/strategies\/existing\.yaml/);
    assert.match(registryText, /config\/strategies\/fresh_ai\.yaml/);
    assert.doesNotMatch(registryText, /config\/strategies\/broken\.yaml/);
  } finally {
    fs.rmSync(layout.root, { recursive: true, force: true });
  }
});
