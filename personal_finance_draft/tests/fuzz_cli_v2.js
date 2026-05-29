
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

const CLI_PATH = path.join(process.cwd(), 'backend', 'cli', 'sovereign_cli.js');

const tests = [
  // 1. Missing mandatory flags/arguments
  { name: 'strategy new (missing name)', args: ['strategy', 'new'] },
  { name: 'trade buy (missing all)', args: ['trade', 'buy'] },
  { name: 'trade buy (missing qty)', args: ['trade', 'buy', 'AAPL'] },
  { name: 'trade sell (missing all)', args: ['trade', 'sell'] },
  { name: 'trade process (missing file)', args: ['trade', 'process'] },
  { name: 'backend data (missing subcommand)', args: ['backend', 'data'] },
  
  // 2. Malformed numeric values
  { name: 'backfill --days malformed', args: ['backfill', '--days', 'abc'] },
  { name: 'trade buy malformed qty', args: ['trade', 'buy', 'AAPL', 'abc'] },
  { name: 'watch --interval malformed', args: ['watch', '--interval', 'abc'] },
  { name: 'bt --fee-bps malformed', args: ['bt', '--fee-bps', 'abc'] },
  { name: 'bt --slippage-bps malformed', args: ['bt', '--slippage-bps', 'abc'] },
  { name: 'bt --horizon malformed', args: ['bt', '--horizon', 'abc'] },
  { name: 'bt --threshold malformed', args: ['bt', '--threshold', 'abc'] },
  { name: 'bt --train-ratio malformed', args: ['bt', '--train-ratio', 'abc'] },
  
  // 3. Non-existent symbol names / paths
  { name: 'backfill --symbol non-existent', args: ['backfill', '--symbol', 'NONEXISTENT_SYMBOL_X'] },
  { name: 'trade buy non-existent symbol', args: ['trade', 'buy', 'NONEXISTENT_SYMBOL_X', '1'] },
  { name: 'backend data summary non-existent symbol', args: ['backend', 'data', 'summary', '--symbol', 'NONEXISTENT_SYMBOL_X'] },
  { name: 'bt --input non-existent file', args: ['bt', '--input', 'non_existent_file.json'] },
  { name: 'validate --input non-existent file', args: ['validate', '--input', 'non_existent_file.json'] },
  
  // 4. --json flag verification
  { name: 'status --json', args: ['status', '--json'] },
  { name: 'quotes status --json', args: ['quotes', 'status', '--json'] },
  { name: 'bt --json', args: ['bt', '--json'] },
  { name: 'backend integrity --json', args: ['backend', 'integrity', '--json'] },
  { name: 'loc --json', args: ['loc', '--json'] },
  { name: 'optimize --json', args: ['optimize', '--json'] },
  { name: 'indicators --json', args: ['indicators', '--json'] },
  { name: 'models --json', args: ['models', '--json'] },
  { name: 'backend status --json', args: ['backend', 'status', '--json'] },
  { name: 'backend stats --json', args: ['backend', 'stats', '--json'] },
  { name: 'backend universe --json', args: ['backend', 'universe', '--json'] },

  // 5. Edge cases / Weird inputs
  { name: 'strategy new with path injection', args: ['strategy', 'new', '../../hacked'] },
  { name: 'bt with invalid dates', args: ['bt', '--from', 'not-a-date', '--to', 'future-land'] },
  { name: 'backfill with invalid timeframe', args: ['backfill', '--timeframe', '100y'] },
];

const results = [];

for (const test of tests) {
  process.stdout.write(`Running: ${test.name.padEnd(50)} `);
  const start = Date.now();
  // We use a shorter timeout for most commands, but some like 'optimize' or 'bt' might take longer.
  // However, for fuzzing we want to see if they fail fast on bad input.
  const timeout = test.args.includes('watch') ? 2000 : 15000;
  const result = spawnSync('node', [CLI_PATH, ...test.args], { encoding: 'utf8', timeout });
  const duration = Date.now() - start;

  const isJsonTest = test.args.includes('--json');
  let isValidJson = false;
  let jsonError = null;
  let parsedJson = null;

  if (isJsonTest && result.stdout) {
    try {
      parsedJson = JSON.parse(result.stdout);
      isValidJson = true;
    } catch (e) {
      jsonError = e.message;
    }
  }

  const code = result.status;
  const signal = result.signal;
  
  let statusStr = '';
  if (signal) {
    statusStr = `SIGNAL ${signal}`;
  } else if (code === 0) {
    statusStr = 'OK (0)';
  } else {
    statusStr = `ERR (${code})`;
  }
  
  console.log(statusStr);

  results.push({
    name: test.name,
    args: test.args,
    exitCode: code,
    signal,
    duration,
    isValidJson,
    jsonError,
    parsedJson,
    stdout: result.stdout || '',
    stderr: result.stderr || ''
  });
}

console.log('\n--- BRITTLE COMMANDS SUMMARY ---\n');

const brittle = results.filter(r => {
  // 1. Crashes (Signal) - but ignore 'watch' timeout which we expect
  if (r.signal && !r.args.includes('watch')) return true;
  // 2. Silent Failures (Exit 0 but should be error)
  if (r.exitCode === 0) {
    if (r.name.includes('missing')) return true;
    if (r.name.includes('malformed') && !r.name.includes('backfill')) return true; // backfill defaults are okay-ish
    if (r.name.includes('non-existent file')) return true;
  }
  // 3. Invalid JSON output
  if (r.args.includes('--json') && !r.isValidJson) return true;
  
  return false;
});

if (brittle.length > 0) {
  brittle.forEach(r => {
    console.log(`[BRITTLE] ${r.name}`);
    console.log(`  Args: ${r.args.join(' ')}`);
    console.log(`  Result: ${r.signal ? `Signal ${r.signal}` : `Exit Code ${r.exitCode}`}`);
    if (r.args.includes('--json') && !r.isValidJson) {
      console.log(`  JSON Error: ${r.jsonError}`);
    }
    const output = (r.stdout + r.stderr).trim();
    if (output) {
      console.log(`  Output (first 100 chars): ${output.substring(0, 100).replace(/\n/g, ' ')}`);
    }
    console.log('');
  });
} else {
  console.log('No brittle commands detected based on the current criteria.');
}

// Check structural integrity for successful JSON outputs
console.log('\n--- JSON STRUCTURAL VERIFICATION ---\n');
results.filter(r => r.isValidJson).forEach(r => {
  const keys = Object.keys(r.parsedJson);
  console.log(`[JSON] ${r.name}: Keys found: ${keys.join(', ')}`);
  // Basic sanity check: should have some keys and not be just { error: ... } if exit code was 0
  if (r.exitCode === 0 && keys.length === 1 && keys[0] === 'error') {
     console.log(`  WARNING: Command succeeded but only returned an error key.`);
  }
});
