const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');

// Optional packages not installed in dev — don't fail for these
const KNOWN_OPTIONAL = ['@mathieuc/tradingview'];

function loadCheck(entryRelPath) {
  const result = spawnSync(process.execPath, ['-e', `
    try {
      const loaded = require('./${entryRelPath}');
      if ('${entryRelPath}' === 'backend/api/app.js') {
        loaded.io?.close?.();
        if (loaded.server?.listening) loaded.server.close();
        process.exit(0);
      }
    } catch (e) {
      const known = ${JSON.stringify(KNOWN_OPTIONAL)};
      if (known.some(dep => e.message.includes(dep))) process.exit(0);
      process.stderr.write(e.stack + '\\n');
      process.exit(1);
    }
  `], { cwd: REPO_ROOT, encoding: 'utf8', timeout: 10000 });
  return result;
}

test('sovereign_cli entry point loads without broken requires', () => {
  const result = loadCheck('backend/cli/sovereign_cli.js');
  assert.equal(result.status, 0, `sovereign_cli failed to load:\n${result.stderr}`);
});

test('backend api entry point loads without broken requires', () => {
  const result = loadCheck('backend/api/app.js');
  assert.equal(result.status, 0, `backend/api/app.js failed to load:\n${result.stderr}`);
});

test('#shared/* subpath imports resolve correctly', () => {
  const result = spawnSync(process.execPath, ['-e', `
    require('#shared/market_validation');
    require('#shared/indicators');
    require('#shared/backtest');
  `], { cwd: REPO_ROOT, encoding: 'utf8' });
  assert.equal(result.status, 0, `#shared/* imports failed:\n${result.stderr}`);
});
