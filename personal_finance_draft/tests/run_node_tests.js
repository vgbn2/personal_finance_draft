const { spawnSync } = require('node:child_process');

const args = [
  '--test',
  'tests/scripts/*.test.js',
  'tests/web/*.test.js',
  ...process.argv.slice(2),
];

const result = spawnSync(process.execPath, args, {
  stdio: 'inherit',
  env: process.env,
});

process.exit(result.status ?? 1);
