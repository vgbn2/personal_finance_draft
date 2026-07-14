'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const { validateAssetDescriptor } = require('../../../../shared/contracts/analysis');
const { loadMarketConfig } = require('../../../../shared/lib/runtime/config_loader');
const { EVIDENCE_FAMILIES, inventoryMarketConfig } = require('../../../../shared/lib/analysis/assets');

const CONFIG_PATH = path.join(__dirname, '../../../../config/markets/data_sources.yaml');

test('real market config inventories assets, evidence, and unsupported entries', async () => {
  const config = await loadMarketConfig(CONFIG_PATH);
  const inventory = inventoryMarketConfig(config);

  assert.ok(inventory.counts.configured_inputs > 0);
  assert.ok(inventory.counts.scoreable > 0);
  assert.ok(inventory.counts.evidence > 0);
  assert.ok(inventory.counts.unsupported > 0);
  assert.ok(inventory.counts.duplicate_declarations > 0);
  assert.ok(inventory.counts.duplicate_legacy_symbols > 0);
  assert.equal(inventory.counts.identity_conflicts, 0);
  assert.equal(inventory.assets.every((asset) => validateAssetDescriptor(asset).ok), true);
  assert.equal(new Set(inventory.assets.map((asset) => asset.asset_id)).size, inventory.assets.length);
  assert.equal(new Set(inventory.evidence_series.map((item) => item.evidence_id)).size, inventory.evidence_series.length);
  assert.equal(inventory.evidence_series.some((item) => Object.hasOwn(item, 'asset_id')), false);

  const evidenceFamilySet = new Set(inventory.evidence_series.map((item) => item.evidence_family));
  for (const family of EVIDENCE_FAMILIES) {
    const configured = config[family] || {};
    const hasConfiguredDimensions = ['series', 'metrics', 'fields', 'events'].some((field) => Array.isArray(configured[field]) && configured[field].length > 0);
    if (hasConfiguredDimensions) assert.ok(evidenceFamilySet.has(family), `${family} should produce evidence descriptors`);
    assert.equal(inventory.assets.some((asset) => asset.taxonomy_source.legacy_family === family), false, `${family} must produce zero assets`);
  }

  for (const symbol of ['SPY', 'GLD']) {
    assert.equal(inventory.assets.some((asset) => asset.symbol === symbol && asset.subtype === 'common_stock'), false);
    assert.ok(inventory.unsupported.some((item) => item.identifier === symbol && item.reason_code === 'unsupported_equity_subtype'));
  }
  assert.ok(inventory.unsupported.some((item) => item.source_family === 'crypto' && item.reason_code === 'ambiguous_crypto_sector'));
  assert.ok(inventory.unsupported.some((item) => item.source_family === 'commodities' && item.reason_code === 'commodity_subtype_missing'));

  console.log(`asset taxonomy inputs: configured=${inventory.counts.configured_inputs} matrix=${inventory.counts.matrix_inputs} raw=${inventory.counts.raw_inputs}`);
  console.log(`asset taxonomy results: scoreable=${inventory.counts.scoreable} evidence=${inventory.counts.evidence} unsupported=${inventory.counts.unsupported}`);
  console.log(`asset taxonomy identity: duplicate_declarations=${inventory.counts.duplicate_declarations} identity_conflicts=${inventory.counts.identity_conflicts} duplicate_legacy_symbols=${inventory.counts.duplicate_legacy_symbols} symbol_collisions=${inventory.counts.symbol_collisions}`);
  console.log(`asset taxonomy sample: ${inventory.assets.slice(0, 4).map((asset) => asset.asset_id).join(', ')}`);
});

test('matrix metadata wins before raw lists and crypto leftovers stay ambiguous', () => {
  const inventory = inventoryMarketConfig({
    equities: {
      enabled: true,
      symbols: ['ACME', 'RAW'],
      universe_matrix: { grid: { USA: { technology: ['ACME'] } } },
    },
    crypto: {
      enabled: true,
      symbols: ['BTCUSDT', 'MYSTERYUSDT'],
      universe_matrix: { grid: { GLOBAL: { layer1: ['BTCUSDT'] } } },
    },
  });

  const acme = inventory.assets.find((asset) => asset.symbol === 'ACME');
  assert.equal(acme.asset_id, 'equity:US:ACME');
  assert.equal(acme.sector, 'technology');
  assert.equal(inventory.assets.filter((asset) => asset.symbol === 'ACME').length, 1);
  assert.ok(inventory.unsupported.some((item) => item.identifier === 'RAW' && item.reason_code === 'unclassified_equity_symbol'));
  assert.ok(inventory.unsupported.some((item) => item.identifier === 'MYSTERYUSDT' && item.reason_code === 'unclassified_crypto_symbol'));
});

test('deduplication uses asset_id and reports bare-symbol collisions separately', () => {
  const inventory = inventoryMarketConfig({
    equities: { enabled: true, universe_matrix: { grid: { USA: { technology: ['SAME', 'SAME'] } } } },
    crypto: { enabled: true, universe_matrix: { grid: { GLOBAL: { layer1: ['SAME'] } } } },
  });

  assert.equal(inventory.assets.length, 2);
  assert.deepEqual(inventory.assets.map((asset) => asset.asset_id).sort(), ['cryptoasset:GLOBAL:SAME', 'equity:US:SAME']);
  assert.equal(inventory.duplicate_declarations.length, 1);
  assert.equal(inventory.duplicate_declarations[0].asset_id, 'equity:US:SAME');
  assert.deepEqual(inventory.symbol_collisions, [{ symbol: 'SAME', asset_ids: ['cryptoasset:GLOBAL:SAME', 'equity:US:SAME'] }]);
});

test('conflicting metadata for one asset id is reported separately from repeated declarations', () => {
  const inventory = inventoryMarketConfig({
    crypto: {
      enabled: true,
      universe_matrix: { grid: { GLOBAL: { layer1: ['TOKEN'], defi: ['TOKEN'] } } },
    },
  });

  assert.equal(inventory.assets.length, 1);
  assert.equal(inventory.duplicate_declarations.length, 1);
  assert.equal(inventory.identity_conflicts.length, 1);
  assert.equal(inventory.identity_conflicts[0].asset_id, 'cryptoasset:GLOBAL:TOKEN');
  assert.ok(inventory.identity_conflicts[0].fields.includes('subtype'));
});
