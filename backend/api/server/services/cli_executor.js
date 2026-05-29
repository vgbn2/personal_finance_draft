const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { 
  findBackendBinary, 
  findNodeCli, 
  REPO_ROOT,
  BACKEND_CANDIDATES,
  CLI_CANDIDATES 
} = require('../../../../shared/lib/paths');

const DEFAULT_HISTORY = path.join(REPO_ROOT, 'storage', 'data', 'cache', 'backtest_history.json');
const DEFAULT_SNAPSHOT = path.join(REPO_ROOT, 'storage', 'data', 'cache', 'last_fetch.json');
const DEFAULT_QUALITY_REPORT = path.join(REPO_ROOT, 'storage', 'data', 'cache', 'data_quality_report.json');
const DEFAULT_MODEL_REPORT = path.join(REPO_ROOT, 'storage', 'data', 'models', 'latest_model_comparison.json');
const DEFAULT_BACKTEST_REPORT = path.join(REPO_ROOT, 'storage', 'data', 'backtests', 'latest_backtest.json');

const MEMORY_CACHE = new Map();
const MEMORY_CACHE_TTL_MS = 5000; // 5 seconds cache for dashboard snappiness

function withCache(key, producer) {
  const now = Date.now();
  if (MEMORY_CACHE.has(key)) {
    const { timestamp, payload } = MEMORY_CACHE.get(key);
    if (now - timestamp < MEMORY_CACHE_TTL_MS) {
      return { ...payload, from_memory_cache: true };
    }
  }
  const payload = producer();
  MEMORY_CACHE.set(key, { timestamp: now, payload });
  return payload;
}

function locateBackendBinary() {
  return findBackendBinary();
}

function locateNodeCli() {
  return findNodeCli();
}

function stringOrFallback(value, fallback) {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function readJsonFile(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    return null;
  }
}

function parseLimit(value) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function parseSymbolList(value) {
  return String(value || '')
    .split(',')
    .map((symbol) => symbol.trim())
    .filter(Boolean);
}

function finiteNumber(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function directionFromReturn(value) {
  const number = finiteNumber(value, 0);
  if (number > 0) {
    return 'long';
  }
  if (number < 0) {
    return 'short';
  }
  return 'neutral';
}

function confidenceFromCandidate(candidate = {}) {
  const hitRate = finiteNumber(candidate.hit_rate, 0.5);
  const expectancy = Math.abs(finiteNumber(candidate.expectancy, 0));
  const sharpeLike = Math.abs(finiteNumber(candidate.sharpe_like, 0));
  const returnStrength = Math.abs(finiteNumber(candidate.total_return, 0));
  const raw = (hitRate * 0.6) + (Math.min(expectancy * 12, 0.18)) + (Math.min(sharpeLike, 0.18)) + (Math.min(returnStrength, 0.14));
  return Number(clamp(raw, 0, 0.99).toFixed(4));
}

function selectedCandidate(entry = {}) {
  const candidates = Array.isArray(entry.candidates) ? entry.candidates : [];
  if (!candidates.length) {
    return null;
  }
  return candidates.find((candidate) => candidate.model === entry.winner) || candidates[0];
}

function backtestSummary(backtest = null) {
  if (!backtest) {
    return {
      available: false,
      reason: 'latest_backtest_report_missing',
    };
  }
  const metrics = backtest.metrics || backtest.out_of_sample || {};
  return {
    available: true,
    source_mode: backtest.source_mode || null,
    generated_at: backtest.generated_at || null,
    strategy: backtest.strategy || null,
    model: backtest.model || null,
    timeframe: backtest.timeframe || null,
    threshold: finiteNumber(backtest.threshold),
    horizon: finiteNumber(backtest.horizon),
    period: backtest.period || null,
    metrics: {
      trades: finiteNumber(metrics.trades, 0),
      net_return: finiteNumber(metrics.net_return, 0),
      max_drawdown: finiteNumber(metrics.max_drawdown, 0),
      sharpe_ratio: finiteNumber(metrics.sharpe_ratio),
      hit_rate: finiteNumber(metrics.hit_rate, 0),
      expectancy: finiteNumber(metrics.expectancy, 0),
      expected_value: finiteNumber(metrics.expected_value, 0),
    },
  };
}

function parseEquityCsv(equityCsv) {
  return String(equityCsv || '')
    .split(',')
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isFinite(value));
}

function maxDrawdownFromEquity(values) {
  let peak = values[0] || 0;
  let maxDrawdown = 0;
  for (const value of values) {
    peak = Math.max(peak, value);
    if (peak > 0) {
      maxDrawdown = Math.max(maxDrawdown, (peak - value) / peak);
    }
  }
  return maxDrawdown;
}

function localStatsFromEquityCsv(equityCsv) {
  const values = parseEquityCsv(equityCsv);
  if (values.length < 1) {
    return {
      ok: false,
      type: 'backend_stats',
      engine: 'sovereign_web_api',
      schema_version: 1,
      error: 'invalid --equity CSV',
    };
  }
  const returns = values.slice(1).map((value, index) => {
    const previous = values[index];
    return previous !== 0 ? (value - previous) / previous : 0;
  });
  const average = returns.length ? returns.reduce((sum, value) => sum + value, 0) / returns.length : 0;
  const variance = returns.length ? returns.reduce((sum, value) => sum + ((value - average) ** 2), 0) / returns.length : 0;
  const volatility = Math.sqrt(variance);
  const cumulativeReturn = values[0] !== 0 ? (values[values.length - 1] - values[0]) / values[0] : 0;
  return {
    ok: true,
    type: 'backend_stats',
    engine: 'sovereign_web_api',
    schema_version: 1,
    source: 'local_equity_curve',
    observations: values.length,
    cumulative_return: Number(cumulativeReturn.toFixed(8)),
    annualized_return: Number(cumulativeReturn.toFixed(8)),
    volatility: Number(volatility.toFixed(8)),
    sharpe: volatility > 0 ? Number((average / volatility).toFixed(8)) : 0,
    sortino: 0,
    max_drawdown: Number(maxDrawdownFromEquity(values).toFixed(8)),
    calmar: 0,
  };
}

function normalizeRecord(record) {
  return {
    ...record,
    symbol: stringOrFallback(record.symbol, '').toUpperCase(),
    timeframe: stringOrFallback(record.timeframe, ''),
    timestamp: record.timestamp || record.time || record.date || null,
    close: Number(record.close),
    volume: Number(record.volume),
  };
}

function loadHistoryRecords(inputPath) {
  const payload = readJsonFile(inputPath);
  if (!payload) {
    return [];
  }

  const candidateArrays = [
    payload.sources,
    payload.records,
    payload.bars,
    payload.data,
  ];
  const records = candidateArrays.find((value) => Array.isArray(value));
  return Array.isArray(records) ? records.map(normalizeRecord) : [];
}

function sortRecordsByTime(records) {
  return [...records].sort((a, b) => {
    const left = String(a.timestamp || '');
    const right = String(b.timestamp || '');
    return left.localeCompare(right);
  });
}

function resolveHistorySlice(records, symbol, timeframe, limit) {
  const symbolKey = stringOrFallback(symbol, '').toUpperCase();
  const timeframeKey = stringOrFallback(timeframe, '');
  let filtered = records.filter((record) => {
    const matchesSymbol = !symbolKey || record.symbol === symbolKey;
    const matchesTimeframe = !timeframeKey || record.timeframe === timeframeKey;
    return matchesSymbol && matchesTimeframe;
  });
  filtered = sortRecordsByTime(filtered);
  if (limit > 0 && filtered.length > limit) {
    filtered = filtered.slice(-limit);
  }
  return filtered;
}

function buildMarketDataSummary(query = {}) {
  const input = stringOrFallback(query.input, DEFAULT_HISTORY);
  const symbol = stringOrFallback(query.symbol, 'AAPL');
  const timeframe = stringOrFallback(query.timeframe, '1d');
  const limit = parseLimit(query.max_bars);
  const records = loadHistoryRecords(input);
  const slice = resolveHistorySlice(records, symbol, timeframe, limit);
  const first = slice[0] || {};
  const last = slice[slice.length - 1] || {};
  const closes = slice.map((record) => Number(record.close)).filter((value) => Number.isFinite(value));
  const volumes = slice.map((record) => Number(record.volume)).filter((value) => Number.isFinite(value));

  return {
    available: true,
    ok: true,
    type: 'market_data_summary',
    engine: 'sovereign_web_api',
    schema_version: 1,
    source: 'local_fixture',
    input,
    summary: {
      symbol: symbol.toUpperCase(),
      timeframe,
      bars: slice.length,
      first_timestamp: first.timestamp || null,
      last_timestamp: last.timestamp || null,
      first_close: Number.isFinite(Number(first.close)) ? Number(first.close) : null,
      last_close: Number.isFinite(Number(last.close)) ? Number(last.close) : null,
      min_close: closes.length ? Math.min(...closes) : null,
      max_close: closes.length ? Math.max(...closes) : null,
      total_volume: volumes.length ? volumes.reduce((sum, value) => sum + value, 0) : 0,
    },
    quality: {
      rejected_records: 0,
      usable_records: slice.length,
      stale_records: 0,
      provider_errors: 0,
    },
    records: slice,
  };
}

function pearsonCorrelation(valuesA, valuesB) {
  if (!valuesA.length || valuesA.length !== valuesB.length) {
    return 0;
  }

  const meanA = valuesA.reduce((sum, value) => sum + value, 0) / valuesA.length;
  const meanB = valuesB.reduce((sum, value) => sum + value, 0) / valuesB.length;
  let numerator = 0;
  let sumSquaresA = 0;
  let sumSquaresB = 0;
  for (let index = 0; index < valuesA.length; index += 1) {
    const deltaA = valuesA[index] - meanA;
    const deltaB = valuesB[index] - meanB;
    numerator += deltaA * deltaB;
    sumSquaresA += deltaA * deltaA;
    sumSquaresB += deltaB * deltaB;
  }

  const denominator = Math.sqrt(sumSquaresA * sumSquaresB);
  if (!Number.isFinite(denominator) || denominator === 0) {
    return 0;
  }
  return Number((numerator / denominator).toFixed(6));
}

function buildCorrelationMatrix(query = {}) {
  const input = stringOrFallback(query.input, DEFAULT_HISTORY);
  const timeframe = stringOrFallback(query.timeframe, '1d');
  const limit = parseLimit(query.max_bars);
  const requestedSymbols = parseSymbolList(query.symbols);
  const records = loadHistoryRecords(input).filter((record) => !timeframe || record.timeframe === timeframe);
  const symbols = requestedSymbols.length
    ? requestedSymbols.map((symbol) => symbol.toUpperCase())
    : [...new Set(records.map((record) => record.symbol).filter(Boolean))];
  const bySymbol = new Map();

  for (const symbol of symbols) {
    const slice = resolveHistorySlice(records, symbol, timeframe, limit);
    const byTimestamp = new Map(slice.map((record) => [String(record.timestamp || ''), record]));
    bySymbol.set(symbol, byTimestamp);
  }

  const commonTimestamps = symbols.reduce((shared, symbol, index) => {
    const timestamps = new Set([...bySymbol.get(symbol).keys()]);
    if (index === 0) {
      return timestamps;
    }
    return new Set([...shared].filter((timestamp) => timestamps.has(timestamp)));
  }, new Set());
  const alignedTimestamps = [...commonTimestamps].sort((left, right) => left.localeCompare(right));
  const alignedValues = symbols.map((symbol) => alignedTimestamps.map((timestamp) => Number(bySymbol.get(symbol).get(timestamp)?.close)).filter((value) => Number.isFinite(value)));
  const size = symbols.length;
  const values = Array.from({ length: size }, (_, rowIndex) => Array.from({ length: size }, (_, columnIndex) => {
    if (rowIndex === columnIndex) {
      return 1;
    }
    return pearsonCorrelation(alignedValues[rowIndex], alignedValues[columnIndex]);
  }));

  return {
    available: true,
    ok: true,
    type: 'correlation_matrix',
    engine: 'sovereign_web_api',
    schema_version: 1,
    source: 'local_fixture',
    input,
    timeframe,
    labels: symbols,
    values,
    sample_size: alignedTimestamps.length,
  };
}

function buildMarketUniverse(query = {}) {
  const input = stringOrFallback(query.input, DEFAULT_HISTORY);
  const limit = parseLimit(query.max_entries);
  const records = loadHistoryRecords(input);
  const bySymbol = new Map();

  for (const record of records) {
    if (!record.symbol) {
      continue;
    }
    const current = bySymbol.get(record.symbol) || {
      symbol: record.symbol,
      records: 0,
      first_timestamp: record.timestamp || null,
      last_timestamp: record.timestamp || null,
    };
    current.records += 1;
    if (!current.first_timestamp || String(record.timestamp || '').localeCompare(String(current.first_timestamp || '')) < 0) {
      current.first_timestamp = record.timestamp || null;
    }
    if (!current.last_timestamp || String(record.timestamp || '').localeCompare(String(current.last_timestamp || '')) > 0) {
      current.last_timestamp = record.timestamp || null;
    }
    bySymbol.set(record.symbol, current);
  }

  const entries = [...bySymbol.values()]
    .sort((left, right) => right.records - left.records || left.symbol.localeCompare(right.symbol));

  return {
    available: true,
    ok: true,
    type: 'market_universe',
    engine: 'sovereign_web_api',
    schema_version: 1,
    source: 'local_fixture',
    input,
    entries: limit > 0 ? entries.slice(0, limit) : entries,
  };
}

function buildPortfolioSnapshot(query = {}) {
  const cash = Number(stringOrFallback(query.cash, '10000.0'));
  const positions = String(query.positions || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [symbol, quantity, averagePrice] = entry.split(':').map((part) => part.trim());
      return {
        symbol: stringOrFallback(symbol, '').toUpperCase(),
        quantity: Number(quantity || 0),
        average_price: Number(averagePrice || 0),
      };
    })
    .filter((position) => position.symbol);

  const market_value = positions.reduce((sum, position) => sum + (position.quantity * position.average_price), 0);
  return {
    available: true,
    ok: true,
    type: 'portfolio_snapshot',
    engine: 'sovereign_web_api',
    schema_version: 1,
    source: 'local_fixture',
    cash: Number.isFinite(cash) ? cash : 0,
    positions,
    summary: {
      market_value,
      equity: (Number.isFinite(cash) ? cash : 0) + market_value,
      positions: positions.length,
    },
  };
}

function localBackendFallback(command, query = {}) {
  switch (command) {
    case 'data summary':
      return buildMarketDataSummary(query);
    case 'correlation':
      return buildCorrelationMatrix(query);
    case 'universe':
      return buildMarketUniverse(query);
    case 'portfolio':
      return buildPortfolioSnapshot(query);
    default:
      return {
        available: false,
        ok: false,
        error: `No local fallback available for ${command}`,
      };
  }
}

function runBackend(commandArgs) {
  const binary = locateBackendBinary();
  if (!binary) {
    return {
      available: false,
      ok: false,
      error: 'C++ backend executable not found',
      searched: BACKEND_CANDIDATES,
    };
  }

  const result = spawnSync(binary, commandArgs, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    shell: false,
  });
  if (result.error) {
    return {
      available: true,
      ok: false,
      path: binary,
      error: result.error.message,
    };
  }

  try {
    return {
      available: true,
      path: binary,
      exit_code: result.status,
      ...JSON.parse(result.stdout),
    };
  } catch (error) {
    return {
      available: true,
      ok: false,
      path: binary,
      exit_code: result.status,
      error: `Unable to parse backend JSON: ${error.message}`,
      stdout: result.stdout,
      stderr: result.stderr,
    };
  }
}

function runNodeCli(commandArgs) {
  const cliPath = locateNodeCli();
  if (!cliPath) {
    return {
      ok: false,
      error: 'Sovereign CLI entrypoint not found',
      searched: CLI_CANDIDATES,
    };
  }

  const result = spawnSync(process.execPath, [
    cliPath,
    ...commandArgs,
  ], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    shell: false,
  });
  if (result.error) {
    return {
      ok: false,
      error: result.error.message,
    };
  }

  try {
    return {
      exit_code: result.status,
      cli_path: path.relative(REPO_ROOT, cliPath),
      ...JSON.parse(result.stdout),
    };
  } catch (error) {
    return {
      ok: false,
      exit_code: result.status,
      error: `Unable to parse CLI JSON: ${error.message}`,
      stdout: result.stdout,
      stderr: result.stderr,
    };
  }
}

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
  const symbol = stringOrFallback(query.symbol, 'AAPL');
  const timeframe = stringOrFallback(query.timeframe, '1d');
  return withCache(`summary:${symbol}:${timeframe}`, () => {
    const args = [
    'data',
    'summary',
    '--symbol',
    symbol,
    '--timeframe',
    timeframe,
    '--input',
    stringOrFallback(query.input, DEFAULT_HISTORY),
    '--max-bars',
    stringOrFallback(query.max_bars, '0'),
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
    return localBackendFallback('data summary', query);
  });
}

function backendCorrelation(query = {}) {
  const symbols = stringOrFallback(query.symbols, 'AAPL,MSFT,SPX');
  return withCache(`correlation:${symbols}`, () => {
    const args = [
    'correlation',
    '--symbols',
    symbols,
    '--timeframe',
    stringOrFallback(query.timeframe, '1d'),
    '--input',
    stringOrFallback(query.input, DEFAULT_HISTORY),
    '--max-bars',
    stringOrFallback(query.max_bars, '252'),
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
    return localBackendFallback('correlation', query);
  });
}

function backendStats(query = {}) {
  return withCache(`stats:${query.equity || 'latest'}`, () => {
    let equityCsv = stringOrFallback(query.equity, null);
    let equitySource = equityCsv ? 'query' : null;
    if (!equityCsv) {
      const inputPath = stringOrFallback(query.input, path.join(REPO_ROOT, 'data', 'backtests', 'latest_backtest.json'));
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
  return withCache('universe', () => {
    const args = [
    'universe',
    '--input',
    stringOrFallback(query.input, DEFAULT_HISTORY),
    '--max-entries',
    stringOrFallback(query.max_entries, '0'),
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
  const cash = stringOrFallback(query.cash, '10000.0');
  const pos = stringOrFallback(query.positions, '');
  return withCache(`portfolio:${cash}:${pos}`, () => {
    const args = [
    'portfolio',
    '--cash',
    cash,
    '--positions',
    pos,
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
    return localBackendFallback('portfolio', query);
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

function signalStatus(query = {}) {
  const modelPath = stringOrFallback(query.model_report, DEFAULT_MODEL_REPORT);
  const backtestPath = stringOrFallback(query.backtest_report, DEFAULT_BACKTEST_REPORT);
  const threshold = finiteNumber(query.threshold, null) ?? finiteNumber(readJsonFile(modelPath)?.threshold, 0.55);

  return withCache(`signal:${modelPath}:${backtestPath}:${threshold}`, () => {
    const modelReport = readJsonFile(modelPath);
    const backtestReport = readJsonFile(backtestPath);
    const perSymbol = Array.isArray(modelReport?.per_symbol_winners) ? modelReport.per_symbol_winners : [];
    const signals = perSymbol
      .map((entry, index) => {
        const candidate = selectedCandidate(entry);
        if (!candidate) {
          return null;
        }
        const expectedValue = finiteNumber(candidate.expectancy, 0);
        const totalReturn = finiteNumber(candidate.total_return, 0);
        const confidence = confidenceFromCandidate(candidate);
        const active = confidence >= threshold && expectedValue > 0;
        return {
          signal_id: `${String(candidate.symbol || entry.symbol || 'asset').toLowerCase()}-${String(candidate.model || 'model').toLowerCase()}-${index}`,
          symbol: String(candidate.symbol || entry.symbol || '').toUpperCase(),
          model: candidate.model || entry.winner || null,
          family: candidate.family || null,
          direction: directionFromReturn(expectedValue || totalReturn),
          confidence,
          threshold,
          active,
          promoted: false,
          expected_value: expectedValue,
          hit_rate: finiteNumber(candidate.hit_rate, 0),
          trades: finiteNumber(candidate.trades, 0),
          total_return: totalReturn,
          sharpe_like: finiteNumber(candidate.sharpe_like, 0),
          source: 'model_comparison',
          as_of: modelReport?.generated_at || backtestReport?.generated_at || null,
          reason: active
            ? 'candidate_above_threshold_not_promoted'
            : 'candidate_for_review_not_promoted',
        };
      })
      .filter(Boolean)
      .sort((left, right) => right.confidence - left.confidence || left.symbol.localeCompare(right.symbol));

    return {
      ok: Boolean(modelReport && perSymbol.length),
      type: 'signal_status',
      schema_version: 1,
      source: 'model_comparison',
      generated_at: modelReport?.generated_at || null,
      source_mode: modelReport?.source_mode || null,
      threshold,
      active_signals: signals.filter((signal) => signal.active).length,
      candidate_signals: signals.length,
      promoted_signals: signals.filter((signal) => signal.promoted).length,
      signals,
      model: {
        available: Boolean(modelReport),
        winner: modelReport?.winner || null,
        candidate_count: finiteNumber(modelReport?.candidate_count, 0),
        feature_count: finiteNumber(modelReport?.feature_count, 0),
        families: Array.isArray(modelReport?.families) ? modelReport.families : [],
        data_quality_ok: modelReport?.data_quality_ok === true,
      },
      backtest: backtestSummary(backtestReport),
      quality: {
        data_quality_ok: modelReport?.data_quality_ok === true && backtestReport?.data_quality_ok === true,
        model_report_available: Boolean(modelReport),
        backtest_report_available: Boolean(backtestReport),
        promotion_required: true,
      },
    };
  });
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
      components,
    };
  });
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
  backendDataSummary,
  backendPortfolio,
  backendUniverse,
  backendStats,
  backtestSummary,
  backendStatus,
  backendKillSwitch,
  cliStatus,
  locateBackendBinary,
  locateNodeCli,
  quoteSources,
  runBackend,
  runNodeCli,
  signalStatus,
  systemStatus,
};
