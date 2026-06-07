const path = require('node:path');

let _strategyModule = null;
function getStrategyModule() {
  if (!_strategyModule) {
    try {
      _strategyModule = require('../../../../cli/commands/strategy');
    } catch {
      _strategyModule = null;
    }
  }
  return _strategyModule;
}

module.exports = {
  path: '/api/strategies',
  status: (payload) => (payload && payload.ok !== false ? 200 : 503),
  handle: () => {
    const mod = getStrategyModule();
    if (!mod) {
      return { ok: false, type: 'strategy_catalog', error: 'strategy module unavailable', strategies: [] };
    }
    try {
      const files = mod.readStrategyRegistry();
      const strategies = files.map((filePath) => {
        const info = mod.inspectStrategyFile(filePath);
        return {
          name: info.name || path.basename(filePath, '.yaml'),
          path: filePath,
          kind: info.kind || null,
          family: info.family || info.kind || null,
          lane: info.lane || 'single_asset',
          role: info.role || 'strategy',
          grade: info.grade || null,
          score: Number.isFinite(Number(info.score)) ? Number(info.score) : null,
          verdict: info.verdict || null,
          last_backtest_at: info.last_backtest_at || null,
          status: info.status || null,
          enabled: info.enabled !== false,
          model: info.model || null,
          universe: info.universe || [],
          timeframe: info.timeframe || null,
          signal_threshold: info.risk?.signal_threshold ?? null,
          ok: info.ok !== false,
          surface: 'research',
          execution: info.enabled === true,
        };
      });
      strategies.push({
        name: 'options_trading',
        path: null,
        kind: 'options',
        family: 'options',
        lane: 'cross_asset',
        role: 'research_signal',
        grade: null,
        score: null,
        verdict: null,
        last_backtest_at: null,
        status: 'research_only',
        enabled: false,
        model: null,
        universe: [],
        timeframe: null,
        signal_threshold: null,
        ok: true,
        surface: 'research',
        execution: false,
        note: 'Options signal research is cataloged, but no option-chain execution wired.',
      });
      return {
        ok: true,
        type: 'strategy_catalog',
        count: strategies.length,
        strategies,
      };
    } catch (err) {
      return { ok: false, type: 'strategy_catalog', error: err.message, strategies: [] };
    }
  },
};

