const fs = require('node:fs/promises');
const path = require('node:path');
const zlib = require('node:zlib');
const crypto = require('node:crypto');

require('../../../shared/lib/env');

const {
  DEFAULT_PROVIDER_PRIORITY,
  normalizeExternalQuotePayload,
  normalizeExternalQuotePayloadWithReport,
  selectPreferredQuoteRecords,
} = require('../../../shared/lib/quote_router');
const {
  readSnapshot,
  recordKey,
  validateSnapshot,
  mergeSnapshots,
} = require('../../../shared/lib/market_validation');

const {
  saveMacroObservations,
} = require('../../../shared/lib/macro_store');

const {
  fetchBinanceBaseCandles,
  fetchYahooBaseCandles,
  fetchCoinbaseBaseCandles,
  fetchFrankfurterFx,
  fetchFredLatest,
  fetchFredHistory,
  fetchWorldBankLatest,
  fetchWorldBankHistory,
  fetchKalshiPredictionEvent,
  fetchAlternativeMeFearGreed,
  fetchNasaPowerWeather,
  fetchAlpacaBaseCandles,
  cachedFetch,
  fetchJson,
  REPO_ROOT,
  API_CACHE_DIR
} = require('../../../shared/lib/providers');

const { fetchPaginated, fetchParallelBackfill, BARS_PER_DAY } = require('../../../shared/lib/backfill');

const CONFIG_PATH = path.join(REPO_ROOT, 'config', 'data_sources.yaml');
const OPTIONS_CONFIG_PATH = path.join(REPO_ROOT, 'config', 'options_data.yaml');
const CACHE_PATH = path.join(REPO_ROOT, 'data', 'cache', 'last_fetch.json');

const SUPPORTED_INTERVALS = {
  '5m': 5 * 60 * 1000,
  '15m': 15 * 60 * 1000,
  '30m': 30 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '4h': 4 * 60 * 60 * 1000,
  '1d': 24 * 60 * 60 * 1000,
};

const COINBASE_PRODUCTS = {
  BTCUSDT: 'BTC-USD',
  ETHUSDT: 'ETH-USD',
  BNBUSDT: 'BNB-USD',
  SOLUSDT: 'SOL-USD',
  XRPUSDT: 'XRP-USD',
  DOGEUSDT: 'DOGE-USD',
  SUIUSDT: 'SUI-USD',
  ADAUSDT: 'ADA-USD',
};

const COINBASE_GRANULARITY = {
  '1m': 60,
  '5m': 300,
  '15m': 900,
  '30m': 1800,
  '1h': 3600,
  '4h': 14400,
  '1d': 86400,
};

const YAHOO_INDEX_SYMBOLS = {
  SPX: '^GSPC',
  NDX: '^NDX',
  DJI: '^DJI',
  VIX: '^VIX',
};

const YAHOO_COMMODITY_SYMBOLS = {
  XAUUSD: 'GC=F',
  XAGUSD: 'SI=F',
  XCUUSD: 'HG=F',
  USOIL: 'CL=F',
};

const STOOQ_EQUITY_SUFFIX = '.us';
const STOOQ_INDEX_SYMBOLS = {
  SPX: '^spx',
  NDX: '^ndq',
  DJI: '^dji',
  VIX: '^vix',
};
const STOOQ_COMMODITY_SYMBOLS = {
  XAUUSD: 'xauusd',
  XAGUSD: 'xagusd',
  XCUUSD: 'xcuusd',
  USOIL: 'usoil',
};
//adopt alpaca api as well
const SPGLOBAL_FLASH_PMI_URL = 'https://www.pmi.spglobal.com/Public/Release/PressReleases?language=en';
const KALSHI_API_BASE = 'https://external-api.kalshi.com/trade-api/v2';
const POLYMARKET_GAMMA_BASE = 'https://gamma-api.polymarket.com';
const POLYMARKET_CLOB_BASE = 'https://clob.polymarket.com';
const OPEN_SKY_TOKEN_URL = 'https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token';
const WEATHER_LOCATION_COORDS = {
  us_gulf: { latitude: 29.7604, longitude: -95.3698 },
  us_midwest: { latitude: 41.8781, longitude: -87.6298 },
  europe_central: { latitude: 51.9244, longitude: 4.4777 },
  us_west: { latitude: 34.0522, longitude: -118.2437 },
};

const OPEN_SKY_REGIONS = {
  us_gulf: { lamin: 24.0, lomin: -98.0, lamax: 31.5, lomax: -80.0 },
  us_midwest: { lamin: 35.0, lomin: -104.0, lamax: 49.0, lomax: -82.0 },
  europe_central: { lamin: 45.0, lomin: 5.0, lamax: 55.0, lomax: 20.0 },
};

function openSkyRegions() {
  return { ...OPEN_SKY_REGIONS };
}

const KALSHI_EVENT_KEYWORDS = {
  fed_rate_cut_prob: ['fed', 'rate', 'cut'],
  us_recession_prob: ['recession'],
  inflation_above_target: ['inflation', 'cpi'],
  risk_off_spike: ['vix', 'volatility', 'recession', 'crash'],
};

const POLYMARKET_EVENT_KEYWORDS = {
  fed_rate_cut_prob: ['fed', 'rate', 'cut'],
  us_recession_prob: ['recession'],
  inflation_above_target: ['inflation', 'cpi'],
  risk_off_spike: ['vix', 'volatility', 'crash'],
};

function parseYamlList(raw) {
  const match = raw.match(/\[(.*)\]/);
  if (!match) {
    return [];
  }

  return match[1]
    .split(',')
    .map((item) => item.trim().replace(/^"|"$/g, ''))
    .filter(Boolean);
}

async function loadConfig() {
  const content = await fs.readFile(CONFIG_PATH, 'utf8');
  const lines = content.split(/\r?\n/);
  const config = {};
  const families = [
    'equities', 'indices', 'commodities', 'fx', 'quote_feeds', 'crypto',
    'pmi', 'macro', 'macro_alt', 'breadth', 'sentiment', 'onchain',
    'prediction_market', 'weather', 'flight', 'crypto_tx', 'satellite_nrt',
    'cargo', 'holdings', 'reserves'
  ];

  families.forEach(f => {
    config[f] = { enabled: false, providers: [], symbols: [], timeframes: [] };
  });
  config.fred_mappings = {};
  config.world_bank_mappings = {};
  config.prediction_market_keywords = {};

  let currentSection = null;
  let currentMappingRoot = null;
  let currentMappingSection = null;

  for (const line of lines) {
    const indent = line.match(/^\s*/)[0].length;
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    if (indent === 0 && trimmed === 'fred_mappings:') {
      currentSection = null;
      currentMappingRoot = 'fred_mappings';
      currentMappingSection = null;
      continue;
    }

    if (indent === 0 && trimmed === 'world_bank_mappings:') {
      currentSection = null;
      currentMappingRoot = 'world_bank_mappings';
      currentMappingSection = null;
      continue;
    }

    if (indent === 0 && trimmed === 'prediction_market_keywords:') {
      currentSection = null;
      currentMappingRoot = 'prediction_market_keywords';
      currentMappingSection = null;
      continue;
    }

    if (currentMappingRoot === 'fred_mappings' && indent === 2 && trimmed.endsWith(':')) {
      currentMappingSection = trimmed.slice(0, -1);
      config.fred_mappings[currentMappingSection] = config.fred_mappings[currentMappingSection] || {};
      continue;
    }

    if (currentMappingRoot === 'fred_mappings' && currentMappingSection && indent === 4) {
      const [key, ...valParts] = trimmed.split(':');
      const val = valParts.join(':').trim().replace(/^"|"$/g, '');
      config.fred_mappings[currentMappingSection][key] = val;
      continue;
    }

    if (currentMappingRoot === 'world_bank_mappings' && indent === 2) {
      const [key, ...valParts] = trimmed.split(':');
      const val = valParts.join(':').trim().replace(/^"|"$/g, '');
      config.world_bank_mappings[key] = val;
      continue;
    }

    if (currentMappingRoot === 'prediction_market_keywords' && indent === 2) {
      const [key, ...valParts] = trimmed.split(':');
      const val = valParts.join(':').trim();
      config.prediction_market_keywords[key] = val.startsWith('[') ? parseYamlList(val) : [val.replace(/^"|"$/g, '')];
      continue;
    }

    if (indent === 0 && trimmed.endsWith(':') && trimmed !== 'sources:') {
      currentMappingRoot = null;
      currentMappingSection = null;
    }

    if (indent === 2 && trimmed.endsWith(':')) {
      const sectionName = trimmed.slice(0, -1);
      if (families.includes(sectionName)) {
        currentSection = sectionName;
      } else {
        currentSection = null;
      }
      continue;
    }

    if (currentSection && indent === 4) {
      const [key, ...valParts] = trimmed.split(':');
      const val = valParts.join(':').trim();
      
      if (key === 'enabled') {
        config[currentSection].enabled = val === 'true';
      } else if (key === 'provider' || key === 'providers') {
        config[currentSection].providers = val.startsWith('[') ? parseYamlList(val) : [val];
      } else {
        // Generic handling for symbols, timeframes, series, metrics, etc.
        config[currentSection][key] = val.startsWith('[') ? parseYamlList(val) : [val];
      }
    }
  }

  return config;
}

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

function aggregateCandles(candles, interval, symbol, provider, family = "unknown") {
  const intervalMs = SUPPORTED_INTERVALS[interval];
  if (!intervalMs) {
    throw new Error(`Unsupported timeframe: ${interval}`);
  }

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
        source: `${provider}-rollup`,
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
    output.records.push(...result.records);
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
  const historyDays = options.historyDays || options.days || 5;
  let baseCandles = null;
  if (provider === 'stooq') {
    const stooqSymbol = resolveStooqSymbol(family, symbol);
    if (!stooqSymbol) {
      throw new Error(`No stooq symbol mapping for ${symbol}`);
    }
    baseCandles = await fetchStooqDailyHistory(stooqSymbol);
  } else {
    const providerSymbol = resolveEquityOrIndexSymbol(family, symbol, provider);
    if (!providerSymbol) {
      throw new Error(`No ${provider} symbol mapping for ${symbol}`);
    }
    // [gemini-work] Force 1d for long history to avoid Yahoo 422
    const bestBase = (historyDays > 730 || !timeframes.includes("1h")) ? "1d" : "1h"; 
    baseCandles = await fetchYahooBaseCandles(providerSymbol, bestBase, historyDays);
  }
  const output = [];

  for (const timeframe of timeframes) {
    if (!SUPPORTED_INTERVALS[timeframe]) {
      throw new Error(`Unsupported derived timeframe: ${timeframe}`);
    }
    const aggregated = aggregateCandles(baseCandles, timeframe, symbol, provider, family); 
    if (aggregated.length > 0) {
      if (historyDays > 5) {
        // [gemini-work] Return full history for backfills
        output.push(...aggregated);
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
  const historyDays = options.historyDays || options.days || 5;
  let baseCandles = null;
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
    // [gemini-work] Force 1d for long history
    const bestBase = (historyDays > 730 || !timeframes.includes("1h")) ? "1d" : "1h"; 
    baseCandles = await fetchYahooBaseCandles(providerSymbol, bestBase, historyDays);
  }
  const output = [];

  for (const timeframe of timeframes) {
    if (!SUPPORTED_INTERVALS[timeframe]) {
      throw new Error(`Unsupported derived timeframe: ${timeframe}`);
    }
    const aggregated = aggregateCandles(baseCandles, timeframe, symbol, provider, family); 
    if (aggregated.length > 0) {
      if (historyDays > 5) {
        // [gemini-work] Return full history
        output.push(...aggregated);
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
  return mappings[eventName] || KALSHI_EVENT_KEYWORDS[eventName] || [String(eventName || '').replace(/_/g, ' ')];
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
async function fetchPolymarketMarkets() { return []; }
async function fetchPolymarketPriceHistory() { return []; }
async function fetchPolymarketHistoricalPrices() { return []; }

const FAMILIES_MANIFEST = [
  { id: 'equities', configKey: 'equities', itemsKey: 'symbols', fetcher: (p, s, t, cfg, opts) => fetchEquityOrIndexSnapshot('equities', p, s, t, cfg, opts) },
  { id: 'indices', configKey: 'indices', itemsKey: 'symbols', fetcher: async (p, s, t, cfg, opts) => {
      if (p === 'fred') {
        const id = resolveFredSeries('indices', s, cfg);
        if (!id) throw new Error(`No FRED series mapping for ${s}`);
        return [{ ...await fetchFredLatest(id), family: 'indices', symbol: s }];
      }
      return fetchEquityOrIndexSnapshot('indices', p, s, t, cfg, opts);
    } 
  },
  { id: 'commodities', configKey: 'commodities', itemsKey: 'symbols', fetcher: (p, s, t, cfg, opts) => fetchCommoditySnapshot('commodities', p, s, t, cfg, opts) },
  { id: 'fx', configKey: 'fx', itemsKey: 'symbols', fetcher: async (p, s, t, cfg, opts) => {
      if (p === 'frankfurter') return [await fetchFrankfurterFx(s)];
      if (p === 'fxapi') return [await fetchFxApiFx(s)];
      return [await fetchEcbFx(s)];
    }
  },
  { id: 'crypto', configKey: 'crypto', itemsKey: 'symbols', fetcher: (p, s, t, cfg, opts) => fetchCryptoSnapshot(p, s, t, 'crypto', opts) },
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
  { id: 'prediction_market', configKey: 'prediction_market', itemsKey: 'events', fetcher: async (p, s, t, cfg) => {
      const record = await fetchKalshiPredictionMarket(s, cfg);
      return record ? [record] : [];
    }
  },
];

const OPTIONS_MANIFEST = [
  { id: 'equities_options', configKey: 'equities_options', itemsKey: 'underlyings', fetcher: (p, s, t, cfg) => fetchYahooOptionsSnapshot('equities_options', p, s) },
  { id: 'stock_options', configKey: 'stock_options', itemsKey: 'underlyings', fetcher: (p, s, t, cfg) => fetchYahooOptionsSnapshot('stock_options', p, s) },
];

async function ingestMarketData(options = {}) {
  try {
    const targetFamily = options.family || null;
    const config = await loadConfig();
    const optionsConfig = await loadOptionsConfig();
    const snapshot = {
      mode: 'live',
      fetched_at: new Date().toISOString(),
      sources: [],
      errors: [],
      provider_checks: collectIngestSkipChecks(config, optionsConfig, targetFamily),
    };

    // 1. External Quote Feeds
    if (!targetFamily || targetFamily === 'fx' || targetFamily === 'quote_feeds') {
      const externalQuotes = await loadExternalQuoteInputs(config);
      snapshot.sources.push(...externalQuotes.records);
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
      if (items && items[0] && options.historyDays <= 5) { // [gemini-work] Skip smoke tests for heavy backfills
        const sampleItem = items[0];
        for (const provider of section.providers) {
          if (!provider) continue;
          try {
            normalizeFetchedRecords(await fetcher(provider, sampleItem, section.timeframes || ['1d'], config, options), fetchContext(family.id, provider, sampleItem));
            snapshot.provider_checks.push({ family: family.id, provider, symbol: sampleItem, status: 'ok' });
          } catch (error) {
            snapshot.provider_checks.push({ family: family.id, provider, symbol: sampleItem, status: 'error', message: error.message });
          }
        }
      }

      // B. Full Data Sync
      if (items) {
        // [gemini-work] Filter items if symbol option is provided
        const filteredItems = options.symbol 
          ? items.filter(i => i === options.symbol)
          : items;

        const syncTimeframes = options.timeframe ? [options.timeframe] : (section.timeframes || ['1d']);

        for (const item of filteredItems) { console.log('[INGEST] Fetching ' + family.id + ':' + item);
          let resolved = false;
          for (const provider of section.providers) {
            if (!provider) continue;
            try {
              const records = normalizeFetchedRecords(await fetcher(provider, item, syncTimeframes, config, options), fetchContext(family.id, provider, item));
              snapshot.sources.push(...records); 
              resolved = true;
              break;
            } catch (error) {
              snapshot.errors.push({ provider, symbol: item, family: family.id, message: error.message });
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
        // [gemini-work] Filter items if symbol option is provided
        const filteredItems = options.symbol 
          ? items.filter(i => i === options.symbol)
          : items;

        for (const item of filteredItems) { console.log('[INGEST] Fetching ' + family.id + ':' + item);
          let resolved = false;
          for (const provider of section.providers) {
            if (!provider) continue;
            try {
              const records = normalizeFetchedRecords(await fetcher(provider, item, null, optionsConfig, options), fetchContext(family.id, provider, item));
              snapshot.sources.push(...records); 
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
    
    // [gemini-work] Disable stale rejection for backfills
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

    console.log('[INGEST] Saving to local filesystem cache...');
    await fs.mkdir(path.dirname(CACHE_PATH), { recursive: true });
    await fs.writeFile(CACHE_PATH, JSON.stringify(preservedSnapshot, null, 2), 'utf8');

    return preservedSnapshot;
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

async function fetchCryptoSnapshot(provider, symbol, timeframes, family = 'crypto', options = {}) {
  const historyDays = options.historyDays || options.days || 5;
  let baseCandles = null;

  if (historyDays > 5 && (provider === 'binance' || provider === 'coinbase')) {
    // [gemini-work] Use Yahoo for long-term crypto history if requested
    const yahooSymbol = COINBASE_PRODUCTS[symbol] || symbol;
    // [gemini-work] Force 1d for long history to avoid Yahoo 422
    const bestBase = (historyDays > 730 || !timeframes.includes("1h")) ? "1d" : "1h"; 
    try {
      baseCandles = await fetchYahooBaseCandles(yahooSymbol, bestBase, historyDays);
      console.log(`[INGEST] Using Yahoo for ${symbol} long-term history (${historyDays} days) at ${bestBase} interval`);
    } catch (err) {
      console.warn(`[INGEST] Yahoo fallback failed for ${symbol}: ${err.message}`);
    }
  }

  if (!baseCandles) {
    let fetchBase = fetchBinanceBaseCandles;
    if (provider === 'coinbase') fetchBase = fetchCoinbaseBaseCandles;
    else if (provider === 'alpaca') fetchBase = fetchAlpacaBaseCandles;
    baseCandles = await fetchBase(symbol);
  }
  const output = [];

  for (const timeframe of timeframes) {
    if (!SUPPORTED_INTERVALS[timeframe]) {
      throw new Error(`Unsupported crypto timeframe: ${timeframe}`);
    }
    const aggregated = aggregateCandles(baseCandles, timeframe, symbol, provider, family); 
    if (aggregated.length > 0) {
      if (historyDays > 5) {
        // [gemini-work] Return full history
        output.push(...aggregated);
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
  fetchEquityOrIndexSnapshot,
  fetchCommoditySnapshot,
  fetchYahooOptionsSnapshot,
  resolveEquityOrIndexSymbol,
  resolveStooqSymbol,
  resolveCommoditySymbol,
  resolveFredSeries,
  resolveWorldBankIndicator,
};

