const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const CLI_PATH = path.join(__dirname, '..', '..', '..', 'backend', 'cli', 'sovereign_cli.js');

test('trade process accepts a local proposed-order file and prints a preview', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sovereign-orders-'));
  const ordersPath = path.join(tempDir, 'orders.json');
  fs.writeFileSync(ordersPath, JSON.stringify({
    orders: [
      { instrumentId: 'AAPL', side: 'buy', quantity: 1, type: 'market' },
    ],
  }, null, 2), 'utf8');

  const result = spawnSync(process.execPath, [
    CLI_PATH,
    'trade',
    'process',
    ordersPath,
    '--json',
  ], {
    cwd: path.join(__dirname, '..', '..', '..'),
    encoding: 'utf8',
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /Proposed order preview/);
  assert.match(result.stdout, /AAPL/);
});
