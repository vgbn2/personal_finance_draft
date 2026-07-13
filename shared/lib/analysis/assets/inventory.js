'use strict';

const SCOREABLE_FAMILIES = Object.freeze({
  equities: 'equity',
  crypto: 'cryptoasset',
  fx: 'fx_pair',
  commodities: 'commodity',
  indices: 'index',
});

const EVIDENCE_FAMILIES = Object.freeze([
  'pmi',
  'macro',
  'macro_alt',
  'breadth',
  'sentiment',
  'onchain',
  'crypto_tx',
  'holdings',
  'reserves',
  'weather',
  'flight',
  'satellite_nrt',
  'cargo',
  'prediction_market',
]);

const CRYPTO_SUBTYPES = Object.freeze({
  layer1: 'native_chain',
  defi: 'protocol_token',
  exchange_tokens: 'exchange_or_meme_token',
  memes: 'exchange_or_meme_token',
});

const EQUITY_MARKETS = Object.freeze({
  USA: { market: 'US', region: 'US', quote_currency: 'USD' },
  VN: { market: 'VN', region: 'VN', quote_currency: 'VND' },
  IN: { market: 'IN', region: 'IN', quote_currency: 'INR' },
  UK: { market: 'UK', region: 'UK', quote_currency: 'GBP' },
  GER: { market: 'DE', region: 'DE', quote_currency: 'EUR' },
});

function stablePart(value) {
  return String(value).trim().replace(/[^A-Za-z0-9._-]+/g, '_');
}

function createAsset({ symbol, family, subtype, market, region, quoteCurrency, sourceFamily, sourcePath, sector }) {
  const normalizedSymbol = String(symbol).trim().toUpperCase();
  return {
    asset_id: `${family}:${stablePart(market).toUpperCase()}:${normalizedSymbol}`,
    symbol: normalizedSymbol,
    family,
    subtype,
    market,
    sector: sector || null,
    quote_currency: quoteCurrency,
    region,
    provider_ids: { legacy_symbol: normalizedSymbol },
    taxonomy_source: { legacy_family: sourceFamily, path: sourcePath },
  };
}

function unsupported(sourceFamily, sourcePath, identifier, classification, reasonCode, reason) {
  return {
    source_family: sourceFamily,
    source_path: sourcePath,
    identifier: String(identifier),
    classification,
    reason_code: reasonCode,
    reason,
  };
}

function matrixEntries(sourceFamily, familyConfig) {
  const entries = [];
  const grid = familyConfig && familyConfig.universe_matrix && familyConfig.universe_matrix.grid;
  if (!grid || typeof grid !== 'object') return entries;
  for (const [market, sectors] of Object.entries(grid)) {
    for (const [sector, symbols] of Object.entries(sectors || {})) {
      if (!Array.isArray(symbols)) continue;
      symbols.forEach((symbol, index) => entries.push({
        symbol,
        market,
        sector,
        sourcePath: `${sourceFamily}.universe_matrix.grid.${market}.${sector}[${index}]`,
      }));
    }
  }
  return entries;
}

function rawSymbolEntries(sourceFamily, familyConfig) {
  if (!familyConfig || !Array.isArray(familyConfig.symbols)) return [];
  return familyConfig.symbols.map((symbol, index) => ({
    symbol,
    sourcePath: `${sourceFamily}.symbols[${index}]`,
  }));
}

function stripCryptoQuote(symbol) {
  const normalized = String(symbol).trim().toUpperCase();
  for (const quote of ['USDT', 'USDC', 'USD']) {
    if (normalized.length > quote.length && normalized.endsWith(quote)) return normalized.slice(0, -quote.length);
  }
  return normalized;
}

function classifyMatrixEntry(sourceFamily, entry) {
  if (sourceFamily === 'equities') {
    if (entry.sector === 'indices' || entry.sector === 'commodity_etfs') {
      return { unsupported: unsupported(sourceFamily, entry.sourcePath, entry.symbol, 'unsupported', 'unsupported_equity_subtype', `equity matrix sector ${entry.sector} is not a common stock`) };
    }
    const location = EQUITY_MARKETS[entry.market];
    if (!location) return { unsupported: unsupported(sourceFamily, entry.sourcePath, entry.symbol, 'ambiguous', 'unknown_equity_market', 'equity market metadata is not mapped') };
    return { asset: createAsset({ symbol: entry.symbol, family: 'equity', subtype: 'common_stock', market: location.market, region: location.region, quoteCurrency: location.quote_currency, sourceFamily, sourcePath: entry.sourcePath, sector: entry.sector }) };
  }

  if (sourceFamily === 'crypto') {
    if (entry.sector === 'ai') return { unsupported: unsupported(sourceFamily, entry.sourcePath, entry.symbol, 'ambiguous', 'ambiguous_crypto_sector', 'AI category does not establish chain, protocol, exchange, or meme subtype') };
    const subtype = CRYPTO_SUBTYPES[entry.sector];
    if (!subtype) return { unsupported: unsupported(sourceFamily, entry.sourcePath, entry.symbol, 'ambiguous', 'unknown_crypto_sector', 'crypto matrix sector has no approved subtype mapping') };
    const asset = createAsset({ symbol: stripCryptoQuote(entry.symbol), family: 'cryptoasset', subtype, market: 'GLOBAL', region: 'GLOBAL', quoteCurrency: 'USD', sourceFamily, sourcePath: entry.sourcePath, sector: entry.sector });
    asset.provider_ids.legacy_symbol = String(entry.symbol).trim().toUpperCase();
    return { asset };
  }

  return { unsupported: unsupported(sourceFamily, entry.sourcePath, entry.symbol, 'ambiguous', 'unexpected_matrix', 'family matrix has no approved taxonomy mapping') };
}

function classifyRawEntry(sourceFamily, entry) {
  const symbol = String(entry.symbol).trim().toUpperCase();
  if (sourceFamily === 'fx') {
    const quote = symbol.length === 6 ? symbol.slice(3) : 'UNKNOWN';
    const region = symbol.length === 6 ? `${symbol.slice(0, 3)}-${quote}` : 'GLOBAL';
    return { asset: createAsset({ symbol, family: 'fx_pair', subtype: 'fx_pair', market: 'OTC', region, quoteCurrency: quote, sourceFamily, sourcePath: entry.sourcePath }) };
  }
  if (sourceFamily === 'indices') return { asset: createAsset({ symbol, family: 'index', subtype: 'index', market: 'GLOBAL', region: 'GLOBAL', quoteCurrency: 'UNKNOWN', sourceFamily, sourcePath: entry.sourcePath }) };
  if (sourceFamily === 'commodities') return { unsupported: unsupported(sourceFamily, entry.sourcePath, symbol, 'ambiguous', 'commodity_subtype_missing', 'current config does not encode energy, metals, or agriculture subtype') };
  if (sourceFamily === 'crypto') return { unsupported: unsupported(sourceFamily, entry.sourcePath, symbol, 'ambiguous', 'unclassified_crypto_symbol', 'raw crypto symbol has no approved matrix subtype') };
  if (sourceFamily === 'equities') return { unsupported: unsupported(sourceFamily, entry.sourcePath, symbol, 'ambiguous', 'unclassified_equity_symbol', 'raw equity symbol lacks market and sector metadata') };
  return { unsupported: unsupported(sourceFamily, entry.sourcePath, symbol, 'unsupported', 'unsupported_family', 'legacy family is not scoreable in this phase') };
}

function evidenceDimensions(family, config) {
  const dimensions = [];
  const addSingle = (field) => (config[field] || []).forEach((value, index) => dimensions.push({ parts: [value], sourcePath: `${family}.${field}[${index}]` }));
  const addCross = (scopeField, metricField) => (config[scopeField] || []).forEach((scope, scopeIndex) => (config[metricField] || []).forEach((metric, metricIndex) => dimensions.push({ parts: [scope, metric], sourcePath: `${family}.${scopeField}[${scopeIndex}]+${metricField}[${metricIndex}]` })));

  if (['pmi', 'macro', 'macro_alt'].includes(family)) addSingle('series');
  else if (family === 'breadth') addSingle('metrics');
  else if (family === 'sentiment') addSingle('fields');
  else if (['onchain', 'crypto_tx'].includes(family)) addCross('chains', 'metrics');
  else if (family === 'holdings') addCross('symbols', 'metrics');
  else if (family === 'reserves') addCross('countries', 'metrics');
  else if (family === 'weather') addCross('locations', 'metrics');
  else if (family === 'flight') addCross('regions', 'metrics');
  else if (family === 'satellite_nrt') addCross('areas', 'metrics');
  else if (family === 'cargo') addCross('regions', 'metrics');
  else if (family === 'prediction_market') addSingle('events');
  return dimensions;
}

function createEvidenceDescriptor(family, config, dimension) {
  const stableParts = dimension.parts.map((part) => stablePart(part).toLowerCase());
  return {
    evidence_id: `evidence:${family}:${stableParts.join(':')}`,
    evidence_family: family,
    dimensions: dimension.parts.map(String),
    enabled: config.enabled === true,
    providers: Array.isArray(config.providers) ? config.providers.slice() : [],
    source_path: dimension.sourcePath,
    scoreable: false,
  };
}

function inventoryMarketConfig(config) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) throw new TypeError('market config must be an object');
  const assetsById = new Map();
  const assetOccurrences = new Map();
  const identityConflicts = [];
  const legacyOccurrences = new Map();
  const legacyAssetIds = new Map();
  const unsupportedEntries = [];
  let matrixInputCount = 0;
  let rawInputCount = 0;

  const recordAsset = (asset) => {
    const occurrences = assetOccurrences.get(asset.asset_id) || [];
    occurrences.push(asset.taxonomy_source.path);
    assetOccurrences.set(asset.asset_id, occurrences);
    const existing = assetsById.get(asset.asset_id);
    if (!existing) assetsById.set(asset.asset_id, asset);
    else {
      const fields = ['family', 'subtype', 'market', 'region', 'quote_currency', 'sector'];
      const mismatches = fields.filter((field) => existing[field] !== asset[field]);
      if (mismatches.length > 0) identityConflicts.push({
        asset_id: asset.asset_id,
        fields: mismatches,
        existing_source: existing.taxonomy_source.path,
        conflicting_source: asset.taxonomy_source.path,
      });
    }
    const legacyKey = `${asset.taxonomy_source.legacy_family}:${asset.provider_ids.legacy_symbol}`;
    const ids = legacyAssetIds.get(legacyKey) || new Set();
    ids.add(asset.asset_id);
    legacyAssetIds.set(legacyKey, ids);
  };
  const recordLegacy = (sourceFamily, symbol, sourcePath) => {
    const normalizedSymbol = String(symbol).trim().toUpperCase();
    const key = `${sourceFamily}:${normalizedSymbol}`;
    const current = legacyOccurrences.get(key) || { source_family: sourceFamily, symbol: normalizedSymbol, source_paths: [] };
    current.source_paths.push(sourcePath);
    legacyOccurrences.set(key, current);
    return key;
  };

  for (const sourceFamily of Object.keys(SCOREABLE_FAMILIES)) {
    const familyConfig = config[sourceFamily] || {};
    const claimed = new Set();
    for (const entry of matrixEntries(sourceFamily, familyConfig)) {
      matrixInputCount++;
      recordLegacy(sourceFamily, entry.symbol, entry.sourcePath);
      claimed.add(String(entry.symbol).trim().toUpperCase());
      const classified = classifyMatrixEntry(sourceFamily, entry);
      if (classified.asset) recordAsset(classified.asset);
      else unsupportedEntries.push(classified.unsupported);
    }
    for (const entry of rawSymbolEntries(sourceFamily, familyConfig)) {
      rawInputCount++;
      const legacyKey = recordLegacy(sourceFamily, entry.symbol, entry.sourcePath);
      if (claimed.has(String(entry.symbol).trim().toUpperCase())) {
        for (const assetId of legacyAssetIds.get(legacyKey) || []) assetOccurrences.get(assetId).push(entry.sourcePath);
        continue;
      }
      const classified = classifyRawEntry(sourceFamily, entry);
      if (classified.asset) recordAsset(classified.asset);
      else unsupportedEntries.push(classified.unsupported);
    }
  }

  const evidenceSeries = [];
  for (const family of EVIDENCE_FAMILIES) {
    const familyConfig = config[family] || {};
    for (const dimension of evidenceDimensions(family, familyConfig)) evidenceSeries.push(createEvidenceDescriptor(family, familyConfig, dimension));
  }

  if (config.quote_feeds) unsupportedEntries.push(unsupported('quote_feeds', 'quote_feeds', 'quote_feeds', 'operational', 'operational_config', 'quote feeds configure runtime providers and are not assets'));

  const assets = [...assetsById.values()];
  const duplicateDeclarations = [...assetOccurrences.entries()]
    .filter(([, paths]) => paths.length > 1)
    .map(([assetId, paths]) => ({ asset_id: assetId, occurrence_count: paths.length, source_paths: paths }));
  const legacyDuplicates = [...legacyOccurrences.values()]
    .filter((entry) => entry.source_paths.length > 1)
    .map((entry) => ({ ...entry, occurrence_count: entry.source_paths.length }));
  const symbolMap = new Map();
  for (const asset of assets) {
    const ids = symbolMap.get(asset.symbol) || new Set();
    ids.add(asset.asset_id);
    symbolMap.set(asset.symbol, ids);
  }
  const symbolCollisions = [...symbolMap.entries()]
    .filter(([, ids]) => ids.size > 1)
    .map(([symbol, ids]) => ({ symbol, asset_ids: [...ids].sort() }));

  return {
    assets,
    evidence_series: evidenceSeries,
    unsupported: unsupportedEntries,
    duplicate_declarations: duplicateDeclarations,
    identity_conflicts: identityConflicts,
    duplicate_legacy_symbols: legacyDuplicates,
    symbol_collisions: symbolCollisions,
    counts: {
      matrix_inputs: matrixInputCount,
      raw_inputs: rawInputCount,
      configured_inputs: matrixInputCount + rawInputCount + evidenceSeries.length,
      scoreable: assets.length,
      evidence: evidenceSeries.length,
      unsupported: unsupportedEntries.length,
      duplicate_declarations: duplicateDeclarations.length,
      identity_conflicts: identityConflicts.length,
      duplicate_legacy_symbols: legacyDuplicates.length,
      symbol_collisions: symbolCollisions.length,
    },
  };
}

module.exports = {
  SCOREABLE_FAMILIES,
  EVIDENCE_FAMILIES,
  inventoryMarketConfig,
};
