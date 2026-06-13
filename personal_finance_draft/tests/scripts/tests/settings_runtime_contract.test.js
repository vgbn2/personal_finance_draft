'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { formatTimeForSettings, layoutConfig } = require('../../../shared/lib/settings/runtime');

const CLI_PATH = path.join(__dirname, '..', '..', '..', 'backend', 'cli', 'sovereign_cli.js');

function withTempSettings(settings, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sovereign-runtime-settings-'));
  const file = path.join(dir, 'user_settings.json');
  fs.writeFileSync(file, JSON.stringify(settings, null, 2));
  try {
    fn(file);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function runCli(args, settingsFile) {
  return spawnSync(process.execPath, [CLI_PATH, ...args, '--json'], {
    encoding: 'utf8',
    env: { ...process.env, SOVEREIGN_USER_SETTINGS_PATH: settingsFile },
  });
}

function sampleSettings(featureFlags = {}) {
  return {
    timezone: 'UTC',
    layout: 'default',
    trading: {
      position_size: 100,
      stop_loss: 0.05,
      take_profit: 0.1,
      min_edge: 0.05,
      max_positions: 10,
      polling_interval: 60,
      backfill_interval_min: 1440,
    },
    feature_flags: {
      bot_autopilot: true,
      polymarket: true,
      onchain_data: true,
      multi_agent_research: true,
      auto_rebalance: false,
      ai_agent_trading: true,
      auto_backfill: false,
      ...featureFlags,
    },
    alerts: { email: true, push: false },
  };
}

test('layout config changes page sizes for compact and research layouts', () => {
  assert.deepEqual(layoutConfig({ layout: 'compact' }), { name: 'compact', selectPageSize: 8, multiSelectPageSize: 10 });
  assert.deepEqual(layoutConfig({ layout: 'research' }), { name: 'research', selectPageSize: 14, multiSelectPageSize: 16 });
  assert.deepEqual(layoutConfig({ layout: 'default' }), { name: 'default', selectPageSize: 10, multiSelectPageSize: 12 });
});

test('timezone formatter uses the saved timezone', () => {
  const stamp = new Date('2026-06-07T00:00:00.000Z');
  assert.equal(formatTimeForSettings(stamp, { timezone: 'UTC' }), '00:00:00');
  assert.equal(formatTimeForSettings(stamp, { timezone: 'Asia/Ho_Chi_Minh' }), '07:00:00');
});

test('polymarket command is blocked when feature flag is off', () => {
  withTempSettings(sampleSettings({ polymarket: false }), (file) => {
    const result = runCli(['polymarket', 'portfolio'], file);
    assert.equal(result.status, 1);
    const payload = JSON.parse(result.stdout.trim());
    assert.equal(payload.ok, false);
    assert.equal(payload.feature_flag, 'polymarket');
  });
});

test('agent command is blocked when multi_agent_research flag is off', () => {
  withTempSettings(sampleSettings({ multi_agent_research: false }), (file) => {
    const result = runCli(['agent', '--query', 'test'], file);
    assert.equal(result.status, 1);
    const payload = JSON.parse(result.stdout.trim());
    assert.equal(payload.feature_flag, 'multi_agent_research');
  });
});

test('ingest onchain family is blocked when onchain_data flag is off', () => {
  withTempSettings(sampleSettings({ onchain_data: false }), (file) => {
    const result = runCli(['ingest', '--family', 'onchain'], file);
    assert.equal(result.status, 1);
    const payload = JSON.parse(result.stdout.trim());
    assert.equal(payload.feature_flag, 'onchain_data');
  });
});

test('bot cycle is blocked when bot_autopilot flag is off', () => {
  withTempSettings(sampleSettings({ bot_autopilot: false }), (file) => {
    const result = runCli(['bot', 'cycle'], file);
    assert.equal(result.status, 1);
    const payload = JSON.parse(result.stdout.trim());
    assert.equal(payload.feature_flag, 'bot_autopilot');
  });
});

test('auto-trade is blocked when ai_agent_trading flag is off', () => {
  withTempSettings(sampleSettings({ ai_agent_trading: false }), (file) => {
    const result = runCli(['auto-trade'], file);
    assert.equal(result.status, 1);
    const payload = JSON.parse(result.stdout.trim());
    assert.equal(payload.feature_flag, 'ai_agent_trading');
  });
});
