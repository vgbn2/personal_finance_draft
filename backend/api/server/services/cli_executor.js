const fs = require('node:fs');
const path = require('node:path');

const {
  findBackendBinary,
  findNodeCli,
  REPO_ROOT,
  BACKEND_CANDIDATES,
  CLI_CANDIDATES,
  DEFAULT_SNAPSHOT,
  DEFAULT_QUALITY_REPORT,
  DEFAULT_MODEL_REPORT,
  DEFAULT_BACKTEST,
} = require('../../../../shared/lib/runtime/paths');
const { resolveRuntimePolicy } = require('../../../../shared/lib/settings/runtime_policy');

const {
  MEMORY_CACHE,
  MEMORY_CACHE_TTL_MS,
  SCORECARD_CACHE,
  SCORECARD_CACHE_TTL_MS,
  SCORECARD_CACHE_MAX_ENTRIES,
  withCache,
  withScorecardCache,
  runScorecardWorker,
  locateBackendBinary,
  locateNodeCli,
  runBackend,
  runNodeCli,
} = require('./cli_executor_cache');

const {
  DEFAULT_HISTORY,
  stringOrFallback,
  readJsonFile,
  parseLimit,
  parseSymbolList,
  finiteNumber,
  clamp,
  parseEquityCsv,
  maxDrawdownFromEquity,
  localStatsFromEquityCsv,
  normalizeRecord,
  loadHistoryRecords,
  sortRecordsByTime,
  resolveHistorySlice,
  bucketKeyForTimeframe,
  deriveCompressedHistory,
  hasUsefulCorrelationPayload,
  buildMarketDataSummary,
  pearsonCorrelation,
  buildCorrelationMatrix,
  buildMarketUniverse,
  buildPortfolioSnapshot,
  localBackendFallback,
} = require('./cli_executor_market');

const {
  DEFAULT_BACKTEST_REPORT,
  SIGNAL_REPORT_MAX_AGE_MS,
  directionFromReturn,
  confidenceFromCandidate,
  selectedCandidate,
  backtestSummary,
  resolveSignalRequest,
  regenerateSignalModelReport,
  signalReportFreshness,
  signalReason,
  projectSignalCandidate,
  projectSignalCandidates,
  buildSignalStatusResponse,
  signalStatus,
  backendScorecard,
  backendCombinedResearch,
} = require('./cli_executor_signals');

function backendStatus(query = {}) {
  const input = stringOrFallback(query.input, DEFAULT_SNAPSHOT);
  return withCache(`status:${input}`, () => {
    const args = [
      'status',
      '--snapshot',
      input,
      '--quality',
      stringOrFallback(query.quality_report, DEFAULT_QUALITY_REPORT),
      '--json',
    ];
    const backend = runBackend(args);
    return backend.available ? backend : runNodeCli(args);
  });
}

function backendDataSummary(query = {}) {
  const symbol = stringOrFallback(query.symbol, 'SPY');
  const timeframe = stringOrFallback(query.timeframe, '1d');
  const maxBars = stringOrFallback(query.max_bars, '0');
  const explicitInput = typeof query.input === 'string' && query.input.trim()
    ? query.input.trim()
    : null;
  if (!explicitInput) {
    return withCache(`summary:canonical:${symbol}:${timeframe}:${maxBars}`, () => runNodeCli([
      'backend',
      'data',
      'summary',
      '--symbol',
      symbol,
      '--timeframe',
      timeframe,
      '--max-bars',
      maxBars,
      '--json',
    ]));
  }

  const input = explicitInput;
  return withCache(`summary:${symbol}:${timeframe}:${input}:${maxBars}`, () => {
    const args = [
      'data',
      'summary',
      '--symbol',
      symbol,
      '--timeframe',
      timeframe,
      '--input',
      input,
      '--max-bars',
      maxBars,
      '--json',
    ];
    const backend = runBackend(args);
    if (backend.available) {
      return backend;
    }
    const nodeCli = runNodeCli(['backend', ...args]);
    if (nodeCli.ok) {
      return nodeCli;
    }
    return localBackendFallback('data summary', query);
  });
}

function backendCorrelation(query = {}) {
  const symbols = stringOrFallback(query.symbols, 'AAPL,MSFT,SPY');
  const timeframe = stringOrFallback(query.timeframe, '1d');
  const input = stringOrFallback(query.input, DEFAULT_HISTORY);
  const maxBars = stringOrFallback(query.max_bars, '252');
  return withCache(`correlation:${symbols}:${timeframe}:${input}:${maxBars}`, () => {
    const args = [
      'correlation',
      '--symbols',
      symbols,
      '--timeframe',
      timeframe,
      '--input',
      input,
      '--max-bars',
      maxBars,
      '--json',
    ];
    const backend = runBackend(args);
    if (hasUsefulCorrelationPayload(backend)) {
      return backend;
    }
    const nodeCli = runNodeCli(['backend', ...args]);
    if (hasUsefulCorrelationPayload(nodeCli)) {
      return nodeCli;
    }
    return localBackendFallback('correlation', query);
  });
}

function backendStats(query = {}) {
  return withCache(`stats:${query.equity || 'latest'}`, () => {
    let equityCsv = stringOrFallback(query.equity, null);
    let equitySource = equityCsv ? 'query' : null;
    if (!equityCsv) {
      const inputPath = stringOrFallback(query.input, DEFAULT_BACKTEST_REPORT);
      try {
        const backtest = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
        if (backtest && backtest.equity_curve && Array.isArray(backtest.equity_curve)) {
          equityCsv = backtest.equity_curve.map((point) => (point.equity * 100).toFixed(2)).join(',');
          equitySource = inputPath;
        }
      } catch (e) {
        // Ignored
      }
    }
    if (!equityCsv) {
      return {
        available: Boolean(locateBackendBinary()),
        ok: false,
        type: 'backend_stats',
        engine: 'sovereign_web_api',
        schema_version: 1,
        error: 'No equity curve found. Run a backtest first or pass equity explicitly.',
      };
    }

    const args = [
      'stats',
      '--equity',
      equityCsv,
      '--json',
    ];
    const nodeArgs = [
      'backend',
      'stats',
      '--equity',
      equityCsv,
      '--json',
    ];
    const backend = runBackend(args);
    const payload = backend.available ? backend : runNodeCli(nodeArgs);
    if (payload.ok === false) {
      return {
        ...localStatsFromEquityCsv(equityCsv),
        equity_source: equitySource,
        fallback_reason: payload.error || 'backend_stats_unavailable',
      };
    }
    return {
      ...payload,
      equity_source: equitySource,
    };
  });
}

function backendUniverse(query = {}) {
  const input = stringOrFallback(query.input, DEFAULT_HISTORY);
  const maxEntries = stringOrFallback(query.max_entries, '0');
  return withCache(`universe:${input}:${maxEntries}`, () => {
    const args = [
      'universe',
      '--input',
      input,
      '--max-entries',
      maxEntries,
      '--json',
    ];
    const backend = runBackend(args);
    if (backend.available) {
      return backend;
    }
    const nodeCli = runNodeCli(args);
    if (nodeCli.ok) {
      return nodeCli;
    }
    return localBackendFallback('universe', query);
  });
}

function backendPortfolio(query = {}) {
  return withCache('portfolio:aggregated', () => {
    const args = [
      'trade',
      'aggregate_portfolio',
      '--json',
    ];
    const payload = runNodeCli(args);

    if (payload.ok === false) {
      return {
        ...localBackendFallback('portfolio', query),
        fallback_reason: payload.error || 'aggregate_portfolio_unavailable',
      };
    }

    return {
      available: true,
      ok: true,
      type: 'portfolio_snapshot',
      engine: 'sovereign_gateway',
      schema_version: 1,
      source: 'multi_broker_aggregation',
      cash: payload.total_usd || 0,
      positions: (payload.positions || []).map((p) => ({
        symbol: p.symbol,
        quantity: p.quantity,
        average_price: p.averagePrice,
        market_value: p.marketValue,
        unrealized_pl: p.unrealizedPl,
      })),
      summary: {
        market_value: (payload.total_equity || 0) - (payload.total_usd || 0),
        equity: payload.total_equity || 0,
        positions: (payload.positions || []).length,
      },
      brokers: payload.brokers || [],
    };
  });
}

function backendIndicators(query = {}) {
  const symbol = stringOrFallback(query.symbol, '');
  const timeframe = stringOrFallback(query.timeframe, '1d');
  return withCache(`indicators:${symbol}:${timeframe}`, () => {
    const args = [
      'indicators',
      '--symbol',
      symbol,
      '--timeframe',
      timeframe,
      '--json',
    ];
    const nodeCli = runNodeCli(args);
    if (nodeCli.exit_code === 0 && nodeCli.ok !== false && !nodeCli.error) {
      return {
        ...nodeCli,
        ok: true,
      };
    }
    return {
      ...nodeCli,
      available: true,
      ok: false,
      error: nodeCli.error || 'indicators_command_failed',
    };
  });
}

function backendKillSwitch(subcommand = 'status') {
  const args = ['kill-switch', subcommand];
  const backend = runBackend(args);
  if (backend.available) {
    return backend;
  }
  return { ok: false, error: 'Kill switch only available via C++ backend' };
}

function backendCacheList() {
  const cacheDir = path.join(REPO_ROOT, 'storage', 'data', 'cache');
  try {
    if (!fs.existsSync(cacheDir)) {
      return { ok: true, files: [] };
    }
    const files = fs.readdirSync(cacheDir)
      .filter((file) => file.endsWith('.json'))
      .map((file) => {
        const fullPath = path.join(cacheDir, file);
        const stats = fs.statSync(fullPath);
        return {
          name: file,
          size: stats.size,
          mtime: stats.mtime,
        };
      });
    return { ok: true, files };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

function quoteSources() {
  return withCache('quote_sources', () => runNodeCli(['quotes', 'status', '--json']));
}

function cliStatus() {
  return withCache('cli_status', () => runNodeCli(['status', '--json']));
}

function systemStatus() {
  return withCache('system_status', () => {
    const cli = cliStatus();
    const backend = backendStatus();
    const quotes = quoteSources();
    const cache = backendCacheList();
    const components = {
      cli: {
        ok: cli.ok !== false && cli.exit_code === 0,
        phase: cli.phase || null,
        cache_mode: cli.cache_mode || null,
        records: cli.records || 0,
        usable_records: cli.usable_records || 0,
        stale_records: cli.stale_records || 0,
        provider_errors: cli.provider_errors || 0,
        cli_path: cli.cli_path || null,
      },
      backend: {
        ok: backend.available !== false && backend.ok !== false,
        available: backend.available !== false,
        type: backend.type || null,
      },
      quotes: {
        ok: Boolean(quotes.ok),
        enabled: quotes.enabled !== false,
        records: quotes.records || 0,
        stale_records: quotes.stale_records || 0,
        providers: Array.isArray(quotes.providers)
          ? quotes.providers.map((provider) => ({
              provider: provider.provider,
              status: provider.status,
              configured: Boolean(provider.configured),
              records: provider.records || 0,
              stale_records: provider.stale_records || 0,
            }))
          : [],
      },
      cache: {
        ok: Boolean(cache.ok),
        files: Array.isArray(cache.files) ? cache.files.length : 0,
      },
    };

    return {
      ok: components.cli.ok && components.backend.ok,
      type: 'system_status',
      schema_version: 1,
      degraded: !components.quotes.ok || !components.cache.ok,
      runtime_policy: cli.runtime_policy || resolveRuntimePolicy(),
      components,
    };
  });
}

function botStatus(query = {}) {
  return runNodeCli(['bot', 'status', '--json']);
}

function botCycle(query = {}) {
  const extraArgs = [];
  if (query.live === 'true') extraArgs.push('--live');
  return runNodeCli(['bot', 'cycle', '--json', ...extraArgs]);
}

function botSell(query = {}) {
  const positionId = String(query.position_id || '');
  if (!positionId) return { ok: false, error: 'position_id required' };
  return runNodeCli(['bot', 'sell', '--position-id', positionId, '--json']);
}

module.exports = {
  BACKEND_CANDIDATES,
  CLI_CANDIDATES,
  DEFAULT_BACKTEST_REPORT,
  DEFAULT_HISTORY,
  DEFAULT_MODEL_REPORT,
  DEFAULT_QUALITY_REPORT,
  DEFAULT_SNAPSHOT,
  backendCacheList,
  backendCorrelation,
  backendCombinedResearch,
  backendDataSummary,
  backendPortfolio,
  backendScorecard,
  SIGNAL_REPORT_MAX_AGE_MS,
  backendUniverse,
  buildCorrelationMatrix,
  backendIndicators,
  backendStats,
  backtestSummary,
  backendStatus,
  backendKillSwitch,
  cliStatus,
  locateBackendBinary,
  locateNodeCli,
  localStatsFromEquityCsv,
  quoteSources,
  runBackend,
  runNodeCli,
  signalStatus,
  systemStatus,
  botStatus,
  botCycle,
  botSell,
};
