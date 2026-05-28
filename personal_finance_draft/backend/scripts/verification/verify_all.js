#!/usr/bin/env node

const { spawnSync } = require('child_process');
const path = require('path');

function selectedChecks() {
  const offline = process.argv.includes('--offline');
  const includeGlobal = process.argv.includes('--include-global');
  const checks = [
  ['headway_mt5_check.js', []],
  ['auth_check.js', []],
  ['quote_inputs.js', []],
  ['symbol_inventory.js', []],
  ];

  if (!offline) {
    checks.push(['crypto_quotes.js', []]);
    checks.push(['region_snapshot.js', []]);
    if (includeGlobal) checks.push(['states_all.js', []]);
  }

  return checks;
}

function runCheck(script, args) {
  const scriptPath = path.join(__dirname, script);
  console.log(`\n=== ${script} ===`);
  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: path.resolve(__dirname, '..', '..'),
    env: process.env,
    encoding: 'utf8',
  });

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);

  return result.status === 0;
}

function main() {
  let ok = true;
  for (const [script, args] of selectedChecks()) {
    ok = runCheck(script, args) && ok;
  }
  if (!ok) process.exitCode = 1;
}

main();
