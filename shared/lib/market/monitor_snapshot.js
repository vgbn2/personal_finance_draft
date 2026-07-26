'use strict';

const {
  familyFreshnessThresholdMs,
  readLatestTsRecord,
} = require('./validation.js');
const { resolveConfiguredMarketUniverse } = require('./configured_universe.js');

const FRESHNESS_STATES = Object.freeze(['fresh', 'delayed', 'stale', 'missing', 'invalid']);
const PROVIDER_STATES = Object.freeze(['reachable', 'degraded', 'unreachable', 'unknown']);
const UPDATE_STATES = Object.freeze(['idle', 'queued', 'running', 'succeeded', 'failed']);
const FUTURE_SKEW_MS = 5 * 60 * 1000;
const TIMEFRAME_MS = Object.freeze({
  '1m': 60 * 1000,
  '5m': 5 * 60 * 1000,
});

function contextValue(context, key) {
  if (context instanceof Map) return context.get(key);
  if (context && typeof context === 'object') return context[key];
  return undefined;
}

function validIso(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : null;
}

function safeErrorCode(value) {
  const code = String(value == null ? '' : value).trim();
  return /^[a-z0-9][a-z0-9_.:-]{0,79}$/i.test(code) ? code : 'update_failed';
}

function safeProvider(value, fallback) {
  const provider = String(value == null ? '' : value).trim().toLowerCase();
  return /^[a-z0-9][a-z0-9_.:-]{0,63}$/.test(provider) ? provider : fallback;
}

function providerStateFor(provider, context) {
  const candidate = String(contextValue(context, provider) || 'unknown').toLowerCase();
  return PROVIDER_STATES.includes(candidate) ? candidate : 'unknown';
}

function updateStateFor(instrumentId, context) {
  const raw = contextValue(context, instrumentId);
  if (raw === undefined || raw === null) {
    return { state: 'idle', attemptedAt: null, error: null };
  }
  const detail = typeof raw === 'string' ? { state: raw } : raw;
  const candidate = String(detail?.state || '').toLowerCase();
  if (!UPDATE_STATES.includes(candidate)) {
    return { state: 'failed', attemptedAt: null, error: 'invalid_update_state' };
  }
  return {
    state: candidate,
    attemptedAt: validIso(detail.last_update_attempt_at),
    // Only accept a caller-declared code. Raw provider errors belong to the
    // separately planned sanitized heartbeat layer and are never echoed here.
    error: detail.last_update_error_code != null
      ? safeErrorCode(detail.last_update_error_code)
      : detail.last_update_error != null
        ? 'update_failed'
        : null,
  };
}

function newCounter(states) {
  return Object.fromEntries(states.map((state) => [state, 0]));
}

function nyseApproximateState(nowMs) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(nowMs));
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  if (byType.weekday === 'Sat' || byType.weekday === 'Sun') return 'closed';
  const minute = Number(byType.hour) * 60 + Number(byType.minute);
  return minute >= 9 * 60 + 30 && minute < 16 * 60 ? 'open' : 'closed';
}

function marketStateAt(instrument, nowMs) {
  if (instrument.schedule_basis === 'continuous_24_7') return 'open';
  if (instrument.schedule_basis === 'nyse_regular_weekdays_no_holiday_calendar') {
    return nyseApproximateState(nowMs);
  }
  return 'unknown';
}

function expectedNextAt(instrument, observedMs, marketState) {
  const intervalMs = TIMEFRAME_MS[instrument.base_timeframe];
  if (!Number.isFinite(observedMs) || !Number.isFinite(intervalMs)) return null;
  if (instrument.schedule_basis === 'calendar_unknown' || marketState === 'closed') return null;
  return new Date(observedMs + intervalMs).toISOString();
}

function classifyLatest(instrument, latest, generatedAtMs) {
  const thresholdMs = familyFreshnessThresholdMs({
    family: instrument.family,
    timeframe: instrument.base_timeframe,
  });
  if (!latest) {
    return {
      state: 'missing',
      value: null,
      observedAt: null,
      ageMs: null,
      thresholdMs,
      provider: instrument.configured_provider,
      sourceMode: null,
      recordCount: null,
      error: null,
    };
  }

  const record = latest.record || {};
  const observedMs = Date.parse(record.timestamp);
  const identityMatches = record.symbol === instrument.symbol
    && record.family === instrument.family
    && record.timeframe === instrument.base_timeframe;
  const value = Number(record.close);
  const invalid = !identityMatches
    || !Number.isFinite(observedMs)
    || observedMs > generatedAtMs + FUTURE_SKEW_MS
    || !Number.isFinite(value)
    || value < 0
    || !Number.isFinite(thresholdMs)
    || thresholdMs <= 0;
  if (invalid) {
    return {
      state: 'invalid',
      value: null,
      observedAt: Number.isFinite(observedMs) ? record.timestamp : null,
      ageMs: null,
      thresholdMs,
      provider: safeProvider(record.provider, instrument.configured_provider),
      sourceMode: latest.sourceMode || null,
      recordCount: Number.isInteger(latest.recordCount) ? latest.recordCount : null,
      error: 'invalid_latest_record',
    };
  }

  const ageMs = Math.max(0, generatedAtMs - observedMs);
  const state = ageMs <= thresholdMs / 2
    ? 'fresh'
    : ageMs <= thresholdMs
      ? 'delayed'
      : 'stale';
  return {
    state,
    value,
    observedAt: record.timestamp,
    ageMs,
    thresholdMs,
    provider: safeProvider(record.provider, instrument.configured_provider),
    sourceMode: latest.sourceMode || null,
    recordCount: Number.isInteger(latest.recordCount) ? latest.recordCount : null,
    error: null,
  };
}

function invalidLatest(instrument, error) {
  return {
    state: 'invalid',
    value: null,
    observedAt: null,
    ageMs: null,
    thresholdMs: familyFreshnessThresholdMs({
      family: instrument.family,
      timeframe: instrument.base_timeframe,
    }),
    provider: instrument.configured_provider,
    sourceMode: null,
    recordCount: null,
    error: error && error.reason ? safeErrorCode(error.reason) : 'latest_read_failed',
  };
}

function buildMarketMonitorSnapshot(config, options = {}) {
  const clockMs = typeof options.clockMs === 'function' ? options.clockMs : Date.now;
  const startedAtMs = clockMs();
  const generatedAtMs = Number.isFinite(options.nowMs) ? options.nowMs : startedAtMs;
  if (!Number.isFinite(generatedAtMs)) throw new TypeError('market monitor snapshot requires a finite generation time');
  const universe = resolveConfiguredMarketUniverse(config);
  const latestReader = options.latestReader || readLatestTsRecord;
  const tsDir = options.tsDir;
  if (typeof tsDir !== 'string' || tsDir.length === 0) {
    throw new TypeError('market monitor snapshot requires a tsDir');
  }

  const freshness = newCounter(FRESHNESS_STATES);
  const providers = newCounter(PROVIDER_STATES);
  const updates = newCounter(UPDATE_STATES);
  const rows = universe.instruments.map((instrument) => {
    let latest;
    try {
      latest = classifyLatest(
        instrument,
        latestReader(tsDir, instrument.symbol, instrument.base_timeframe),
        generatedAtMs,
      );
    } catch (error) {
      latest = invalidLatest(instrument, error);
    }
    const providerState = providerStateFor(latest.provider, options.providerStates);
    const update = updateStateFor(instrument.instrument_id, options.updateStates);
    const marketState = marketStateAt(instrument, generatedAtMs);
    freshness[latest.state] += 1;
    providers[providerState] += 1;
    updates[update.state] += 1;
    return {
      instrument_id: instrument.instrument_id,
      symbol: instrument.symbol,
      display_name: instrument.display_name,
      family: instrument.family,
      market: instrument.market,
      base_timeframe: instrument.base_timeframe,
      value: latest.value,
      value_kind: instrument.value_kind,
      currency_or_unit: instrument.currency_or_unit,
      provider: latest.provider,
      observed_at: latest.observedAt,
      age_ms: latest.ageMs,
      freshness_threshold_ms: latest.thresholdMs,
      expected_next_at: expectedNextAt(
        instrument,
        latest.observedAt === null ? null : Date.parse(latest.observedAt),
        marketState,
      ),
      freshness_state: latest.state,
      provider_state: providerState,
      update_state: update.state,
      last_update_attempt_at: update.attemptedAt,
      last_update_error: update.error || latest.error,
      record_count: latest.recordCount,
      source_mode: latest.sourceMode,
      market_state: marketState,
      schedule_basis: instrument.schedule_basis,
    };
  });

  const priceBearingTotal = rows.length;
  const reconciled = FRESHNESS_STATES.reduce((sum, state) => sum + freshness[state], 0);
  if (reconciled !== priceBearingTotal) {
    throw new Error('market monitor freshness counters do not reconcile');
  }
  const durationMs = Math.max(0, clockMs() - startedAtMs);
  const storageMode = options.storageMode === 'segments'
    || (options.storageMode === undefined && process.env.SOVEREIGN_TS_STORAGE === 'segments')
    ? 'segments'
    : 'canonical';

  return {
    schema_version: 1,
    policy_version: 'global-market-monitor-v1',
    universe_policy_version: universe.policy_version,
    generated_at: new Date(generatedAtMs).toISOString(),
    snapshot_duration_ms: durationMs,
    storage_mode: storageMode,
    counts: {
      ...universe.counts,
      freshness,
      provider: providers,
      update: updates,
    },
    rows,
    exclusions: universe.exclusions,
  };
}

module.exports = {
  FRESHNESS_STATES,
  PROVIDER_STATES,
  UPDATE_STATES,
  buildMarketMonitorSnapshot,
  classifyLatest,
  marketStateAt,
};
