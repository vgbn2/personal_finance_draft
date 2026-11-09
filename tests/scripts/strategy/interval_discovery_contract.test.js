'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const {
  DEFAULT_RISK_BOUNDS,
  CANONICAL_STRATEGY_FAMILIES,
  VALID_STRATEGY_FAMILIES,
  STRATEGY_ARCHETYPES,
  formatStrategyName,
  generateCandidateSpec,
  generateAiCandidateSpec,
  validateRiskBounds,
  computeSpecChecksum,
  calculateRiskAdjustedScore,
  rankCandidates,
  evaluateStrategy,
  stageCandidate,
  discoverAllMarketSymbols,
  resolveUniverse,
  getCategorySymbols,
  NON_TRADEABLE_SERIES,
  formatDdMmYy,
  formatTradeWindow,
  parseDdMmYy,
  IntervalStrategyEngine,
} = require('../../../shared/lib/strategy/interval_discovery');

test('interval discovery: generates valid strategy specifications matching archetype contracts', () => {
  const archetypes = Object.keys(STRATEGY_ARCHETYPES);
  assert.ok(archetypes.length >= 3, 'at least 3 archetypes defined');

  for (const arch of archetypes) {
    const spec = generateCandidateSpec({ archetype: arch, seed: 'test_seed' });

    assert.ok(spec.name, `spec has name for ${arch}`);
    assert.strictEqual(spec.archetype, arch, `archetype matches for ${arch}`);
    assert.ok(spec.family, `spec has family for ${arch}`);
    assert.ok(spec.model, `spec has model for ${arch}`);
    assert.ok(spec.timeframe, `spec has timeframe for ${arch}`);
    assert.ok(Array.isArray(spec.universe) && spec.universe.length > 0, `universe is non-empty for ${arch}`);
    assert.ok(spec.indicators && typeof spec.indicators === 'object', `indicators defined for ${arch}`);
    assert.ok(spec.indicator_periods && typeof spec.indicator_periods === 'object', `indicator_periods defined for ${arch}`);
    assert.ok(spec.risk && typeof spec.risk === 'object', `risk defined for ${arch}`);

    const validation = validateRiskBounds(spec);
    assert.strictEqual(validation.valid, true, `default generated spec must pass risk bounds: ${validation.errors?.join(', ')}`);

    const expectedChecksum = computeSpecChecksum(spec);
    assert.strictEqual(spec.checksum, expectedChecksum, `checksum matches deterministic calculation for ${arch}`);

    // Mutating a property changes the checksum
    const altered = { ...spec, risk: { ...spec.risk, signal_threshold: 0.90 } };
    assert.notStrictEqual(computeSpecChecksum(altered), expectedChecksum, 'altered spec yields distinct checksum');
  }
});

test('interval discovery: strictly rejects ungrounded or out-of-bound risk parameters', () => {
  const baseSpec = generateCandidateSpec({ archetype: 'ema_macd_trend' });

  // 1. risk_weight out of bounds
  const highRisk = { ...baseSpec, risk: { ...baseSpec.risk, risk_weight: 0.50 } };
  const valHigh = validateRiskBounds(highRisk);
  assert.strictEqual(valHigh.valid, false, 'rejects risk_weight > 0.25');
  assert.ok(valHigh.errors.some((e) => e.includes('risk_weight_out_of_bounds')));

  const negativeRisk = { ...baseSpec, risk: { ...baseSpec.risk, risk_weight: -0.05 } };
  assert.strictEqual(validateRiskBounds(negativeRisk).valid, false, 'rejects negative risk_weight');

  const nanRisk = { ...baseSpec, risk: { ...baseSpec.risk, risk_weight: 'extreme' } };
  assert.strictEqual(validateRiskBounds(nanRisk).valid, false, 'rejects non-numeric risk_weight');

  // 2. max_holding_days out of bounds
  const highHorizon = { ...baseSpec, risk: { ...baseSpec.risk, max_holding_days: 45 } };
  const valHorizon = validateRiskBounds(highHorizon);
  assert.strictEqual(valHorizon.valid, false, 'rejects max_holding_days > 30');
  assert.ok(valHorizon.errors.some((e) => e.includes('max_holding_days_out_of_bounds')));

  const zeroHorizon = { ...baseSpec, risk: { ...baseSpec.risk, max_holding_days: 0 } };
  assert.strictEqual(validateRiskBounds(zeroHorizon).valid, false, 'rejects max_holding_days <= 0');

  const floatHorizon = { ...baseSpec, risk: { ...baseSpec.risk, max_holding_days: 3.5 } };
  assert.strictEqual(validateRiskBounds(floatHorizon).valid, false, 'rejects non-integer max_holding_days');

  // 3. signal_threshold out of bounds
  const lowThreshold = { ...baseSpec, risk: { ...baseSpec.risk, signal_threshold: 0.40 } };
  const valLowTh = validateRiskBounds(lowThreshold);
  assert.strictEqual(valLowTh.valid, false, 'rejects signal_threshold < 0.50');
  assert.ok(valLowTh.errors.some((e) => e.includes('signal_threshold_out_of_bounds')));

  const highThreshold = { ...baseSpec, risk: { ...baseSpec.risk, signal_threshold: 0.99 } };
  assert.strictEqual(validateRiskBounds(highThreshold).valid, false, 'rejects signal_threshold > 0.95');

  // 4. max_drawdown_limit out of bounds
  const highDrawdown = { ...baseSpec, risk: { ...baseSpec.risk, max_drawdown_limit: 0.50 } };
  const valHighDd = validateRiskBounds(highDrawdown);
  assert.strictEqual(valHighDd.valid, false, 'rejects max_drawdown_limit > 0.35');
  assert.ok(valHighDd.errors.some((e) => e.includes('max_drawdown_limit_out_of_bounds')));

  // 5. non-object spec
  assert.strictEqual(validateRiskBounds(null).valid, false, 'rejects null spec');
  assert.strictEqual(validateRiskBounds('invalid').valid, false, 'rejects string spec');

  // 6. strategy family and name validation
  assert.ok(Array.isArray(VALID_STRATEGY_FAMILIES) && VALID_STRATEGY_FAMILIES.length >= 10);
  const badFamilySpec = { ...baseSpec, family: 'unregistered_moon_shot' };
  const valBadFamily = validateRiskBounds(badFamilySpec);
  assert.strictEqual(valBadFamily.valid, false, 'rejects unregistered strategy family');
  assert.ok(valBadFamily.errors.some((e) => e.includes('invalid_strategy_family')));

  const badNameSpec = { ...baseSpec, name: 'invalid name with spaces!' };
  const valBadName = validateRiskBounds(badNameSpec);
  assert.strictEqual(valBadName.valid, false, 'rejects non-alphanumeric/spaces strategy name');
  assert.ok(valBadName.errors.some((e) => e.includes('invalid_strategy_name')));
});

test('interval discovery: scoring criteria deterministically rank candidates', () => {
  // Test zero trades
  const zeroTradeScore = calculateRiskAdjustedScore({ trades: 0, sharpe_ratio: 3.0 });
  assert.strictEqual(zeroTradeScore, 0, 'zero trade count results in 0 score');

  // Sharpe comparison: higher sharpe -> higher score
  const highSharpe = calculateRiskAdjustedScore({
    trades: 15,
    sharpe_ratio: 2.5,
    max_drawdown: 0.10,
    profit_factor: 2.0,
    win_rate: 0.60,
  });
  const lowSharpe = calculateRiskAdjustedScore({
    trades: 15,
    sharpe_ratio: 0.8,
    max_drawdown: 0.10,
    profit_factor: 2.0,
    win_rate: 0.60,
  });
  assert.ok(highSharpe > lowSharpe, `higher Sharpe (${highSharpe}) must exceed lower Sharpe (${lowSharpe})`);

  // Drawdown comparison: lower drawdown -> higher score
  const lowDd = calculateRiskAdjustedScore({
    trades: 15,
    sharpe_ratio: 1.5,
    max_drawdown: 0.05,
    profit_factor: 2.0,
    win_rate: 0.60,
  });
  const highDd = calculateRiskAdjustedScore({
    trades: 15,
    sharpe_ratio: 1.5,
    max_drawdown: 0.25,
    profit_factor: 2.0,
    win_rate: 0.60,
  });
  assert.ok(lowDd > highDd, `lower Drawdown (${lowDd}) must score higher than higher Drawdown (${highDd})`);

  // Profit Factor comparison: higher profit factor -> higher score
  const highPf = calculateRiskAdjustedScore({
    trades: 15,
    sharpe_ratio: 1.5,
    max_drawdown: 0.10,
    profit_factor: 3.0,
    win_rate: 0.60,
  });
  const lowPf = calculateRiskAdjustedScore({
    trades: 15,
    sharpe_ratio: 1.5,
    max_drawdown: 0.10,
    profit_factor: 1.1,
    win_rate: 0.60,
  });
  assert.ok(highPf > lowPf, `higher Profit Factor (${highPf}) must score higher than lower Profit Factor (${lowPf})`);

  // Candidate ranking sorting
  const candidates = [
    { name: 'strat_c', score: lowSharpe },
    { name: 'strat_a', score: highSharpe },
    { name: 'strat_b', score: lowDd },
  ];
  const ranked = rankCandidates(candidates);
  assert.strictEqual(ranked[0].name, 'strat_a', 'highest score ranked first');
  assert.ok(ranked[0].score >= ranked[1].score && ranked[1].score >= ranked[2].score, 'candidates sorted descending');
});

test('interval discovery: candidate staging produces immutable checksummed records', (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sv-strat-candidates-'));
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  const spec = generateCandidateSpec({ archetype: 'ema_macd_trend', seed: 'stage_test' });
  const evaluation = {
    symbol: 'SPY',
    bar_count: 5000,
    engine: 'sovereign_cpp_core',
    trades: 250,
    net_return: 0.05,
    max_drawdown: 0.04,
    sharpe_ratio: 2.10,
    win_rate: 0.58,
    profit_factor: 2.2,
  };

  const stageRes = stageCandidate({
    spec,
    evaluation,
  }, {
    candidatesDir: tmpDir,
    min_sharpe: 1.0,
    max_drawdown: 0.20,
  });

  assert.strictEqual(stageRes.staged, true, 'candidate meeting quality gate must stage');
  assert.ok(fs.existsSync(stageRes.path), `staged file exists at ${stageRes.path}`);

  const loaded = JSON.parse(fs.readFileSync(stageRes.path, 'utf8'));
  assert.strictEqual(loaded.checksum, spec.checksum, 'staged checksum matches spec checksum');
  assert.strictEqual(loaded.spec.name, spec.name, 'staged spec name matches');
  assert.strictEqual(loaded.status, 'staged_candidate', 'status is staged_candidate');
  assert.strictEqual(loaded.evaluation.trades, 250, 'staged evaluation matches');
  assert.strictEqual(typeof loaded.score, 'number', 'staged record contains computed numeric score');

  // Candidate is staged regardless of Sharpe or trade count for manual user filtering
  const lowTradesEval = { ...evaluation, trades: 10, sharpe_ratio: 0.10 };
  const stageLow = stageCandidate({
    spec,
    evaluation: lowTradesEval,
  }, {
    candidatesDir: tmpDir,
  });
  assert.strictEqual(stageLow.staged, true, 'candidate is preserved for manual user filtering');
  assert.ok(fs.existsSync(stageLow.path), 'candidate file written to storage');
});

test('interval discovery: stageCandidate enforces metric thresholds before disk persistence', async (t) => {
  const tmpCandidates = fs.mkdtempSync(path.join(os.tmpdir(), 'sv-stage-gate-candidates-'));
  const tmpYaml = fs.mkdtempSync(path.join(os.tmpdir(), 'sv-stage-gate-yaml-'));
  t.after(() => {
    fs.rmSync(tmpCandidates, { recursive: true, force: true });
    fs.rmSync(tmpYaml, { recursive: true, force: true });
  });

  const spec = generateCandidateSpec({ archetype: 'ema_macd_trend', seed: 'gate_test' });

  // 1. Reject negative or below-threshold Sharpe ratio
  const negSharpeEval = {
    symbol: 'SPY',
    trades: 300,
    win_rate: 0.40,
    sharpe_ratio: -0.46,
    max_drawdown: 0.15,
    profit_factor: 1.1,
  };
  const negSharpeResult = stageCandidate({
    spec,
    evaluation: negSharpeEval,
  }, {
    candidatesDir: tmpCandidates,
    yamlDir: tmpYaml,
    min_sharpe: 0.50,
    max_drawdown: 0.35,
    min_trades: 200,
  });
  assert.strictEqual(negSharpeResult.staged, false, 'candidate with negative Sharpe must not be staged');
  assert.strictEqual(negSharpeResult.reason, 'sharpe_below_threshold');
  assert.strictEqual(negSharpeResult.sharpe, -0.46);
  assert.strictEqual(negSharpeResult.threshold, 0.50);
  assert.strictEqual(fs.readdirSync(tmpCandidates).length, 0, 'zero candidate files written on Sharpe failure');
  assert.strictEqual(fs.readdirSync(tmpYaml).length, 0, 'zero YAML files written on Sharpe failure');

  // 2. Reject excessive drawdown exceeding threshold
  const highDdEval = {
    symbol: 'SPY',
    trades: 300,
    win_rate: 0.55,
    sharpe_ratio: 1.20,
    max_drawdown: 0.42,
    profit_factor: 1.5,
  };
  const highDdResult = stageCandidate({
    spec,
    evaluation: highDdEval,
  }, {
    candidatesDir: tmpCandidates,
    yamlDir: tmpYaml,
    min_sharpe: 0.50,
    max_drawdown: 0.20,
    min_trades: 200,
  });
  assert.strictEqual(highDdResult.staged, false, 'candidate with excessive drawdown must not be staged');
  assert.strictEqual(highDdResult.reason, 'drawdown_above_threshold');
  assert.strictEqual(highDdResult.drawdown, 0.42);
  assert.strictEqual(highDdResult.threshold, 0.20);
  assert.strictEqual(fs.readdirSync(tmpCandidates).length, 0, 'zero candidate files written on drawdown failure');
  assert.strictEqual(fs.readdirSync(tmpYaml).length, 0, 'zero YAML files written on drawdown failure');

  // 3. Reject insufficient trade count
  const lowTradesEval = {
    symbol: 'SPY',
    trades: 45,
    win_rate: 0.60,
    sharpe_ratio: 1.80,
    max_drawdown: 0.10,
    profit_factor: 2.0,
  };
  const lowTradesResult = stageCandidate({
    spec,
    evaluation: lowTradesEval,
  }, {
    candidatesDir: tmpCandidates,
    yamlDir: tmpYaml,
    min_sharpe: 0.50,
    max_drawdown: 0.35,
    min_trades: 200,
  });
  assert.strictEqual(lowTradesResult.staged, false, 'candidate with insufficient trades must not be staged');
  assert.strictEqual(lowTradesResult.reason, 'trades_below_threshold');
  assert.strictEqual(lowTradesResult.trades, 45);
  assert.strictEqual(lowTradesResult.threshold, 200);
  assert.strictEqual(fs.readdirSync(tmpCandidates).length, 0, 'zero candidate files written on trade count failure');
  assert.strictEqual(fs.readdirSync(tmpYaml).length, 0, 'zero YAML files written on trade count failure');

  // 4. Reject insufficient profit factor
  const lowPfEval = {
    symbol: 'SPY',
    trades: 250,
    win_rate: 0.50,
    sharpe_ratio: 1.10,
    max_drawdown: 0.12,
    profit_factor: 0.85,
  };
  const lowPfResult = stageCandidate({
    spec,
    evaluation: lowPfEval,
  }, {
    candidatesDir: tmpCandidates,
    yamlDir: tmpYaml,
    min_profit_factor: 1.0,
  });
  assert.strictEqual(lowPfResult.staged, false, 'candidate with low profit factor must not be staged');
  assert.strictEqual(lowPfResult.reason, 'profit_factor_below_threshold');
  assert.strictEqual(lowPfResult.profit_factor, 0.85);
  assert.strictEqual(lowPfResult.threshold, 1.0);
  assert.strictEqual(fs.readdirSync(tmpCandidates).length, 0, 'zero candidate files written on profit factor failure');

  // 5. Stage when all thresholds are met
  const validEval = {
    symbol: 'SPY',
    trades: 250,
    win_rate: 0.58,
    sharpe_ratio: 1.45,
    max_drawdown: 0.14,
    profit_factor: 1.80,
  };
  const passResult = stageCandidate({
    spec,
    evaluation: validEval,
  }, {
    candidatesDir: tmpCandidates,
    yamlDir: tmpYaml,
    min_sharpe: 1.0,
    max_drawdown: 0.20,
    min_trades: 200,
    min_profit_factor: 1.0,
  });
  assert.strictEqual(passResult.staged, true, 'valid candidate must be staged successfully');
  assert.ok(fs.existsSync(passResult.path), 'candidate JSON file exists on disk');
  assert.ok(fs.existsSync(passResult.yaml_path), 'strategy YAML file exists on disk');

  const loadedRecord = JSON.parse(fs.readFileSync(passResult.path, 'utf8'));
  assert.strictEqual(loadedRecord.checksum, spec.checksum);
  assert.strictEqual(loadedRecord.evaluation.sharpe_ratio, 1.45);
  assert.strictEqual(loadedRecord.evaluation.trades, 250);

  const loadedYaml = fs.readFileSync(passResult.yaml_path, 'utf8');
  assert.ok(loadedYaml.includes(passResult.record.name));
  assert.ok(loadedYaml.includes('1.45'));

  // 6. IntervalStrategyEngine runCycle enforces minSharpe barrier
  const engine = new IntervalStrategyEngine({
    intervalSecs: 1,
    candidatesDir: tmpCandidates,
    yamlDir: tmpYaml,
    minSharpe: 99.0, // unachievable Sharpe ratio
    minTrades: 0,
    maxDrawdown: 1.0,
    logger: () => {},
  });
  const cycle = await engine.runCycle();
  assert.strictEqual(cycle.success, true);
  assert.strictEqual(cycle.staged, false, 'engine cycle must not stage when Sharpe is below minSharpe threshold');
  assert.strictEqual(cycle.reason, 'sharpe_below_threshold');
  assert.strictEqual(cycle.stagedPath, null);
  assert.strictEqual(cycle.yamlPath, null);
});

test('interval discovery: IntervalStrategyEngine executes cycle against local fixtures', async (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sv-engine-candidates-'));
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  const engine = new IntervalStrategyEngine({
    intervalSecs: 1,
    candidatesDir: tmpDir,
    yamlDir: tmpDir,
    minSharpe: -10, // allow staging for test verification
    minTrades: 0,   // allow staging for test verification
    maxDrawdown: 1.0, // allow staging for test verification
    logger: () => {}, // silent
  });

  const cycle = await engine.runCycle();
  assert.strictEqual(cycle.success, true, 'cycle completed successfully');
  assert.ok(cycle.spec, 'cycle generated spec');
  assert.ok(cycle.evaluation, 'cycle generated evaluation');
  assert.strictEqual(typeof cycle.evaluation.trades, 'number', 'evaluation has numeric trades');
  assert.strictEqual(typeof cycle.evaluation.max_drawdown, 'number', 'evaluation has numeric drawdown');
  assert.strictEqual(typeof cycle.score, 'number', 'cycle has score');
  assert.strictEqual(cycle.staged, true, 'cycle candidate staged');
  assert.ok(fs.existsSync(cycle.stagedPath), 'staged candidate file exists on disk');

  // Verify engine start/stop lifecycle
  await engine.start();
  assert.strictEqual(engine.running, true, 'engine running flag is true');
  engine.stop();
  assert.strictEqual(engine.running, false, 'engine running flag is false after stop');
});

test('interval discovery: CLI supports single-cycle execution via --once', (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sv-cli-candidates-'));
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  const scriptPath = path.resolve(__dirname, '../../../tools/agent/strategy_interval_generator.js');
  const res = spawnSync(process.execPath, [
    scriptPath,
    '--once',
    '--candidates-dir', tmpDir,
    '--yaml-dir', tmpDir,
    '--archetype', 'ema_macd_trend',
  ], {
    encoding: 'utf8',
    timeout: 10000,
  });

  assert.strictEqual(res.status, 0, `CLI --once exited with status ${res.status}: ${res.stderr}`);
  assert.ok(res.stdout.includes('[INTERVAL-GENERATOR]'), 'stdout contains interval generator logs');
  assert.ok(res.stdout.includes('Generated:'), 'stdout confirms strategy generation');
  assert.ok(res.stdout.includes('Backtest Engine:'), 'stdout confirms backtest execution');
});

test('interval discovery: discoverAllMarketSymbols dynamically retrieves universe from disk and manifests', () => {
  const symbols = discoverAllMarketSymbols();
  assert.ok(Array.isArray(symbols), 'symbols must be an array');
  assert.ok(symbols.length > 10, 'must dynamically discover >10 symbols from disk storage and configs');
  assert.ok(symbols.includes('AAPL'), 'contains AAPL from equity data/configs');
  assert.ok(symbols.includes('BTCUSDT') || symbols.includes('BTC'), 'contains crypto symbols from data/configs');
  assert.strictEqual(symbols.includes('FEDFUNDS'), false, 'strictly excludes non-tradeable macro reference series FEDFUNDS');
  assert.strictEqual(symbols.includes('CPI'), false, 'strictly excludes non-tradeable macro reference series CPI');
  assert.ok(NON_TRADEABLE_SERIES.has('FEDFUNDS'), 'NON_TRADEABLE_SERIES catalog includes FEDFUNDS');

  const cryptoUniverse = resolveUniverse('crypto');
  assert.ok(cryptoUniverse.includes('BTC'), 'resolves crypto asset class universe');
  assert.strictEqual(cryptoUniverse.includes('FEDFUNDS'), false, 'crypto universe excludes macro indicators');

  const equityUniverse = resolveUniverse('equities');
  assert.ok(equityUniverse.includes('AAPL'), 'resolves equity asset class universe');
});

test('interval discovery: date parsing and trade window formatting (dd/mm/yy to dd/mm/yy)', () => {
  const iso = parseDdMmYy('15/03/24');
  assert.ok(iso, 'parses 15/03/24 successfully');
  assert.strictEqual(iso.slice(0, 10), '2024-03-15');

  const formatted = formatDdMmYy(iso);
  assert.strictEqual(formatted, '15/03/24');

  const windowStr = formatTradeWindow('2024-01-05T00:00:00.000Z', '2024-04-20T12:00:00.000Z');
  assert.strictEqual(windowStr, '05/01/24 to 20/04/24');
});

test('interval discovery: evaluates strategy across multi-market universe with C++ engine', async () => {
  const spec = generateCandidateSpec({
    archetype: 'volatility_breakout',
    universe: ['SPY', 'QQQ', 'AAPL'],
  });

  const evaluation = await evaluateStrategy(spec, {
    universe: ['SPY', 'QQQ', 'AAPL'],
    engine: 'cpp_frame',
  });

  assert.strictEqual(evaluation.engine, 'sovereign_cpp_core', 'engine provenance must be sovereign_cpp_core');
  assert.ok(evaluation.trades > 0, 'trades count must be positive');
  assert.ok(evaluation.first_trade_enter, 'first_trade_enter must be recorded');
  assert.ok(evaluation.last_trade_exit, 'last_trade_exit must be recorded');
  assert.ok(evaluation.trading_window.includes(' to '), 'trading window formatted as dd/mm/yy to dd/mm/yy');
});

test('interval discovery: CLI supports --all-markets and custom universe', (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sv-cli-multimarket-'));
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
  const scriptPath = path.resolve(__dirname, '../../../tools/agent/strategy_interval_generator.js');

  const res = spawnSync(process.execPath, [
    scriptPath,
    '--once',
    '--universe', 'SPY,QQQ,AAPL',
    '--candidates-dir', tmpDir,
    '--yaml-dir', tmpDir,
    '--archetype', 'volatility_breakout',
    '--from', '01/01/24',
    '--to', '01/06/24',
  ], {
    encoding: 'utf8',
    timeout: 15000,
  });

  assert.strictEqual(res.status, 0, `CLI exited with error: ${res.stderr}`);
  assert.ok(res.stdout.includes('Universe: 3 symbols'), 'logs reflect 3 universe symbols');
  assert.ok(res.stdout.includes('Backtest Engine: sovereign_cpp_core'), 'confirms sovereign_cpp_core C++ execution');
  assert.ok(res.stdout.includes('Window:'), 'confirms trade window output');
});

test('interval discovery: canonical taxonomy covers 10 families and 20 archetypes with multi-asset universes', () => {
  const expectedFamilies = [
    'momentum',
    'mean_reversion',
    'breakout',
    'microstructure',
    'volatility',
    'event_drift',
    'stat_arb',
    'trend_following',
    'ml_alpha',
    'prediction',
  ];

  for (const fam of expectedFamilies) {
    assert.ok(CANONICAL_STRATEGY_FAMILIES.includes(fam), `canonical families must include ${fam}`);
    assert.ok(VALID_STRATEGY_FAMILIES.includes(fam), `valid families must include ${fam}`);
  }

  const expectedArchetypes = [
    'ema_macd_trend', 'opening_range_momentum',
    'bollinger_mean_reversion', 'crypto_regime_reversal', 'rsi_stoch_reversal',
    'volatility_breakout', 'atr_volatility_breakout',
    'order_flow_imbalance', 'orderflow_depth',
    'volatility_smile_skew', 'straddle_dispersion',
    'pead_earnings_drift', 'fomc_drift',
    'etf_basket_arb', 'pairs_reversion',
    'macro_trend_ribbon', 'turtle_breakout',
    'cnn_window_alpha', 'random_forest_alpha',
    'clob_depth_imbalance', 'outcome_skew',
  ];

  for (const arch of expectedArchetypes) {
    assert.ok(STRATEGY_ARCHETYPES[arch], `archetype ${arch} must exist in STRATEGY_ARCHETYPES`);
    const item = STRATEGY_ARCHETYPES[arch];
    assert.ok(expectedFamilies.includes(item.family), `family for ${arch} must be canonical: ${item.family}`);
    assert.ok(item.signal_core, `archetype ${arch} must declare signal_core`);
    assert.ok(Array.isArray(item.universe) && item.universe.length >= 2, `archetype ${arch} must define multi-asset universe (>=2 symbols): ${item.universe}`);
    assert.ok(Object.keys(item.indicators).length >= 2, `archetype ${arch} must combine at least 2 indicators`);
    assert.ok(item.default_risk.stop_loss_pct <= 0.05, `archetype ${arch} stop loss <= 5%`);
    assert.ok(item.default_risk.max_drawdown_limit <= 0.20, `archetype ${arch} drawdown <= 20%`);
  }
});

test('interval discovery: formatStrategyName adheres to mandatory naming grammar', () => {
  const autoName = formatStrategyName({
    prefix: 'auto',
    family: 'momentum',
    signal_core: 'ema_macd',
    timeframe: '1h',
  });
  assert.strictEqual(autoName, 'auto_momentum_ema_macd_1h');
  assert.match(autoName, /^[a-z0-9_]+$/);

  const candName = formatStrategyName({
    prefix: 'cand',
    family: 'mean_reversion',
    signal_core: 'bollinger_rsi',
    timeframe: '1d',
    seed: 'seed123',
  });
  assert.strictEqual(candName, 'cand_mean_reversion_bollinger_rsi_1d_seed123');
  assert.match(candName, /^[a-z0-9_]+$/);
});

test('interval discovery: preserves all evaluated candidates for manual human filtering without discard', (t) => {
  const tmpStaged = fs.mkdtempSync(path.join(os.tmpdir(), 'sv-staged-'));
  t.after(() => fs.rmSync(tmpStaged, { recursive: true, force: true }));

  const spec = generateCandidateSpec({ archetype: 'ema_macd_trend', seed: 'keep_all_test' });
  const rawEval = {
    symbol: 'SPY',
    trades: 50,
    sharpe_ratio: -0.47,
    max_drawdown: 0.51,
  };

  const stageRes = stageCandidate({
    spec,
    evaluation: rawEval,
  }, {
    candidatesDir: tmpStaged,
  });

  assert.strictEqual(stageRes.staged, true, 'must stage candidate without discard');
  assert.ok(fs.existsSync(stageRes.path), 'staged file written to storage');
  const stagedData = JSON.parse(fs.readFileSync(stageRes.path, 'utf8'));
  assert.strictEqual(stagedData.checksum, spec.checksum);
  assert.strictEqual(stagedData.evaluation.trades, 50);
});

test('interval discovery: generateAiCandidateSpec validates AI candidate spec or returns null on offline', async () => {
  const aiCandidate = await generateAiCandidateSpec();
  if (aiCandidate) {
    const validation = validateRiskBounds(aiCandidate);
    assert.strictEqual(validation.valid, true, `AI candidate must pass risk bounds validation: ${JSON.stringify(validation.errors)}`);
    assert.ok(aiCandidate.ai_generated, 'must be marked as ai_generated');
    assert.ok(aiCandidate.checksum, 'must contain checksum');
  } else {
    // Expected when router/network is temporarily unreachable in hermetic test env
    assert.strictEqual(aiCandidate, null);
  }
});
