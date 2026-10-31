const FRESHNESS_STATES = Object.freeze(['fresh', 'delayed', 'stale', 'missing', 'invalid']);
const PROVIDER_STATES = Object.freeze(['reachable', 'degraded', 'unreachable', 'unknown']);
const UPDATE_STATES = Object.freeze(['idle', 'queued', 'running', 'succeeded', 'failed']);
const SORT_KEYS = new Set([
  'symbol',
  'value',
  'family',
  'provider',
  'observed_at',
  'age_ms',
  'freshness_state',
  'update_state',
]);

export const MARKET_MONITOR_PAGE_SIZE = 100;
export const MARKET_MONITOR_MAX_ROWS = 100_000;
export const MARKET_MONITOR_STALE_AFTER_MS = 30_000;

export class MarketMonitorRequestError extends Error {
  constructor(code) {
    super(code);
    this.name = 'MarketMonitorRequestError';
    this.code = code;
  }
}

function plainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function nonNegativeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function counterValue(counter, key) {
  return plainObject(counter) && nonNegativeInteger(counter[key]) ? counter[key] : null;
}

function appendQuery(url, values) {
  const separator = String(url).includes('?') ? '&' : '?';
  return `${url}${separator}${new URLSearchParams(values).toString()}`;
}

async function readPage(fetchImpl, url, headers, signal) {
  let response;
  try {
    response = await fetchImpl(url, { headers, signal });
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    throw new MarketMonitorRequestError('network_error');
  }
  if (response.status === 401 || response.status === 403) {
    throw new MarketMonitorRequestError('unauthorized');
  }
  if (!response.ok) throw new MarketMonitorRequestError('api_error');

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new MarketMonitorRequestError('malformed_response');
  }
  if (!plainObject(payload) || payload.ok !== true || !Array.isArray(payload.rows)) {
    throw new MarketMonitorRequestError('malformed_response');
  }
  if (!plainObject(payload.pagination)) {
    throw new MarketMonitorRequestError('malformed_response');
  }
  return payload;
}

export async function fetchCompleteMarketMonitor({
  fetchImpl = fetch,
  url,
  headers,
  signal,
  pageSize = MARKET_MONITOR_PAGE_SIZE,
  maxRows = MARKET_MONITOR_MAX_ROWS,
}) {
  if (typeof fetchImpl !== 'function' || typeof url !== 'string' || url.length === 0) {
    throw new TypeError('market monitor fetch requires a fetch implementation and URL');
  }
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > MARKET_MONITOR_PAGE_SIZE) {
    throw new TypeError('market monitor page size is out of bounds');
  }
  if (!Number.isSafeInteger(maxRows) || maxRows < pageSize || maxRows > MARKET_MONITOR_MAX_ROWS) {
    throw new TypeError('market monitor row bound is out of bounds');
  }

  let firstPage = null;
  let offset = 0;
  const rows = [];

  while (true) {
    const page = await readPage(
      fetchImpl,
      appendQuery(url, { limit: String(pageSize), offset: String(offset) }),
      headers,
      signal,
    );
    const returned = page.pagination.returned;
    const filteredTotal = page.pagination.filtered_total;
    if (
      !nonNegativeInteger(returned)
      || !nonNegativeInteger(filteredTotal)
      || returned !== page.rows.length
      || page.pagination.offset !== offset
      || page.rows.length > pageSize
    ) {
      throw new MarketMonitorRequestError('malformed_pagination');
    }

    if (!firstPage) {
      firstPage = page;
    } else if (
      page.generated_at !== firstPage.generated_at
      || page.policy_version !== firstPage.policy_version
      || page.universe_policy_version !== firstPage.universe_policy_version
      || JSON.stringify(page.counts) !== JSON.stringify(firstPage.counts)
    ) {
      throw new MarketMonitorRequestError('snapshot_changed_during_pagination');
    }

    rows.push(...page.rows);
    if (rows.length > maxRows || filteredTotal > maxRows) {
      throw new MarketMonitorRequestError('response_too_large');
    }
    if (!page.pagination.has_more) {
      if (rows.length !== filteredTotal) {
        throw new MarketMonitorRequestError('malformed_pagination');
      }
      break;
    }
    if (page.rows.length === 0) {
      throw new MarketMonitorRequestError('malformed_pagination');
    }
    offset += page.rows.length;
  }

  return {
    ...firstPage,
    rows,
    pagination: {
      ...firstPage.pagination,
      offset: 0,
      returned: rows.length,
      filtered_total: rows.length,
      has_more: false,
    },
  };
}

function validRow(row) {
  if (!plainObject(row)) return false;
  if (
    !row.instrument_id
    || !row.symbol
    || !row.family
    || !row.base_timeframe
    || !row.provider
    || !FRESHNESS_STATES.includes(row.freshness_state)
    || !PROVIDER_STATES.includes(row.provider_state)
    || !UPDATE_STATES.includes(row.update_state)
  ) {
    return false;
  }
  if (row.value !== null && (!Number.isFinite(row.value) || row.value < 0)) return false;
  if (row.age_ms !== null && (!Number.isFinite(row.age_ms) || row.age_ms < 0)) return false;
  if (row.observed_at !== null && !Number.isFinite(Date.parse(row.observed_at))) return false;
  return true;
}

export function normalizeMarketMonitorPayload(payload, nowMs = Date.now()) {
  if (
    !plainObject(payload)
    || payload.ok !== true
    || payload.type !== 'market_monitor'
    || payload.schema_version !== 1
    || !plainObject(payload.counts)
    || !Array.isArray(payload.rows)
  ) {
    throw new MarketMonitorRequestError('malformed_response');
  }
  const generatedAtMs = Date.parse(payload.generated_at);
  if (!Number.isFinite(generatedAtMs) || !Number.isFinite(nowMs)) {
    throw new MarketMonitorRequestError('malformed_response');
  }

  const priceBearingTotal = counterValue(payload.counts, 'price_bearing_total');
  const configuredTotal = counterValue(payload.counts, 'configured_price_bearing_total');
  const freshness = Object.fromEntries(
    FRESHNESS_STATES.map((state) => [state, counterValue(payload.counts.freshness, state)]),
  );
  const provider = Object.fromEntries(
    PROVIDER_STATES.map((state) => [state, counterValue(payload.counts.provider, state)]),
  );
  const update = Object.fromEntries(
    UPDATE_STATES.map((state) => [state, counterValue(payload.counts.update, state)]),
  );
  if (
    priceBearingTotal === null
    || configuredTotal === null
    || Object.values(freshness).includes(null)
    || Object.values(provider).includes(null)
    || Object.values(update).includes(null)
  ) {
    throw new MarketMonitorRequestError('malformed_response');
  }

  const validRows = payload.rows.filter(validRow);
  const malformedRows = payload.rows.length - validRows.length;
  const seenIds = new Set();
  const rows = validRows.filter((row) => {
    if (seenIds.has(row.instrument_id)) return false;
    seenIds.add(row.instrument_id);
    return true;
  });
  const duplicateRows = validRows.length - rows.length;
  const freshnessTotal = Object.values(freshness).reduce((sum, value) => sum + value, 0);
  const providerTotal = Object.values(provider).reduce((sum, value) => sum + value, 0);
  const updateTotal = Object.values(update).reduce((sum, value) => sum + value, 0);
  const diagnostics = [];
  if (freshnessTotal !== priceBearingTotal) diagnostics.push('counter_mismatch');
  if (providerTotal !== priceBearingTotal) diagnostics.push('provider_counter_mismatch');
  if (updateTotal !== priceBearingTotal) diagnostics.push('update_counter_mismatch');
  if (configuredTotal < priceBearingTotal) diagnostics.push('configured_count_mismatch');
  if (payload.rows.length !== priceBearingTotal) diagnostics.push('row_count_mismatch');
  if (malformedRows > 0) diagnostics.push('malformed_rows');
  if (duplicateRows > 0) diagnostics.push('duplicate_rows');
  if (priceBearingTotal === 0) diagnostics.push('empty_universe');

  const snapshotAgeMs = Math.max(0, nowMs - generatedAtMs);
  const staleSnapshot = snapshotAgeMs > MARKET_MONITOR_STALE_AFTER_MS;
  if (staleSnapshot) diagnostics.push('stale_snapshot');

  return {
    ...payload,
    rows,
    counts: {
      ...payload.counts,
      freshness,
      provider,
      update,
    },
    generatedAtMs,
    snapshotAgeMs,
    staleSnapshot,
    malformedRows,
    duplicateRows,
    diagnostics,
    degraded: Boolean(payload.degraded || diagnostics.length > 0),
  };
}

function comparable(row, key) {
  if (key === 'value' || key === 'age_ms') return row[key];
  if (key === 'observed_at') return row.observed_at === null ? null : Date.parse(row.observed_at);
  return String(row[key] ?? '').toLowerCase();
}

export function filterAndSortMarketRows(rows, {
  query = '',
  family = 'all',
  freshness = 'all',
  sortKey = 'symbol',
  sortDirection = 'asc',
} = {}) {
  const safeRows = Array.isArray(rows) ? rows : [];
  const needle = String(query).trim().toLowerCase();
  const key = SORT_KEYS.has(sortKey) ? sortKey : 'symbol';
  const direction = sortDirection === 'desc' ? -1 : 1;
  return safeRows
    .filter((row) => (
      (family === 'all' || row.family === family)
      && (freshness === 'all' || row.freshness_state === freshness)
      && (
        needle.length === 0
        || String(row.symbol).toLowerCase().includes(needle)
        || String(row.display_name || '').toLowerCase().includes(needle)
        || String(row.provider).toLowerCase().includes(needle)
      )
    ))
    .slice()
    .sort((left, right) => {
      const a = comparable(left, key);
      const b = comparable(right, key);
      if (a === null && b === null) return String(left.instrument_id).localeCompare(String(right.instrument_id));
      if (a === null) return 1;
      if (b === null) return -1;
      const compared = typeof a === 'number' && typeof b === 'number'
        ? a - b
        : String(a).localeCompare(String(b));
      return compared === 0
        ? String(left.instrument_id).localeCompare(String(right.instrument_id))
        : compared * direction;
    });
}

export function formatMarketAge(value) {
  if (!Number.isFinite(value) || value < 0) return 'unknown';
  if (value < 1000) return '<1s';
  const seconds = Math.floor(value / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h ${minutes % 60}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

export function formatMarketValue(row) {
  if (!Number.isFinite(row?.value)) return '—';
  const absolute = Math.abs(row.value);
  const maximumFractionDigits = absolute >= 1000 ? 2 : absolute >= 1 ? 4 : 8;
  const rendered = row.value.toLocaleString(undefined, { maximumFractionDigits });
  return row.currency_or_unit ? `${rendered} ${row.currency_or_unit}` : rendered;
}
