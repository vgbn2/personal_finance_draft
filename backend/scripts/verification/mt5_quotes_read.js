#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { normalizeExternalQuotePayload } = require('../../../shared/lib/market/quote_router');

require('../../../shared/lib/runtime/env');

const COMMON_FILE = process.env.SOVEREIGN_HEADWAY_MT5_QUOTES_PATH || 
                   process.env.HEADWAY_MT5_QUOTES_PATH || 
                   path.join(
                     process.env.APPDATA || '',
                     'MetaQuotes',
                     'Terminal',
                     'Common',
                     'Files',
                     'headway_mt5_quotes.json'
                   );

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readJsonWhenReady(filePath, attempts = 10, delayMs = 750) {
  let lastError = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const stat = fs.statSync(filePath);
      if (stat.size === 0) {
        lastError = new Error('MT5 export exists but is still empty');
      } else {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
      }
    } catch (error) {
      lastError = error;
    }
    await sleep(delayMs);
  }
  throw lastError || new Error('MT5 export was not ready');
}

async function main() {
  const filePath = process.env.SOVEREIGN_HEADWAY_MT5_QUOTES_PATH ||
    process.env.HEADWAY_MT5_QUOTES_PATH ||
    COMMON_FILE;

  if (!fs.existsSync(filePath)) {
    console.log(JSON.stringify({
      ok: false,
      provider: 'headway_mt5',
      path: filePath,
      message: 'No MT5 export found yet. Install/run SovereignExport in MT5 first.',
    }, null, 2));
    process.exitCode = 1;
    return;
  }

  const payload = await readJsonWhenReady(filePath);
  const quotes = normalizeExternalQuotePayload(payload, 'headway_mt5');
  console.log(JSON.stringify({
    ok: quotes.length > 0,
    provider: 'headway_mt5',
    path: filePath,
    quote_records: quotes.length,
    event_records: Array.isArray(payload.events) ? payload.events.length : 0,
    generated_at: payload.generated_at || null,
    sample_quotes: quotes.slice(0, 10),
    sample_events: Array.isArray(payload.events) ? payload.events.slice(0, 10) : [],
  }, null, 2));
}

main().catch((error) => {
  console.log(JSON.stringify({
    ok: false,
    provider: 'headway_mt5',
    path: process.env.SOVEREIGN_HEADWAY_MT5_QUOTES_PATH ||
      process.env.HEADWAY_MT5_QUOTES_PATH ||
      COMMON_FILE,
    message: error.message,
  }, null, 2));
  process.exitCode = 1;
});
