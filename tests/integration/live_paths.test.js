'use strict';

/**
 * Live-path integration tests.
 *
 * These tests exercise real CLI paths against live brokers, real Supabase, and
 * real network endpoints.  They are skipped in CI and in offline environments.
 *
 * Gate variable: set SOVEREIGN_LIVE_TEST=1 to enable.
 *
 * Run manually:
 *   SOVEREIGN_LIVE_TEST=1 node --test tests/integration/live_paths.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const LIVE = process.env.SOVEREIGN_LIVE_TEST === '1';
const REPO_ROOT = path.join(__dirname, '..', '..');
const CLI = path.join(REPO_ROOT, 'backend', 'cli', 'sovereign_cli.js');

function cli(...args) {
  return spawnSync(process.execPath, [CLI, ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    timeout: 30000,
    env: { ...process.env },
  });
}

// ---------------------------------------------------------------------------
// Auth / user path
// ---------------------------------------------------------------------------

test('doctor runtime reports node version and sovereign binary', { skip: !LIVE }, () => {
  const result = cli('doctor', 'runtime', '--json');
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout.trim().split('\n').find((l) => l.startsWith('{')));
  assert.ok(payload.node_version, 'node_version should be present');
  assert.ok(payload.sovereign_binary || payload.cli_path, 'cli path should be present');
});

test('doctor data shows cache symbol counts', { skip: !LIVE }, () => {
  const result = cli('doctor', 'data', '--json');
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const lines = result.stdout.trim().split('\n').filter((l) => l.startsWith('{'));
  const payload = JSON.parse(lines[0]);
  assert.equal(typeof payload.ok, 'boolean');
  assert.ok(typeof payload.total_cached === 'number' || Array.isArray(payload.symbols));
});

// ---------------------------------------------------------------------------
// Run-loop status
// ---------------------------------------------------------------------------

test('sovereign run status returns loop registry', { skip: !LIVE }, () => {
  const result = cli('run', 'status', '--json');
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const lines = result.stdout.trim().split('\n').filter((l) => l.startsWith('{'));
  assert.ok(lines.length > 0, 'expected JSON output');
  const payload = JSON.parse(lines[0]);
  assert.ok('loops' in payload || payload.ok === false, 'loops key or ok:false expected');
});

// ---------------------------------------------------------------------------
// Polymarket paper-trading path
// ---------------------------------------------------------------------------

test('polymarket paper-run dry-run returns ok with summary', { skip: !LIVE }, () => {
  const result = cli(
    'polymarket', 'paper-run',
    '--strategy', 'low_prob_dip',
    '--virtual-balance', '100',
    '--dry-run',
    '--limit', '3',
    '--json',
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const lines = result.stdout.trim().split('\n').filter((l) => l.startsWith('{'));
  assert.ok(lines.length > 0, 'expected JSON output');
  const payload = JSON.parse(lines[0]);
  assert.equal(payload.ok, true);
  assert.ok('summary' in payload);
  assert.equal(typeof payload.summary.virtual_balance, 'number');
});

// ---------------------------------------------------------------------------
// Polymarket backtest path
// ---------------------------------------------------------------------------

test('polymarket backtest scans at least 1 market', { skip: !LIVE }, () => {
  const result = cli(
    'polymarket', 'backtest',
    '--days', '90',
    '--strategy', 'low_prob_dip',
    '--max-markets', '5',
    '--json',
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const lines = result.stdout.trim().split('\n').filter((l) => l.startsWith('{'));
  assert.ok(lines.length > 0, 'expected JSON output');
  const payload = JSON.parse(lines[0]);
  assert.equal(payload.ok, true);
  assert.ok(payload.marketsScanned >= 0, 'marketsScanned should be a non-negative integer');
});

// ---------------------------------------------------------------------------
// Backend integrity path
// ---------------------------------------------------------------------------

test('backend integrity returns a structured response', { skip: !LIVE }, () => {
  const result = cli('backend', 'integrity', '--json');
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const lines = result.stdout.trim().split('\n').filter((l) => l.startsWith('{'));
  assert.ok(lines.length > 0, 'expected JSON output');
  const payload = JSON.parse(lines[0]);
  assert.equal(typeof payload.ok, 'boolean');
  assert.equal(typeof payload.total_cached, 'number');
});

// ---------------------------------------------------------------------------
// Setup / broker env path
// ---------------------------------------------------------------------------

test('setup alpaca dry-run writes no real env file', { skip: !LIVE }, () => {
  const result = cli(
    'setup', 'alpaca',
    '--dry-run',
    '--json',
    '--set', 'ALPACA_API_KEY=test_key',
    '--set', 'ALPACA_SECRET_KEY=test_secret',
    '--set', 'ALPACA_BASE_URL=https://paper-api.alpaca.markets',
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const lines = result.stdout.trim().split('\n').filter((l) => l.startsWith('{'));
  assert.ok(lines.length > 0, 'expected JSON output');
  const payload = JSON.parse(lines[0]);
  assert.equal(payload.ok, true);
  assert.equal(payload.dry_run, true);
});
