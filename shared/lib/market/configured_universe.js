'use strict';

const {
  YAHOO_INDEX_SYMBOLS,
  YAHOO_COMMODITY_SYMBOLS,
  YAHOO_FX_SYMBOLS,
} = require('./provider_symbols.js');

const PRICE_BEARING_FAMILIES = Object.freeze([
  'crypto',
  'equities',
  'indices',
  'commodities',
  'fx',
  'prediction_market',
]);

const CANONICAL_MARKET_FAMILIES = Object.freeze([
  'crypto',
  'equities',
  'indices',
  'commodities',
  'fx',
  'macro',
  'prediction_market',
]);
const FAMILY_BASE_TIMEFRAME = Object.freeze({
  crypto: '1m',
  equities: '1m',
  indices: '5m',
  commodities: '5m',
  fx: '5m',
  prediction_market: '1h',
});
const FAMILY_PROVIDER = Object.freeze({
  crypto: 'binance',
  equities: 'alpaca',
  indices: 'yahoo',
  commodities: 'yahoo',
  fx: 'yahoo',
  prediction_market: 'polymarket',
});
const FAMILY_MARKET = Object.freeze({
  crypto: 'GLOBAL',
  fx: 'GLOBAL',
  prediction_market: 'GLOBAL',
});
const FAMILY_VALUE_KIND = Object.freeze({
  crypto: 'latest_price',
  equities: 'latest_price',
  indices: 'index_level',
  commodities: 'latest_price',
  fx: 'exchange_rate',
  prediction_market: 'probability_price',
});
const YAHOO_MAPS = Object.freeze({
  indices: YAHOO_INDEX_SYMBOLS,
  commodities: YAHOO_COMMODITY_SYMBOLS,
  fx: YAHOO_FX_SYMBOLS,
});
const NON_PRICE_AXES = Object.freeze({
  pmi: ['series'],
  macro: ['series'],
  macro_alt: ['series'],
  breadth: ['metrics'],
  sentiment: ['fields'],
  onchain: ['chains', 'metrics'],
  crypto_tx: ['chains', 'metrics'],
  weather: ['locations', 'metrics'],
  flight: ['regions', 'metrics'],
  holdings: ['symbols', 'metrics'],
  reserves: ['countries', 'metrics'],
  satellite_nrt: ['areas', 'metrics'],
  cargo: ['regions', 'metrics'],
});
const SAFE_SYMBOL = /^[A-Z0-9][A-Z0-9._-]{0,31}$/;

function normalizedList(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeSymbol(value) {
  const symbol = String(value == null ? '' : value).trim().toUpperCase();
  return SAFE_SYMBOL.test(symbol) ? symbol : null;
}

function visitEquitySymbols(section = {}, visitor) {
  for (const rawSymbol of normalizedList(section.symbols)) visitor(rawSymbol, null);
  const grid = section.universe_matrix?.grid;
  if (!grid || typeof grid !== 'object' || Array.isArray(grid)) return;
  for (const [market, sectors] of Object.entries(grid)) {
    if (!sectors || typeof sectors !== 'object' || Array.isArray(sectors)) continue;
    for (const symbols of Object.values(sectors)) {
      for (const rawSymbol of normalizedList(symbols)) visitor(rawSymbol, market);
    }
  }
}

function parseEquitySection(section = {}) {
  const entries = new Map();
  const invalidSymbols = new Set();
  visitEquitySymbols(section, (rawSymbol, market) => {
    const symbol = normalizeSymbol(rawSymbol);
    if (!symbol) {
      invalidSymbols.add(String(rawSymbol));
      return;
    }
    if (!entries.has(symbol)) entries.set(symbol, { symbol, markets: new Set() });
    if (market) entries.get(symbol).markets.add(String(market).trim().toUpperCase());
  });

  return {
    entries: [...entries.values()].map(({ symbol, markets }) => ({
      symbol,
      market: markets.size === 1 ? [...markets][0] : null,
      market_conflict: markets.size > 1 ? [...markets].sort() : null,
    })),
    invalidSymbols: [...invalidSymbols],
  };
}

function equityUniverseEntries(section = {}) {
  return parseEquitySection(section).entries;
}

function invalidEquitySymbols(section = {}) {
  return parseEquitySection(section).invalidSymbols;
}

function alpacaEquity5mSkipReason(entry) {
  if (entry.market_conflict) {
    return `symbol is assigned to multiple markets: ${entry.market_conflict.join(',')}`;
  }
  const market = entry.market ? String(entry.market).toUpperCase() : null;
  if (market && market !== 'USA') {
    return `market ${market} is not covered by Alpaca US equity 1m backfill`;
  }
  if (!SAFE_SYMBOL.test(entry.symbol)) {
    return 'symbol format is not a supported canonical market identifier';
  }
  return null;
}

function currencyOrUnit(family, symbol, market) {
  if (family === 'indices') return 'points';
  if (family === 'fx' && /^[A-Z]{6}$/.test(symbol)) return symbol.slice(3);
  if (family === 'crypto' && symbol.endsWith('USDT')) return 'USDT';
  if (family === 'equities' && market === 'USA') return 'USD';
  if (family === 'commodities') return 'USD';
  return null;
}

function scheduleBasis(family, market) {
  if (family === 'crypto') return 'continuous_24_7';
  if (family === 'equities' && market === 'USA') {
    return 'nyse_regular_weekdays_no_holiday_calendar';
  }
  return 'calendar_unknown';
}

function instrumentRow(family, symbol, market = null) {
  return {
    instrument_id: `${family}:${symbol}`,
    symbol,
    display_name: symbol,
    family,
    market: market || FAMILY_MARKET[family] || null,
    base_timeframe: FAMILY_BASE_TIMEFRAME[family],
    value_kind: FAMILY_VALUE_KIND[family],
    currency_or_unit: currencyOrUnit(family, symbol, market),
    configured_provider: FAMILY_PROVIDER[family],
    schedule_basis: scheduleBasis(family, market),
  };
}

function countConfiguredCoordinates(section, axes) {
  let count = 1;
  for (const axis of axes) {
    const values = normalizedList(section?.[axis]);
    if (values.length === 0) return 0;
    count *= new Set(values.map((value) => String(value))).size;
  }
  return count;
}

function resolveConfiguredMarketUniverse(config = {}) {
  const instruments = [];
  const exclusions = [];
  let notPriceBearingTotal = 0;

  for (const family of PRICE_BEARING_FAMILIES) {
    const section = config[family];
    if (!section || section.enabled === false) continue;
    if (family === 'equities') {
      const { entries, invalidSymbols } = parseEquitySection(section);
      for (const symbol of invalidSymbols) {
        exclusions.push({
          family,
          symbol,
          price_bearing: true,
          reason: 'unsafe_or_malformed_symbol',
        });
      }
      for (const entry of entries) {
        const reason = alpacaEquity5mSkipReason(entry);
        if (reason) {
          exclusions.push({
            family,
            symbol: entry.symbol,
            price_bearing: true,
            reason: entry.market_conflict ? 'ambiguous_market_configuration' : 'unsupported_writer_market',
            detail: reason,
          });
        } else {
          instruments.push(instrumentRow(family, entry.symbol, entry.market));
        }
      }
      continue;
    }

    const seen = new Set();
    const rawList = family === 'prediction_market'
      ? (section.events || section.symbols || [])
      : normalizedList(section.symbols);
    for (const rawSymbol of normalizedList(rawList)) {
      const symbol = normalizeSymbol(rawSymbol);
      if (!symbol) {
        exclusions.push({
          family,
          symbol: String(rawSymbol),
          price_bearing: true,
          reason: 'unsafe_or_malformed_symbol',
        });
        continue;
      }
      if (seen.has(symbol)) continue;
      seen.add(symbol);
      if (YAHOO_MAPS[family] && !YAHOO_MAPS[family][symbol]) {
        exclusions.push({
          family,
          symbol,
          price_bearing: true,
          reason: 'missing_provider_symbol_mapping',
        });
        continue;
      }
      instruments.push(instrumentRow(family, symbol));
    }
  }

  for (const [family, axes] of Object.entries(NON_PRICE_AXES)) {
    const section = config[family];
    if (!section || section.enabled === false) continue;
    const count = countConfiguredCoordinates(section, axes);
    notPriceBearingTotal += count;
    if (count > 0) {
      exclusions.push({
        family,
        price_bearing: false,
        reason: 'not_price_bearing',
        configured_items: count,
      });
    }
  }

  const unique = new Map();
  for (const instrument of instruments) unique.set(instrument.instrument_id, instrument);
  const ordered = [...unique.values()].sort((left, right) => (
    PRICE_BEARING_FAMILIES.indexOf(left.family) - PRICE_BEARING_FAMILIES.indexOf(right.family)
    || left.symbol.localeCompare(right.symbol)
  ));
  const priceExclusions = exclusions.filter((entry) => entry.price_bearing).length;

  return {
    policy_version: 'configured-market-universe-v1',
    instruments: ordered,
    exclusions,
    counts: {
      configured_price_bearing_total: ordered.length + priceExclusions,
      price_bearing_total: ordered.length,
      excluded_price_bearing_total: priceExclusions,
      not_price_bearing_total: notPriceBearingTotal,
      exclusion_entries: exclusions.length,
    },
  };
}

function configuredTimeframes(section = {}) {
  return [...new Set(normalizedList(section.timeframes)
    .map((timeframe) => String(timeframe).trim())
    .filter(Boolean))];
}

function buildWriterJobUniverse(config, families = PRICE_BEARING_FAMILIES) {
  const allowed = new Set(normalizedList(families).map((family) => String(family).toLowerCase()));
  return resolveConfiguredMarketUniverse(config).instruments
    .filter((instrument) => allowed.has(instrument.family))
    .map((instrument) => ({
      symbol: instrument.symbol,
      family: instrument.family,
      baseTf: instrument.base_timeframe,
      timeframes: configuredTimeframes(config[instrument.family]),
    }));
}

module.exports = {
  PRICE_BEARING_FAMILIES,
  CANONICAL_MARKET_FAMILIES,
  FAMILY_BASE_TIMEFRAME,
  FAMILY_PROVIDER,
  resolveConfiguredMarketUniverse,
  buildWriterJobUniverse,
  equityUniverseEntries,
  alpacaEquity5mSkipReason,
};
