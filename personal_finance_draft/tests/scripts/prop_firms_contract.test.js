const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  assessPropFirmSuitability,
} = require('../../shared/lib/strategy/backtest');
const {
  formatPropFirmChoiceDescription,
  formatPropFirmChoiceLabel,
  getPropFirmProfileChoices,
  loadPropFirmStore,
  resolvePropFirmProfile,
  setActivePropFirmProfile,
  formatPropFirmProfileLabel,
  normalizeProfile,
  upsertPropFirmProfile,
} = require('../../shared/lib/prop_firms');

function tempStorePath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prop-firm-store-'));
  return path.join(dir, 'prop_firms.json');
}

test('prop firm profiles load, persist, and resolve active profiles', () => {
  const storePath = tempStorePath();

  const seeded = loadPropFirmStore({ storePath });
  assert.equal(seeded.active_profile_id, 'vprop_starter_2_step');
  assert.ok(seeded.profiles.vprop_starter_2_step);

  upsertPropFirmProfile({
    id: 'custom_one_step',
    name: 'Custom One Step',
    firm: 'Acme Prop',
    account_type: 'one_step',
    rules: {
      max_daily_loss: 0.03,
      max_total_loss: 0.05,
      min_trading_days: 5,
      profit_target: 0.08,
      consistency_cap: 0.25,
      max_news_window_minutes: 1,
      allow_overnight: false,
      allow_weekend: false,
      allow_hedging: false,
      allow_ea: true,
    },
  }, { storePath });

  const persisted = loadPropFirmStore({ storePath });
  assert.ok(persisted.profiles.custom_one_step);
  assert.equal(persisted.profiles.custom_one_step.account_type, 'one_step');

  const active = setActivePropFirmProfile('custom_one_step', { storePath });
  assert.equal(active.id, 'custom_one_step');
  assert.equal(resolvePropFirmProfile('active', { storePath }).id, 'custom_one_step');

  const choices = getPropFirmProfileChoices({ storePath });
  assert.ok(choices.some((choice) => choice.value === 'custom_one_step'));
  assert.ok(choices.some((choice) => String(choice.label).includes('[ACTIVE]')));
  assert.ok(choices.every((choice) => !String(choice.label).includes('custom_one_step')));
});

test('legacy blank profiles normalize to usable labels', () => {
  const profile = normalizeProfile({
    id: 'propfirm_one_step_one_step',
    name: '',
    firm: '',
    account_type: 'one_step',
    step_count: 1,
    rules: {},
  });

  const label = formatPropFirmProfileLabel(profile, 'vprop_starter_2_step');
  assert.equal(profile.name, 'propfirm_one_step_one_step');
  assert.equal(profile.firm, 'propfirm_one_step_one_step');
  assert.match(label, /propfirm_one_step_one_step/);
  assert.match(label, /one_step/);
});

test('prop firm choice labels stay human-readable while ids remain internal', () => {
  const profile = normalizeProfile({
    id: 'custom_two_step_evaluation_null',
    name: 'Two-Step Evaluation',
    firm: 'Custom',
    account_type: 'two_step',
    rules: {
      max_daily_loss: 0.04,
      max_total_loss: 0.06,
      min_trading_days: 4,
    },
  });

  const label = formatPropFirmChoiceLabel(profile, profile.id);
  const description = formatPropFirmChoiceDescription(profile);

  assert.equal(label, '[ACTIVE] Two-Step Evaluation | Custom');
  assert.equal(description, 'two_step | DD 4% | TD 4 | Loss 6%');
});

test('assessPropFirmSuitability uses the selected profile and supports opt-out', () => {
  const profile = {
    id: 'low_variance_2_step',
    name: 'Low Variance 2-Step',
    firm: 'Example Firm',
    account_type: 'two_step',
    step_count: 2,
    rules: {
      max_daily_loss: 0.04,
      max_total_loss: 0.06,
      min_trading_days: 4,
      profit_target: 0.1,
      consistency_cap: 0.35,
      max_news_window_minutes: 2,
      allow_overnight: false,
      allow_weekend: false,
      allow_hedging: false,
      allow_ea: true,
    },
  };

  const result = assessPropFirmSuitability(
    {
      net_return: 0.12,
      max_drawdown: 0.03,
      time_weighted_variance: 0.0002,
    },
    [
      { net_return: 0.02, exit_time: '2026-01-01T00:00:00Z', holding_period_bars: 10 },
      { net_return: 0.03, exit_time: '2026-01-02T00:00:00Z', holding_period_bars: 10 },
      { net_return: 0.01, exit_time: '2026-01-03T00:00:00Z', holding_period_bars: 10 },
      { net_return: 0.04, exit_time: '2026-01-04T00:00:00Z', holding_period_bars: 10 },
    ],
    { propFirmProfile: profile },
  );

  assert.equal(result.profile_id, 'low_variance_2_step');
  assert.equal(result.account_type, 'two_step');
  assert.equal(result.firm, 'Example Firm');
  assert.equal(result.passable, true);

  const disabled = assessPropFirmSuitability(
    { net_return: 0.12, max_drawdown: 0.03, time_weighted_variance: 0.0002 },
    [],
    { propFirm: 'none' },
  );

  assert.equal(disabled, null);
});
