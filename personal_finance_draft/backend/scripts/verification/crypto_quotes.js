#!/usr/bin/env node

const { loadConfig, fetchCryptoSnapshot } = require('../data_ops/ingest_market_data');

async function main() {
  const config = await loadConfig();
  const crypto = config.crypto || {};
  const symbols = Array.isArray(crypto.symbols) ? crypto.symbols.slice(0, 5) : [];
  const providers = Array.isArray(crypto.providers) ? crypto.providers : [];
  const timeframes = Array.isArray(crypto.timeframes) && crypto.timeframes.length ? crypto.timeframes : ['5m'];
  const samples = [];

  for (const symbol of symbols) {
    for (const provider of providers) {
      try {
        const records = await fetchCryptoSnapshot(provider, symbol, timeframes);
        samples.push({
          family: 'crypto',
          provider,
          symbol,
          record_count: records.length,
          sample: records.slice(0, 3),
        });
      } catch (error) {
        samples.push({
          family: 'crypto',
          provider,
          symbol,
          error: error.message,
        });
      }
    }
  }

  console.log(JSON.stringify({
    enabled: Boolean(crypto.enabled),
    providers,
    symbols,
    timeframes,
    samples,
  }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
