'use strict';

const {
  ACCOUNT_TYPE_DEFAULTS,
  deletePropFirmProfile,
  getActivePropFirmProfile,
  getPropFirmProfileChoices,
  getPropFirmProfiles,
  formatPropFirmChoiceDescription,
  formatPropFirmChoiceLabel,
  formatPropFirmProfileLabel,
  loadPropFirmStore,
  normalizeProfile,
  setActivePropFirmProfile,
  slugify,
  upsertPropFirmProfile,
  resolvePropFirmProfile,
} = require('../../../../shared/lib/profiles/prop_firms.js');
const { runInteractiveMenu, promptSelect, promptText, promptConfirm, promptMultiSelect, isRichTerminal } = require('../../tui/index.js');
const utils = require('../../lib/utils.js');
const { hasFlag, printPayload, pageText } = utils;

function formatPropFirmRuleValue(value) {
  if (value === null || value === undefined || value === '') return 'n/a';
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  if (typeof value === 'number') {
    if (Math.abs(value) <= 1 && value !== 0) return `${(value * 100).toFixed(1)}%`;
    return String(value);
  }
  return String(value);
}

function summarizePropFirmProfile(profile, activeId = null) {
  if (!profile) return null;
  const normalized = normalizeProfile(profile);
  return {
    id: normalized.id,
    active: normalized.id === activeId,
    name: normalized.name,
    firm: normalized.firm,
    account_type: normalized.account_type,
    step_count: normalized.step_count,
    description: normalized.description,
    rules: normalized.rules,
    custom_metrics: normalized.custom_metrics,
    tags: normalized.tags,
    notes: normalized.notes,
    phases: normalized.phases,
  };
}

function displayPropFirmProfile(profile, activeId = null) {
  const normalized = normalizeProfile(profile);
  const name = formatPropFirmChoiceLabel(normalized, null);
  const ruleSummary = formatPropFirmChoiceDescription(normalized);
  const suffix = normalized.description ? ` — ${normalized.description}` : '';
  return `${name} [${ruleSummary}]${suffix}`;
}

function renderPropFirmProfileDetails(profile, activeId = null) {
  const normalized = normalizeProfile(profile);
  const lines = [
    '\x1b[1;36mProp Firm Profile\x1b[0m',
    '\x1b[90m' + '='.repeat(72) + '\x1b[0m',
    `  ${formatPropFirmChoiceLabel(normalized, activeId)}`,
    `  Type: ${normalized.account_type} | Steps: ${normalized.step_count}`,
    `  Rules: ${formatPropFirmChoiceDescription(normalized)}`,
  ];

  if (normalized.description) {
    lines.push(`  Notes: ${normalized.description}`);
  }

  lines.push('');
  lines.push('  Risk Rules');
  lines.push(`    Profit target: ${formatPropFirmRuleValue(normalized.rules.profit_target)}`);
  lines.push(`    Consistency cap: ${formatPropFirmRuleValue(normalized.rules.consistency_cap)}`);
  lines.push(`    News window: ${formatPropFirmRuleValue(normalized.rules.max_news_window_minutes)} min`);
  lines.push(`    Overnight: ${normalized.rules.allow_overnight ? 'yes' : 'no'} | Weekend: ${normalized.rules.allow_weekend ? 'yes' : 'no'} | Hedging: ${normalized.rules.allow_hedging ? 'yes' : 'no'} | EA: ${normalized.rules.allow_ea ? 'yes' : 'no'}`);

  if (Array.isArray(normalized.phases) && normalized.phases.length > 0) {
    lines.push('');
    lines.push('  Phases');
    normalized.phases.forEach((phase, index) => {
      const target = phase.profit_target == null ? 'n/a' : formatPropFirmRuleValue(phase.profit_target);
      lines.push(`    ${index + 1}. ${phase.name} | target ${target}`);
    });
  }

  return lines.join('\n');
}

function renderPropFirmProfileList(profiles, activeId = null) {
  const lines = [
    '\x1b[1;36mProp Firm Profiles\x1b[0m',
    '\x1b[90m' + '='.repeat(72) + '\x1b[0m',
  ];
  profiles.forEach((profile) => {
    const activeTag = profile.id === activeId ? '\x1b[32mACTIVE\x1b[0m' : '\x1b[90m     \x1b[0m';
    lines.push(`  [${activeTag}] ${displayPropFirmProfile(profile, activeId)}`);
  });
  lines.push('');
  lines.push('\x1b[90mTip: use `strategy prop-firms show <name>` for full rules or `--json` for automation.\x1b[0m');
  return lines.join('\n');
}

async function promptPropFirmProfilePayload(existing = null) {
  const current = existing ? normalizeProfile(existing) : null;
  const ruleDefaults = current?.rules || ACCOUNT_TYPE_DEFAULTS.two_step;
  const accountTypeOptions = [
    { label: `${current?.account_type === 'two_step' ? '[current] ' : ''}2-Step evaluation`, value: 'two_step' },
    { label: `${current?.account_type === 'one_step' ? '[current] ' : ''}1-Step evaluation`, value: 'one_step' },
    { label: `${current?.account_type === 'instant' ? '[current] ' : ''}Instant / funded`, value: 'instant' },
  ].sort((left, right) => {
    if (current?.account_type === left.value) return -1;
    if (current?.account_type === right.value) return 1;
    return 0;
  });
  const account_type = current ? await promptSelect('Account type:', accountTypeOptions) : await promptSelect('Account type:', accountTypeOptions);
  const defaults = ACCOUNT_TYPE_DEFAULTS[account_type] || ACCOUNT_TYPE_DEFAULTS.two_step;
  const suggestedName = current?.name || (
    account_type === 'one_step' ? 'One-Step Evaluation'
      : account_type === 'instant' ? 'Instant Funding'
      : 'Two-Step Evaluation'
  );
  const suggestedFirm = current?.firm || 'Custom';
  const name = await promptText('Profile name:', suggestedName);
  const firm = await promptText('Firm / provider:', suggestedFirm);
  const description = await promptText('Description:', current?.description || `${suggestedName} prop-firm profile`);
  const max_daily_loss = await promptText('Max daily loss (decimal):', String(ruleDefaults.max_daily_loss ?? defaults.max_daily_loss));
  const max_total_loss = await promptText('Max total loss (decimal):', String(ruleDefaults.max_total_loss ?? defaults.max_total_loss));
  const min_trading_days = await promptText('Minimum trading days:', String(ruleDefaults.min_trading_days ?? defaults.min_trading_days));
  const profit_target = await promptText('Profit target (blank for none):', ruleDefaults.profit_target === null ? '' : String(ruleDefaults.profit_target));
  const consistency_cap = await promptText('Consistency cap (decimal):', String(ruleDefaults.consistency_cap ?? defaults.consistency_cap));
  const max_news_window_minutes = await promptText('Max news window (minutes):', String(ruleDefaults.max_news_window_minutes ?? defaults.max_news_window_minutes));
  const phaseTargetsDefault = current?.phases?.length
    ? current.phases.map((phase) => phase.profit_target).filter((value) => value !== null && value !== undefined).join(',')
    : account_type === 'instant'
      ? ''
      : account_type === 'one_step'
        ? String(ruleDefaults.profit_target ?? defaults.profit_target ?? '')
        : `${ruleDefaults.profit_target ?? defaults.profit_target ?? ''},${((ruleDefaults.profit_target ?? defaults.profit_target ?? 0) / 2).toFixed(4)}`;
  const phaseTargets = await promptText('Phase profit targets (comma-separated, blank = auto):', phaseTargetsDefault);
  const customMetricsText = await promptText('Custom metrics JSON (optional):', JSON.stringify(current?.custom_metrics || {}));
  const tagsText = await promptText('Tags (comma-separated):', (current?.tags || []).join(', '));
  const notesText = await promptText('Notes (comma-separated):', (current?.notes || []).join(', '));
  const allow_overnight = await promptConfirm('Allow overnight holds?', Boolean(ruleDefaults.allow_overnight ?? defaults.allow_overnight));
  const allow_weekend = await promptConfirm('Allow weekend holds?', Boolean(ruleDefaults.allow_weekend ?? defaults.allow_weekend));
  const allow_hedging = await promptConfirm('Allow hedging?', Boolean(ruleDefaults.allow_hedging ?? defaults.allow_hedging));
  const allow_ea = await promptConfirm('Allow EAs / bots?', Boolean(ruleDefaults.allow_ea ?? defaults.allow_ea));
  const id = current?.id || slugify(`${firm || 'propfirm'}_${name || account_type}_${account_type}`) || `propfirm_${account_type}`;
  const step_count = account_type === 'one_step' ? 1 : account_type === 'instant' ? 0 : 2;
  const phaseValues = phaseTargets
    .split(',')
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isFinite(value));
  const phases = step_count > 0
    ? Array.from({ length: step_count }, (_, index) => ({
        name: `step_${index + 1}`,
        profit_target: phaseValues[index] ?? (index === step_count - 1 ? (Number.isFinite(Number(profit_target)) ? Number(profit_target) : null) : null),
        notes: '',
      }))
    : [];

  let custom_metrics = {};
  try {
    custom_metrics = customMetricsText ? JSON.parse(customMetricsText) : {};
  } catch {
    custom_metrics = {};
  }

  return normalizeProfile({
    id,
    name,
    firm,
    account_type,
    step_count,
    description,
    rules: {
      max_daily_loss: Number(max_daily_loss),
      max_total_loss: Number(max_total_loss),
      min_trading_days: Number(min_trading_days),
      profit_target: profit_target === '' ? null : Number(profit_target),
      consistency_cap: Number(consistency_cap),
      max_news_window_minutes: Number(max_news_window_minutes),
      allow_overnight,
      allow_weekend,
      allow_hedging,
      allow_ea,
    },
    phases,
    custom_metrics,
    tags: tagsText.split(',').map((value) => value.trim()).filter(Boolean),
    notes: notesText.split(',').map((value) => value.trim()).filter(Boolean),
    updated_at: new Date().toISOString(),
  });
}

async function commandPropFirmProfiles(args) {
  const subcommand = args[0];
  const store = loadPropFirmStore();
  const profiles = getPropFirmProfiles().sort((a, b) => `${a.firm} ${a.name}`.localeCompare(`${b.firm} ${b.name}`));

  if (!subcommand || subcommand === 'list' || subcommand === 'interactive') {
    if (!isRichTerminal() || hasFlag(args, '--json')) {
      if (hasFlag(args, '--json')) {
        printPayload({
          active_profile_id: store.active_profile_id,
          count: profiles.length,
          profiles: profiles.map((profile) => summarizePropFirmProfile(profile, store.active_profile_id)),
        }, args);
      } else {
        pageText(renderPropFirmProfileList(profiles, store.active_profile_id), args);
      }
      return 0;
    }

    const profileChoices = [
      { label: '+ Add new profile', value: '__ADD' },
      ...profiles.map((p) => ({
        label: formatPropFirmChoiceLabel(p, store.active_profile_id),
        description: formatPropFirmChoiceDescription(p),
        value: p.id,
      })),
    ];
    const selectedId = await promptSelect('Select profile:', profileChoices);
    if (!selectedId) return 0;
    if (selectedId === '__ADD') return commandPropFirmProfiles(['add']);

    const contextAction = await promptSelect(`Profile: ${selectedId}`, [
      { label: 'Set Active', value: 'set-active' },
      { label: 'Edit', value: 'edit' },
      { label: 'Inspect', value: 'show' },
      { label: 'Delete', value: 'delete' },
      { label: 'Back', value: null },
    ]);
    if (!contextAction) return 0;
    return commandPropFirmProfiles([contextAction, selectedId]);
  }

  if (subcommand === 'show') {
    const targetRef = args[1] || (isRichTerminal() && !hasFlag(args, '--json')
      ? await promptSelect('Select profile:', getPropFirmProfileChoices())
      : null);
    const profile = resolvePropFirmProfile(targetRef) || (targetRef ? resolvePropFirmProfile(targetRef) : null);
    if (!profile) {
      printPayload({ error: 'Prop firm profile not found' }, args);
      return 1;
    }
    if (hasFlag(args, '--json')) {
      printPayload(summarizePropFirmProfile(profile, store.active_profile_id), args);
    } else {
      pageText(renderPropFirmProfileDetails(profile, store.active_profile_id), args);
    }
    return 0;
  }

  if (subcommand === 'add' || subcommand === 'edit') {
    const existing = subcommand === 'edit'
      ? resolvePropFirmProfile(args[1] || (isRichTerminal() && !hasFlag(args, '--json') ? await promptSelect('Edit profile:', getPropFirmProfileChoices()) : null))
      : null;
    if (subcommand === 'edit' && !existing) {
      printPayload({ error: 'Prop firm profile not found' }, args);
      return 1;
    }
    const payload = await promptPropFirmProfilePayload(existing);
    upsertPropFirmProfile(payload);
    const savedProfile = resolvePropFirmProfile(payload.id) || payload;
    const refreshedStore = loadPropFirmStore();
    if (hasFlag(args, '--json')) {
      printPayload({
        saved: payload.id,
        active_profile_id: refreshedStore.active_profile_id,
        profile: summarizePropFirmProfile(savedProfile, refreshedStore.active_profile_id),
      }, args);
    } else {
      pageText(renderPropFirmProfileDetails(savedProfile, refreshedStore.active_profile_id), args);
    }
    return 0;
  }

  if (subcommand === 'set-active') {
    const targetRef = args[1] || (isRichTerminal() && !hasFlag(args, '--json')
      ? await promptSelect('Set active profile:', getPropFirmProfileChoices())
      : null);
    if (!targetRef) {
      printPayload({ error: 'Prop firm profile id is required' }, args);
      return 1;
    }
    const profile = setActivePropFirmProfile(targetRef);
    if (hasFlag(args, '--json')) {
      printPayload({ active_profile_id: profile.id, profile: summarizePropFirmProfile(profile, profile.id) }, args);
    } else {
      pageText(renderPropFirmProfileDetails(profile, profile.id), args);
    }
    return 0;
  }

  if (subcommand === 'delete') {
    const targetRef = args[1] || (isRichTerminal() && !hasFlag(args, '--json')
      ? await promptSelect('Delete profile:', getPropFirmProfileChoices())
      : null);
    if (!targetRef) {
      printPayload({ error: 'Prop firm profile id is required' }, args);
      return 1;
    }
    const profile = resolvePropFirmProfile(targetRef);
    if (!profile) {
      printPayload({ error: 'Prop firm profile not found' }, args);
      return 1;
    }
    const confirmed = hasFlag(args, '--yes') || hasFlag(args, '--force') || (!isRichTerminal() ? true : await promptConfirm(`Delete ${profile.name}?`, false));
    if (!confirmed) return 0;
    const removed = deletePropFirmProfile(profile.id);
    if (hasFlag(args, '--json')) {
      printPayload({ deleted: removed ? profile.id : null }, args);
    } else if (removed) {
      console.log(`Deleted prop-firm profile: ${profile.name}`);
    }
    return removed ? 0 : 1;
  }

  printPayload({ error: 'Usage: strategy prop-firms [list|show|add|edit|set-active|delete]' }, args);
  return 1;
}

module.exports = {
  formatPropFirmRuleValue,
  summarizePropFirmProfile,
  displayPropFirmProfile,
  renderPropFirmProfileDetails,
  renderPropFirmProfileList,
  promptPropFirmProfilePayload,
  commandPropFirmProfiles,
};
