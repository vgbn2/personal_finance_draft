const fs = require('node:fs/promises');
const path = require('node:path');
const zlib = require('node:zlib');
const crypto = require('node:crypto');

require('../../../../shared/lib/runtime/env');

const {
  DEFAULT_PROVIDER_PRIORITY,
  normalizeExternalQuotePayload,
  normalizeExternalQuotePayloadWithReport,
  selectPreferredQuoteRecords,
} = require('../../../../shared/lib/market/quote_router');
const {
  readSnapshot,
  readTsIndex,
  recordKey,
  validateSnapshot,
  mergeSnapshots,
  writePartitionedSnapshot,
  writeTsIndex,
} = require('../../../../shared/lib/market/validation');

/**
 * Attempts to aggregate a higher timeframe (1w, 1mo) from the local 1d binary cache.
 * Returns aggregated records or null if local data is insufficient.
 */
function deriveHighTfFromLocalDaily(family, symbol, targetTf) {
  if (targetTf !== '1w' && targetTf !== '1mo') return null;

  try {
    const dailyRecords = readTsIndex(TS_INDEX_PATH, symbol, '1d');
    if (!dailyRecords || dailyRecords.length < 100) return null;

    const candlesWithOpenTime = dailyRecords.map(r => ({
      ...r,
      openTime: new Date(r.timestamp).getTime()
    }));

    const provider = dailyRecords[0].provider || 'local-aggregate';
    const aggregated = aggregateCandles(candlesWithOpenTime, targetTf, symbol, provider, family, { sourceTimeframe: '1d' });

    if (aggregated.length > 0) {
       console.log(`[INGEST] Derived ${aggregated.length} ${targetTf} bars for ${symbol} from local 1d cache (${dailyRecords.length} bars)`);
       return aggregated;
    }
  } catch (err) {
    console.warn(`[INGEST] Local aggregation failed for ${symbol}:${targetTf}: ${err.message}`);
  }
  return null;
}

const {
  saveMacroObservations,
} = require('../../../../shared/lib/data/macro_store');

const {
  fetchBinanceBaseCandles,
  fetchYahooBaseCandles,
  fetchCoinbaseBaseCandles,
  fetchCoinGeckoBaseCandles,
  fetchFrankfurterFx,
  fetchFrankfurterHistory,
  fetchFredLatest,
  fetchFredHistory,
  fetchWorldBankLatest,
  fetchWorldBankHistory,
  fetchKalshiPredictionEvent,
  fetchAlternativeMeFearGreed,
  fetchNasaPowerWeather,
  fetchAlpacaBaseCandles,
  fetchFinnhubSnapshot,
  fetchTwelveDataSnapshot,
  cachedFetch,
  fetchJson,
  REPO_ROOT,
  API_CACHE_DIR
} = require('../../../../shared/lib/providers');

const { fetchPaginated, fetchParallelBackfill, BARS_PER_DAY } = require('../../../../shared/lib/data/backfill');

const CONFIG_PATH = path.join(REPO_ROOT, 'config', 'markets', 'data_sources.yaml');
const OPTIONS_CONFIG_PATH = path.join(REPO_ROOT, 'config', 'markets', 'options_data.yaml');
const CACHE_PATH = path.join(REPO_ROOT, 'storage', 'data', 'cache', 'last_fetch.json');
const SCOPED_CACHE_PATH = path.join(REPO_ROOT, 'storage', 'data', 'cache', 'last_fetch_scoped.json');
const HISTORY_PATH = path.join(REPO_ROOT, 'storage', 'data', 'cache');
const TS_INDEX_PATH = path.join(REPO_ROOT, 'storage', 'data', 'ts');

const {
  SUPPORTED_INTERVALS,
  YAHOO_MAX_DAYS,
  selectYahooBase,
  COINBASE_PRODUCTS,
  COINBASE_GRANULARITY,
  YAHOO_INDEX_SYMBOLS,
  YAHOO_COMMODITY_SYMBOLS,
  YAHOO_COMMODITY_REVERSE,
  STOOQ_EQUITY_SUFFIX,
  STOOQ_INDEX_SYMBOLS,
  STOOQ_COMMODITY_SYMBOLS,
  SPGLOBAL_FLASH_PMI_URL,
  KALSHI_API_BASE,
  POLYMARKET_GAMMA_BASE,
  POLYMARKET_CLOB_BASE,
  OPEN_SKY_TOKEN_URL,
  WEATHER_LOCATION_COORDS,
  OPEN_SKY_REGIONS,
  openSkyRegions,
  KALSHI_EVENT_KEYWORDS,
  POLYMARKET_EVENT_KEYWORDS,
} = require('./constants');

const {
  parseYamlList,
  parseYamlRecursive,
  loadMarketConfig
} = require('../../../../shared/lib/runtime/config_loader');

async function loadOptionsConfig() {
  const content = await fs.readFile(OPTIONS_CONFIG_PATH, 'utf8');
  const lines = content.split(/\r?\n/);
  const config = {};
  const families = [
    'prediction_market', 'equities_options', 'stock_options',
    'sentiment', 'macro_alt', 'onchain', 'breadth'
  ];

  families.forEach(f => {
    config[f] = { enabled: false, providers: [] };
  });

  let currentSection = null;

  for (const line of lines) {
    const indent = line.match(/^\s*/)[0].length;
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    if (indent === 0 && trimmed.endsWith(':')) {
      const sectionName = trimmed.slice(0, -1);
      if (families.includes(sectionName)) {
        currentSection = sectionName;
      } else {
        currentSection = null;
      }
      continue;
    }

    if (currentSection && indent === 2) {
      const [key, ...valParts] = trimmed.split(':');
      const val = valParts.join(':').trim();

      if (key === 'enabled') {
        config[currentSection].enabled = val === 'true';
      } else if (key === 'provider' || key === 'providers') {
        config[currentSection].providers = val.startsWith('[') ? parseYamlList(val) : [val];
      } else {
        config[currentSection][key] = val.startsWith('[') ? parseYamlList(val) : [val];
      }
    }
  }

  return config;
}

const SENSITIVE_QUERY_PARAMS = new Set([
  'api_key',
  'apikey',
  'key',
  'token',
  'access_token',
  'secret',
  'password',
  'cx',
]);

let openSkyAccessToken = null;
let openSkyAccessTokenExpiresAt = 0;

function redactUrl(value) {
  try {
    const url = new URL(String(value));
    for (const key of [...url.searchParams.keys()]) {
      if (SENSITIVE_QUERY_PARAMS.has(key.toLowerCase())) {
        url.searchParams.set(key, 'REDACTED');
      }
    }
    return url.toString();
  } catch {
    return String(value).replace(/([?&](?:api_?key|apikey|key|token|access_token|secret|password|cx)=)[^&\s]+/gi, '$1REDACTED');
  }
}

async function openSkyAuthHeaderFromEnv() {
  if (process.env.OPENSKY_ACCESS_TOKEN) {
    return `Bearer ${process.env.OPENSKY_ACCESS_TOKEN}`;
  }

  const clientId = process.env.OPENSKY_CLIENT_ID || '';
  const clientSecret = process.env.OPENSKY_CLIENT_SECRET || '';
  if (!clientId || !clientSecret) return null;

  const now = Date.now();
  if (openSkyAccessToken && now < openSkyAccessTokenExpiresAt) {
    return `Bearer ${openSkyAccessToken}`;
  }

  const response = await cachedFetch(OPEN_SKY_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.access_token) {
    const message = payload?.error_description || payload?.error || `${response.status} ${response.statusText}`;
    throw new Error(`OpenSky token request failed: ${message}`);
  }

  openSkyAccessToken = payload.access_token;
  openSkyAccessTokenExpiresAt = now + Math.max(1, Number(payload.expires_in || 1800) - 30) * 1000;
  return `Bearer ${openSkyAccessToken}`;
}

async function fetchOpenSkyJson(url) {
  const headers = {
    accept: 'application/json',
    'user-agent': 'sovereign-market-ingestor/1.0',
  };
  const auth = await openSkyAuthHeaderFromEnv();
  if (auth) headers.authorization = auth;

  const response = await cachedFetch(url, { headers });
  if (!response.ok) {
    throw new Error(`Request failed for ${redactUrl(url)}: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

async function fetchBinary(url, accept = 'application/octet-stream,application/pdf') {
  const response = await cachedFetch(url, {
    headers: {
      accept,
      'user-agent': 'sovereign-market-ingestor/1.0',
    },
  });

  if (!response.ok) {
    throw new Error(`Request failed for ${redactUrl(url)}: ${response.status} ${response.statusText}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

async function fetchText(url, accept = 'application/xml,text/xml') {
  const response = await cachedFetch(url, {
    headers: {
      accept,
      'user-agent': 'sovereign-market-ingestor/1.0',
    },
  });

  if (!response.ok) {
    throw new Error(`Request failed for ${redactUrl(url)}: ${response.status} ${response.statusText}`);
  }

  return response.text();
}

function parseCsvTable(text) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  const headerIndex = lines.findIndex((line) => {
    const columns = line.split(',').map((value) => value.trim().toUpperCase());
    return columns.includes('YEAR') && columns.includes('MO') && columns.includes('DY');
  });
  if (headerIndex < 0) {
    throw new Error('Unable to locate CSV header');
  }

  const headers = lines[headerIndex].split(',').map((value) => value.trim());
  const rows = [];

  for (const line of lines.slice(headerIndex + 1)) {
    if (/^#/i.test(line)) {
      continue;
    }
    const values = line.split(',');
    if (values.length < headers.length) {
      continue;
    }
    const row = {};
    for (let i = 0; i < headers.length; i += 1) {
      row[headers[i]] = values[i].trim();
    }
    rows.push(row);
  }

  return rows;
}

// V8 passes spread arguments on the call stack, so target.push(...records)
// throws RangeError above ~100k elements. Deep sub-daily backfills routinely
// return 100k-525k records, and the provider loop's try/catch would swallow
// that RangeError as a generic provider failure (the symbol silently yields
// zero bars). Every push of a fetched/aggregated record array must go through
// this loop instead.
function appendRecords(target, records) {
  for (const record of records || []) target.push(record);
  return target;
}

function providerErrorIsResolvedBySource(error, sources) {
  if (!error || !error.symbol) return false;
  const symbol = String(error.symbol).trim().toUpperCase();
  return sources.some((source) => String(source.symbol || source.location || source.region || source.country || '').trim().toUpperCase() === symbol);
}

function unresolvedProviderErrors(errors, sources) {
  return (errors || []).filter((error) => !providerErrorIsResolvedBySource(error, sources));
}

function removeRejectedSources(snapshot, rejectStale = true) {
  const { report } = validateSnapshot(snapshot, { rejectStale });
  if (report.rejected_keys.length === 0) {
    return { removed_records: 0, stale_records: 0 };
  }
  const rejected = new Set(report.rejected_keys);
  const before = snapshot.sources.length;
  snapshot.sources = snapshot.sources.filter((record, index) => !rejected.has(recordKey(record, index)));
  return {
    removed_records: before - snapshot.sources.length,
    stale_records: report.freshness.stale_records,
  };
}

function parseStooqCsv(text) {
  const lines = String(text || '').split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) {
    throw new Error('Unable to parse Stooq CSV');
  }
  const header = lines[0].split(',').map((value) => value.trim().toLowerCase());
  const cols = new Map(header.map((name, index) => [name, index]));
  const records = [];
  for (const line of lines.slice(1)) {
    const parts = line.split(',');
    if (parts.length < header.length) continue;
    const date = parts[cols.get('date')];
    const open = Number(parts[cols.get('open')]);
    const high = Number(parts[cols.get('high')]);
    const low = Number(parts[cols.get('low')]);
    const close = Number(parts[cols.get('close')]);
    const volume = Number(parts[cols.get('volume')]);
    if (!date || [open, high, low, close].some((value) => !Number.isFinite(value))) continue;
    records.push({
      openTime: Date.parse(`${date}T00:00:00Z`),
      open,
      high,
      low,
      close,
      volume: Number.isFinite(volume) ? volume : 0,
    });
  }
  if (records.length === 0) {
    throw new Error('Stooq CSV produced no usable candles');
  }
  return records.sort((a, b) => a.openTime - b.openTime);
}

function resolveStooqSymbol(family, symbol) {
  if (family === 'equities') {
    return `${String(symbol).toLowerCase()}${STOOQ_EQUITY_SUFFIX}`;
  }
  if (family === 'indices') {
    return STOOQ_INDEX_SYMBOLS[symbol] || `${String(symbol).toLowerCase()}_us`;
  }
  if (family === 'commodities') {
    return STOOQ_COMMODITY_SYMBOLS[symbol] || String(symbol).toLowerCase();
  }
  return null;
}

async function fetchStooqDailyHistory(symbol) {
  const url = new URL('https://stooq.com/q/d/l/');
  url.searchParams.set('s', symbol);
  url.searchParams.set('i', 'd');
  const csv = await fetchText(url.toString(), 'text/csv,text/plain');
  return parseStooqCsv(csv);
}

function aggregateCandles(candles, interval, symbol, provider, family = "unknown", options = {}) {
  const intervalMs = SUPPORTED_INTERVALS[interval];
  if (!intervalMs) {
    throw new Error(`Unsupported timeframe: ${interval}`);
  }
  const sourceTimeframe = options.sourceTimeframe || options.baseTimeframe || null;
  const sourceIntervalMs = sourceTimeframe ? SUPPORTED_INTERVALS[sourceTimeframe] : null;
  const derivedFromDaily = sourceIntervalMs && sourceIntervalMs >= SUPPORTED_INTERVALS['1d'] && intervalMs < SUPPORTED_INTERVALS['1d'];
  const source = sourceTimeframe ? `${provider}-rollup-from-${sourceTimeframe}` : `${provider}-rollup`;

  const buckets = new Map();
  for (const candle of candles) {
    const bucketStart = Math.floor(candle.openTime / intervalMs) * intervalMs;
    const existing = buckets.get(bucketStart);
    if (!existing) {
      buckets.set(bucketStart, {
        family,
        provider,
        symbol,
        timeframe: interval,
        timestamp: new Date(bucketStart).toISOString(),
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        volume: candle.volume,
        source,
        provenance: source,
        ...(sourceTimeframe ? { derived_from_timeframe: sourceTimeframe } : {}),
        ...(derivedFromDaily ? { experimental_only: true, experimental_reason: 'daily_derived_lower_timeframe' } : {}),
      });
      continue;
    }

    existing.high = Math.max(existing.high, candle.high);
    existing.low = Math.min(existing.low, candle.low);
    existing.close = candle.close;
    existing.volume += candle.volume;
  }

  return Array.from(buckets.values()).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
}

function resolveEquityOrIndexSymbol(family, symbol, provider) {
  if (provider === 'yahoo' && family === 'indices') {
    return YAHOO_INDEX_SYMBOLS[symbol] || null;
  }

  // Vietnamese stocks resolution (.VN suffix for Stooq/Yahoo)
  const vnStocks = new Set(['VHM', 'VRE', 'VNM', 'MSN', 'FMC', 'VCB', 'BID', 'CTG', 'TCB', 'FPT', 'CMG', 'VIC', 'HPG', 'GAS']);
  if (vnStocks.has(symbol) && (provider === 'yahoo' || provider === 'stooq')) {
    return `${symbol}.VN`;
  }

  return symbol;
}

function resolveCommoditySymbol(provider, symbol) {
  if (provider !== 'yahoo') {
    return null;
  }

  return YAHOO_COMMODITY_SYMBOLS[symbol] || null;
}

function quoteImportPath(provider) {
  const key = String(provider || '').toUpperCase();
  const explicit = process.env[`SOVEREIGN_${key}_QUOTES_PATH`] || process.env[`${key}_QUOTES_PATH`] || null;
  if (explicit) return explicit;

  if (
    String(provider || '').toLowerCase() === 'headway_mt5' &&
    process.env.SOVEREIGN_DISABLE_MT5_AUTO_PATH !== '1'
  ) {
    const commonPath = path.join(
      process.env.APPDATA || '',
      'MetaQuotes',
      'Terminal',
      'Common',
      'Files',
      'headway_mt5_quotes.json',
    );
    return commonPath;
  }

  return null;
}

async function loadExternalQuoteProvider(provider) {
  const filePath = quoteImportPath(provider);
  if (!filePath) {
    return { records: [], provider_check: null, error: null };
  }

  try {
    const payload = JSON.parse(await fs.readFile(filePath, 'utf8'));
    const normalization = normalizeExternalQuotePayloadWithReport(payload, provider);
    const records = normalization.records;
    return {
      records,
      provider_check: {
        family: 'quote_feeds',
        provider,
        symbol: 'configured_quote_import',
        status: records.length > 0 ? 'ok' : 'error',
        quality: normalization.report.rejected_records > 0 ? 'degraded' : 'clean',
        input_rows: normalization.report.input_rows,
        records: records.length,
        rejected_records: normalization.report.rejected_records,
        rejection_reasons: normalization.report.rejection_reasons,
        path: filePath,
        ...(records.length === 0 ? { message: 'quote import file produced no usable records' } : {}),
      },
      error: records.length === 0
        ? { family: 'quote_feeds', provider, symbol: 'configured_quote_import', message: 'quote import file produced no usable records' }
        : null,
    };
  } catch (error) {
    return {
      records: [],
      provider_check: {
        family: 'quote_feeds',
        provider,
        symbol: 'configured_quote_import',
        status: 'error',
        message: error.message,
        path: filePath,
      },
      error: {
        family: 'quote_feeds',
        provider,
        symbol: 'configured_quote_import',
        message: error.message,
      },
    };
  }
}

async function loadExternalQuoteInputs(config) {
  if (!config.quote_feeds?.enabled) {
    return {
      records: [],
      provider_checks: [],
      errors: [],
    };
  }

  const providers = (config.quote_feeds?.providers || ['mt5', 'webull'])
    .filter(Boolean);
  const output = {
    records: [],
    provider_checks: [],
    errors: [],
  };

  for (const provider of providers) {
    const result = await loadExternalQuoteProvider(provider);
    appendRecords(output.records, result.records);
    if (result.provider_check) output.provider_checks.push(result.provider_check);
    if (result.error) output.errors.push(result.error);
  }

  return output;
}

function ingestSkipCheck(family, reason, extra = {}) {
  return {
    family,
    provider: 'manifest',
    status: 'skipped',
    reason,
    ...extra,
  };
}

function familySection(config, manifestEntry) {
  return config?.[manifestEntry.configKey] || null;
}

function collectIngestSkipChecks(config, optionsConfig, targetFamily = null) {
  const checks = [];

  const quoteFeeds = config?.quote_feeds || null;
  if (targetFamily && !['fx', 'quote_feeds'].includes(targetFamily)) {
    checks.push(ingestSkipCheck('quote_feeds', 'target_family_filter', { target_family: targetFamily }));
  } else if (!quoteFeeds || !quoteFeeds.enabled) {
    checks.push(ingestSkipCheck('quote_feeds', 'disabled_in_config'));
  }

  for (const family of FAMILIES_MANIFEST) {
    if (targetFamily && targetFamily !== family.id) {
      checks.push(ingestSkipCheck(family.id, 'target_family_filter', { target_family: targetFamily }));
      continue;
    }

    const section = familySection(config, family);
    if (!section || !section.enabled) {
      checks.push(ingestSkipCheck(family.id, 'disabled_in_config'));
    }
  }

  for (const family of OPTIONS_MANIFEST) {
    if (targetFamily && targetFamily !== family.id) {
      checks.push(ingestSkipCheck(family.id, 'target_family_filter', { target_family: targetFamily }));
      continue;
    }

    const section = familySection(optionsConfig, family);
    if (!section || !section.enabled) {
      checks.push(ingestSkipCheck(family.id, 'disabled_in_config'));
    }
  }

  return checks;
}

function isRecordObject(record) {
  return Boolean(record) && typeof record === 'object' && !Array.isArray(record);
}

function fetchContext(family, provider, item) {
  return String(family) + ':' + String(provider) + ':' + String(item);
}

function normalizeFetchedRecords(records, context) {
  const list = Array.isArray(records) ? records : [records];
  const valid = list.filter(isRecordObject);
  if (valid.length !== list.length) {
    throw new Error(context + ' returned ' + (list.length - valid.length) + ' invalid record(s)');
  }
  return valid;
}

function isScopedSnapshotRequest(options = {}) {
  const requestedDays = Number(options.historyDays || options.days || 0);
  return Boolean(
    options.family ||
    options.symbol ||
    requestedDays > 5 ||
    options.history ||
    options.backfill
  );
}

function isDedupableQuoteRecord(record) {
  return isRecordObject(record) && ['equities', 'indices', 'commodities', 'crypto', 'fx'].includes(record.family) &&
    Boolean(record.symbol) &&
    Boolean(record.timestamp) &&
    ['open', 'high', 'low', 'close', 'bid', 'ask', 'last'].some((field) => Object.prototype.hasOwnProperty.call(record, field));
}

function dedupePreferredMarketQuotes(records) {
  const quoteRecords = [];
  const otherRecords = [];
  for (const record of records) {
    if (isDedupableQuoteRecord(record)) {
      quoteRecords.push(record);
    } else {
      otherRecords.push(record);
    }
  }
  const selectedQuotes = selectPreferredQuoteRecords(quoteRecords, { providerPriority: DEFAULT_PROVIDER_PRIORITY });
  return {
    records: [
      ...selectedQuotes,
      ...otherRecords,
    ],
    input_records: records.length,
    quote_records: quoteRecords.length,
    removed_records: records.length - (selectedQuotes.length + otherRecords.length),
  };
}

function selectNearestOptions(contracts, spot, count = 1) {
  return [...contracts]
    .filter((contract) => Number.isFinite(Number(contract.strike)))
    .sort((a, b) => {
      const deltaA = Math.abs(Number(a.strike) - spot);
      const deltaB = Math.abs(Number(b.strike) - spot);
      return deltaA - deltaB;
    })
    .slice(0, count);
}

function parseCboeOptionSymbol(symbol) {
  const match = String(symbol || '').match(/(\d{6})([CP])(\d{8})$/);
  if (!match) {
    return null;
  }

  const [, datePart, type, strikePart] = match;
  const year = 2000 + Number(datePart.slice(0, 2));
  const month = Number(datePart.slice(2, 4));
  const day = Number(datePart.slice(4, 6));
  const expiration = new Date(Date.UTC(year, month - 1, day)).toISOString();
  return {
    option_type: type === 'C' ? 'call' : 'put',
    expiration,
    strike: Number(strikePart) / 1000,
  };
}

function selectCboeContracts(contracts, optionType, count = 1) {
  const targetDelta = optionType === 'call' ? 0.5 : -0.5;
  return [...contracts]
    .map((contract) => ({
      contract,
      parsed: parseCboeOptionSymbol(contract.option),
    }))
    .filter(({ contract, parsed }) => {
      if (!parsed || parsed.option_type !== optionType) {
        return false;
      }
      return Number.isFinite(Number(contract.bid)) && Number.isFinite(Number(contract.ask));
    })
    .sort((a, b) => {
      const deltaA = Number.isFinite(Number(a.contract.delta))
        ? Math.abs(Number(a.contract.delta) - targetDelta)
        : Number.POSITIVE_INFINITY;
      const deltaB = Number.isFinite(Number(b.contract.delta))
        ? Math.abs(Number(b.contract.delta) - targetDelta)
        : Number.POSITIVE_INFINITY;
      return deltaA - deltaB;
    })
    .slice(0, count);
}

function resolveFredSeries(family, symbol, config) {
  const mappings = config.fred_mappings || {};
  const familyMappings = mappings[family] || {};
  return familyMappings[symbol] || null;
}

function resolveWorldBankIndicator(metric, config) {
  const mappings = config.world_bank_mappings || {};
  return mappings[metric] || metric;
}

async function fetchEquityOrIndexSnapshot(family, provider, symbol, timeframes, config, options = {}) {
  timeframes = timeframes || ['1d'];
  const historyDays = options.historyDays || options.days || 5;
  const startTime = options.startTime || null;
  const endTime = options.endTime || null;
  const targetStartMs = startTime || (Date.now() - (historyDays * 24 * 60 * 60 * 1000));
  const subDailyTimeframes = timeframes.filter(tf => {
    const ms = SUPPORTED_INTERVALS[tf];
    return ms !== undefined && ms <= INTRADAY_THRESHOLD_MS;
  });
  const dailyOrAbove = timeframes.filter(tf => {
    const ms = SUPPORTED_INTERVALS[tf];
    return ms !== undefined && ms > INTRADAY_THRESHOLD_MS;
  });
  const output = [];

  if (provider === 'alpaca' && subDailyTimeframes.length > 0) {
    const providerSymbol = resolveEquityOrIndexSymbol(family, symbol, provider);
    if (!providerSymbol) {
      throw new Error(`No ${provider} symbol mapping for ${symbol}`);
    }

    const ORDER = ['1m', '5m', '15m', '30m', '1h', '4h'];
    const finestSubDaily = ORDER.find(tf => subDailyTimeframes.includes(tf)) || subDailyTimeframes[0];
    let nativeCandles = null;
    try {
      nativeCandles = await fetchPaginated(providerSymbol, finestSubDaily, historyDays, family, fetchAlpacaBaseCandles, endTime || null, {
        chunkDelayMs: options.chunkDelayMs || 0,
      });
    } catch (err) {
      console.warn(`[INGEST] Native ${finestSubDaily} fetch failed for ${symbol} via ${provider}: ${err.message}`);
    }

    if (nativeCandles && nativeCandles.length > 0) {
      const nativeBarsForAgg = nativeCandles.map(c => ({
        openTime: c.openTime,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume,
      }));

      for (const tf of subDailyTimeframes) {
        if (!SUPPORTED_INTERVALS[tf]) continue;
        const aggregated = tf === finestSubDaily
          ? nativeCandles.map(c => ({
              family,
              provider,
              symbol,
              timeframe: tf,
              timestamp: new Date(c.openTime).toISOString(),
              open: c.open,
              high: c.high,
              low: c.low,
              close: c.close,
              volume: c.volume,
            }))
          : aggregateCandles(nativeBarsForAgg, tf, symbol, provider, family, { sourceTimeframe: finestSubDaily });

        if (aggregated.length > 0) {
          for (const r of aggregated) {
            if (new Date(r.timestamp).getTime() >= targetStartMs) output.push(r);
          }
        }
      }
    }
  }

  const unresolvedSubDailyTimeframes = subDailyTimeframes.filter(tf => !output.some(r => r.timeframe === tf));
  if (provider === 'alpaca' && unresolvedSubDailyTimeframes.length > 0) {
    if (dailyOrAbove.length === 0) {
      throw new Error(`No native Alpaca ${unresolvedSubDailyTimeframes.join(',')} candles returned for ${symbol}`);
    }
    console.warn(`[INGEST] Alpaca returned no native ${unresolvedSubDailyTimeframes.join(',')} candles for ${symbol}; not synthesizing sub-daily bars from daily data`);
  }

  const remainingTimeframes = [
    ...dailyOrAbove,
    ...(provider === 'alpaca' ? [] : unresolvedSubDailyTimeframes),
  ];

  if (remainingTimeframes.length === 0) return output;

  let baseCandles = null;
  let baseTimeframe = '1d';
  if (provider === 'stooq') {
    const stooqSymbol = resolveStooqSymbol(family, symbol);
    if (!stooqSymbol) {
      throw new Error(`No stooq symbol mapping for ${symbol}`);
    }
    baseCandles = await fetchStooqDailyHistory(stooqSymbol);
  } else if (provider === 'alpaca') {
    const providerSymbol = resolveEquityOrIndexSymbol(family, symbol, provider);
    if (!providerSymbol) {
      throw new Error(`No ${provider} symbol mapping for ${symbol}`);
    }
    baseCandles = await fetchAlpacaBaseCandles(providerSymbol, Math.max(100, Math.ceil(historyDays * 1.5)), '1d', startTime, endTime);
  } else {
    const providerSymbol = resolveEquityOrIndexSymbol(family, symbol, provider);
    if (!providerSymbol) {
      throw new Error(`No ${provider} symbol mapping for ${symbol}`);
    }
    const { base: bestBase, effectiveDays } = selectYahooBase(remainingTimeframes, historyDays);
    baseTimeframe = bestBase;
    baseCandles = await fetchYahooBaseCandles(providerSymbol, bestBase, effectiveDays, startTime, endTime);
  }

  for (const timeframe of remainingTimeframes) {
    if (!SUPPORTED_INTERVALS[timeframe]) {
      throw new Error(`Unsupported derived timeframe: ${timeframe}`);
    }
    const aggregated = aggregateCandles(baseCandles, timeframe, symbol, provider, family, { sourceTimeframe: baseTimeframe });
    if (aggregated.length > 0) {
      if (historyDays > 5) {
       
        appendRecords(output, aggregated);
      } else {
        output.push({
          ...aggregated[aggregated.length - 1],
          family,
        });
      }
    }
  }

  return output;
}

async function fetchCommoditySnapshot(family, provider, symbol, timeframes, config, options = {}) {
  // Normalize Yahoo-native symbols (GC=F, BZ=F, etc.) to canonical names
  symbol = YAHOO_COMMODITY_REVERSE[symbol] || symbol;
  const historyDays = options.historyDays || options.days || 5;
  const startTime = options.startTime || null;
  const endTime = options.endTime || null;

  let baseCandles = null;
  let baseTimeframe = '1d';
  if (provider === 'stooq') {
    const stooqSymbol = resolveStooqSymbol('commodities', symbol);
    if (!stooqSymbol) {
      throw new Error(`No stooq symbol mapping for ${symbol}`);
    }
    baseCandles = await fetchStooqDailyHistory(stooqSymbol);
  } else {
    const providerSymbol = resolveCommoditySymbol(provider, symbol);
    if (!providerSymbol) {
      throw new Error(`No ${provider} symbol mapping for ${symbol}`);
    }
   
    const bestBase = (historyDays > 730 || !timeframes.includes("1h")) ? "1d" : "1h"; 
    baseTimeframe = bestBase;
    baseCandles = await fetchYahooBaseCandles(providerSymbol, bestBase, historyDays, startTime, endTime);
  }
  const output = [];

  for (const timeframe of timeframes) {
    if (!SUPPORTED_INTERVALS[timeframe]) {
      throw new Error(`Unsupported derived timeframe: ${timeframe}`);
    }
    const aggregated = aggregateCandles(baseCandles, timeframe, symbol, provider, family, { sourceTimeframe: baseTimeframe });
    if (aggregated.length > 0) {
      if (historyDays > 5) {
       
        appendRecords(output, aggregated);
      } else {
        output.push({
          ...aggregated[aggregated.length - 1],
          family,
        });
      }
    }
  }

  return output;
}

async function fetchYahooOptionsSnapshot(family, provider, underlying) {
  if (provider === 'cboe') {
    const url = new URL(`https://cdn.cboe.com/api/global/delayed_quotes/options/${encodeURIComponent(underlying)}.json`);
    const payload = await fetchJson(url.toString());
    const options = payload?.data?.options;
    if (!Array.isArray(options) || options.length === 0) {
      throw new Error(`Cboe options response missing chain for ${underlying}`);
    }

    const spot = Number(payload?.data?.current_price);
    const selected = [
      ...selectCboeContracts(options, 'call', 1),
      ...selectCboeContracts(options, 'put', 1),
    ];
    const records = selected.map(({ contract, parsed }) => ({
      provider: 'cboe',
      family,
      underlying,
      option_type: parsed.option_type,
      expiration: parsed.expiration,
      contract_symbol: contract.option,
      strike: parsed.strike,
      implied_volatility: contract.iv != null ? Number(contract.iv) : null,
      open_interest: contract.open_interest != null ? Number(contract.open_interest) : null,
      volume: contract.volume != null ? Number(contract.volume) : null,
      bid: contract.bid != null ? Number(contract.bid) : null,
      ask: contract.ask != null ? Number(contract.ask) : null,
      last_price: contract.last_trade_price != null ? Number(contract.last_trade_price) : null,
      delta: contract.delta != null ? Number(contract.delta) : null,
      gamma: contract.gamma != null ? Number(contract.gamma) : null,
      theta: contract.theta != null ? Number(contract.theta) : null,
      vega: contract.vega != null ? Number(contract.vega) : null,
      rho: contract.rho != null ? Number(contract.rho) : null,
      spot: Number.isFinite(spot) ? spot : null,
      timestamp: payload.timestamp || new Date().toISOString(),
      source_url: redactUrl(url.toString()),
    }));

    if (records.length === 0) {
      throw new Error(`Cboe options chain produced no contracts for ${underlying}`);
    }

    return records;
  }

  if (provider !== 'yahoo') {
    throw new Error(`Unsupported options provider: ${provider}`);
  }

  const underlyingCandles = await fetchYahooBaseCandles(underlying);
  const spot = Number(underlyingCandles[underlyingCandles.length - 1].close);
  if (!Number.isFinite(spot)) {
    throw new Error(`Unable to determine spot price for ${underlying}`);
  }

  const url = new URL(`https://query2.finance.yahoo.com/v7/finance/options/${encodeURIComponent(underlying)}`);
  const payload = await fetchJson(url.toString());
  const result = payload?.optionChain?.result?.[0];
  const chain = result?.options?.[0];

  if (!result || !chain) {
    throw new Error(`Yahoo options response missing chain for ${underlying}`);
  }

  const expirationDate = chain.expirationDate || result.expirationDates?.[0];
  const expiration = expirationDate ? new Date(Number(expirationDate) * 1000).toISOString() : new Date().toISOString();
  const calls = selectNearestOptions(chain.calls || [], spot, 1);
  const puts = selectNearestOptions(chain.puts || [], spot, 1);
  const records = [];

  for (const contract of calls) {
    records.push({
      provider: 'yahoo',
      family,
      underlying,
      option_type: 'call',
      expiration,
      contract_symbol: contract.contractSymbol,
      strike: Number(contract.strike),
      implied_volatility: contract.impliedVolatility != null ? Number(contract.impliedVolatility) : null,
      open_interest: contract.openInterest != null ? Number(contract.openInterest) : null,
      volume: contract.volume != null ? Number(contract.volume) : null,
      bid: contract.bid != null ? Number(contract.bid) : null,
      ask: contract.ask != null ? Number(contract.ask) : null,
      last_price: contract.lastPrice != null ? Number(contract.lastPrice) : null,
      in_the_money: Boolean(contract.inTheMoney),
      spot,
      source_url: redactUrl(url.toString()),
    });
  }

  for (const contract of puts) {
    records.push({
      provider: 'yahoo',
      family,
      underlying,
      option_type: 'put',
      expiration,
      contract_symbol: contract.contractSymbol,
      strike: Number(contract.strike),
      implied_volatility: contract.impliedVolatility != null ? Number(contract.impliedVolatility) : null,
      open_interest: contract.openInterest != null ? Number(contract.openInterest) : null,
      volume: contract.volume != null ? Number(contract.volume) : null,
      bid: contract.bid != null ? Number(contract.bid) : null,
      ask: contract.ask != null ? Number(contract.ask) : null,
      last_price: contract.lastPrice != null ? Number(contract.lastPrice) : null,
      in_the_money: Boolean(contract.inTheMoney),
      spot,
      source_url: redactUrl(url.toString()),
    });
  }

  if (records.length === 0) {
    throw new Error(`Yahoo options chain produced no contracts for ${underlying}`);
  }

  return records;
}

function impliedProbability(market) {
  const values = [
    market.yes_bid,
    market.yes_ask,
    market.last_price,
    market.yes_bid_dollars,
    market.yes_ask_dollars,
    market.last_price_dollars,
  ]
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));

  if (values.length === 0) {
    return null;
  }

  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  return average > 1 ? average / 100 : average;
}

async function fetchGoogleCustomSearchInterest(query) {
  const apiKey = process.env.GOOGLE_API_KEY || process.env.GOOGLE_CUSTOM_SEARCH_API_KEY;
  const cx = process.env.GOOGLE_CSE_ID || process.env.GOOGLE_CUSTOM_SEARCH_ENGINE_ID;
  if (!apiKey || !cx) {
    throw new Error('Google Custom Search credentials not configured');
  }

  const url = new URL('https://www.googleapis.com/customsearch/v1');
  url.searchParams.set('key', apiKey);
  url.searchParams.set('cx', cx);
  url.searchParams.set('q', query);
  url.searchParams.set('num', '10');

  const payload = await fetchJson(url.toString());
  const totalResults = Number(payload?.searchInformation?.totalResults || 0);
  const items = Array.isArray(payload.items) ? payload.items : [];
  const relevanceSignals = items.map((item) => String(item.title || item.snippet || '').toLowerCase());
  const keywordHits = relevanceSignals.reduce((count, text) => count + (text.includes(String(query).toLowerCase()) ? 1 : 0), 0);
  const interestScore = Math.max(0, Math.min(1,
    (Math.log10(totalResults + 1) / 10) + (items.length / 50) + (keywordHits / 20),
  ));

  return {
    family: 'sentiment',
    provider: 'google_custom_search',
    symbol: query.replace(/\s+/g, '_').toLowerCase(),
    metric: 'search_interest',
    timestamp: new Date().toISOString(),
    value: Number(interestScore.toFixed(3)),
    search_query: query,
    search_total_results: totalResults,
    result_count: items.length,
    source_url: redactUrl(url.toString()),
  };
}

function numberOrNull(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseJsonList(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function eventKeywords(eventName, provider, config) {
  const mappings = config.prediction_market_keywords || {};
  const defaults = provider === 'polymarket' ? POLYMARKET_EVENT_KEYWORDS : KALSHI_EVENT_KEYWORDS;
  return mappings[eventName] || defaults[eventName] || [String(eventName || '').replace(/_/g, ' ')];
}

function matchesPredictionEvent(record, eventName, provider, config) {
  const keywords = eventKeywords(eventName, provider, config).filter(Boolean);
  const text = [
    record.title,
    record.subtitle,
    record.ticker,
    record.event_ticker,
    record.question,
    record.slug,
    record.description,
  ].filter(Boolean).join(' ').toLowerCase();
  return keywords.some((keyword) => text.includes(String(keyword).toLowerCase()));
}

function kalshiMarketRecord(eventName, market, sourceUrl) {
  return {
    family: 'prediction_market',
    provider: 'kalshi',
    symbol: eventName || market.ticker,
    market_ticker: market.ticker,
    event_ticker: market.event_ticker || null,
    title: market.title || market.yes_sub_title || null,
    timestamp: market.updated_time || market.close_time || market.open_time || new Date().toISOString(),
    value: impliedProbability(market),
    result: market.result || null,
    status: market.status || null,
    volume_fp: numberOrNull(market.volume_fp),
    volume_24h_fp: numberOrNull(market.volume_24h_fp),
    open_interest_fp: numberOrNull(market.open_interest_fp),
    regulatory_venue: 'cftc_dcm',
    source_url: sourceUrl,
  };
}

async function fetchKalshiPredictionMarket(eventName, config) {
  const direct = String(eventName || '').trim();
  if (/^[A-Z0-9-]+$/.test(direct)) {
    const sourceUrl = `${KALSHI_API_BASE}/events/${direct}`;
    return kalshiMarketRecord(eventName, await fetchKalshiPredictionEvent(direct, config), sourceUrl);
  }

  const url = new URL(`${KALSHI_API_BASE}/markets`);
  url.searchParams.set('limit', '200');
  url.searchParams.set('status', 'open');
  const payload = await fetchJson(url.toString());
  const markets = Array.isArray(payload?.markets) ? payload.markets : [];
  const match = markets.find((market) => matchesPredictionEvent(market, eventName, 'kalshi', config));
  if (!match) {
    return null;
  }
  return kalshiMarketRecord(eventName, match, redactUrl(url.toString()));
}

function parsePolymarketTokenIds(market = {}) {
  const candidates = [
    market.clobTokenIds,
    market.clob_token_ids,
    market.clobTokenIDs,
    market.tokenIds,
    market.token_ids,
  ];
  for (const value of candidates) {
    const parsed = parseJsonList(value).map(String).filter(Boolean);
    if (parsed.length > 0) return [...new Set(parsed)];
    if (Array.isArray(value)) return [...new Set(value.map(String).filter(Boolean))];
  }

  const tokens = Array.isArray(market.tokens) ? market.tokens : [];
  const tokenIds = tokens
    .map((token) => token.token_id || token.tokenId || token.id)
    .map(String)
    .filter(Boolean);
  return [...new Set(tokenIds)];
}

function polymarketMarketRecord(eventName, market, sourceUrl) {
  const price = numberOrNull(
    market.lastTradePrice ??
    market.last_trade_price ??
    market.bestAsk ??
    market.bestBid ??
    market.outcomePrice
  );
  return {
    family: 'prediction_market',
    provider: 'polymarket',
    symbol: eventName || market.slug || market.id,
    market_id: market.id || null,
    condition_id: market.conditionId || market.condition_id || null,
    question: market.question || market.title || null,
    timestamp: market.updatedAt || market.updated_at || market.endDate || market.end_date || new Date().toISOString(),
    value: price,
    status: market.active === false ? 'inactive' : (market.closed ? 'closed' : 'active'),
    volume: numberOrNull(market.volume ?? market.volumeNum),
    liquidity: numberOrNull(market.liquidity ?? market.liquidityNum),
    clob_token_ids: parsePolymarketTokenIds(market),
    source_url: sourceUrl,
  };
}

function polymarketHistoryPoints(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.history)) return payload.history;
  if (Array.isArray(payload?.prices)) return payload.prices;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

function polymarketPriceHistoryRecords(symbol, market, tokenId, payload, options = {}, sourceUrl = '') {
  const timeframe = polymarketTimeframeFromOptions(options);
  const marketId = market.id || market.market_id || market.conditionId || market.condition_id || tokenId;
  return polymarketHistoryPoints(payload)
    .map((point) => predictionCandleRecord('polymarket', symbol, marketId, point, timeframe, sourceUrl, {
      token_id: tokenId,
      condition_id: market.conditionId || market.condition_id || null,
      question: market.question || market.title || null,
    }))
    .filter((record) => record.close !== null && !Number.isNaN(Date.parse(record.timestamp)));
}
function predictionCandleRecord(provider, symbol, marketId, candle, timeframe, sourceUrl, extra = {}) {
  const price = candle.price || candle.yes_bid || candle.yes_ask || {};
  const open = numberOrNull(price.open ?? candle.p);
  const high = numberOrNull(price.high ?? candle.p);
  const low = numberOrNull(price.low ?? candle.p);
  const close = numberOrNull(price.close ?? candle.p);
  const unixSeconds = Number(candle.end_period_ts ?? candle.t);
  return {
    family: 'prediction_market',
    provider,
    symbol,
    market_id: marketId,
    timeframe,
    timestamp: new Date(unixSeconds * 1000).toISOString(),
    open,
    high,
    low,
    close,
    volume: numberOrNull(candle.volume) || 0,
    open_interest: numberOrNull(candle.open_interest),
    source: `${provider}-${timeframe}-prediction-history`,
    source_url: redactUrl(sourceUrl),
    ...extra,
  };
}

function polymarketTimeframeFromOptions(options = {}) {
  if (options.timeframe) return options.timeframe;
  if (options.interval === '1d') return '1d';
  const fidelity = Math.max(1, Math.floor(Number(options.fidelity) || 60));
  if (fidelity >= 1440) return '1d';
  if (fidelity % 60 === 0) return `${fidelity / 60}h`;
  return `${fidelity}m`;
}

async function fetchPredictionInterestSignal(eventName, provider = 'google_custom_search') {
  if (provider !== 'google_custom_search') {
    throw new Error(`Unsupported prediction interest provider: ${provider}`);
  }
  const query = String(eventName || '').replace(/_/g, ' ');
  return fetchGoogleCustomSearchInterest(query);
}

// Provider adapters that still need full extraction share this narrow boundary.
async function fetchOpenSkyRegion() { return {}; }
async function fetchBlockchairStats() { return {}; }
async function fetchBlockchairOnchain() { return {}; }
async function fetchSecHoldingsSnapshot() { return {}; }
async function fetchSpGlobalFlashPmi() { return {}; }
async function fetchEcbFx() { return {}; }
async function fetchFxApiFx() { return {}; }
async function fetchYahooBreadthProxy() { return {}; }
async function fetchKalshiHistoricalMarkets() { return []; }
async function fetchKalshiHistoricalCandlesticks() { return []; }
async function fetchPolymarketMarkets(eventName, config = {}, options = {}) {
  const url = new URL(`${POLYMARKET_GAMMA_BASE}/markets`);
  url.searchParams.set('limit', String(options.limit || 200));
  if (options.active !== false) url.searchParams.set('active', 'true');
  if (options.closed === false) url.searchParams.set('closed', 'false');

  const payload = await fetchJson(url.toString());
  const markets = Array.isArray(payload) ? payload : (Array.isArray(payload?.markets) ? payload.markets : []);
  return markets
    .filter((market) => matchesPredictionEvent(market, eventName, 'polymarket', config))
    .slice(0, options.maxMarkets || 3)
    .map((market) => polymarketMarketRecord(eventName, market, redactUrl(url.toString())));
}

async function fetchPolymarketPriceHistory(tokenId, options = {}) {
  if (!tokenId) return { payload: { history: [] }, sourceUrl: '' };
  const url = new URL(`${POLYMARKET_CLOB_BASE}/prices-history`);
  url.searchParams.set('market', tokenId);
  url.searchParams.set('interval', options.interval || 'max');
  url.searchParams.set('fidelity', String(options.fidelity || 60));
  if (options.startTs) url.searchParams.set('startTs', String(options.startTs));
  if (options.endTs) url.searchParams.set('endTs', String(options.endTs));
  return {
    payload: await fetchJson(url.toString()),
    sourceUrl: redactUrl(url.toString()),
  };
}

async function fetchPolymarketHistoricalPrices(eventName, config = {}, options = {}) {
  const markets = await fetchPolymarketMarkets(eventName, config, options);
  const records = [];
  for (const marketRecord of markets) {
    const tokenIds = marketRecord.clob_token_ids || [];
    for (const tokenId of tokenIds.slice(0, options.maxTokens || 1)) {
      const { payload, sourceUrl } = await fetchPolymarketPriceHistory(tokenId, options);
      records.push(...polymarketPriceHistoryRecords(eventName, marketRecord, tokenId, payload, options, sourceUrl));
    }
  }
  return records;
}

const FAMILIES_MANIFEST = [
  { id: 'equities', configKey: 'equities', itemsKey: 'symbols', fetcher: async (p, s, t, cfg, opts) => {
        if (p === 'tradingview') {
          const { fetchTradingViewQuotes } = require('../../../../shared/lib/providers/tradingview');
          return fetchTradingViewQuotes([s]);
        }
        if (p === 'finnhub') return fetchFinnhubSnapshot('equities', s, t, opts);
        if (p === 'twelve') return fetchTwelveDataSnapshot('equities', s, t, opts);
        return fetchEquityOrIndexSnapshot('equities', p, s, t, cfg, opts);
      } 
    },
  { id: 'indices', configKey: 'indices', itemsKey: 'symbols', fetcher: async (p, s, t, cfg, opts) => {
        if (p === 'tradingview') {
          const { fetchTradingViewQuotes } = require('../../../../shared/lib/providers/tradingview');
          return fetchTradingViewQuotes([s]);
        }
        if (p === 'twelve') return fetchTwelveDataSnapshot('indices', s, t, opts);
        if (p === 'fred') {
          const id = resolveFredSeries('indices', s, cfg);
          if (!id) throw new Error(`No FRED series mapping for ${s}`);
          if (opts?.historyDays) {
              const records = await fetchFredHistory(id, opts.historyDays);
            return records.map(r => ({ ...r, family: 'indices', symbol: s }));
        }
        return [{ ...await fetchFredLatest(id), family: 'indices', symbol: s }];
      }
      return fetchEquityOrIndexSnapshot('indices', p, s, t, cfg, opts);
    } 
  },
  { id: 'commodities', configKey: 'commodities', itemsKey: 'symbols', fetcher: async (p, s, t, cfg, opts) => {
        if (p === 'tradingview') {
          const { fetchTradingViewQuotes } = require('../../../../shared/lib/providers/tradingview');
          return fetchTradingViewQuotes([s]);
        }
        if (p === 'twelve') return fetchTwelveDataSnapshot('commodities', s, t, opts);
        return fetchCommoditySnapshot('commodities', p, s, t, cfg, opts);
      }
    },
  { id: 'fx', configKey: 'fx', itemsKey: 'symbols', fetcher: async (p, s, t, cfg, opts) => {
      if (p === 'tradingview') {
        const { fetchTradingViewQuotes } = require('../../../../shared/lib/providers/tradingview');
        return fetchTradingViewQuotes([s]);
      }
        if (p === 'frankfurter') {
          if (opts?.historyDays) {
            return fetchFrankfurterHistory(s, opts.historyDays);
          }
          return [await fetchFrankfurterFx(s)];
        }
        if (p === 'finnhub') return fetchFinnhubSnapshot('fx', s, t, opts);
        if (p === 'twelve') return fetchTwelveDataSnapshot('fx', s, t, opts);
        if (p === 'fxapi') return [await fetchFxApiFx(s)];
        if (p === 'ecb') {
          if (opts?.historyDays) {
            return fetchEcbHistory(s, opts.historyDays);
          }
          return [await fetchEcbFx(s)];
        }
        return [await fetchEcbFx(s)];
      }
    },
  { id: 'crypto', configKey: 'crypto', itemsKey: 'symbols', fetcher: async (p, s, t, cfg, opts) => {
        if (p === 'tradingview') {
          const { fetchTradingViewQuotes } = require('../../../../shared/lib/providers/tradingview');
          return fetchTradingViewQuotes([s]);
        }
        if (p === 'finnhub') return fetchFinnhubSnapshot('crypto', s, t, opts);
        if (p === 'twelve') return fetchTwelveDataSnapshot('crypto', s, t, opts);
        return fetchCryptoSnapshot(p, s, t, 'crypto', opts);
      }
    },
  { id: 'pmi', configKey: 'pmi', itemsKey: 'series', fetcher: async (p, s, t, cfg) => fetchSpGlobalFlashPmi() },
  { id: 'macro', configKey: 'macro', itemsKey: 'series', fetcher: async (p, s, t, cfg, opts) => {
      const id = resolveFredSeries('macro', s, cfg);
      if (!id) throw new Error(`No FRED series mapping for ${s}`);
      if (opts?.historyDays) {
        const records = await fetchFredHistory(id, opts.historyDays);
        return records.map(r => ({ ...r, family: 'macro', series: s }));
      }
      return [{ ...await fetchFredLatest(id), family: 'macro', series: s }];
    }
  },
  { id: 'weather', configKey: 'weather', itemsKey: 'locations', fetcher: (p, s, t, cfg) => fetchNasaPowerWeather(s).then(r => [r]) },
  { id: 'flight', configKey: 'flight', itemsKey: 'regions', fetcher: (p, s, t, cfg) => fetchOpenSkyRegion(s).then(r => [r]) },
  { id: 'crypto_tx', configKey: 'crypto_tx', itemsKey: 'chains', fetcher: (p, s, t, cfg) => fetchBlockchairStats(s).then(r => [r]) },
  { id: 'sentiment', configKey: 'sentiment', itemsKey: null, fetcher: (p, s, t, cfg) => fetchAlternativeMeFearGreed().then(r => [r]) },
  { id: 'holdings', configKey: 'holdings', itemsKey: 'symbols', fetcher: (p, s, t, cfg) => fetchSecHoldingsSnapshot(s, cfg).then(r => [r]) },
  { id: 'reserves', configKey: 'reserves', itemsKey: 'countries', fetcher: async (p, s, t, cfg, opts) => {
      const results = [];
      for (const m of cfg.reserves.metrics) {
        const indicator = resolveWorldBankIndicator(m, cfg);
        if (opts?.historyDays) {
          const records = await fetchWorldBankHistory(s, indicator, opts.historyDays);
          results.push(...records.map(r => ({ ...r, family: 'reserves', country: s, metric: m })));
        } else {
          results.push({ ...await fetchWorldBankLatest(s, indicator, cfg), family: 'reserves', country: s, metric: m });
        }
      }
      return results;
    }
  },
  { id: 'onchain', configKey: 'onchain', itemsKey: 'chains', fetcher: (p, s, t, cfg) => fetchBlockchairOnchain(s).then(r => [r]) },
  { id: 'breadth', configKey: 'breadth', itemsKey: 'metrics', fetcher: (p, s, t, cfg) => fetchYahooBreadthProxy(s, cfg).then(r => [r]) },
  { id: 'prediction_market', configKey: 'prediction_market', itemsKey: 'events', fetcher: async (p, s, t, cfg, opts) => {
      if (p === 'polymarket') {
        if (opts?.historyDays || opts?.history || opts?.backfill) {
          return fetchPolymarketHistoricalPrices(s, cfg, opts);
        }
        return fetchPolymarketMarkets(s, cfg, opts);
      }
      if (opts?.historyDays || opts?.history || opts?.backfill) {
        return [];
      }
      const record = await fetchKalshiPredictionMarket(s, cfg);
      return record ? [record] : [];
    }
  },
];

const OPTIONS_MANIFEST = [
  { id: 'equities_options', configKey: 'equities_options', itemsKey: 'underlyings', fetcher: (p, s, t, cfg) => fetchYahooOptionsSnapshot('equities_options', p, s) },
  { id: 'stock_options', configKey: 'stock_options', itemsKey: 'underlyings', fetcher: (p, s, t, cfg) => fetchYahooOptionsSnapshot('stock_options', p, s) },
];

/**
 * Parses the universe_matrix structure and returns a map of symbol -> tags + coordinate_id.
 */
function parseUniverseMatrix(matrix) {
    const symbolMap = new Map();
    if (!matrix || !matrix.grid) return symbolMap;

    const markets = new Set((matrix.x_axis_markets || []).map(m => m.toLowerCase()));
    const sectors = new Set((matrix.y_axis_sectors || []).map(s => s.toLowerCase()));

    for (const [marketKey, sectorGrid] of Object.entries(matrix.grid)) {
        const mKey = marketKey.toLowerCase();
        if (!markets.has(mKey)) {
            throw new Error(`[MATRIX] Market '${marketKey}' in grid is not defined in x_axis_markets.`);
        }

        for (const [sectorKey, symbols] of Object.entries(sectorGrid)) {
            const sKey = sectorKey.toLowerCase();
            if (!sectors.has(sKey)) {
                throw new Error(`[MATRIX] Sector '${sectorKey}' for market '${marketKey}' is not defined in y_axis_sectors.`);
            }

            if (Array.isArray(symbols)) {
                symbols.forEach(symbol => {
                    const ticker = symbol.includes(':') ? symbol.split(':').pop() : symbol;
                    const coordinate_id = `${marketKey}-${sectorKey}-${ticker}`.toUpperCase();
                    
                    symbolMap.set(symbol, {
                        config_market: mKey,
                        config_sector: sKey,
                        coordinate_id: coordinate_id
                    });
                });
            }
        }
    }
    return symbolMap;
}

/**
 * Recursively parses the categories structure and returns a map of symbol -> tags.
 * Tags are accumulated from the path in the hierarchy.
 */
function parseHierarchicalTags(categories, pathTags = {}) {
    const symbolMap = new Map();
    
    for (const [key, value] of Object.entries(categories)) {
        if (Array.isArray(value)) {
            value.forEach(symbol => {
                if (!symbolMap.has(symbol)) symbolMap.set(symbol, { ...pathTags });
                const existing = symbolMap.get(symbol);
                if (['technology', 'financials', 'energy', 'healthcare', 'mining', 'automotive', 
                     'industrials', 'real_estate', 'consumer', 'layer1', 'defi', 'ai', 'memes',
                     'communication_services', 'consumer_discretionary'].includes(key)) {
                    existing.config_sector = key;
                } else if (['vietnam', 'india', 'uk', 'germany', 'usa', 'global'].includes(key)) {
                    existing.config_market = key;
                }
            });
        } 
        else if (typeof value === 'object' && value !== null) {
            const newTags = { ...pathTags };
            if (['vietnam', 'india', 'uk', 'germany', 'usa', 'global'].includes(key)) {
                newTags.config_market = key;
            } else if (key !== 'international' && key !== 'categories' && key !== 'grid') {
                newTags.config_sector = key;
            }
            const subMap = parseHierarchicalTags(value, newTags);
            for (const [s, t] of subMap.entries()) {
                if (!symbolMap.has(s)) symbolMap.set(s, { ...t });
                else Object.assign(symbolMap.get(s), t);
            }
        }
    }
    return symbolMap;
}

async function ingestMarketData(options = {}) {
  try {
    const targetFamily = options.family || null;
    const scopedSnapshot = isScopedSnapshotRequest(options);
    const requestedDays = Number(options.historyDays || options.days || 0);
    const config = await loadConfig();
    const optionsConfig = await loadOptionsConfig();
    
   
    const categoryTags = new Map();
    for (const f of FAMILIES_MANIFEST) {
        const section = config[f.configKey];
        if (section?.universe_matrix) {
            categoryTags.set(f.id, parseUniverseMatrix(section.universe_matrix));
        } else if (section?.categories) {
            categoryTags.set(f.id, parseHierarchicalTags(section.categories));
        }
    }

    // Read full history to build universeMap (now partitioned)
    const existingHistory = readSnapshot(HISTORY_PATH, targetFamily ? { family: targetFamily } : {});
    const universeMap = new Map();
    if (existingHistory && Array.isArray(existingHistory.sources)) {
      for (const s of existingHistory.sources) {
        const key = `${s.family || 'unknown'}:${s.symbol}:${s.timeframe || '1d'}`;
        if (!universeMap.has(key)) universeMap.set(key, { min: Infinity, max: 0, count: 0 });
        const meta = universeMap.get(key);
        const ts = new Date(s.timestamp).getTime();
        meta.min = Math.min(meta.min, ts);
        meta.max = Math.max(meta.max, ts);
        meta.count++;
      }
    }

    const snapshot = {
      mode: requestedDays > 5 ? 'provider_history' : 'live',
      fetched_at: new Date().toISOString(),
      sources: [],
      errors: [],
      provider_checks: collectIngestSkipChecks(config, optionsConfig, targetFamily),
      snapshot_scope: {
        kind: scopedSnapshot ? 'scoped' : 'global',
        representative_of_global_live_health: !scopedSnapshot,
        target_family: targetFamily,
        target_symbol: options.symbol || null,
        requested_days: requestedDays || null,
      },
    };

    // 1. External Quote Feeds
    if (!targetFamily || targetFamily === 'fx' || targetFamily === 'quote_feeds') {
      const externalQuotes = await loadExternalQuoteInputs(config);
      appendRecords(snapshot.sources, externalQuotes.records);
      snapshot.errors.push(...externalQuotes.errors);
      snapshot.provider_checks.push(...externalQuotes.provider_checks);
    }

    // 2. Standard Families (Market Data)
    for (const family of FAMILIES_MANIFEST) {
      if (targetFamily && targetFamily !== family.id) continue;
      const section = config[family.configKey];
      if (!section || !section.enabled) continue;

      const fetcher = family.fetcher || family.fetch;

      // A. Provider Smoke Tests
      const items = family.itemsKey ? section[family.itemsKey] : ['fear_and_greed'];
        if (items && items[0] && (options.historyDays || 0) <= 5 && !options.symbol) {
          const sampleItem = items[0];
          for (const provider of section.providers) {
            if (!provider) continue;
            try {
              const sampleRecords = normalizeFetchedRecords(await fetcher(provider, sampleItem, section.timeframes || ['1d'], config, options), fetchContext(family.id, provider, sampleItem));
              if (sampleRecords.length > 0) {
                snapshot.provider_checks.push({ family: family.id, provider, symbol: sampleItem, status: 'ok' });
              } else {
                snapshot.provider_checks.push({ family: family.id, provider, symbol: sampleItem, status: 'skipped', reason: 'no_records' });
              }
            } catch (error) {
              snapshot.provider_checks.push({ family: family.id, provider, symbol: sampleItem, status: 'error', message: error.message });
            }
          }
        }

      // B. Full Data Sync
      if (items) {
        const allSymbols = new Set(items);
        const tagsMap = categoryTags.get(family.id);
        if (tagsMap) {
            for (const s of tagsMap.keys()) allSymbols.add(s);
        }

        const filteredItems = options.symbol 
          ? Array.from(allSymbols).filter(i => i === options.symbol)
          : Array.from(allSymbols);

        const syncTimeframes = options.timeframe ? [options.timeframe] : (section.timeframes || ['1d']);

        for (const item of filteredItems) { 
         
          const requestedDays = options.historyDays || options.days || 5;
          const force = options.force || options.historyForce || false;
          const requestedMs = requestedDays * 24 * 60 * 60 * 1000;
          const now = Date.now();
          const targetStart = now - requestedMs;
          
          let skipItem = !force;
          let latestInCache = 0;
          let earliestInCache = Infinity;

          for (const tf of syncTimeframes) {
              const cacheKey = `${family.id}:${item}:${tf}`;
              const meta = universeMap.get(cacheKey);
              const freshnessThreshold = SUPPORTED_INTERVALS[tf] || 24 * 60 * 60 * 1000;
              
              if (!meta || meta.min > targetStart || (now - meta.max) > freshnessThreshold) {
                  skipItem = false;
              }
              if (meta) {
                  latestInCache = Math.max(latestInCache, meta.max);
                  earliestInCache = Math.min(earliestInCache, meta.min);
              }
          }

          if (skipItem) {
              if (filteredItems.length > 1) {
                // Bulk ingestion skip
                continue;
              } else {
                // Single symbol: force refresh but log it
                console.log(`[INGEST] ${family.id}:${item} cache hit (full range covered). Refreshing anyway for latest bar.`);
              }
          }

         
          let fetchOptions = { ...options };
          if (!skipItem && latestInCache > 0 && earliestInCache <= targetStart && (now - latestInCache) > 0) {
              // Cache covers history but is stale. Just fetch the forward gap.
              const buffer = 1000 * 60 * 5; // 5m buffer
              fetchOptions.startTime = latestInCache - buffer; 
              console.log(`[INGEST] ${family.id}:${item} identifies forward gap. Fetching from ${new Date(fetchOptions.startTime).toISOString()} to fill.`);
          }

          console.log('[INGEST] Fetching ' + family.id + ':' + item);
          let resolved = false;

          // Local Aggregation Engine: Build 1w/1mo from 1d if available
          const localDerived = [];
          const remoteTimeframes = [];
          for (const tf of syncTimeframes) {
              const derived = deriveHighTfFromLocalDaily(family.id, item, tf);
              if (derived) {
                  appendRecords(localDerived, derived);
              } else {
                  remoteTimeframes.push(tf);
              }
          }

          if (localDerived.length > 0) {
              appendRecords(snapshot.sources, localDerived);
              if (remoteTimeframes.length === 0) resolved = true;
          }

          if (!resolved) {
            // options.provider pins the provider chain to one entry (e.g. the 5m
            // deep backfill must hit binance natively -- TwelveData earlier in the
            // chain silently caps history at 5,000 bars and would win the break).
            const providerList = options.provider
              ? [options.provider]
              : section.providers;
            for (const provider of providerList) {
              if (!provider) continue;
              try {
                const providerSymbol = (family.id === 'equities' || family.id === 'indices') ? resolveEquityOrIndexSymbol(family.id, item, provider) : item;
                const records = normalizeFetchedRecords(await fetcher(provider, item, remoteTimeframes, config, fetchOptions), fetchContext(family.id, provider, item));
                if (!records || records.length === 0) {
                  continue;
                }
              
             
              const tags = categoryTags.get(family.id)?.get(item);
              records.forEach(r => {
                  if (!r.family) r.family = family.id;
                  if (tags) {
                      if (tags.config_market) r.config_market = tags.config_market;
                      if (tags.config_sector) r.config_sector = tags.config_sector;
                      if (tags.coordinate_id) r.coordinate_id = tags.coordinate_id;
                  }
              });

              appendRecords(snapshot.sources, records);
              resolved = true;
              break;
            } catch (error) {
              snapshot.errors.push({ provider, symbol: item, family: family.id, message: error.message });
            }
          }
        }
          if (!resolved && items.length > 0) {
            snapshot.errors.push({ provider: family.id, symbol: item, message: `No ${family.id} provider resolved successfully` });
          }
        }
      }
    }

    // 3. Options Families
    for (const family of OPTIONS_MANIFEST) {
      if (targetFamily && targetFamily !== family.id) continue;
      const section = optionsConfig[family.configKey];
      if (!section || !section.enabled) continue;

      const fetcher = family.fetcher || family.fetch;
      const items = section[family.itemsKey];
      if (items) {
       
        const filteredItems = options.symbol 
          ? items.filter(i => i === options.symbol)
          : items;

        for (const item of filteredItems) { console.log('[INGEST] Fetching ' + family.id + ':' + item);
          let resolved = false;
          for (const provider of section.providers) {
            if (!provider) continue;
            try {
              const records = normalizeFetchedRecords(await fetcher(provider, item, null, optionsConfig, options), fetchContext(family.id, provider, item));
              appendRecords(snapshot.sources, records);
              resolved = true;
              break;
            } catch (error) {
              snapshot.errors.push({ provider, symbol: item, family: family.id, message: error.message });
            }
          }
          if (!resolved) {
            snapshot.errors.push({ provider: family.id, symbol: item, message: `No ${family.id} provider resolved successfully` });
          }
        }
      }
    }

    const deduped = dedupePreferredMarketQuotes(snapshot.sources); 
    snapshot.sources = deduped.records;
    snapshot.errors = unresolvedProviderErrors(snapshot.errors, snapshot.sources);
    
   
    const rejectStale = (options.historyDays || options.days || 0) <= 5;
    const qualityFilter = removeRejectedSources(snapshot, rejectStale); 

    snapshot.deduplication = {
      input_records: deduped.input_records,
      output_records: snapshot.sources.length,
      quote_records: deduped.quote_records,
      removed_records: deduped.input_records - snapshot.sources.length,
      policy: 'provider_priority_then_quality',
    };
    snapshot.quality_filter = {
      removed_records: qualityFilter.removed_records,
      stale_records: qualityFilter.stale_records,
      policy: rejectStale ? 'drop_rejected_live_records' : 'preserve_historical_records',
    };

    // --- PRIORITIZED MERGE & PERSISTENCE ---
    const existing = readSnapshot(CACHE_PATH);

    const preservedSnapshot = mergeSnapshots(existing, snapshot);
    const mergedQualityFilter = removeRejectedSources(preservedSnapshot, rejectStale);
    preservedSnapshot.quality_filter = {
      ...preservedSnapshot.quality_filter,
      merged_removed_records: mergedQualityFilter.removed_records,
      merged_stale_records: mergedQualityFilter.stale_records,
      policy: rejectStale ? 'drop_rejected_live_records_after_merge' : 'preserve_historical_records_after_merge',
    };

    if (!targetFamily || targetFamily === 'macro' || targetFamily === 'pmi') {
      try {
        preservedSnapshot.macro_store = await saveMacroObservations(preservedSnapshot.sources);
      } catch (err) {
        preservedSnapshot.macro_store = {
          configured: false,
          skipped: true,
          written: 0,
          records: 0,
          units: {},
          error: err.message,
        };
        console.warn(`[SUPABASE] Macro observation write failed: ${err.message}`);
      }
    } else {
      preservedSnapshot.macro_store = {
        configured: false,
        skipped: true,
        written: 0,
        records: 0,
        units: {},
        reason: 'target_family_filter',
        target_family: targetFamily,
      };
    }

    console.log('[INGEST] Saving to local filesystem cache...');
    await fs.mkdir(path.dirname(CACHE_PATH), { recursive: true });
    const latestSnapshotPath = scopedSnapshot ? SCOPED_CACHE_PATH : CACHE_PATH;
    await fs.writeFile(latestSnapshotPath, JSON.stringify(capSubDailyJsonView(preservedSnapshot), null, 2), 'utf8');

    // Write family-partitioned long-term history (merge with full archive first).
    // JSON gets the sub-daily-capped view (<=30m bars limited to the last
    // FIVE_MIN_JSON_CAP_DAYS); the binary ts-index gets FULL depth and is
    // merge-protected in writeTsIndex so capped-JSON rebuilds cannot truncate it.
    const fullHistory = mergeSnapshots(existingHistory, preservedSnapshot);
    writePartitionedSnapshot(HISTORY_PATH, capSubDailyJsonView(fullHistory));

    // Write per-symbol binary index for fast targeted reads
    writeTsIndex(TS_INDEX_PATH, fullHistory);

    return options.returnAttemptSnapshot ? snapshot : fullHistory;
  } finally {
    // Cleanup if any
  }
}

if (require.main === module) {
  const options = {};
  const daysIdx = process.argv.indexOf('--days');
  if (daysIdx !== -1 && process.argv[daysIdx + 1]) {
    options.historyDays = parseInt(process.argv[daysIdx + 1], 10);
  }
  const familyIdx = process.argv.indexOf('--family');
  if (familyIdx !== -1 && process.argv[familyIdx + 1]) {
    options.family = process.argv[familyIdx + 1];
  }
  const symbolIdx = process.argv.indexOf('--symbol');
  if (symbolIdx !== -1 && process.argv[symbolIdx + 1]) {
    options.symbol = process.argv[symbolIdx + 1];
  }
  const tfIdx = process.argv.indexOf('--timeframe');
  if (tfIdx !== -1 && process.argv[tfIdx + 1]) {
    options.timeframe = process.argv[tfIdx + 1];
  }

  ingestMarketData(options)
    .then((snapshot) => {
      const verbose = process.argv.includes('--full');
      if (verbose) {
        console.log(JSON.stringify(snapshot, null, 2));
        return;
      }

      const sourceCount = snapshot.sources.length;
      const errorCount = snapshot.errors.length;
      const familyCounts = snapshot.sources.reduce((acc, source) => {
        const key = source.family || 'unknown';
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {});

      console.log(JSON.stringify({
        mode: snapshot.mode,
        fetched_at: snapshot.fetched_at,
        sources: sourceCount,
        errors: errorCount,
        families: familyCounts,
        macro_store: snapshot.macro_store ? {
          configured: snapshot.macro_store.configured,
          written: snapshot.macro_store.written,
          skipped: snapshot.macro_store.skipped,
        } : null,
        provider_checks: snapshot.provider_checks.length,
      }, null, 2));
    })
    .catch((error) => {
      console.error(error.stack || error.message);
      process.exitCode = 1;
    });
}

// Timeframes at or below this duration are considered "sub-daily" and require
// native intraday bars — aggregation from 1d base produces only 1 synthetic bar/day.
const INTRADAY_THRESHOLD_MS = 4 * 60 * 60 * 1000; // 4h in ms

// JSON backtest_history.json cap for high-frequency timeframes: full depth lives in
// the binary ts-index only. Cap prevents unbounded JSON bloat (§3b risk).
const FIVE_MIN_JSON_CAP_DAYS = 90;

/**
 * Return a shallow view of `snapshot` whose sub-daily (<=30m) sources are
 * limited to the last FIVE_MIN_JSON_CAP_DAYS. Used for JSON writes only —
 * the binary ts-index must always receive the uncapped snapshot.
 */
function capSubDailyJsonView(snapshot) {
  if (!snapshot || !Array.isArray(snapshot.sources)) return snapshot;
  const capMs = SUPPORTED_INTERVALS['30m'];
  const cutoff = Date.now() - FIVE_MIN_JSON_CAP_DAYS * 24 * 60 * 60 * 1000;
  const capped = [];
  let dropped = 0;
  for (const r of snapshot.sources) {
    const intervalMs = SUPPORTED_INTERVALS[r.timeframe];
    if (intervalMs !== undefined && intervalMs <= capMs && new Date(r.timestamp).getTime() < cutoff) {
      dropped++;
      continue;
    }
    capped.push(r);
  }
  if (dropped === 0) return snapshot;
  return { ...snapshot, sources: capped };
}

async function fetchCryptoSnapshot(provider, symbol, timeframes, family = 'crypto', options = {}) {
  const historyDays = options.historyDays || options.days || 5;
  const startTime = options.startTime || null;
  const endTime = options.endTime || null;

  // Determine if any requested timeframe is sub-daily (requires native intraday bars)
  const subDailyTimeframes = timeframes.filter(tf => {
    const ms = SUPPORTED_INTERVALS[tf];
    return ms !== undefined && ms <= INTRADAY_THRESHOLD_MS;
  });
  const dailyOrAbove = timeframes.filter(tf => {
    const ms = SUPPORTED_INTERVALS[tf];
    return ms !== undefined && ms > INTRADAY_THRESHOLD_MS;
  });

  const output = [];
  const targetStartMs = startTime || (Date.now() - (historyDays * 24 * 60 * 60 * 1000));

  // --- Sub-daily branch: route to native Binance fetch via fetchPaginated ---
  // This produces real intraday bars instead of the 1-bar-per-day aggregation from 1d base.
  // Only for binance/coinbase providers (not coingecko/alpaca which lack 5m intraday depth).
  if (subDailyTimeframes.length > 0 && historyDays > 5 && (provider === 'binance' || provider === 'coinbase')) {
    // Fetch at the finest sub-daily timeframe requested; coarser sub-daily TFs aggregate from it.
    const ORDER = ['5m', '15m', '30m', '1h', '4h'];
    const finestSubDaily = ORDER.find(tf => subDailyTimeframes.includes(tf)) || subDailyTimeframes[0];

    let nativeCandles = null;
    try {
      // fetchPaginated handles chunked pagination (3-day chunks for 5m), sequential, rate-safe.
      nativeCandles = await fetchPaginated(symbol, finestSubDaily, historyDays, 'crypto', fetchBinanceBaseCandles, endTime || null);
    } catch (err) {
      console.warn(`[INGEST] Native ${finestSubDaily} fetch failed for ${symbol} via ${provider}: ${err.message}`);
    }

    if (nativeCandles && nativeCandles.length > 0) {
      // Convert fetchPaginated output {openTime, open, high, low, close, volume} to snapshot record shape
      const nativeBarsForAgg = nativeCandles.map(c => ({
        openTime: c.openTime,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume,
      }));

      for (const tf of subDailyTimeframes) {
        if (!SUPPORTED_INTERVALS[tf]) continue;
        const aggregated = tf === finestSubDaily
          ? nativeCandles.map(c => ({
              family,
              provider,
              symbol,
              timeframe: tf,
              timestamp: new Date(c.openTime).toISOString(),
              open: c.open,
              high: c.high,
              low: c.low,
              close: c.close,
              volume: c.volume,
            }))
          : aggregateCandles(nativeBarsForAgg, tf, symbol, provider, family, { sourceTimeframe: finestSubDaily });

        if (aggregated.length > 0) {
          // No JSON cap here: the snapshot must carry FULL depth so the binary
          // ts-index receives it. The 90-day JSON cap is applied at write time
          // in the save block (capSubDailyJsonView). Plain loop, not push(...):
          // a 5-year 5m fetch is ~526k records and spread args overflow the stack.
          for (const r of aggregated) {
            if (new Date(r.timestamp).getTime() >= targetStartMs) output.push(r);
          }
        }
      }
    }
    // Fall through to daily aggregation for any dailyOrAbove timeframes still needed
  }

  // --- Daily-and-above branch (or sub-daily fallback when native fetch unavailable) ---
  const remainingTimeframes = [
    ...dailyOrAbove,
    // Include sub-daily TFs that weren't handled (e.g., provider is coingecko/alpaca, or native fetch failed)
    ...subDailyTimeframes.filter(tf => !output.some(r => r.timeframe === tf)),
  ];

  if (remainingTimeframes.length === 0) return output;

  let baseCandles = null;

  // Primary Provider Fetch
  if (provider === 'coingecko') {
    baseCandles = await fetchCoinGeckoBaseCandles(symbol, Math.max(historyDays, 365));
  } else {
    let fetchBase = fetchBinanceBaseCandles;
    if (provider === 'coinbase') fetchBase = fetchCoinbaseBaseCandles;
    else if (provider === 'alpaca') fetchBase = fetchAlpacaBaseCandles;

    try {
      const limit = Math.max(100, Math.ceil(historyDays * 1.5));
      baseCandles = await fetchBase(symbol, limit, '1d', startTime, endTime);
    } catch (err) {
      console.warn(`[INGEST] Primary provider ${provider} failed for ${symbol}: ${err.message}. Attempting Yahoo fallback.`);
    }
  }

  // Yahoo Fallback (only if primary failed and history requested)
  if (!baseCandles && historyDays > 5 && (provider === 'binance' || provider === 'coinbase')) {
    const yahooSymbol = COINBASE_PRODUCTS[symbol] || symbol;
    const { base: bestBase, effectiveDays } = selectYahooBase(remainingTimeframes, historyDays);
    try {
      baseCandles = await fetchYahooBaseCandles(yahooSymbol, bestBase, effectiveDays, startTime, endTime);
      console.log(`[INGEST] Using Yahoo fallback for ${symbol} (${bestBase}, ${effectiveDays}d)`);
    } catch (err) {
      console.warn(`[INGEST] Yahoo fallback failed for ${symbol}: ${err.message}`);
    }
  }

  if (!baseCandles) {
    if (output.length > 0) {
      // Sub-daily succeeded; daily base failed — not fatal if caller only needs sub-daily
      console.warn(`[INGEST] Daily base fetch failed for ${symbol} via ${provider}; returning sub-daily results only`);
      return output;
    }
    throw new Error(`Failed to fetch crypto data for ${symbol} via ${provider} or fallbacks`);
  }

  for (const timeframe of remainingTimeframes) {
    if (!SUPPORTED_INTERVALS[timeframe]) {
      throw new Error(`Unsupported crypto timeframe: ${timeframe}`);
    }
    const aggregated = aggregateCandles(baseCandles, timeframe, symbol, provider, family, { sourceTimeframe: '1d' });
    if (aggregated.length > 0) {
      const filtered = aggregated.filter(r => new Date(r.timestamp).getTime() >= targetStartMs);
      if (historyDays > 5) {
        appendRecords(output, filtered);
      } else if (filtered.length > 0) {
        output.push({
          ...filtered[filtered.length - 1],
          family,
        });
      }
    }
  }

  return output;
}

async function loadConfig() {
  return loadMarketConfig(CONFIG_PATH);
}

module.exports = {
  ingestMarketData,
  loadConfig,
  loadOptionsConfig,
  collectIngestSkipChecks,
  loadExternalQuoteInputs,
  fetchNasaPowerWeather,
  fetchOpenSkyRegion,
  openSkyRegions,
  fetchBlockchairStats,
  fetchBlockchairOnchain,
  fetchAlternativeMeFearGreed,
  fetchSecHoldingsSnapshot,
  fetchWorldBankLatest,
  fetchKalshiPredictionEvent,
  fetchKalshiHistoricalMarkets,
  fetchKalshiHistoricalCandlesticks,
  fetchKalshiPredictionMarket,
  fetchPolymarketMarkets,
  fetchPolymarketPriceHistory,
  fetchPolymarketHistoricalPrices,
  parsePolymarketTokenIds,
  polymarketMarketRecord,
  polymarketPriceHistoryRecords,
  fetchPredictionInterestSignal,
  fetchGoogleCustomSearchInterest,
  fetchYahooBreadthProxy,
  fetchYahooBaseCandles,
  fetchPaginated,
  fetchParallelBackfill,
  fetchStooqDailyHistory,
  fetchBinanceBaseCandles,
  fetchCoinbaseBaseCandles,
  fetchFrankfurterFx,
  fetchEcbFx,
  fetchSpGlobalFlashPmi,
  fetchFredLatest,
  redactUrl,
  polymarketTimeframeFromOptions,
  aggregateCandles,
  dedupePreferredMarketQuotes,
  loadExternalQuoteInputs,
  loadExternalQuoteProvider,
  parseCsvTable,
  parseStooqCsv,
  unresolvedProviderErrors,
  fetchCryptoSnapshot,
  capSubDailyJsonView,
  fetchEquityOrIndexSnapshot,
  fetchCommoditySnapshot,
  fetchYahooOptionsSnapshot,
  resolveEquityOrIndexSymbol,
  resolveStooqSymbol,
  resolveCommoditySymbol,
  resolveFredSeries,
  resolveWorldBankIndicator,
  appendRecords,
};

