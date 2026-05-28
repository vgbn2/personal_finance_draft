#!/usr/bin/env node

const { buildUrl, fetchJson, printSummary } = require('./shared');

async function main() {
  const url = buildUrl('https://opensky-network.org/api/states/all', {
    time: process.argv.includes('--time') ? process.argv[process.argv.indexOf('--time') + 1] : null,
  });
  const payload = await fetchJson(url.toString());
  console.log(`url: ${url.toString()}`);
  printSummary('opensky.states_all', payload);
  console.log('raw');
  console.log(JSON.stringify(payload, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
