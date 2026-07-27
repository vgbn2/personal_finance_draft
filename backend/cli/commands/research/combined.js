'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { loadMarketConfig } = require('../../../../shared/lib/runtime/config_loader');
const { REPO_ROOT, DEFAULT_SNAPSHOT } = require('../../../../shared/lib/runtime/paths');
const { inventoryMarketConfig } = require('../../../../shared/lib/analysis/assets');
const { composeCombinedExactAsset, rejectedEnvelope } = require('../../../../shared/lib/analysis/services/combined_exact_asset');
const { buildScorecard } = require('./scorecard');
const { optionValue, printPayload } = require('../../lib/utils');

const ENGINE_CONFIG_PATH = path.join(REPO_ROOT, 'config', 'analysis', 'combined_assets.json');
const MARKET_CONFIG_PATH = path.join(REPO_ROOT, 'config', 'markets', 'data_sources.yaml');

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

async function buildCachedCombinedResearch({
  assetId,
  decisionAt = new Date().toISOString(),
  timeframes = '1h,4h,1d',
  tsDir,
  snapshotPath = DEFAULT_SNAPSHOT,
  marketConfigPath = MARKET_CONFIG_PATH,
  engineConfigPath = ENGINE_CONFIG_PATH,
} = {}) {
  const decisionMs = Date.parse(decisionAt);
  if (!assetId || !String(assetId).includes(':') || !Number.isFinite(decisionMs)) {
    return rejectedEnvelope({
      assetId,
      decisionAt,
      policyVersion: 'exact-asset-v1',
      reasons: ['valid exact asset_id and decision_at are required'],
    });
  }

  const marketConfig = await loadMarketConfig(marketConfigPath);
  const inventory = inventoryMarketConfig(marketConfig);
  const matches = inventory.assets.filter((asset) => asset.asset_id === assetId);
  if (matches.length !== 1) {
    return rejectedEnvelope({
      assetId,
      decisionAt,
      policyVersion: 'exact-asset-v1',
      reasons: [matches.length === 0 ? 'unknown_exact_asset' : 'duplicate_exact_asset'],
    });
  }
  const asset = matches[0];
  const conflict = inventory.identity_conflicts.find((item) => item.asset_id === assetId);
  if (conflict) {
    return rejectedEnvelope({
      assetId,
      decisionAt,
      policyVersion: 'exact-asset-v1',
      reasons: ['conflicting_exact_asset_identity'],
    });
  }

  const technical = await buildScorecard([
    '--tf', timeframes,
    '--min-conf', '0',
    '--top', '1',
    '--allow-degraded',
  ], {
    now: decisionMs,
    ...(tsDir ? { tsDir } : {}),
    universeLoader: async () => [{
      symbol: asset.provider_ids.legacy_symbol,
      family: asset.taxonomy_source.legacy_family,
      market: asset.market,
      sector: asset.sector,
      coordinate_id: asset.asset_id,
    }],
  });
  const technicalRow = technical.ok && Array.isArray(technical.rows)
    ? technical.rows.find((row) => row.symbol === asset.provider_ids.legacy_symbol)
    : null;

  const snapshot = readJson(snapshotPath, {});
  const macroRecords = Array.isArray(snapshot.sources)
    ? snapshot.sources.filter((row) => row && (row.family === 'macro' || row.family === 'pmi'))
    : [];
  const engineConfig = readJson(engineConfigPath, { policy_version: 'exact-asset-v1', assets: {} });

  return composeCombinedExactAsset({
    asset,
    technicalRow,
    macroRecords,
    macroMapping: engineConfig.assets && engineConfig.assets[asset.asset_id],
    decisionAt: new Date(decisionMs).toISOString(),
    policyVersion: engineConfig.policy_version || 'exact-asset-v1',
  });
}

async function commandCombined(args) {
  const result = await buildCachedCombinedResearch({
    assetId: optionValue(args, '--asset-id', ''),
    decisionAt: optionValue(args, '--decision-at', new Date().toISOString()),
    timeframes: optionValue(args, '--tf', '1h,4h,1d'),
  });
  printPayload(result, args);
  return result.type === 'combined_research' ? 0 : 1;
}

module.exports = {
  ENGINE_CONFIG_PATH,
  MARKET_CONFIG_PATH,
  buildCachedCombinedResearch,
  commandCombined,
};
