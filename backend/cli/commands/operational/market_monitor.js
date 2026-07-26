'use strict';

const {
  createDefaultMarketMonitorService,
} = require('../../../../shared/lib/market/monitor_service.js');
const {
  hasFlag,
  optionValue,
  pageText,
  printPayload,
} = require('../../lib/utils.js');

const WATCH_MIN_INTERVAL_SECS = 5;
const WATCH_MAX_INTERVAL_SECS = 300;
const WATCH_DEFAULT_INTERVAL_SECS = 10;
const WATCH_MAX_ITERATIONS = 3600;
const WATCH_DEFAULT_ITERATIONS = 60;

let defaultService = null;

function getDefaultService() {
  if (!defaultService) defaultService = createDefaultMarketMonitorService();
  return defaultService;
}

function optionQuery(args, flag, field, output) {
  const value = optionValue(args, flag, null);
  if (value !== null) output[field] = value;
}

function marketMonitorQueryFromArgs(args = []) {
  const query = {};
  optionQuery(args, '--family', 'family', query);
  optionQuery(args, '--freshness', 'freshness_state', query);
  optionQuery(args, '--provider-state', 'provider_state', query);
  optionQuery(args, '--update-state', 'update_state', query);
  optionQuery(args, '--symbol', 'symbol', query);
  optionQuery(args, '--limit', 'limit', query);
  optionQuery(args, '--offset', 'offset', query);
  return query;
}

function strictBoundedInteger(args, flag, fallback, min, max) {
  const raw = optionValue(args, flag, String(fallback));
  if (!/^\d+$/.test(String(raw))) throw new Error(`${flag} must be an integer`);
  const value = Number.parseInt(String(raw), 10);
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error(`${flag} must be between ${min} and ${max}`);
  }
  return value;
}

function formatAge(ageMs) {
  if (!Number.isFinite(ageMs)) return '-';
  if (ageMs < 60_000) return `${Math.floor(ageMs / 1000)}s`;
  if (ageMs < 3_600_000) return `${Math.floor(ageMs / 60_000)}m`;
  if (ageMs < 86_400_000) return `${Math.floor(ageMs / 3_600_000)}h`;
  return `${Math.floor(ageMs / 86_400_000)}d`;
}

function renderMarketMonitor(payload) {
  if (!payload.ok) {
    return `Market monitor unavailable: ${payload.error_code || payload.error || 'unknown error'}`;
  }
  const freshness = payload.counts?.freshness || {};
  const lines = [
    'Global Market Monitor',
    `Generated: ${payload.generated_at}`,
    `Configured: ${payload.counts?.price_bearing_total ?? 0}`
      + ` | Fresh ${freshness.fresh || 0}`
      + ` | Delayed ${freshness.delayed || 0}`
      + ` | Stale ${freshness.stale || 0}`
      + ` | Missing ${freshness.missing || 0}`
      + ` | Invalid ${freshness.invalid || 0}`,
  ];
  if (payload.degraded) lines.push(`Degraded: ${payload.degradation_reasons.join(', ')}`);
  lines.push('');
  lines.push('Symbol       Family       Last known        Age      Freshness  Provider   Update');
  for (const row of payload.rows) {
    const value = row.value === null ? '-' : String(row.value);
    lines.push(
      `${String(row.symbol).padEnd(12)}`
      + `${String(row.family).padEnd(13)}`
      + `${value.padEnd(18)}`
      + `${formatAge(row.age_ms).padEnd(9)}`
      + `${String(row.freshness_state).padEnd(11)}`
      + `${String(row.provider).padEnd(11)}`
      + `${String(row.update_state)}`,
    );
  }
  lines.push('');
  const firstShown = payload.pagination.returned > 0 ? payload.pagination.offset + 1 : 0;
  const lastShown = payload.pagination.returned > 0
    ? payload.pagination.offset + payload.pagination.returned
    : 0;
  lines.push(
    `Rows ${firstShown}-${lastShown}`
    + ` of ${payload.pagination.filtered_total} filtered; global counters are unfiltered.`,
  );
  return lines.join('\n');
}

async function runMarketMonitorQuery(args = [], service = getDefaultService()) {
  return service.query(marketMonitorQueryFromArgs(args));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function commandMarketMonitor(args = [], options = {}) {
  const service = options.service || getDefaultService();
  if (!hasFlag(args, '--watch')) {
    const payload = await runMarketMonitorQuery(args, service);
    if (hasFlag(args, '--json')) printPayload(payload, args);
    else pageText(renderMarketMonitor(payload), args);
    return payload.ok ? 0 : 1;
  }

  let intervalSecs;
  let iterations;
  try {
    intervalSecs = strictBoundedInteger(
      args,
      '--interval-secs',
      WATCH_DEFAULT_INTERVAL_SECS,
      WATCH_MIN_INTERVAL_SECS,
      WATCH_MAX_INTERVAL_SECS,
    );
    iterations = strictBoundedInteger(
      args,
      '--iterations',
      WATCH_DEFAULT_ITERATIONS,
      1,
      WATCH_MAX_ITERATIONS,
    );
  } catch (error) {
    printPayload({ ok: false, type: 'market_monitor', error_code: 'invalid_watch_option', error: error.message }, args);
    return 1;
  }

  let exitCode = 0;
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const payload = await runMarketMonitorQuery(args, service);
    exitCode = payload.ok ? exitCode : 1;
    if (hasFlag(args, '--json')) console.log(JSON.stringify(payload));
    else console.log(renderMarketMonitor(payload));
    if (iteration + 1 < iterations) {
      await (options.sleep || sleep)(intervalSecs * 1000);
    }
  }
  return exitCode;
}

async function commandMarket(args = [], options = {}) {
  const subcommand = args[0] || 'monitor';
  if (subcommand !== 'monitor') {
    printPayload({
      ok: false,
      type: 'market_monitor',
      error_code: 'unsupported_market_command',
      error: `Unsupported market command: ${subcommand}`,
    }, args);
    return 1;
  }
  return commandMarketMonitor(args.slice(1), options);
}

module.exports = {
  WATCH_DEFAULT_INTERVAL_SECS,
  WATCH_DEFAULT_ITERATIONS,
  WATCH_MAX_INTERVAL_SECS,
  WATCH_MAX_ITERATIONS,
  WATCH_MIN_INTERVAL_SECS,
  commandMarket,
  commandMarketMonitor,
  marketMonitorQueryFromArgs,
  renderMarketMonitor,
  runMarketMonitorQuery,
};
