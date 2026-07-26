'use strict';

const path = require('node:path');
const { loadMarketConfig } = require('../runtime/config_loader.js');
const { REPO_ROOT } = require('../runtime/paths.js');
const {
  FRESHNESS_STATES,
  PROVIDER_STATES,
  UPDATE_STATES,
  buildMarketMonitorSnapshot,
} = require('./monitor_snapshot.js');
const { PRICE_BEARING_FAMILIES } = require('./configured_universe.js');

const MARKET_MONITOR_CACHE_TTL_MS = 5000;
const MARKET_MONITOR_DEFAULT_LIMIT = 50;
const MARKET_MONITOR_MAX_LIMIT = 100;
const MARKET_MONITOR_MAX_OFFSET = 100000;
const DEFAULT_CONFIG_PATH = path.join(REPO_ROOT, 'config', 'markets', 'data_sources.yaml');
const DEFAULT_TS_DIR = path.join(REPO_ROOT, 'storage', 'data', 'ts');
const ALLOWED_QUERY_FIELDS = new Set([
  'family',
  'freshness_state',
  'provider_state',
  'update_state',
  'symbol',
  'limit',
  'offset',
]);

class MarketMonitorQueryError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'MarketMonitorQueryError';
    this.code = code;
  }
}

function optionalEnum(query, field, allowed) {
  const raw = query[field];
  if (raw === undefined || raw === null || String(raw).trim() === '') return null;
  const value = String(raw).trim().toLowerCase();
  if (!allowed.includes(value)) {
    throw new MarketMonitorQueryError(`invalid_${field}`, `${field} is not supported`);
  }
  return value;
}

function boundedInteger(query, field, fallback, min, max) {
  const raw = query[field];
  if (raw === undefined || raw === null || String(raw).trim() === '') return fallback;
  if (!/^\d+$/.test(String(raw).trim())) {
    throw new MarketMonitorQueryError(`invalid_${field}`, `${field} must be an integer`);
  }
  const value = Number.parseInt(String(raw), 10);
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new MarketMonitorQueryError(
      `invalid_${field}`,
      `${field} must be between ${min} and ${max}`,
    );
  }
  return value;
}

function parseMarketMonitorQuery(query = {}) {
  if (!query || typeof query !== 'object' || Array.isArray(query)) {
    throw new MarketMonitorQueryError('invalid_query', 'query must be an object');
  }
  const unknown = Object.keys(query).filter((field) => !ALLOWED_QUERY_FIELDS.has(field));
  if (unknown.length > 0) {
    throw new MarketMonitorQueryError('invalid_query_field', `unsupported query field: ${unknown[0]}`);
  }
  const symbolRaw = query.symbol;
  let symbol = null;
  if (symbolRaw !== undefined && symbolRaw !== null && String(symbolRaw).trim() !== '') {
    symbol = String(symbolRaw).trim().toUpperCase();
    if (!/^[A-Z0-9][A-Z0-9._-]{0,31}$/.test(symbol)) {
      throw new MarketMonitorQueryError('invalid_symbol', 'symbol is not a canonical market identifier');
    }
  }
  return {
    family: optionalEnum(query, 'family', PRICE_BEARING_FAMILIES),
    freshness_state: optionalEnum(query, 'freshness_state', FRESHNESS_STATES),
    provider_state: optionalEnum(query, 'provider_state', PROVIDER_STATES),
    update_state: optionalEnum(query, 'update_state', UPDATE_STATES),
    symbol,
    limit: boundedInteger(
      query,
      'limit',
      MARKET_MONITOR_DEFAULT_LIMIT,
      1,
      MARKET_MONITOR_MAX_LIMIT,
    ),
    offset: boundedInteger(query, 'offset', 0, 0, MARKET_MONITOR_MAX_OFFSET),
  };
}

function degradationReasons(snapshot, refreshErrorCode = null) {
  const reasons = [];
  const freshness = snapshot?.counts?.freshness || {};
  const provider = snapshot?.counts?.provider || {};
  const update = snapshot?.counts?.update || {};
  if (Number(freshness.stale || 0) > 0) reasons.push('stale_market_rows');
  if (Number(freshness.missing || 0) > 0) reasons.push('missing_market_rows');
  if (Number(freshness.invalid || 0) > 0) reasons.push('invalid_market_rows');
  if (Number(provider.degraded || 0) > 0 || Number(provider.unreachable || 0) > 0) {
    reasons.push('provider_health_degraded');
  }
  if (Number(update.failed || 0) > 0) reasons.push('market_updates_failed');
  if (refreshErrorCode) reasons.push(refreshErrorCode);
  return reasons;
}

function filterSnapshotRows(snapshot, filters) {
  return snapshot.rows.filter((row) => (
    (filters.family === null || row.family === filters.family)
    && (filters.freshness_state === null || row.freshness_state === filters.freshness_state)
    && (filters.provider_state === null || row.provider_state === filters.provider_state)
    && (filters.update_state === null || row.update_state === filters.update_state)
    && (filters.symbol === null || row.symbol === filters.symbol)
  ));
}

function marketMonitorPayload(snapshot, filters, {
  refreshErrorCode = null,
} = {}) {
  const filteredRows = filterSnapshotRows(snapshot, filters);
  const rows = filteredRows.slice(filters.offset, filters.offset + filters.limit);
  const reasons = degradationReasons(snapshot, refreshErrorCode);
  return {
    ok: true,
    type: 'market_monitor',
    schema_version: snapshot.schema_version,
    degraded: reasons.length > 0,
    degradation_reasons: reasons,
    refresh_error_code: refreshErrorCode,
    policy_version: snapshot.policy_version,
    universe_policy_version: snapshot.universe_policy_version,
    generated_at: snapshot.generated_at,
    snapshot_duration_ms: snapshot.snapshot_duration_ms,
    storage_mode: snapshot.storage_mode,
    counts: snapshot.counts,
    filters: {
      family: filters.family,
      freshness_state: filters.freshness_state,
      provider_state: filters.provider_state,
      update_state: filters.update_state,
      symbol: filters.symbol,
    },
    pagination: {
      offset: filters.offset,
      limit: filters.limit,
      returned: rows.length,
      filtered_total: filteredRows.length,
      has_more: filters.offset + rows.length < filteredRows.length,
    },
    rows,
    exclusions: snapshot.exclusions,
  };
}

function errorPayload(error) {
  const invalidQuery = error instanceof MarketMonitorQueryError;
  return {
    ok: false,
    type: 'market_monitor',
    schema_version: 1,
    degraded: true,
    error_code: invalidQuery ? error.code : 'market_monitor_unavailable',
    error: invalidQuery ? error.message : 'market monitor snapshot unavailable',
    counts: null,
    rows: [],
    exclusions: [],
  };
}

function createMarketMonitorService({
  loadConfig,
  buildSnapshot,
  clockMs = Date.now,
  ttlMs = MARKET_MONITOR_CACHE_TTL_MS,
} = {}) {
  if (typeof loadConfig !== 'function') throw new TypeError('market monitor service requires loadConfig');
  if (typeof buildSnapshot !== 'function') throw new TypeError('market monitor service requires buildSnapshot');
  if (!Number.isFinite(ttlMs) || ttlMs <= 0 || ttlMs > MARKET_MONITOR_CACHE_TTL_MS) {
    throw new TypeError(`market monitor cache ttl must be between 1 and ${MARKET_MONITOR_CACHE_TTL_MS} ms`);
  }

  let cached = null;
  let lastGood = null;
  let inFlight = null;

  async function refreshSnapshot() {
    const startedAt = clockMs();
    const config = await loadConfig();
    const snapshot = await buildSnapshot(config, { nowMs: startedAt });
    if (!snapshot || !Array.isArray(snapshot.rows) || !snapshot.counts) {
      throw new Error('invalid market monitor snapshot');
    }
    cached = { snapshot, storedAt: clockMs(), refreshErrorCode: null };
    lastGood = snapshot;
    return { snapshot, refreshErrorCode: null };
  }

  async function snapshotState() {
    const now = clockMs();
    const age = cached ? now - cached.storedAt : null;
    if (cached && age >= 0 && age < ttlMs) {
      return {
        snapshot: cached.snapshot,
        refreshErrorCode: cached.refreshErrorCode || null,
      };
    }
    if (!inFlight) {
      inFlight = refreshSnapshot()
        .catch((error) => {
          if (lastGood) {
            cached = {
              snapshot: lastGood,
              storedAt: clockMs(),
              refreshErrorCode: 'snapshot_refresh_failed',
            };
            return { snapshot: lastGood, refreshErrorCode: 'snapshot_refresh_failed' };
          }
          throw error;
        })
        .finally(() => {
          inFlight = null;
        });
    }
    return inFlight;
  }

  return Object.freeze({
    async query(query = {}) {
      try {
        const filters = parseMarketMonitorQuery(query);
        const state = await snapshotState();
        return marketMonitorPayload(state.snapshot, filters, state);
      } catch (error) {
        return errorPayload(error);
      }
    },
    clear() {
      cached = null;
      lastGood = null;
      inFlight = null;
    },
  });
}

function createDefaultMarketMonitorService({
  configPath = DEFAULT_CONFIG_PATH,
  tsDir = DEFAULT_TS_DIR,
  clockMs = Date.now,
} = {}) {
  return createMarketMonitorService({
    clockMs,
    loadConfig: () => loadMarketConfig(configPath),
    buildSnapshot: (config, { nowMs }) => buildMarketMonitorSnapshot(config, {
      tsDir,
      nowMs,
      clockMs,
    }),
  });
}

module.exports = {
  ALLOWED_QUERY_FIELDS,
  DEFAULT_CONFIG_PATH,
  DEFAULT_TS_DIR,
  MARKET_MONITOR_CACHE_TTL_MS,
  MARKET_MONITOR_DEFAULT_LIMIT,
  MARKET_MONITOR_MAX_LIMIT,
  MARKET_MONITOR_MAX_OFFSET,
  MarketMonitorQueryError,
  createDefaultMarketMonitorService,
  createMarketMonitorService,
  errorPayload,
  marketMonitorPayload,
  parseMarketMonitorQuery,
};
