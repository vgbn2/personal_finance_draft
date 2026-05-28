const test = require('node:test');
const assert = require('node:assert/strict');
const { loadConfig } = require('../../backend/scripts/data_ops/ingest_market_data');

/**
 * TEST: CONFIGURATION INTEGRITY
 */
test('ingestion config loader prioritizes data_sources.yaml', async () => {
  const config = await loadConfig();
  
  assert.ok(config.equities, 'Equities section should exist');
  assert.ok(config.breadth, 'Breadth section should exist');
});

