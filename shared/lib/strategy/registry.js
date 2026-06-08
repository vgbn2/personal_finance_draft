const fs = require('node:fs');
const path = require('node:path');
const { REPO_ROOT, STORAGE_DATA_DIR } = require('../runtime/paths');

const STRATEGY_GRADE_INDEX_PATH = path.join(STORAGE_DATA_DIR, 'strategy_grade_index.json');

function normalizeKey(value, fallback = '') {
  const raw = String(value || fallback || '').trim().toLowerCase();
  return raw
    .replace(/[\s-]+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

function normalizeStrategyPath(filePath) {
  if (!filePath) return '';
  const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(REPO_ROOT, filePath);
  return path.relative(REPO_ROOT, absolutePath).replace(/\\/g, '/');
}

function inferStrategyTaxonomy(meta = {}) {
  const family = normalizeKey(meta.family || meta.kind || meta.role || meta.name, 'uncategorized') || 'uncategorized';
  const explicitLane = normalizeKey(meta.lane);
  const explicitRole = normalizeKey(meta.role);
  const name = normalizeKey(meta.name);
  const kind = normalizeKey(meta.kind);
  const crossKeywords = ['multi_asset', 'correlation', 'pair', 'pairs', 'basket', 'hedge', 'hedging', 'arb', 'arbitrage', 'portfolio', 'cross'];

  let role = explicitRole || '';
  if (!role) {
    if (name.includes('hedge') || kind.includes('hedge')) role = 'hedging';
    else if (name.includes('arb') || kind.includes('arb')) role = 'arbitrage';
    else if (name.includes('portfolio') || name.includes('multi_asset') || kind === 'multi_asset' || kind === 'portfolio_optimization' || kind === 'correlation') {
      role = 'portfolio_optimization';
    } else if (explicitLane === 'cross_asset') {
      role = 'portfolio_optimization';
    } else {
      role = 'strategy';
    }
  }

  let lane = explicitLane === 'cross_asset' || explicitLane === 'single_asset' ? explicitLane : '';
  if (!lane) {
    const matchedCross = crossKeywords.some((needle) => name.includes(needle) || kind.includes(needle));
    lane = matchedCross || role === 'hedging' || role === 'arbitrage' || role === 'portfolio_optimization'
      ? 'cross_asset'
      : 'single_asset';
  }

  return {
    family: family || 'uncategorized',
    lane,
    role,
  };
}

function laneDisplayLabel(lane) {
  return lane === 'cross_asset' ? 'Portfolio Optimization' : 'Single Asset';
}

function normalizeStrategyUniverse(record = {}) {
  const universe = Array.isArray(record.universe)
    ? record.universe
    : Array.isArray(record.strategy_universe)
      ? record.strategy_universe
      : Array.isArray(record.symbols)
        ? record.symbols
        : [];
  return universe.map((symbol) => String(symbol || '').trim()).filter(Boolean);
}

function classifyStrategyAssetMode(record = {}) {
  const universe = normalizeStrategyUniverse(record);
  const universeSize = universe.length;
  const explicitMode = normalizeKey(record.asset_mode || record.assetMode || record.strategy_mode);
  if (explicitMode === 'single_asset') return 'single_asset';
  if (explicitMode === 'portfolio_management' || explicitMode === 'portfolio_optimization') return 'portfolio_management';
  if (explicitMode === 'multi_asset_strategy' || explicitMode === 'multi_asset') {
    return universeSize > 1 ? 'multi_asset_strategy' : 'single_asset';
  }

  const name = normalizeKey(record.name);
  const kind = normalizeKey(record.kind);
  const role = normalizeKey(record.role);
  const lane = normalizeKey(record.lane);
  const portfolioKeywords = [
    'portfolio',
    'multi_asset',
    'cross_asset',
    'correlation',
    'pair',
    'pairs',
    'basket',
    'hedge',
    'hedging',
    'arbitrage',
    'allocation',
    'rotation',
    'regime',
  ];

  const looksLikePortfolio =
    lane === 'cross_asset' ||
    role === 'portfolio_optimization' ||
    kind === 'portfolio_optimization' ||
    kind === 'multi_asset' ||
    kind === 'correlation' ||
    portfolioKeywords.some((needle) => name.includes(needle) || kind.includes(needle) || role.includes(needle));

  if (looksLikePortfolio) return 'portfolio_management';
  if (universeSize > 1) return 'multi_asset_strategy';
  return 'single_asset';
}

function formatStrategyAssetModeLabel(assetMode) {
  if (assetMode === 'portfolio_management') return 'Portfolio Management';
  if (assetMode === 'multi_asset_strategy') return 'Multi-Asset Strategy';
  return 'Single Asset';
}

function formatStrategyGradeTag(record = {}) {
  const grade = String(record.grade || '').trim().toUpperCase();
  const score = Number(record.score);
  if (grade && Number.isFinite(score)) {
    return `${grade} / ${score}`;
  }
  if (grade) return grade;
  return 'draft';
}

function readStrategyGradeIndex() {
  if (!fs.existsSync(STRATEGY_GRADE_INDEX_PATH)) {
    return { updated_at: null, strategies: {} };
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(STRATEGY_GRADE_INDEX_PATH, 'utf8'));
    if (!parsed || typeof parsed !== 'object') {
      return { updated_at: null, strategies: {} };
    }
    return {
      updated_at: parsed.updated_at || null,
      strategies: parsed.strategies && typeof parsed.strategies === 'object' ? parsed.strategies : {},
    };
  } catch {
    return { updated_at: null, strategies: {} };
  }
}

function writeStrategyGradeIndex(index) {
  fs.mkdirSync(path.dirname(STRATEGY_GRADE_INDEX_PATH), { recursive: true });
  const payload = {
    updated_at: new Date().toISOString(),
    strategies: index && typeof index.strategies === 'object' ? index.strategies : {},
  };
  fs.writeFileSync(STRATEGY_GRADE_INDEX_PATH, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return payload;
}

function upsertStrategyGradeRecord(record = {}) {
  const index = readStrategyGradeIndex();
  const key = normalizeStrategyPath(record.path || record.strategy_source || record.file || '');
  if (!key) return null;
  const taxonomy = inferStrategyTaxonomy(record);
  const current = index.strategies[key] || {};
  const next = {
    ...current,
    path: key,
    name: record.name || current.name || path.basename(key, path.extname(key)),
    family: taxonomy.family,
    lane: taxonomy.lane,
    role: taxonomy.role,
    grade: record.grade || current.grade || null,
    score: Number.isFinite(Number(record.score)) ? Number(record.score) : (current.score ?? null),
    verdict: record.verdict || current.verdict || null,
    trust_state: record.trust_state || current.trust_state || null,
    last_backtest_at: record.last_backtest_at || current.last_backtest_at || null,
    time_weighted_variance: Number.isFinite(Number(record.time_weighted_variance))
      ? Number(record.time_weighted_variance)
      : (current.time_weighted_variance ?? null),
    time_weighted_stddev: Number.isFinite(Number(record.time_weighted_stddev))
      ? Number(record.time_weighted_stddev)
      : (current.time_weighted_stddev ?? null),
    prop_firm_score: Number.isFinite(Number(record.prop_firm_score))
      ? Number(record.prop_firm_score)
      : (current.prop_firm_score ?? null),
    prop_firm_grade: record.prop_firm_grade || current.prop_firm_grade || null,
    prop_firm_verdict: record.prop_firm_verdict || current.prop_firm_verdict || null,
    prop_firm_passable: typeof record.prop_firm_passable === 'boolean'
      ? record.prop_firm_passable
      : (current.prop_firm_passable ?? null),
    prop_firm_trading_days: Number.isFinite(Number(record.prop_firm_trading_days))
      ? Number(record.prop_firm_trading_days)
      : (current.prop_firm_trading_days ?? null),
    prop_firm_best_day_share: Number.isFinite(Number(record.prop_firm_best_day_share))
      ? Number(record.prop_firm_best_day_share)
      : (current.prop_firm_best_day_share ?? null),
    updated_at: new Date().toISOString(),
  };
  index.strategies[key] = next;
  writeStrategyGradeIndex(index);
  return next;
}

function getStrategyGradeRecord(filePath, name = null) {
  const index = readStrategyGradeIndex();
  const key = normalizeStrategyPath(filePath);
  if (key && index.strategies[key]) return index.strategies[key];
  if (name) {
    const match = Object.values(index.strategies).find((entry) => normalizeKey(entry.name) === normalizeKey(name));
    if (match) return match;
  }
  return null;
}

function decorateStrategyRecord(record) {
  const taxonomy = inferStrategyTaxonomy(record);
  const gradeRecord = getStrategyGradeRecord(record.path, record.name);
  const assetMode = classifyStrategyAssetMode(record);
  return {
    ...record,
    family: record.family || taxonomy.family,
    lane: record.lane || taxonomy.lane,
    role: record.role || taxonomy.role,
    asset_mode: assetMode,
    asset_mode_label: formatStrategyAssetModeLabel(assetMode),
    grade: gradeRecord?.grade || record.grade || null,
    score: Number.isFinite(Number(gradeRecord?.score)) ? Number(gradeRecord.score) : (record.score ?? null),
    verdict: gradeRecord?.verdict || record.verdict || null,
    trust_state: gradeRecord?.trust_state || record.trust_state || null,
    last_backtest_at: gradeRecord?.last_backtest_at || record.last_backtest_at || null,
    time_weighted_variance: Number.isFinite(Number(gradeRecord?.time_weighted_variance))
      ? Number(gradeRecord.time_weighted_variance)
      : (record.time_weighted_variance ?? null),
    time_weighted_stddev: Number.isFinite(Number(gradeRecord?.time_weighted_stddev))
      ? Number(gradeRecord.time_weighted_stddev)
      : (record.time_weighted_stddev ?? null),
    prop_firm_score: Number.isFinite(Number(gradeRecord?.prop_firm_score))
      ? Number(gradeRecord.prop_firm_score)
      : (record.prop_firm_score ?? null),
    prop_firm_grade: gradeRecord?.prop_firm_grade || record.prop_firm_grade || null,
    prop_firm_verdict: gradeRecord?.prop_firm_verdict || record.prop_firm_verdict || null,
    prop_firm_passable: typeof gradeRecord?.prop_firm_passable === 'boolean'
      ? gradeRecord.prop_firm_passable
      : (record.prop_firm_passable ?? null),
  };
}

module.exports = {
  STRATEGY_GRADE_INDEX_PATH,
  normalizeKey,
  normalizeStrategyPath,
  inferStrategyTaxonomy,
  laneDisplayLabel,
  normalizeStrategyUniverse,
  classifyStrategyAssetMode,
  formatStrategyAssetModeLabel,
  formatStrategyGradeTag,
  readStrategyGradeIndex,
  writeStrategyGradeIndex,
  upsertStrategyGradeRecord,
  getStrategyGradeRecord,
  decorateStrategyRecord,
};
