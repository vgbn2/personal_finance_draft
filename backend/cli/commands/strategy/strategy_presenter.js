'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { inferStrategyTaxonomy, decorateStrategyRecord } = require('../../../../shared/lib/strategy/registry.js');
const { DEFAULT_PERIODS } = require('../../../../shared/lib/market/indicators.js');
const { parseYamlRecursive } = require('../../../../shared/lib/runtime/config_loader.js');
const { normalizeSizingIntent } = require('../../../../shared/lib/trading/position_sizing.js');
const { optionValue } = require('../../lib/utils.js');
const { REPO_ROOT } = require('../../lib/utils.js');

function slugifyStrategyName(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function get_Current_Universe_Symbols() {
  const { get_Current_Universe_Symbols: getSymbols } = require('../../lib/utils.js');
  return getSymbols();
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

  const universe = Array.isArray(options.universe) && options.universe.length > 0
    ? options.universe
    : get_Current_Universe_Symbols().slice(0, 5);

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

function parseStrategyYaml(text) {
  const lines = text.split(/\r?\n/);
  const [yaml] = parseYamlRecursive(lines);
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

function buildAutomationTrustDecision(report, minTrustScore, isLive) {
  const trust = report?.trust_assessment || {};
  if (!isLive) {
    return { allowed: true, reason: null, trust };
  }

  const score = Number.isFinite(trust.score) ? trust.score : 0;
  const verdict = String(trust.verdict || 'unknown');
  const alpha = Number.isFinite(trust.oos_alpha_vs_buy_hold) ? trust.oos_alpha_vs_buy_hold : null;
  const reasons = [];

  if (report?.data_quality_ok !== true || report?.data_quality_summary?.ok === false) {
    reasons.push('data quality is not verified');
  }
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

function buildStrategySizingDecision({ symbol, allocationUsd, referencePrice }) {
  return normalizeSizingIntent({
    intent: { mode: 'notional', value: allocationUsd, currency: 'USD' },
    instrument: {
      instrumentId: symbol,
      assetClass: 'equity_or_crypto_unqualified',
      quoteCurrency: 'USD',
      quantityStep: 1,
      contractMultiplier: 1,
      metadataSource: 'legacy_strategy_whole_unit_contract',
    },
    referencePrice,
  });
}

function resolveStrategyTimeframe(strategy, args) {
  const fromStrategy = String(strategy?.timeframe || '').trim();
  if (fromStrategy) return fromStrategy;
  const fromArgs = String(optionValue(args, '--timeframe', '1d') || '').trim();
  return fromArgs || '1d';
}

module.exports = {
  slugifyStrategyName,
  get_Current_Universe_Symbols,
  buildStrategyPlan,
  parseStrategyYaml,
  strategySectionPresent,
  inspectStrategyFile,
  buildAutomationTrustDecision,
  buildStrategySizingDecision,
  resolveStrategyTimeframe,
};
