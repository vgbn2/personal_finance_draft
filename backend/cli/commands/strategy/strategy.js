const path = require('node:path');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const {
  fetchBinanceBaseCandles, fetchCoinbaseBaseCandles, fetchKalshiHistoricalCandlesticks,
  fetchKalshiHistoricalMarkets, fetchStooqDailyHistory, fetchPolymarketHistoricalPrices,
  fetchYahooBaseCandles, fetchPaginated, fetchParallelBackfill, ingestMarketData,
  dedupePreferredMarketQuotes, loadConfig, loadExternalQuoteInputs,
  resolveCommoditySymbol, resolveEquityOrIndexSymbol, resolveStooqSymbol
} = require('../../../scripts/data_ops/ingest_market_data.js');
const { DEFAULT_PROVIDER_PRIORITY } = require('../../../../shared/lib/market/quote_router.js');
const { filterFeatureFrame, runBacktest, splitFeatureFrame } = require('../../../../shared/lib/strategy/backtest.js');
const { calculateFeatureFrame, calculateRollingFeatureFrame, DEFAULT_PERIODS, generateSampleBars } = require('../../../../shared/lib/market/indicators.js');
const { compareModels } = require('../../../../shared/lib/ml/models.js');
const { mergeSnapshots, readSnapshot, validateSnapshot, writeJson } = require('../../../../shared/lib/market/validation.js');
const { runInteractiveMenu, handleIntersection, promptSelect, promptText, promptConfirm, promptMultiSelect, isRichTerminal } = require('../../tui/index.js');
const { inferStrategyTaxonomy, laneDisplayLabel, formatStrategyGradeTag, decorateStrategyRecord } = require('../../../../shared/lib/strategy/registry.js');
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
const { featureGate, loadRuntimeSettings } = require('../../../../shared/lib/settings/runtime');

const utils = require('../../lib/utils.js');
const { usage, helpText, pageText, optionValue, hasFlag, printPayload, currentPhaseLabel, formatHumanNumber, formatHumanPayload, renderHumanValue, safeReadJson, labelState, numericOption, get_Current_Universe_Symbols } = utils;
const { REPO_ROOT, DEFAULT_SNAPSHOT, DEFAULT_QUALITY_REPORT, DEFAULT_HISTORY, DEFAULT_FEATURES, DEFAULT_MODEL_REPORT, DEFAULT_BACKTEST, DEFAULT_STATE_PATH, BACKEND_CANDIDATES, HELP_TOPICS } = utils;



function slugifyStrategyName(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function buildStrategyPlan(name, options = {}) {
  const strategyName = slugifyStrategyName(name);
  if (!strategyName) {
    throw new Error('strategy name is required');
  }
  const kind = String(options.kind || 'momentum').toLowerCase();
  const taxonomy = inferStrategyTaxonomy({
    name: strategyName,
    kind,
    family: options.family || kind,
    lane: options.lane || null,
    role: options.role || null,
  });
  const model = String(options.model || 'cnn_v3');
  const timeframe = String(options.timeframe || '1d').trim() || '1d';
  
  // Dynamic Universe: Use provided options or fetch real symbols from cache
  const universe = Array.isArray(options.universe) && options.universe.length > 0 
    ? options.universe 
    : get_Current_Universe_Symbols().slice(0, 5); // Default to top 5 symbols
    
  const threshold = Number.isFinite(Number(options.signalThreshold)) ? Number(options.signalThreshold) : 0.65;
  const maxHoldingDays = Number.isFinite(Number(options.maxHoldingDays)) ? Number(options.maxHoldingDays) : 5;
  const riskWeight = Number.isFinite(Number(options.riskWeight)) ? Number(options.riskWeight) : 0.4;
  const indicators = options.indicators && typeof options.indicators === 'object'
    ? options.indicators
    : {
        return_fast: true,
        return_slow: true,
        volatility: true,
        rsi: true,
        atr: true,
        bollinger: true,
      };
  const features = options.features && typeof options.features === 'object'
    ? options.features
    : {
        technical: Object.keys(indicators).filter((key) => Boolean(indicators[key])),
        relative: [],
        orderflow: [],
        custom: [],
      };
  const indicatorPeriods = options.indicatorPeriods && typeof options.indicatorPeriods === 'object'
    ? options.indicatorPeriods
    : {
        return_fast: DEFAULT_PERIODS.returnFast,
        return_slow: DEFAULT_PERIODS.returnSlow,
        volatility: DEFAULT_PERIODS.volatility,
        rsi: DEFAULT_PERIODS.rsi,
        atr: DEFAULT_PERIODS.atr,
        bollinger: DEFAULT_PERIODS.bollinger,
      };
  return [
    `name: ${strategyName}`,
    `kind: ${kind}`,
    `family: ${taxonomy.family}`,
    `lane: ${taxonomy.lane}`,
    `role: ${taxonomy.role}`,
    'status: draft',
    'enabled: false',
    `model: ${model}`,
    `timeframe: ${timeframe}`,
    'sections:',
    `  hypothesis: "Replace this with the market edge thesis for ${strategyName}."`,
    '  universe:',
    ...universe.map((symbol) => `    - ${symbol}`),
    '  signals:',
    '    entry: "Define the trigger conditions here."',
    '    exit: "Define the exit conditions here."',
    '  data:',
    '    required_sources:',
    '      - price_volume',
    '      - sentiment',
    '    validation: strict',
    '  features:',
    '    technical:',
    ...((features.technical || []).map((item) => `      - ${item}`)),
    '    relative:',
    ...((features.relative || []).map((item) => `      - ${item}`)),
    '    orderflow:',
    ...((features.orderflow || []).map((item) => `      - ${item}`)),
    '    custom:',
    ...((features.custom || []).map((item) => `      - ${item}`)),
    '  indicators:',
    `    return_fast: ${Boolean(indicators.return_fast)}`,
    `    return_slow: ${Boolean(indicators.return_slow)}`,
    `    volatility: ${Boolean(indicators.volatility)}`,
    `    rsi: ${Boolean(indicators.rsi)}`,
    `    atr: ${Boolean(indicators.atr)}`,
    `    bollinger: ${Boolean(indicators.bollinger)}`,
    '  indicator_periods:',
    `    return_fast: ${indicatorPeriods.return_fast}`,
    `    return_slow: ${indicatorPeriods.return_slow}`,
    `    volatility: ${indicatorPeriods.volatility}`,
    `    rsi: ${indicatorPeriods.rsi}`,
    `    atr: ${indicatorPeriods.atr}`,
    `    bollinger: ${indicatorPeriods.bollinger}`,
    '  risk:',
    `    signal_threshold: ${threshold}`,
    `    max_holding_days: ${maxHoldingDays}`,
    `    risk_weight: ${riskWeight}`,
    '    fail_closed: true',
    '  promotion:',
    '    require_backtest: true',
    '    require_walk_forward: true',
    '    require_paper_trade: true',
    '    review_required: true',
    '  notes: []',
    '',
  ].join('\n');
}

function getStrategyRegistryPath(options = {}) {
  return options.registryPath || path.join(REPO_ROOT, 'config', 'trading', 'strategies.yaml');
}

function getStrategyDirectory(options = {}) {
  return options.strategyDir || path.join(REPO_ROOT, 'config', 'strategies');
}

function readStrategyRegistry(options = {}) {
  const registryPath = getStrategyRegistryPath(options);
  if (!fs.existsSync(registryPath)) {
    return [];
  }
  const text = fs.readFileSync(registryPath, 'utf8');
  const lines = text.split(/\r?\n/);
  const files = [];
  let inRegistry = false;
  let inFiles = false;
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line === 'registry:') {
      inRegistry = true;
      inFiles = false;
      continue;
    }
    if (inRegistry && line === 'files:') {
      inFiles = true;
      continue;
    }
    if (inFiles) {
      const match = line.match(/^-\s+"?([^"]+)"?$/);
      if (match) {
        files.push(match[1]);
        continue;
      }
      if (line && !line.startsWith('-')) {
        break;
      }
    }
  }
  return files;
}

function listStrategyFiles(options = {}) {
  const repoRoot = options.repoRoot || REPO_ROOT;
  const strategyDir = getStrategyDirectory(options);
  if (!fs.existsSync(strategyDir)) {
    return [];
  }
  return fs.readdirSync(strategyDir)
    .filter((fileName) => fileName.toLowerCase().endsWith('.yaml'))
    .sort((a, b) => a.localeCompare(b))
    .map((fileName) => path.relative(repoRoot, path.join(strategyDir, fileName)).replace(/\\/g, '/'));
}

// Parse a strategy YAML file once and return a structured object.
// Keeps hand-rolled parsing for list/section formats that parseYamlRecursive
// does not handle (YAML `- item` lists).
function parseStrategyYaml(text) {
  const { parseYamlRecursive } = require('../../../../shared/lib/runtime/config_loader.js');
  const lines = text.split(/\r?\n/);
  const [yaml] = parseYamlRecursive(lines);

  // Strategy fields live at top-level; sections block contains everything else
  const sec = (yaml.sections && typeof yaml.sections === 'object') ? yaml.sections : yaml;

  function asArray(v) { return Array.isArray(v) ? v : []; }
  function asObj(v)   { return (v && typeof v === 'object' && !Array.isArray(v)) ? v : {}; }

  const rawFeatures = asObj(sec.features);

  return {
    name:              yaml.name   || null,
    kind:              yaml.kind   || null,
    family:            yaml.family || null,
    lane:              yaml.lane   || null,
    role:              yaml.role   || null,
    status:            yaml.status || null,
    enabled:           yaml.enabled === true || yaml.enabled === 'true',
    model:             yaml.model  || null,
    timeframe:         yaml.timeframe || null,
    universe:          asArray(sec.universe),
    risk:              asObj(sec.risk),
    indicators:        asObj(sec.indicators),
    indicator_periods: asObj(sec.indicator_periods),
    features: {
      technical: asArray(rawFeatures.technical),
      relative:  asArray(rawFeatures.relative),
      orderflow: asArray(rawFeatures.orderflow),
      custom:    asArray(rawFeatures.custom),
    },
  };
}

function strategySectionPresent(text, section) {
  if (section === 'notes') return /^(?:notes|  notes):/m.test(text);
  return new RegExp(`^  ${section}:`, 'm').test(text);
}

function inspectStrategyFile(filePath, options = {}) {
  const repoRoot = options.repoRoot || REPO_ROOT;
  const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(repoRoot, filePath);
  const exists = fs.existsSync(absolutePath);
  if (!exists) {
    return {
      path: filePath,
      exists: false,
      ok: false,
      issues: ['missing_file'],
    };
  }

  const text = fs.readFileSync(absolutePath, 'utf8');
  const yaml = parseStrategyYaml(text);
  const requiredTop = ['name', 'kind', 'status', 'enabled', 'model'];
  const requiredSections = ['hypothesis', 'universe', 'signals', 'data', 'risk', 'promotion', 'notes'];
  const issues = [];
  for (const key of requiredTop) {
    if (!new RegExp(`^${key}:`, 'm').test(text)) issues.push(`missing_${key}`);
  }
  for (const sec of requiredSections) {
    if (!strategySectionPresent(text, sec)) issues.push(`missing_section_${sec}`);
  }
  const taxonomy = inferStrategyTaxonomy({ ...yaml, path: filePath });
  const gradeRecord = decorateStrategyRecord({
    path: filePath,
    name: yaml.name,
    family: yaml.family || taxonomy.family,
    lane: yaml.lane || taxonomy.lane,
    role: yaml.role || taxonomy.role,
  });

  return {
    path: filePath,
    exists: true,
    ok: issues.length === 0,
    name: yaml.name,
    kind: yaml.kind,
    family: gradeRecord.family,
    lane: gradeRecord.lane,
    role: gradeRecord.role,
    status: yaml.status,
    enabled: yaml.enabled,
    model: yaml.model,
    timeframe: yaml.timeframe,
    universe: yaml.universe,
    risk: yaml.risk,
    features: yaml.features,
    indicators: yaml.indicators,
    indicator_periods: yaml.indicator_periods,
    grade: gradeRecord.grade,
    score: gradeRecord.score,
    verdict: gradeRecord.verdict,
    trust_state: gradeRecord.trust_state,
    last_backtest_at: gradeRecord.last_backtest_at,
    issues,
  };
}

function resolveStrategyTimeframe(strategy, args) {
  const fromStrategy = String(strategy?.timeframe || '').trim();
  if (fromStrategy) return fromStrategy;
  const fromArgs = String(optionValue(args, '--timeframe', '1d') || '').trim();
  return fromArgs || '1d';
}

function buildAutomationTrustDecision(report, minTrustScore, isLive) {
  const trust = report?.trust_assessment || {};
  if (!isLive) {
    return { allowed: true, reason: null, trust };
  }

  const score = Number.isFinite(trust.score) ? trust.score : 0;
  const verdict = String(trust.verdict || 'unknown');
  const alpha = Number.isFinite(trust.oos_alpha_vs_buy_hold) ? trust.oos_alpha_vs_buy_hold : null;
  const reasons = [];

  if (verdict !== 'researchable') reasons.push(`verdict=${verdict}`);
  if (score < minTrustScore) reasons.push(`score=${score}/100 < ${minTrustScore}`);
  if (alpha == null) reasons.push('missing oos alpha');
  else if (alpha <= 0) reasons.push(`oos alpha=${(alpha * 100).toFixed(2)}%`);

  return {
    allowed: reasons.length === 0,
    reason: reasons.length ? reasons.join(', ') : null,
    trust,
  };
}

function syncStrategyRegistry(options = {}) {
  const registryFiles = readStrategyRegistry(options);
  const registrySet = new Set(registryFiles);
  const discovered = [];
  const skipped = [];

  for (const filePath of listStrategyFiles(options)) {
    if (registrySet.has(filePath)) continue;
    const info = inspectStrategyFile(filePath, options);
    if (info.ok) {
      discovered.push(filePath);
    } else {
      skipped.push({ path: filePath, issues: info.issues || [] });
    }
  }

  const merged = [...registryFiles, ...discovered];
  const uniqueMerged = [...new Set(merged)].sort();
  if (!options.dryRun) {
    writeStrategyRegistry(uniqueMerged, options);
  }

  return {
    dry_run: Boolean(options.dryRun),
    before: registryFiles.length,
    after: uniqueMerged.length,
    added: discovered.sort((a, b) => a.localeCompare(b)),
    skipped,
    registry: uniqueMerged,
  };
}

function strategyRegistryReport() {
  const files = readStrategyRegistry();
  const strategies = files.map((filePath) => inspectStrategyFile(filePath)).map(decorateStrategyRecord);
  return {
    count: strategies.length,
    ok: strategies.every((strategy) => strategy.ok),
    strategies,
  };
}

function registeredStrategyOptions() {
  return strategyRegistryReport().strategies
    .filter((strategy) => strategy.exists && strategy.ok)
    .sort((a, b) => (a.name || a.path).localeCompare(b.name || b.path))
    .map((strategy) => ({
      label: `${strategy.enabled ? '[\x1b[32mON\x1b[0m]' : '[\x1b[90mOFF\x1b[0m]'} ${strategy.name || strategy.path} (${formatStrategyGradeTag(strategy)})`,
      value: strategy.path,
      category: laneDisplayLabel(strategy.lane),
    }));
}

function writeStrategyRegistry(files, options = {}) {
  const registryPath = getStrategyRegistryPath(options);
  const text = fs.readFileSync(registryPath, 'utf8');
  const base = text.replace(/\nregistry:\n(?:  .*\n?)*/m, '\n');
  const uniqueFiles = [...new Set(files)].sort();
  const registryBlock = [
    'registry:',
    '  files:',
    ...uniqueFiles.map((file) => `    - "${file}"`),
    '',
  ].join('\n');
  fs.writeFileSync(registryPath, `${base.trimEnd()}\n\n${registryBlock}`, 'utf8');
}

function toggleStrategyStatus(filePath) {
  const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(REPO_ROOT, filePath);
  if (!fs.existsSync(absolutePath)) return false;
  let text = fs.readFileSync(absolutePath, 'utf8');
  const isEnabled = parseStrategyYaml(text).enabled;
  text = text.replace(/^enabled:\s*(.+)$/m, `enabled: ${!isEnabled}`);
  fs.writeFileSync(absolutePath, text, 'utf8');
  return !isEnabled;
}

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


const EXECUTION_MEMORY = require('../../../../shared/lib/runtime/execution_memory.js');

async function runAutomationPass(args, strategiesOverride = null) {
    const settings = loadRuntimeSettings();
    const isLive = hasFlag(args, '--live');
    const refreshDays = numericOption(args, '--refresh-days', 2);
    const minTrustScore = numericOption(args, '--min-trust-score', 70);
    const refreshGroups = new Map();
    
    let targetStrategies;
    if (strategiesOverride) {
        targetStrategies = strategiesOverride;
    } else {
        const files = readStrategyRegistry();
        targetStrategies = files.map(inspectStrategyFile).filter(s => s.enabled);
    }

    if (targetStrategies.length === 0) {
        console.log(`[\x1b[90m${new Date().toLocaleTimeString()}\x1b[0m] [AUTOMATION] No strategies to process.`);
        return;
    }

    console.log(`[\x1b[36m${new Date().toLocaleTimeString()}\x1b[0m] [AUTOMATION] Scanning ${targetStrategies.length} strategies... (Mode: ${isLive ? '\x1b[1;31mLIVE\x1b[0m' : '\x1b[1;32mDRY-RUN\x1b[0m'})`);
    
    // 1. Collect all symbols needed, grouped by timeframe
    targetStrategies.forEach(s => {
        const universe = Array.isArray(s.universe) ? s.universe : [];
        const timeframe = resolveStrategyTimeframe(s, args);
        if (!refreshGroups.has(timeframe)) refreshGroups.set(timeframe, new Set());
        const bucket = refreshGroups.get(timeframe);
        universe.forEach(sym => bucket.add(sym));
    });

    // 2. Fetch latest data in batches per timeframe
    const { commandBackfill } = require('../data/data.js');
    global.suppressLogs = true;
    try {
        for (const [timeframe, symbols] of refreshGroups.entries()) {
            const list = [...symbols];
            if (list.length === 0) continue;
            console.log(`[AUTOMATION] Refreshing ${list.length} symbols for ${timeframe}...`);
            await commandBackfill(['--symbol', list.join(','), '--days', String(refreshDays), '--timeframe', timeframe, '--json']);
        }
    } finally {
        global.suppressLogs = false;
    }

    // 3. For each strategy, generate signal and check threshold
    const { commandBacktest } = require('../research/research.js');
    const { commandTrade, fetchBalance } = require('../trade/trade.js');

   
    console.log(`[AUTOMATION] Fetching portfolio balance for dynamic sizing...`);
    const balanceObj = await fetchBalance(isLive).catch(err => {
        if (isLive) {
            throw new Error(`Critical: Failed to fetch balance in LIVE mode: ${err.message}`);
        }
        console.warn(`\x1b[1;33m[WARNING]\x1b[0m Failed to fetch balance: ${err.message}. Using $100,000 baseline.`);
        return { EQUITY: 100000 };
    });
    const totalEquity = balanceObj.EQUITY || balanceObj.USD || 100000;
    console.log(`[AUTOMATION] Total Equity: $${formatHumanNumber(totalEquity)}`);

    for (const strategy of targetStrategies) {
        console.log(`[AUTOMATION] Analyzing ${strategy.name}...`);
        
        const universeArgs = (strategy.universe || []).flatMap(s => ['--symbol', s]);
        const strategyTimeframe = resolveStrategyTimeframe(strategy, args);
        global.suppressLogs = true;
        let report;
        try {
            report = await commandBacktest([
                '--strategy', strategy.path,
                '--model', strategy.model,
                '--timeframe', strategyTimeframe,
                '--threshold', String(strategy.risk?.signal_threshold || 0.65),
                '--allow-degraded',
                '--json',
                ...universeArgs
            ]);
        } finally {
            global.suppressLogs = false;
        }

        if (report && report.trades && report.trades.length > 0) {
            const lastTrade = report.trades[report.trades.length - 1];
            const tradeType = 'buy'; // runBacktest currently only generates long signals
            const signalTime = lastTrade.entry_time || lastTrade.timestamp;
            const signalPrice = lastTrade.entry || lastTrade.price;
            const signalId = `${strategy.name}:${lastTrade.symbol}:${signalTime}:${tradeType}`;

            if (EXECUTION_MEMORY.has(signalId)) {
                console.log(`[AUTOMATION] Signal ${signalId} already processed. Skipping.`);
                continue;
            }

            // Freshness check: Signal must be within the last bar's timeframe
            const signalTs = new Date(signalTime).getTime();
            const now = Date.now();
            const timeframeToMs = {
                '5m': 5 * 60 * 1000,
                '15m': 15 * 60 * 1000,
                '30m': 30 * 60 * 1000,
                '1h': 60 * 60 * 1000,
                '4h': 4 * 60 * 60 * 1000,
                '1d': 24 * 60 * 60 * 1000,
                '1w': 7 * 24 * 60 * 60 * 1000
            };
            const barDurationMs = timeframeToMs[strategyTimeframe] || (24 * 60 * 60 * 1000);
            const maxAgeMs = 1.5 * barDurationMs; // Allow 1.5 bars of age (buffer for fetch/cron delay)

            if (now - signalTs > maxAgeMs) {
                console.log(`[AUTOMATION] Signal for ${lastTrade.symbol} is stale (${new Date(signalTs).toLocaleString()}). Skipping.`);
                continue;
            }

            const trustDecision = buildAutomationTrustDecision(report, minTrustScore, isLive);
            if (!trustDecision.allowed) {
                const trust = trustDecision.trust || {};
                console.log(`[AUTOMATION] Live execution gated for ${strategy.name}: ${trustDecision.reason}.`);
                console.log(`[AUTOMATION] Trust gate: ${trust.grade || 'n/a'} / ${trust.score ?? 'n/a'} | verdict=${trust.verdict || 'n/a'}`);
                continue;
            }

           
            const riskWeight = strategy.risk?.risk_weight || 0.1;
            const currentPrice = signalPrice || 1;
            const fixedPositionSize = Number(settings.trading?.position_size);
            const allocationUsd = Number.isFinite(fixedPositionSize) && fixedPositionSize > 0
                ? Math.min(totalEquity * riskWeight, fixedPositionSize)
                : totalEquity * riskWeight;
            const qty = Math.floor(allocationUsd / currentPrice);

            if (qty <= 0) {
                console.warn(`[AUTOMATION] Calculated quantity for ${lastTrade.symbol} is 0 (Equity: ${totalEquity}, Weight: ${riskWeight}, Price: ${currentPrice}). Skipping.`);
                continue;
            }

            console.log(`[\x1b[1;32mSIGNAL\x1b[0m] Strategy ${strategy.name} trigger: ${tradeType.toUpperCase()} ${lastTrade.symbol} @ ${currentPrice} | Qty: ${qty} ($${(qty * currentPrice).toFixed(2)})`);
            
            if (isLive) {
                console.log(`[\x1b[1;31mEXECUTE\x1b[0m] Sending LIVE order for ${lastTrade.symbol} (Qty: ${qty})...`);
                const tradeArgs = [
                    tradeType,
                    lastTrade.symbol,
                    String(qty),
                    'market',
                    '--live'
                ];
                if (process.env.SOVEREIGN_TRADE_PIN) {
                    tradeArgs.push('--pin', process.env.SOVEREIGN_TRADE_PIN);
                }
                await commandTrade(tradeArgs);
            }
 else {
                console.log(`[\x1b[1;32mDRY-RUN\x1b[0m] Order simulated for ${lastTrade.symbol} | Calculated Qty: ${qty}.`);
            }

            EXECUTION_MEMORY.add(signalId);
        }
    }
}

async function runAutomatedStrategies(args) {
    const settings = loadRuntimeSettings();
    const gate = featureGate('ai_agent_trading', { settings, surface: 'Strategy automation' });
    if (!gate.ok) {
        printPayload({ ok: false, type: 'feature_gate', feature_flag: gate.flag, reason: gate.reason, hint: gate.hint }, args);
        return 1;
    }
    const intervalMinutes = numericOption(args, '--interval', settings.trading.polling_interval || 15);
    const intervalMs = intervalMinutes * 60 * 1000;
    let passes = 0;
    const maxPasses = numericOption(args, '--passes', 0); // 0 = run indefinitely
    const passLabel = maxPasses === 0 ? '∞' : String(maxPasses);

    console.log(`[\x1b[1;35mAUTO\x1b[0m] Starting Strategy Automation Loop (Interval: ${intervalMinutes} min, Max Passes: ${passLabel})`);
    console.log('Press Ctrl+C to stop.');

    return new Promise((resolve) => {
        const loop = async () => {
            try {
                passes++;
                console.log(`[AUTOMATION] Starting Pass ${passes}/${passLabel}...`);
                await runAutomationPass(args);
            } catch (error) {
                console.error(`[AUTOMATION] Pass failed: ${error.message}`);
            }
            if (maxPasses === 0 || passes < maxPasses) {
                setTimeout(loop, intervalMs);
            } else {
                console.log(`[AUTOMATION] Reached max passes (${maxPasses}). Exiting.`);
                resolve(0);
            }
        };
        loop();
    });
}
// ------------------------------------------

function groupStrategiesHierarchically(strategies) {
  const groups = {};
  strategies.forEach((s) => {
    const lane = laneDisplayLabel(s.lane);
    const family = String(s.family || s.kind || 'uncategorized').toUpperCase();
    if (!groups[lane]) groups[lane] = {};
    if (!groups[lane][family]) groups[lane][family] = [];
    groups[lane][family].push(s);
  });
  return groups;
}

async function interactiveStrategyWizard() {
  console.log(`\n\x1b[1;36mStrategy Creation Wizard\x1b[0m`);
  
  const name = await promptText('Strategy Name (e.g. my_momentum_v1):');
  if (!name) return null;

  const kind = await promptSelect('Strategy Kind:', [
    { label: 'Momentum', value: 'momentum' },
    { label: 'Mean Reversion', value: 'mean_reversion' },
    { label: 'Arbitrage', value: 'arbitrage' },
    { label: 'Machine Learning', value: 'ml' }
  ]);

  const model = await promptSelect('Predictive Model:', [
    { label: 'CNN v3 (Windowed)', value: 'cnn_v3' },
    { label: 'LSTM v1', value: 'lstm_v1' },
    { label: 'XGBoost (Feature-based)', value: 'xgboost' }
  ]);

  const { pickAssets } = require('../../tui/asset_picker');
  const selectedSymbols = await pickAssets({ multi: true, label: 'Strategy Universe', prompt: 'Select Universe Symbols:' });

  const enabledIndicators = await promptMultiSelect('Enable Indicators (Space to toggle, Enter to confirm):', [
    { label: '  Return Fast', value: 'return_fast' },
    { label: '  Return Slow', value: 'return_slow' },
    { label: '  Volatility', value: 'volatility' },
    { label: '  RSI', value: 'rsi' },
    { label: '  ATR', value: 'atr' },
    { label: '  Bollinger', value: 'bollinger' },
  ], {
    initialValues: ['return_fast', 'return_slow', 'volatility', 'rsi', 'atr', 'bollinger'],
  }) || [];

  const threshold = await promptText('Signal Threshold (0.0 to 1.0):', '0.65');
  const maxHold = await promptText('Max Holding Days:', '5');
  const weight = await promptText('Risk Weight (0.0 to 1.0):', '0.4');

  const slug = slugifyStrategyName(name);
  const outputPath = path.join(REPO_ROOT, 'config', 'strategies', `${slug}.yaml`);
  
  const payload = buildStrategyPlan(name, {
    kind,
    model,
    universe: selectedSymbols,
    signalThreshold: Number(threshold),
    maxHoldingDays: Number(maxHold),
    riskWeight: Number(weight),
    features: {
      technical: enabledIndicators,
      relative: [],
      orderflow: [],
      custom: [],
    },
    indicators: {
      return_fast: enabledIndicators.includes('return_fast'),
      return_slow: enabledIndicators.includes('return_slow'),
      volatility: enabledIndicators.includes('volatility'),
      rsi: enabledIndicators.includes('rsi'),
      atr: enabledIndicators.includes('atr'),
      bollinger: enabledIndicators.includes('bollinger'),
    },
    indicatorPeriods: {
      return_fast: DEFAULT_PERIODS.returnFast,
      return_slow: DEFAULT_PERIODS.returnSlow,
      volatility: DEFAULT_PERIODS.volatility,
      rsi: DEFAULT_PERIODS.rsi,
      atr: DEFAULT_PERIODS.atr,
      bollinger: DEFAULT_PERIODS.bollinger,
    },
  });

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, payload, 'utf8');

  // Register in strategies.yaml
  const registryFiles = readStrategyRegistry();
  const relPath = path.relative(REPO_ROOT, outputPath).replace(/\\/g, '/');
  if (!registryFiles.includes(relPath)) {
    registryFiles.push(relPath);
    writeStrategyRegistry(registryFiles);
  }

  console.log(`\n\x1b[1;32mSUCCESS:\x1b[0m Strategy created and registered at ${outputPath}`);
  return { path: outputPath, name: slug };
}

async function commandStrategy(args) {
  const subcommand = args[0];

  if (!subcommand || subcommand === 'list' || subcommand === 'interactive') {
    // ... existing list/interactive logic ...
    const report = strategyRegistryReport();
    if (!isRichTerminal()) {
      printPayload(report, args);
      return report.ok ? 0 : 1;
    }

    const groups = groupStrategiesHierarchically(report.strategies);
    const choices = [];

    const laneOrder = ['Single Asset', 'Portfolio Optimization'];
    laneOrder.filter((lane) => groups[lane]).concat(Object.keys(groups).filter((lane) => !laneOrder.includes(lane)).sort()).forEach((lane) => {
      const families = groups[lane];
      Object.keys(families).sort().forEach((family) => {
        const groupItems = families[family];
        choices.push({
          label: `--- ${family} (${groupItems.length} strategies) ---`,
          value: `__FAMILY_HEADER:${lane}:${family}`,
          category: lane,
          isSectorHeader: true,
          sectorGroup: `${lane}::${family}`,
        });

        groupItems.sort((a, b) => (a.name || '').localeCompare(b.name || '')).forEach((s) => {
          choices.push({
            label: `  ${s.enabled ? '[\x1b[32mON\x1b[0m]' : '[\x1b[90mOFF\x1b[0m]'} ${s.name || s.path} (${formatStrategyGradeTag(s)})`,
            value: s.path,
            category: lane,
            sectorGroup: `${lane}::${family}`,
          });
        });
      });
    });

    choices.push({ label: '--- Operations ---', value: '__OP_HEADER', category: 'OPS' });
    choices.push({ label: '  [+] Create New Strategy', value: '__NEW_STRATEGY', category: 'OPS' });
    choices.push({ label: '  [~] Manage Prop Firm Profiles', value: '__PROP_FIRMS', category: 'OPS' });
    choices.push({ label: '  [SYNC] Sync Strategy Registry', value: '__SYNC_REGISTRY', category: 'OPS' });

    console.log(`\n\x1b[1;36mStrategy Management\x1b[0m`);
    const { promptMultiSelect } = require('../../tui/index.js');
    const selected = await promptMultiSelect('Select strategies for action (Space to select, Enter to confirm):', choices);
    
    if (!selected || selected.length === 0) return 0;

    if (selected.includes('__NEW_STRATEGY')) {
      await interactiveStrategyWizard();
      return 0;
    }
    if (selected.includes('__PROP_FIRMS')) {
      await commandPropFirmProfiles(['interactive']);
      return 0;
    }
    if (selected.includes('__SYNC_REGISTRY')) {
      const summary = syncStrategyRegistry();
      printPayload({
        synced: true,
        added: summary.added,
        skipped: summary.skipped,
        before: summary.before,
        after: summary.after,
      }, args);
      return 0;
    }

    const finalPaths = [...new Set(selected.filter((value) => !String(value).startsWith('__')))];
    if (finalPaths.length === 0) return 0;

    const action = await promptSelect(`Action for ${finalPaths.length} selected strategies:`, [
      { label: 'Run Backtest (Sequential)', value: 'backtest' },
      { label: 'Toggle Enabled Status', value: 'toggle' },
      { label: 'Run Automated Pass (Once)', value: 'auto_pass' },
      { label: 'Cancel', value: null }
    ]);

    if (!action) return 0;

    if (action === 'toggle') {
      for (const p of finalPaths) {
        const newState = toggleStrategyStatus(p);
        console.log(`  - ${p}: ${newState ? '\x1b[32mENABLED\x1b[0m' : '\x1b[90mDISABLED\x1b[0m'}`);
      }
    } else if (action === 'backtest') {
      const { commandBacktest } = require('../research/research.js');
      for (const p of finalPaths) {
        console.log(`\n\x1b[1;33m>>> Executing backtest: ${p}\x1b[0m`);
        await commandBacktest(['--strategy', p, '--allow-degraded']);
      }
    } else if (action === 'auto_pass') {
      // Temporarily override enabled status in memory to run only selected
      const allStrategies = readStrategyRegistry().map(inspectStrategyFile);
      const selectedStrategies = allStrategies.filter(s => finalPaths.includes(s.path));
      
      console.log(`\n\x1b[1;35m>>> Running automated pass for ${selectedStrategies.length} selected strategies...\x1b[0m`);
      await runAutomationPass(args.slice(1), selectedStrategies);
    }
    return 0;
  }
  
  if (subcommand === 'validate') {
    const report = strategyRegistryReport();
    printPayload(report, args);
    return report.ok ? 0 : 1;
  }
  
  if (subcommand === 'run_automated') {
      await runAutomatedStrategies(args.slice(1));
      return 0;
  }

  if (subcommand === 'sync') {
    const summary = syncStrategyRegistry({ dryRun: hasFlag(args, '--dry-run') });
    printPayload(summary, args);
    return 0;
  }

  if (subcommand === 'prop-firms' || subcommand === 'prop_firms' || subcommand === 'propfirms') {
    return commandPropFirmProfiles(args.slice(1));
  }
  
  if (subcommand !== 'new') {
    printPayload({ error: 'Usage: strategy new <name> [...] | strategy list | strategy interactive | strategy prop-firms | strategy sync | strategy run_automated' }, args);
    return 1;
  }
  const name = args[1];
  if (!name) {
    if (isRichTerminal()) {
      await interactiveStrategyWizard();
      return 0;
    }
    printPayload({ error: 'strategy new requires a name' }, args);
    return 1;
  }
  const output = optionValue(args, '--output', path.join(REPO_ROOT, 'config', 'strategies', `${slugifyStrategyName(name)}.yaml`));
  const universe = (optionValue(args, '--universe', 'SPY,QQQ') || '').split(',').map((item) => item.trim()).filter(Boolean);
  const payload = buildStrategyPlan(name, {
    kind: optionValue(args, '--kind', 'momentum'),
    model: optionValue(args, '--model', 'cnn_v3'),
    family: optionValue(args, '--family', null),
    lane: optionValue(args, '--lane', null),
    role: optionValue(args, '--role', null),
    universe,
    signalThreshold: numericOption(args, '--signal-threshold', 0.65),
    maxHoldingDays: numericOption(args, '--max-holding-days', 5),
    riskWeight: numericOption(args, '--risk-weight', 0.4),
  });
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, payload, 'utf8');
  const registryFiles = readStrategyRegistry();
  registryFiles.push(path.relative(REPO_ROOT, output).replace(/\\/g, '/'));
  writeStrategyRegistry(registryFiles);
  printPayload({ created: output, strategy: slugifyStrategyName(name) }, args);
  return 0;
}

/**
 * TUI entry point for the "Strategy" menu — presents a flat New / List /
 * Validate / Sync Registry picker, then delegates to commandStrategy.
 * Direct CLI calls (e.g. `sovereign strategy list`) pass through untouched.
 */
async function commandStrategyMenu(args) {
  if (args.length > 0) return commandStrategy(args);

  global.suppressLogs = true;
  const action = await promptSelect('Strategy:', [
    { label: 'New', value: 'new' },
    { label: 'List', value: 'list' },
    { label: 'Validate', value: 'validate' },
    { label: 'Sync Registry', value: 'sync' },
  ]);
  global.suppressLogs = false;

  if (!action) return 0;
  return commandStrategy([action]);
}

/**
 * TUI entry point for the "Prop Firm" menu — presents a flat Profiles /
 * Set Active / Inspect Profile picker, then delegates to commandPropFirmProfiles.
 * Direct CLI calls (e.g. `sovereign prop-firms show <id>`) pass through untouched.
 */
async function commandPropFirmMenu(args) {
  if (args.length > 0) return commandPropFirmProfiles(args);

  global.suppressLogs = true;
  const action = await promptSelect('Prop Firm:', [
    { label: 'Profiles', value: 'list' },
    { label: 'Set Active', value: 'set-active' },
    { label: 'Inspect Profile', value: 'show' },
  ]);
  global.suppressLogs = false;

  if (!action) return 0;
  return commandPropFirmProfiles([action]);
}

module.exports = {
  slugifyStrategyName, get_Current_Universe_Symbols, buildStrategyPlan, getStrategyRegistryPath, getStrategyDirectory, readStrategyRegistry, listStrategyFiles, strategySectionPresent, inspectStrategyFile, syncStrategyRegistry, strategyRegistryReport, registeredStrategyOptions, writeStrategyRegistry, interactiveStrategyWizard, commandPropFirmProfiles, commandStrategy, commandStrategyMenu, commandPropFirmMenu, runAutomatedStrategies
};
