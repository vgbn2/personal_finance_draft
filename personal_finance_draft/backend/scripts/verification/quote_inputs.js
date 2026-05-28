#!/usr/bin/env node

const { loadConfig, loadExternalQuoteInputs, dedupePreferredMarketQuotes } = require('../data_ops/ingest_market_data');

async function main() {
  const config = await loadConfig();
  const imported = await loadExternalQuoteInputs(config);
  const deduped = dedupePreferredMarketQuotes(imported.records);
  const providers = (config.quote_feeds?.providers || ['headway_mt5', 'mt5', 'webull']).map((provider) => ({
    provider,
    configured: Boolean(process.env[`SOVEREIGN_${String(provider).toUpperCase()}_QUOTES_PATH`] || process.env[`${String(provider).toUpperCase()}_QUOTES_PATH`]),
    env_key: process.env[`SOVEREIGN_${String(provider).toUpperCase()}_QUOTES_PATH`] ? `SOVEREIGN_${String(provider).toUpperCase()}_QUOTES_PATH` : (process.env[`${String(provider).toUpperCase()}_QUOTES_PATH`] ? `${String(provider).toUpperCase()}_QUOTES_PATH` : null),
    records: imported.records.filter((record) => record.provider === provider).length,
  }));

  console.log(JSON.stringify({
    enabled: Boolean(config.quote_feeds?.enabled),
    providers,
    total_records: imported.records.length,
    deduped_records: deduped.records.length,
    errors: imported.errors,
    sample_records: imported.records.slice(0, 10),
    sample_deduped: deduped.records.slice(0, 10),
  }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
