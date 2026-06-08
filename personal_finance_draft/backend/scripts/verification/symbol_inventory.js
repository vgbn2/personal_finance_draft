#!/usr/bin/env node

const { loadConfig } = require('../data_ops/ingest_market_data');
const { normalizeSymbol, inferFamily } = require('../../../shared/lib/market/quote_router');

function flattenInventory(config) {
  const sources = config.sources || config;
  const rows = [];
  for (const [family, block] of Object.entries(sources)) {
    if (!block || typeof block !== 'object' || !Array.isArray(block.symbols)) continue;
    for (const symbol of block.symbols) {
      rows.push({
        family,
        inferred_family: inferFamily(symbol, family),
        symbol,
        normalized_symbol: normalizeSymbol(symbol, family),
        providers: block.providers || [],
        timeframes: block.timeframes || [],
        enabled: Boolean(block.enabled),
      });
    }
  }
  return rows;
}

async function main() {
  const config = await loadConfig();
  const rows = flattenInventory(config);
  const families = [...new Set(rows.map((row) => row.family))].sort();
  console.log(JSON.stringify({
    families,
    symbol_count: rows.length,
    rows,
  }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
