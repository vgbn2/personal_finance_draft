
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const CLI_PATH = path.join(process.cwd(), 'backend', 'cli', 'sovereign_cli.js');

const tests = [
  // 1. Missing mandatory flags/arguments
  { name: 'strategy new (missing name)', args: ['strategy', 'new'] },
  { name: 'trade buy (missing all)', args: ['trade', 'buy'] },
  { name: 'trade buy (missing qty)', args: ['trade', 'buy', 'AAPL'] },
  
  // 2. Malformed numeric values
  { name: 'backfill --days malformed', args: ['backfill', '--days', 'abc'] },
  { name: 'trade buy malformed qty', args: ['trade', 'buy', 'AAPL', 'abc'] },
  { name: 'watch --interval malformed', args: ['watch', '--interval', 'abc'] },
  { name: 'bt --fee-bps malformed', args: ['bt', '--fee-bps', 'abc'] },
  
  // 3. Non-existent symbol names
  { name: 'backfill --symbol non-existent', args: ['backfill', '--symbol', 'NONEXISTENT_SYMBOL_X'] },
  { name: 'trade buy non-existent symbol', args: ['trade', 'buy', 'NONEXISTENT_SYMBOL_X', '1'] },
  { name: 'backend data summary non-existent symbol', args: ['backend', 'data', 'summary', '--symbol', 'NONEXISTENT_SYMBOL_X'] },
  
  // 4. --json flag verification
  { name: 'status --json', args: ['status', '--json'] },
  { name: 'quotes status --json', args: ['quotes', 'status', '--json'] },
  { name: 'bt --json', args: ['bt', '--json'] },
  { name: 'backend integrity --json', args: ['backend', 'integrity', '--json'] },
  { name: 'loc --json', args: ['loc', '--json'] },
];

const results = [];

for (const test of tests) {
  console.log(`Running test: ${test.name}`);
  const start = Date.now();
  const result = spawnSync('node', [CLI_PATH, ...test.args], { encoding: 'utf8', timeout: 30000 });
  const duration = Date.now() - start;

  const isJsonTest = test.args.includes('--json');
  let isValidJson = false;
  let jsonError = null;

  if (isJsonTest && result.stdout) {
    try {
      JSON.parse(result.stdout);
      isValidJson = true;
    } catch (e) {
      jsonError = e.message;
    }
  }

  results.push({
    name: test.name,
    args: test.args,
    exitCode: result.status,
    stdoutLen: result.stdout ? result.stdout.length : 0,
    stderrLen: result.stderr ? result.stderr.length : 0,
    duration,
    signal: result.signal,
    error: result.error,
    isValidJson,
    jsonError,
    // Truncate output for summary
    stdoutSample: result.stdout ? result.stdout.substring(0, 100).replace(/\n/g, ' ') : '',
    stderrSample: result.stderr ? result.stderr.substring(0, 100).replace(/\n/g, ' ') : ''
  });
}

console.log('\n--- Fuzzing Summary ---\n');
console.table(results.map(r => ({
  Name: r.name,
  Code: r.exitCode,
  Signal: r.signal || 'none',
  'JSON OK': r.isValidJson ? 'YES' : (r.args.includes('--json') ? 'FAIL' : 'N/A'),
  Duration: r.duration + 'ms',
  'Output (start)': r.stdoutSample
})));

const brittle = results.filter(r => r.exitCode === null || r.signal || (r.exitCode === 0 && r.name.includes('missing')) || (r.args.includes('--json') && !r.isValidJson));

if (brittle.length > 0) {
  console.log('\n--- Potential Brittle Commands ---');
  brittle.forEach(r => {
    console.log(`- ${r.name} (Code: ${r.exitCode}, Signal: ${r.signal}, JSON OK: ${r.isValidJson})`);
  });
} else {
  console.log('\nNo obviously brittle commands found (no crashes, no invalid JSON where expected).');
}
