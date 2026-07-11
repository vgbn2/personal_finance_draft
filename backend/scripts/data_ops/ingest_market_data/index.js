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

const { isFresh, readCoverage } = require('../../../../shared/lib/market/coverage');

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
const OHLCV_INGEST_FAMILIES = new Set(['crypto', 'equities', 'indices', 'commodities', 'fx']);
const FAMILY_BASE_TF_MAP = { crypto: '1m', equities: '1m', indices: '5m', commodities: '5m', fx: '5m' };

function buildDryRunFamilyPlan(manifest, config, targetFamily, options, kind) {
  const families = [];
  let plannedFetches = 0;

  for (const family of manifest) {
    if (targetFamily && targetFamily !== family.id) continue;
    const section = config[family.configKey];
    if (!section || !section.enabled) continue;

    const configuredItems = family.itemsKey ? section[family.itemsKey] : ['fear_and_greed'];
    const items = Array.isArray(configuredItems) ? configuredItems : [];
    const filteredItems = options.symbol ? items.filter((item) => item === options.symbol) : items;
    const timeframes = options.timeframe ? [options.timeframe] : (section.timeframes || ['1d']);
    const providers = Array.isArray(section.providers) ? section.providers.filter(Boolean) : [];
    const fetchCount = filteredItems.length * Math.max(timeframes.length, 1) * Math.max(providers.length, 1);

    plannedFetches += fetchCount;
    families.push({
      family: family.id,
      kind,
      config_key: family.configKey,
      enabled: true,
      providers,
      item_count: filteredItems.length,
      timeframes,
      planned_fetches: fetchCount,
      target_symbol: options.symbol || null,
    });
  }

  return { families, plannedFetches };
}

function buildIngestDryRunPlan(config, optionsConfig, targetFamily, options) {
  const market = buildDryRunFamilyPlan(FAMILIES_MANIFEST, config, targetFamily, options, 'market');
  const optionsFamilies = buildDryRunFamilyPlan(OPTIONS_MANIFEST, optionsConfig, targetFamily, options, 'options');
  return {
    target_family: targetFamily,
    target_symbol: options.symbol || null,
    target_timeframe: options.timeframe || null,
    requested_days: Number(options.historyDays || options.days || 0) || null,
    planned_fetches: market.plannedFetches + optionsFamilies.plannedFetches,
    families: [...market.families, ...optionsFamilies.families],
  };
}

const {
  SUPPORTED_INTERVALS,
  parseTimeframeMs,
  bucketStartFor,
  YAHOO_MAX_DAYS,
  selectYahooBase,
  COINBASE_PRODUCTS,
  COINBASE_GRANULARITY,
  YAHOO_INDEX_SYMBOLS,
  YAHOO_COMMODITY_SYMBOLS,
  YAHOO_COMMODITY_REVERSE,
  YAHOO_FX_SYMBOLS,
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

const { aggregateCandles } = require('./candle_utils');

const {
  parseStooqCsv,
  resolveStooqSymbol,
  fetchStooqDailyHistory,
  resolveCommoditySymbol,
  fetchEquityOrIndexSnapshot,
  fetchCommoditySnapshot,
  fetchFxSnapshot,
  fetchCryptoSnapshot,
} = require('./snapshot_fetchers.js');

const {
  fetchPredictionInterestSignal,
  fetchGoogleCustomSearchInterest,
  fetchKalshiPredictionMarket,
  fetchPolymarketMarkets,
  fetchPolymarketPriceHistory,
  fetchPolymarketHistoricalPrices,
  parsePolymarketTokenIds,
  polymarketMarketRecord,
  polymarketPriceHistoryRecords,
  polymarketTimeframeFromOptions,
} = require('./providers/prediction.js');

const {
  fetchOpenSkyRegion,
  fetchBlockchairStats,
  fetchBlockchairOnchain,
  fetchSecHoldingsSnapshot,
  fetchSpGlobalFlashPmi,
  fetchEcbFx,
  fetchFxApiFx,
  fetchYahooBreadthProxy,
  fetchKalshiHistoricalMarkets,
  fetchKalshiHistoricalCandlesticks,
  FAMILIES_MANIFEST,
  OPTIONS_MANIFEST,
} = require('./manifests.js');

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
    const dryRun = Boolean(options.dryRun);
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
      mode: dryRun ? 'dry_run' : (requestedDays > 5 ? 'provider_history' : 'live'),
      dry_run: dryRun,
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

    if (dryRun) {
      snapshot.dry_run_plan = buildIngestDryRunPlan(config, optionsConfig, targetFamily, options);
      snapshot.provider_checks.push({
        status: 'skipped',
        reason: 'dry_run',
        planned_fetches: snapshot.dry_run_plan.planned_fetches,
      });
      return snapshot;
    }

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

          // ts/bin gate: binary bins are the authoritative store and are more
          // accurate than the snapshot-based check below (snapshot only covers
          // JSON-ingested data, not symbols backfilled via crypto/equity-deep-backfill).
          // Skip the provider loop entirely for bulk ingest only when the bin for the
          // REQUESTED timeframe is BOTH fresh AND already covers the requested history
          // depth. Gating on the requested TF (not the family base) is what lets an
          // explicit deep `--timeframe 1d --history-days N` request through even when the
          // base (5m/1m) bin is fresh. Single-symbol calls always fall through; force
          // bypasses entirely (skipItem already false).
          if (skipItem && filteredItems.length > 1 && OHLCV_INGEST_FAMILIES.has(family.id)) {
            const gateTf = syncTimeframes[0] || FAMILY_BASE_TF_MAP[family.id] || '1d';
            try {
              const binGate = isFresh(TS_INDEX_PATH, item, gateTf, family.id, now);
              const cov = readCoverage(TS_INDEX_PATH, item, gateTf);
              const coversDepth = cov && cov.exists && Number.isFinite(cov.firstBarMs)
                && cov.firstBarMs <= targetStart;
              if (binGate.fresh && coversDepth) continue; // fresh AND deep enough — skip
              skipItem = false;            // stale or too shallow — fetch
            } catch (_) {
              skipItem = false;            // on error, fall through to provider
            }
          }

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
              if (!global.suppressLogs) console.log(`[INGEST] ${family.id}:${item} identifies forward gap. Fetching from ${new Date(fetchOptions.startTime).toISOString()} to fill.`);
          }

          if (!global.suppressLogs) console.log('[INGEST] Fetching ' + family.id + ':' + item);
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

        for (const item of filteredItems) { if (!global.suppressLogs) console.log('[INGEST] Fetching ' + family.id + ':' + item);
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

    if (!global.suppressLogs) console.log('[INGEST] Saving to local filesystem cache...');
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
  fetchFxSnapshot,
  fetchYahooOptionsSnapshot,
  resolveEquityOrIndexSymbol,
  resolveStooqSymbol,
  resolveCommoditySymbol,
  resolveFredSeries,
  resolveWorldBankIndicator,
  appendRecords,
};
