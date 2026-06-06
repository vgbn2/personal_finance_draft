'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const CLI_PATH = path.join(__dirname, '..', '..', '..', 'backend', 'cli', 'sovereign_cli.js');

function runSettings(args, settingsFile) {
  const env = { ...process.env, SOVEREIGN_USER_SETTINGS_PATH: settingsFile };
  const result = spawnSync(process.execPath, [CLI_PATH, 'settings', ...args, '--json'], { encoding: 'utf8', env });
  return JSON.parse(result.stdout.trim());
}

function withTempSettings(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sovereign-settings-'));
  const file = path.join(dir, 'user_settings.json');
  try { fn(file); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

test('settings show returns full settings shape with all required keys', () => {
  withTempSettings((file) => {
    const payload = runSettings(['show'], file);
    assert.equal(payload.ok, true);
    assert.equal(payload.type, 'user_settings');
    assert.equal(typeof payload.timezone, 'string');
    assert.equal(typeof payload.layout, 'string');
    assert.equal(typeof payload.trading, 'object');
    assert.equal(typeof payload.trading.position_size, 'number');
    assert.equal(typeof payload.trading.stop_loss, 'number');
    assert.equal(typeof payload.feature_flags, 'object');
    assert.equal(typeof payload.alerts, 'object');
  });
});

test('settings timezone persists and show reflects the change', () => {
  withTempSettings((file) => {
    const set = runSettings(['timezone', '--value', 'Asia/Ho_Chi_Minh'], file);
    assert.equal(set.ok, true);
    assert.equal(set.timezone, 'Asia/Ho_Chi_Minh');
    const show = runSettings(['show'], file);
    assert.equal(show.timezone, 'Asia/Ho_Chi_Minh');
  });
});

test('settings params --position-size merges correctly; other params unchanged', () => {
  withTempSettings((file) => {
    const set = runSettings(['params', '--position-size', '250'], file);
    assert.equal(set.ok, true);
    assert.equal(set.trading.position_size, 250);
    assert.equal(set.trading.stop_loss, 0.05);
    assert.equal(set.trading.max_positions, 10);
    const show = runSettings(['show'], file);
    assert.equal(show.trading.position_size, 250);
    assert.equal(show.trading.stop_loss, 0.05);
  });
});

test('settings auto_backfill flag and backfill_interval_min round-trip', () => {
  withTempSettings((file) => {
    // Defaults: flag off, interval present.
    const initial = runSettings(['show'], file);
    assert.equal(initial.feature_flags.auto_backfill, false);
    assert.equal(initial.trading.backfill_interval_min, 1440);

    const flag = runSettings(['flags', '--flag', 'auto_backfill', '--value', 'true'], file);
    assert.equal(flag.ok, true);
    assert.equal(flag.feature_flags.auto_backfill, true);

    const params = runSettings(['params', '--backfill-interval', '720'], file);
    assert.equal(params.ok, true);
    assert.equal(params.trading.backfill_interval_min, 720);

    const show = runSettings(['show'], file);
    assert.equal(show.feature_flags.auto_backfill, true);
    assert.equal(show.trading.backfill_interval_min, 720);
  });
});

test('settings reset restores defaults and show matches default shape', () => {
  withTempSettings((file) => {
    runSettings(['timezone', '--value', 'Asia/Tokyo'], file);
    runSettings(['params', '--position-size', '500'], file);
    const reset = runSettings(['reset'], file);
    assert.equal(reset.ok, true);
    assert.equal(reset.reset, true);
    const show = runSettings(['show'], file);
    assert.equal(show.timezone, 'UTC');
    assert.equal(show.trading.position_size, 100);
    assert.equal(show.layout, 'default');
  });
});
