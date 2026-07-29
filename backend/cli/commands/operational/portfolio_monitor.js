'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { optionValue, hasFlag, numericOption, printPayload } = require('../../lib/utils.js');
const { runGatewayCommand } = require('../../../../shared/lib/runtime/backend_bridge.js');
const { parseYamlRecursive } = require('../../../../shared/lib/runtime/config_loader.js');
const { writeJson } = require('../../../../shared/lib/market/validation.js');
const { REPO_ROOT, STORAGE_DATA_DIR } = require('../../../../shared/lib/runtime/paths.js');
const { errorCode, writeServiceHeartbeat } = require('../../../../shared/lib/runtime/service_heartbeat.js');
const {
  normalizeAlpacaPortfolioScope,
} = require('../../../../shared/lib/brokers/alpaca_portfolio_scope.js');

const PORTFOLIO_MONITOR_STATUS_PATH = path.join(
  STORAGE_DATA_DIR,
  'cache',
  'portfolio_monitor_status.json',
);
const DEFAULT_RISK_CONFIG_PATH = path.join(REPO_ROOT, 'config', 'trading', 'risk_management.yaml');
const DEFAULT_PORTFOLIO_SCOPE = 'both';
const DEFAULT_ALPACA_SCOPE = 'paper';
const PORTFOLIO_SCOPES = Object.freeze(['live', 'live_paper', 'both']);

const DEFAULT_THRESHOLDS = Object.freeze({
  max_position_notional: 25000,
  max_gross_exposure: 100000,
  max_net_exposure: 50000,
  max_drawdown: 0.10,
});

function finiteNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function positiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function loadRiskThresholds(configPath = DEFAULT_RISK_CONFIG_PATH, env = process.env) {
  let configured = {};
  try {
    const lines = fs.readFileSync(configPath, 'utf8').split(/\r?\n/);
    const [parsed] = parseYamlRecursive(lines);
    configured = parsed.risk || {};
  } catch (_) {
    // Defaults keep the monitor useful when a deployment mounts no config file.
  }

  return {
    max_position_notional: positiveNumber(
      env.SOVEREIGN_MAX_POSITION_NOTIONAL,
      positiveNumber(configured.max_position_notional, DEFAULT_THRESHOLDS.max_position_notional),
    ),
    max_gross_exposure: positiveNumber(
      env.SOVEREIGN_MAX_GROSS_EXPOSURE,
      positiveNumber(configured.max_gross_exposure, DEFAULT_THRESHOLDS.max_gross_exposure),
    ),
    max_net_exposure: positiveNumber(
      env.SOVEREIGN_MAX_NET_EXPOSURE,
      positiveNumber(configured.max_net_exposure, DEFAULT_THRESHOLDS.max_net_exposure),
    ),
    max_drawdown: positiveNumber(
      env.SOVEREIGN_MAX_DRAWDOWN,
      positiveNumber(configured.max_drawdown, DEFAULT_THRESHOLDS.max_drawdown),
    ),
  };
}

function positionMarketValue(position) {
  if (Number.isFinite(Number(position && position.marketValue))) {
    return Number(position.marketValue);
  }
  const quantity = finiteNumber(position && position.quantity);
  const averagePrice = finiteNumber(position && position.averagePrice);
  return quantity * averagePrice;
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasFiniteNumber(object, field) {
  const value = object[field];
  return value !== null && value !== '' && Number.isFinite(Number(value));
}

function isAggregateBucket(value) {
  return isObject(value)
    && hasFiniteNumber(value, 'total_equity')
    && hasFiniteNumber(value, 'total_usd')
    && Array.isArray(value.positions)
    && Array.isArray(value.brokers);
}

function isInternalPaperBucket(value) {
  return isObject(value)
    && hasFiniteNumber(value, 'virtual_balance')
    && hasFiniteNumber(value, 'starting_balance')
    && hasFiniteNumber(value, 'open_positions')
    && hasFiniteNumber(value, 'open_cost')
    && hasFiniteNumber(value, 'equity_marked_at_cost')
    && Array.isArray(value.positions);
}

function normalizePortfolioScope(value, fallback = null) {
  const normalized = String(value ?? '').trim().toLowerCase().replace(/-/g, '_');
  if (PORTFOLIO_SCOPES.includes(normalized)) return normalized;
  return fallback;
}

function combineAggregateBuckets(live, livePaper) {
  return {
    total_equity: finiteNumber(live.total_equity) + finiteNumber(livePaper.total_equity),
    total_usd: finiteNumber(live.total_usd) + finiteNumber(livePaper.total_usd),
    positions: [...live.positions, ...livePaper.positions],
    brokers: [...live.brokers, ...livePaper.brokers],
  };
}

function normalizePortfolioSnapshot(payload, requestedScope = DEFAULT_PORTFOLIO_SCOPE) {
  const scope = normalizePortfolioScope(requestedScope);
  if (!scope) return { ok: false, error: 'invalid_portfolio_monitor_scope' };
  if (!isObject(payload)) {
    return { ok: false, error: 'portfolio_snapshot_unavailable' };
  }
  if (payload.ok === false) {
    return { ok: false, error: payload.error || 'portfolio_snapshot_unavailable' };
  }

  const bucketNames = ['live', 'live_paper', 'paper'];
  const hasBucketedShape = bucketNames.some((name) => Object.hasOwn(payload, name));
  if (hasBucketedShape) {
    if (!bucketNames.every((name) => Object.hasOwn(payload, name))
      || !isAggregateBucket(payload.live)
      || !isAggregateBucket(payload.live_paper)
      || !isInternalPaperBucket(payload.paper)) {
      return { ok: false, error: 'invalid_aggregate_portfolio_schema' };
    }
    const snapshot = scope === 'live'
      ? payload.live
      : (scope === 'live_paper'
        ? payload.live_paper
        : combineAggregateBuckets(payload.live, payload.live_paper));
    return { ok: true, scope, snapshot };
  }

  if (isAggregateBucket(payload)) {
    return { ok: true, scope: 'legacy_flat', snapshot: payload };
  }
  return { ok: false, error: 'invalid_aggregate_portfolio_schema' };
}

function buildRiskAssessment(
  payload,
  previousStatus = {},
  thresholds = DEFAULT_THRESHOLDS,
  now = Date.now(),
  portfolioScope = DEFAULT_PORTFOLIO_SCOPE,
) {
  const normalized = normalizePortfolioSnapshot(payload, portfolioScope);
  if (!normalized.ok) {
    return {
      ok: false,
      status: 'error',
      checked_at: new Date(now).toISOString(),
      error: normalized.error,
      breaches: [{ code: 'portfolio_unavailable', severity: 'critical' }],
    };
  }

  const snapshot = normalized.snapshot;
  const positions = Array.isArray(snapshot.positions) ? snapshot.positions : [];
  const brokers = Array.isArray(snapshot.brokers) ? snapshot.brokers : [];
  const equity = finiteNumber(snapshot.total_equity);
  const cash = finiteNumber(snapshot.total_usd);
  const values = positions.map((position) => positionMarketValue(position));
  const grossExposure = values.reduce((sum, value) => sum + Math.abs(value), 0);
  const netExposure = values.reduce((sum, value) => sum + value, 0);
  const previousPeak = previousStatus.portfolio_scope
    && previousStatus.portfolio_scope !== normalized.scope
    ? 0
    : finiteNumber(previousStatus.peak_equity);
  const peakEquity = Math.max(previousPeak, equity);
  const drawdown = peakEquity > 0 ? Math.max(0, (peakEquity - equity) / peakEquity) : 0;
  const breaches = [];

  positions.forEach((position, index) => {
    const notional = Math.abs(values[index]);
    if (notional > thresholds.max_position_notional) {
      breaches.push({
        code: 'max_position_notional',
        severity: 'critical',
        symbol: String(position.symbol || position.assetId || 'unknown'),
        actual: notional,
        limit: thresholds.max_position_notional,
      });
    }
  });
  if (grossExposure > thresholds.max_gross_exposure) {
    breaches.push({ code: 'max_gross_exposure', severity: 'critical', actual: grossExposure, limit: thresholds.max_gross_exposure });
  }
  if (Math.abs(netExposure) > thresholds.max_net_exposure) {
    breaches.push({ code: 'max_net_exposure', severity: 'critical', actual: Math.abs(netExposure), limit: thresholds.max_net_exposure });
  }
  if (drawdown > thresholds.max_drawdown) {
    breaches.push({ code: 'max_drawdown', severity: 'critical', actual: drawdown, limit: thresholds.max_drawdown });
  }

  const brokerErrors = brokers
    .filter((broker) => broker && broker.status !== 'connected')
    .map((broker) => ({
      code: 'broker_unavailable',
      severity: 'warning',
      broker: String(broker.name || 'unknown'),
      error_code: broker.error ? errorCode(broker.error) : null,
    }));
  breaches.push(...brokerErrors);
  const connectedBrokers = brokers
    .filter((broker) => broker && broker.status === 'connected')
    .map((broker) => broker.name);
  if (brokers.length > 0 && connectedBrokers.length === 0) {
    breaches.push({ code: 'no_connected_brokers', severity: 'critical' });
  }

  const criticalCount = breaches.filter((breach) => breach.severity === 'critical').length;
  return {
    ok: criticalCount === 0,
    status: criticalCount > 0 ? 'breach' : (breaches.length > 0 ? 'warning' : 'healthy'),
    checked_at: new Date(now).toISOString(),
    portfolio_scope: normalized.scope,
    equity,
    cash,
    peak_equity: peakEquity,
    drawdown,
    gross_exposure: grossExposure,
    net_exposure: netExposure,
    position_count: positions.length,
    connected_brokers: connectedBrokers,
    broker_count: brokers.length,
    thresholds: { ...thresholds },
    breaches,
  };
}

function readPreviousStatus(statusPath = PORTFOLIO_MONITOR_STATUS_PATH) {
  try {
    return JSON.parse(fs.readFileSync(statusPath, 'utf8'));
  } catch (_) {
    return {};
  }
}

async function runPortfolioMonitorCycle(options = {}) {
  const previousStatus = options.previousStatus || {};
  const thresholds = options.thresholds || DEFAULT_THRESHOLDS;
  const now = options.now || Date.now();
  try {
    const snapshot = await options.fetchPortfolio();
    return buildRiskAssessment(
      snapshot,
      previousStatus,
      thresholds,
      now,
      options.portfolioScope,
    );
  } catch (error) {
    return buildRiskAssessment(
      { ok: false, error: error.message },
      previousStatus,
      thresholds,
      now,
      options.portfolioScope,
    );
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function portfolioMonitorExitCode(assessment) {
  return assessment && assessment.ok ? 0 : 1;
}

function sanitizedStatusPatch(patch) {
  const result = { ...patch };
  if (Object.hasOwn(result, 'error')) {
    result.error = result.error ? errorCode(result.error) : null;
  }
  return result;
}

async function runPortfolioMonitorLoop(options = {}) {
  const once = options.once === true;
  const intervalSecs = options.intervalSecs;
  const nowMs = options.nowMs || (() => Date.now());
  const wait = options.sleep || sleep;
  const fetchPortfolio = options.fetchPortfolio;
  const publishStatus = options.publishStatus || (() => {});
  const onCycle = options.onCycle || (() => {});
  const maxCycles = Number.isInteger(options.maxCycles) && options.maxCycles > 0
    ? options.maxCycles
    : null;
  let status = { ...(options.initialStatus || {}) };
  let cycle = finiteNumber(status.cycle);
  let cyclesRun = 0;
  let assessment = null;

  /* eslint-disable no-await-in-loop */
  for (;;) {
    cycle += 1;
    cyclesRun += 1;
    publishStatus({ status: 'polling', cycle }, { attempted: false });
    assessment = await runPortfolioMonitorCycle({
      previousStatus: status,
      thresholds: options.thresholds,
      fetchPortfolio,
      now: nowMs(),
      portfolioScope: options.portfolioScope,
    });
    const nextRunAt = once
      ? null
      : new Date(nowMs() + intervalSecs * 1000).toISOString();
    const currentStatus = {
      ...assessment,
      cycle,
      next_run_at: nextRunAt,
    };
    status = { ...status, ...currentStatus };
    if (!assessment.error) {
      delete status.error;
      delete status.error_code;
    }
    delete status.stopped_signal;
    publishStatus(currentStatus, { attempted: true, clearTransient: true });
    onCycle({ cycle, ...assessment });
    if (once || (maxCycles !== null && cyclesRun >= maxCycles)) break;
    await wait(intervalSecs * 1000);
  }
  /* eslint-enable no-await-in-loop */

  return { assessment, cycle, status };
}

async function commandPortfolioMonitor(args) {
  const once = hasFlag(args, '--once');
  const intervalSecs = Math.max(5, numericOption(
    args,
    '--interval-secs',
    finiteNumber(process.env.PORTFOLIO_MONITOR_INTERVAL_SECS, 60),
  ));
  const timeoutMs = Math.max(1000, numericOption(
    args,
    '--timeout-ms',
    finiteNumber(process.env.PORTFOLIO_MONITOR_TIMEOUT_MS, 45000),
  ));
  const portfolioScope = normalizePortfolioScope(optionValue(
    args,
    '--scope',
    process.env.PORTFOLIO_MONITOR_SCOPE || DEFAULT_PORTFOLIO_SCOPE,
  ));
  const alpacaScope = normalizeAlpacaPortfolioScope(optionValue(
    args,
    '--alpaca-scope',
    process.env.PORTFOLIO_MONITOR_ALPACA_SCOPE || DEFAULT_ALPACA_SCOPE,
  ));
  if (!portfolioScope || !alpacaScope) {
    printPayload({
      ok: false,
      type: 'portfolio_monitor',
      error: !portfolioScope
        ? 'invalid_portfolio_monitor_scope'
        : 'invalid_alpaca_portfolio_scope',
    }, args);
    return 1;
  }
  const statusPath = optionValue(args, '--status-path', PORTFOLIO_MONITOR_STATUS_PATH);
  const thresholds = loadRiskThresholds(optionValue(args, '--risk-config', DEFAULT_RISK_CONFIG_PATH));
  let status = readPreviousStatus(statusPath);

  const publishStatus = (patch, publication = {}) => {
    const persistedPatch = sanitizedStatusPatch(patch);
    if (publication.clearTransient) {
      delete status.error;
      delete status.error_code;
      delete status.stopped_signal;
    }
    status = {
      ...status,
      ...persistedPatch,
      pid: process.pid,
      interval_secs: intervalSecs,
      updated_at: new Date().toISOString(),
    };
    writeJson(statusPath, status);
    try {
      const success = persistedPatch.status === 'healthy' || persistedPatch.ok === true;
      writeServiceHeartbeat('portfolio_monitor', {
        state: persistedPatch.status === 'stopped' ? 'stopped' : (persistedPatch.status === 'polling' ? 'running' : (success ? 'healthy' : 'degraded')),
        success,
        attempted: publication.attempted,
        error_code: persistedPatch.error_code || persistedPatch.error || null,
        next_run_at: persistedPatch.next_run_at || null,
      });
    } catch (_) {
      // Monitoring publication must not change portfolio-monitor behavior.
    }
  };
  const stop = (signal) => {
    try { publishStatus({ status: 'stopped', stopped_signal: signal }, { attempted: false }); } catch (_) {}
    process.exit(0);
  };
  process.once('SIGINT', () => stop('SIGINT'));
  process.once('SIGTERM', () => stop('SIGTERM'));

  const result = await runPortfolioMonitorLoop({
    once,
    intervalSecs,
    thresholds,
    portfolioScope,
    initialStatus: status,
    fetchPortfolio: () => runGatewayCommand([
      'aggregate_portfolio',
      '--json',
      '--alpaca-scope',
      alpacaScope,
    ], { timeout: timeoutMs }),
    publishStatus,
    onCycle: (assessment) => {
      if (!once) console.log(JSON.stringify({ type: 'portfolio_monitor_cycle', ...assessment }));
    },
  });

  if (once) printPayload({ type: 'portfolio_monitor', cycle: result.cycle, ...result.assessment }, args);
  return portfolioMonitorExitCode(result.assessment);
}

module.exports = {
  PORTFOLIO_MONITOR_STATUS_PATH,
  DEFAULT_RISK_CONFIG_PATH,
  DEFAULT_THRESHOLDS,
  DEFAULT_PORTFOLIO_SCOPE,
  DEFAULT_ALPACA_SCOPE,
  PORTFOLIO_SCOPES,
  loadRiskThresholds,
  normalizePortfolioScope,
  combineAggregateBuckets,
  normalizePortfolioSnapshot,
  buildRiskAssessment,
  runPortfolioMonitorCycle,
  runPortfolioMonitorLoop,
  sanitizedStatusPatch,
  portfolioMonitorExitCode,
  commandPortfolioMonitor,
};
