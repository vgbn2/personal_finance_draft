const fs = require('node:fs');
const path = require('node:path');
const { REPO_ROOT } = require('../runtime/paths');
const { writeJson } = require('../market/validation');

const PROP_FIRM_STORE_PATH = path.join(REPO_ROOT, 'config', 'trading', 'prop_firms.json');

const ACCOUNT_TYPE_DEFAULTS = {
  one_step: {
    max_daily_loss: 0.04,
    max_total_loss: 0.05,
    min_trading_days: 3,
    profit_target: 0.08,
    consistency_cap: 0.4,
    max_news_window_minutes: 2,
    allow_overnight: false,
    allow_weekend: false,
    allow_hedging: false,
    allow_ea: true,
  },
  two_step: {
    max_daily_loss: 0.04,
    max_total_loss: 0.06,
    min_trading_days: 4,
    profit_target: 0.10,
    consistency_cap: 0.35,
    max_news_window_minutes: 2,
    allow_overnight: false,
    allow_weekend: false,
    allow_hedging: false,
    allow_ea: true,
  },
  instant: {
    max_daily_loss: 0.03,
    max_total_loss: 0.05,
    min_trading_days: 1,
    profit_target: null,
    consistency_cap: 0.25,
    max_news_window_minutes: 2,
    allow_overnight: false,
    allow_weekend: false,
    allow_hedging: false,
    allow_ea: true,
  },
};

function normalizeText(value, fallback = '') {
  const text = String(value ?? '').trim();
  if (text) return text;
  return String(fallback ?? '').trim();
}

function slugify(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

function toBoolean(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (value === null || value === undefined || value === '') return fallback;
  const text = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(text)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(text)) return false;
  return fallback;
}

function toNumber(value, fallback = null) {
  if (value === null || value === undefined || value === '') return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeAccountType(value) {
  const text = slugify(value);
  if (!text) return 'two_step';
  if (['1_step', 'one_step', 'one', 'single_step', 'single'].includes(text)) return 'one_step';
  if (['2_step', 'two_step', 'two', 'multi_step', 'evaluation'].includes(text)) return 'two_step';
  if (['instant', 'direct', 'funded', 'funding'].includes(text)) return 'instant';
  return ['one_step', 'two_step', 'instant'].includes(text) ? text : 'two_step';
}

function defaultProfiles() {
  return {
    vprop_starter_2_step: {
      id: 'vprop_starter_2_step',
      name: 'VProp Starter 2-Step',
      firm: 'VProp',
      account_type: 'two_step',
      step_count: 2,
      description: 'Starter template for small-account evaluations with tight daily loss control.',
      rules: {
        max_daily_loss: 0.04,
        max_total_loss: 0.06,
        min_trading_days: 4,
        profit_target: 0.10,
        consistency_cap: 0.35,
        max_news_window_minutes: 2,
        allow_overnight: false,
        allow_weekend: false,
        allow_hedging: false,
        allow_ea: true,
      },
      phases: [
        { name: 'step_1', profit_target: 0.10 },
        { name: 'step_2', profit_target: 0.05 },
      ],
    },
    ftmo_standard_2_step: {
      id: 'ftmo_standard_2_step',
      name: 'FTMO Standard 2-Step',
      firm: 'FTMO',
      account_type: 'two_step',
      step_count: 2,
      description: 'Generic two-step template with moderate consistency pressure.',
      rules: {
        max_daily_loss: 0.05,
        max_total_loss: 0.10,
        min_trading_days: 4,
        profit_target: 0.10,
        consistency_cap: 0.5,
        max_news_window_minutes: 2,
        allow_overnight: true,
        allow_weekend: false,
        allow_hedging: false,
        allow_ea: true,
      },
      phases: [
        { name: 'step_1', profit_target: 0.10 },
        { name: 'step_2', profit_target: 0.05 },
      ],
    },
    topstep_consistency_1_step: {
      id: 'topstep_consistency_1_step',
      name: 'Topstep Consistency 1-Step',
      firm: 'Topstep',
      account_type: 'one_step',
      step_count: 1,
      description: 'Futures-style one-step template emphasizing consistency and daily loss discipline.',
      rules: {
        max_daily_loss: 0.03,
        max_total_loss: 0.05,
        min_trading_days: 5,
        profit_target: 0.08,
        consistency_cap: 0.5,
        max_news_window_minutes: 3,
        allow_overnight: true,
        allow_weekend: false,
        allow_hedging: false,
        allow_ea: true,
      },
      phases: [
        { name: 'funding', profit_target: 0.08 },
      ],
    },
    the5ers_growth_instant: {
      id: 'the5ers_growth_instant',
      name: 'The5ers Growth Instant',
      firm: 'The5ers',
      account_type: 'instant',
      step_count: 0,
      description: 'Instant-funding starter template for traders that need tighter drawdown control.',
      rules: {
        max_daily_loss: 0.03,
        max_total_loss: 0.05,
        min_trading_days: 1,
        profit_target: null,
        consistency_cap: 0.25,
        max_news_window_minutes: 2,
        allow_overnight: false,
        allow_weekend: false,
        allow_hedging: false,
        allow_ea: true,
      },
      phases: [],
    },
    fundednext_evaluation_2_step: {
      id: 'fundednext_evaluation_2_step',
      name: 'FundedNext Evaluation 2-Step',
      firm: 'FundedNext',
      account_type: 'two_step',
      step_count: 2,
      description: 'Two-step starter profile with a stricter consistency cap and news avoidance.',
      rules: {
        max_daily_loss: 0.04,
        max_total_loss: 0.06,
        min_trading_days: 5,
        profit_target: 0.10,
        consistency_cap: 0.35,
        max_news_window_minutes: 2,
        allow_overnight: false,
        allow_weekend: false,
        allow_hedging: false,
        allow_ea: true,
      },
      phases: [
        { name: 'step_1', profit_target: 0.10 },
        { name: 'step_2', profit_target: 0.05 },
      ],
    },
  };
}

function defaultStore() {
  return {
    version: 1,
    active_profile_id: 'vprop_starter_2_step',
    profiles: defaultProfiles(),
    updated_at: new Date().toISOString(),
  };
}

function normalizeProfile(raw = {}) {
  const accountType = normalizeAccountType(raw.account_type || raw.accountType || raw.type);
  const id = slugify(raw.id || raw.name || `${raw.firm || 'propfirm'}_${accountType}`) || `propfirm_${accountType}`;
  const baseRules = {
    ...(ACCOUNT_TYPE_DEFAULTS[accountType] || ACCOUNT_TYPE_DEFAULTS.two_step),
    ...(raw.rules && typeof raw.rules === 'object' ? raw.rules : {}),
  };
  const directRuleKeys = [
    'max_daily_loss',
    'max_total_loss',
    'min_trading_days',
    'profit_target',
    'consistency_cap',
    'max_news_window_minutes',
    'allow_overnight',
    'allow_weekend',
    'allow_hedging',
    'allow_ea',
  ];
  for (const key of directRuleKeys) {
    if (raw[key] !== undefined && raw[key] !== null && raw[key] !== '') {
      baseRules[key] = raw[key];
    }
  }

  const rules = {
    ...baseRules,
    max_daily_loss: toNumber(baseRules.max_daily_loss, ACCOUNT_TYPE_DEFAULTS[accountType].max_daily_loss),
    max_total_loss: toNumber(baseRules.max_total_loss, ACCOUNT_TYPE_DEFAULTS[accountType].max_total_loss),
    min_trading_days: Math.max(0, Math.floor(toNumber(baseRules.min_trading_days, ACCOUNT_TYPE_DEFAULTS[accountType].min_trading_days))),
    profit_target: baseRules.profit_target === null
      ? null
      : toNumber(baseRules.profit_target, ACCOUNT_TYPE_DEFAULTS[accountType].profit_target),
    consistency_cap: toNumber(baseRules.consistency_cap, ACCOUNT_TYPE_DEFAULTS[accountType].consistency_cap),
    max_news_window_minutes: Math.max(0, Math.floor(toNumber(baseRules.max_news_window_minutes, ACCOUNT_TYPE_DEFAULTS[accountType].max_news_window_minutes))),
    allow_overnight: toBoolean(baseRules.allow_overnight, ACCOUNT_TYPE_DEFAULTS[accountType].allow_overnight),
    allow_weekend: toBoolean(baseRules.allow_weekend, ACCOUNT_TYPE_DEFAULTS[accountType].allow_weekend),
    allow_hedging: toBoolean(baseRules.allow_hedging, ACCOUNT_TYPE_DEFAULTS[accountType].allow_hedging),
    allow_ea: toBoolean(baseRules.allow_ea, ACCOUNT_TYPE_DEFAULTS[accountType].allow_ea),
  };

  const stepCount = Number.isFinite(Number(raw.step_count))
    ? Math.max(0, Math.floor(Number(raw.step_count)))
    : (accountType === 'one_step' ? 1 : accountType === 'instant' ? 0 : 2);
  const phases = Array.isArray(raw.phases)
    ? raw.phases.map((phase, index) => ({
        name: normalizeText(phase && phase.name, `step_${index + 1}`),
        profit_target: phase && phase.profit_target !== undefined ? toNumber(phase.profit_target, null) : null,
        notes: normalizeText(phase && phase.notes, ''),
      }))
    : (stepCount > 0
      ? Array.from({ length: stepCount }, (_, index) => ({
          name: `step_${index + 1}`,
          profit_target: index === stepCount - 1 && rules.profit_target !== null ? rules.profit_target : null,
          notes: '',
        }))
      : []);

  const customMetrics = raw.custom_metrics && typeof raw.custom_metrics === 'object' && !Array.isArray(raw.custom_metrics)
    ? raw.custom_metrics
    : {};

  return {
    id,
    name: normalizeText(raw.name, id),
    firm: normalizeText(raw.firm, raw.name || id),
    account_type: accountType,
    step_count: stepCount,
    description: normalizeText(raw.description, ''),
    tags: Array.isArray(raw.tags) ? raw.tags.map((value) => normalizeText(value)).filter(Boolean) : [],
    rules,
    phases,
    custom_metrics: customMetrics,
    notes: Array.isArray(raw.notes) ? raw.notes.map((value) => normalizeText(value)).filter(Boolean) : [],
    updated_at: normalizeText(raw.updated_at, new Date().toISOString()),
  };
}

function loadPropFirmStore(options = {}) {
  const storePath = options.storePath || PROP_FIRM_STORE_PATH;
  if (!fs.existsSync(storePath)) {
    return defaultStore();
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(storePath, 'utf8'));
    if (!parsed || typeof parsed !== 'object') {
      return defaultStore();
    }
    const profilesSource = Array.isArray(parsed.profiles)
      ? Object.fromEntries(parsed.profiles.map((profile) => [profile.id || slugify(profile.name), normalizeProfile(profile)]))
      : Object.fromEntries(Object.entries(parsed.profiles || {}).map(([id, profile]) => [id, normalizeProfile({ id, ...profile })]));
    return {
      version: Number.isFinite(Number(parsed.version)) ? Number(parsed.version) : 1,
      active_profile_id: normalizeText(parsed.active_profile_id, 'vprop_starter_2_step'),
      profiles: profilesSource,
      updated_at: normalizeText(parsed.updated_at, new Date().toISOString()),
    };
  } catch {
    return defaultStore();
  }
}

function savePropFirmStore(store, options = {}) {
  const storePath = options.storePath || PROP_FIRM_STORE_PATH;
  const payload = {
    version: 1,
    active_profile_id: normalizeText(store.active_profile_id, 'vprop_starter_2_step'),
    profiles: Object.fromEntries(
      Object.entries(store.profiles || {}).map(([id, profile]) => [id, normalizeProfile({ id, ...profile })])
    ),
    updated_at: new Date().toISOString(),
  };
  writeJson(storePath, payload);
  return payload;
}

function getPropFirmProfiles(options = {}) {
  const store = loadPropFirmStore(options);
  return Object.values(store.profiles).map((profile) => normalizeProfile(profile));
}

function resolvePropFirmProfile(ref, options = {}) {
  const store = loadPropFirmStore(options);
  const normalizedRef = normalizeText(ref, '').toLowerCase();
  if (!normalizedRef || normalizedRef === 'active' || normalizedRef === 'default') {
    const active = store.profiles[store.active_profile_id] || null;
    return active ? normalizeProfile(active) : null;
  }
  if (['none', 'off', 'disabled', 'skip'].includes(normalizedRef)) {
    return null;
  }

  const direct = store.profiles[ref] || store.profiles[slugify(ref)] || null;
  if (direct) return normalizeProfile(direct);

  const matched = Object.values(store.profiles).find((profile) => {
    const normalizedName = normalizeText(profile.name).toLowerCase();
    const normalizedFirm = normalizeText(profile.firm).toLowerCase();
    return normalizedName === normalizedRef || normalizedFirm === normalizedRef;
  });
  return matched ? normalizeProfile(matched) : null;
}

function getActivePropFirmProfile(options = {}) {
  return resolvePropFirmProfile('active', options);
}

function getPropFirmProfileChoices(options = {}) {
  const profiles = getPropFirmProfiles(options);
  const activeId = loadPropFirmStore(options).active_profile_id;
  return profiles
    .sort((a, b) => `${a.firm} ${a.name}`.localeCompare(`${b.firm} ${b.name}`))
    .map((profile) => ({
      label: formatPropFirmChoiceLabel(profile, activeId),
      description: formatPropFirmChoiceDescription(profile),
      value: profile.id,
      category: profile.firm || profile.account_type,
    }));
}

function upsertPropFirmProfile(input = {}, options = {}) {
  const store = loadPropFirmStore(options);
  const profile = normalizeProfile(input);
  store.profiles[profile.id] = profile;
  if (!store.active_profile_id) {
    store.active_profile_id = profile.id;
  }
  return savePropFirmStore(store, options);
}

function deletePropFirmProfile(id, options = {}) {
  const store = loadPropFirmStore(options);
  const key = slugify(id);
  if (!key || !store.profiles[key]) return false;
  delete store.profiles[key];
  if (store.active_profile_id === key) {
    store.active_profile_id = Object.keys(store.profiles)[0] || 'vprop_starter_2_step';
  }
  savePropFirmStore(store, options);
  return true;
}

function setActivePropFirmProfile(id, options = {}) {
  const store = loadPropFirmStore(options);
  const key = slugify(id);
  if (!key || !store.profiles[key]) {
    throw new Error(`Prop firm profile not found: ${id}`);
  }
  store.active_profile_id = key;
  savePropFirmStore(store, options);
  return normalizeProfile(store.profiles[key]);
}

function flattenRules(profile = {}) {
  const normalized = normalizeProfile(profile);
  return {
    profile_id: normalized.id,
    profile_name: normalized.name,
    firm: normalized.firm,
    account_type: normalized.account_type,
    step_count: normalized.step_count,
    ...normalized.rules,
  };
}

function formatPropFirmProfileLabel(profile, activeId = null) {
  const normalized = normalizeProfile(profile);
  const name = normalizeText(normalized.name, normalized.id);
  const firm = normalizeText(normalized.firm, normalized.id);
  const status = normalized.id === activeId ? '[ACTIVE]' : '[     ]';
  const ruleBits = [
    `DD ${Math.round((normalized.rules.max_daily_loss || 0) * 1000) / 10}%`,
    `TD ${normalized.rules.min_trading_days}`,
    `Loss ${Math.round((normalized.rules.max_total_loss || 0) * 1000) / 10}%`,
  ].join(' | ');
  return `${status} ${name} (${firm} | ${normalized.account_type} | ${normalized.id}) ${ruleBits}`;
}

function formatPropFirmChoiceLabel(profile, activeId = null) {
  const normalized = normalizeProfile(profile);
  const name = normalizeText(normalized.name, normalized.id);
  const firm = normalizeText(normalized.firm, normalized.id);
  const status = normalized.id === activeId ? '[ACTIVE] ' : '';
  return `${status}${name} | ${firm}`;
}

function formatPropFirmChoiceDescription(profile) {
  const normalized = normalizeProfile(profile);
  const dailyLoss = Math.round((normalized.rules.max_daily_loss || 0) * 1000) / 10;
  const totalLoss = Math.round((normalized.rules.max_total_loss || 0) * 1000) / 10;
  return [
    normalized.account_type,
    `DD ${dailyLoss}%`,
    `TD ${normalized.rules.min_trading_days}`,
    `Loss ${totalLoss}%`,
  ].join(' | ');
}

module.exports = {
  ACCOUNT_TYPE_DEFAULTS,
  PROP_FIRM_STORE_PATH,
  deletePropFirmProfile,
  defaultProfiles,
  defaultStore,
  flattenRules,
  getActivePropFirmProfile,
  getPropFirmProfileChoices,
  getPropFirmProfiles,
  loadPropFirmStore,
  normalizeAccountType,
  normalizeProfile,
  formatPropFirmProfileLabel,
  formatPropFirmChoiceDescription,
  formatPropFirmChoiceLabel,
  resolvePropFirmProfile,
  savePropFirmStore,
  setActivePropFirmProfile,
  slugify,
  toBoolean,
  toNumber,
  upsertPropFirmProfile,
};
