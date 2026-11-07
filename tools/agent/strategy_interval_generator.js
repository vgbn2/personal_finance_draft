#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const {
  DEFAULT_CANDIDATES_DIR,
  DEFAULT_AUTOMATED_STRATEGIES_DIR,
  STRATEGY_ARCHETYPES,
  generateCandidateSpec,
  validateRiskBounds,
  evaluateStrategy,
  calculateRiskAdjustedScore,
  stageCandidate,
  IntervalStrategyEngine,
} = require('../../shared/lib/strategy/interval_discovery');

function printUsage() {
  console.log(`
Usage: node tools/agent/strategy_interval_generator.js [options]

Autonomous interval strategy discovery engine. Generates, validates risk bounds,
backtests against local fixtures, scores risk-adjusted return, and stages passing
candidates with immutable checksums.

Options:
  --report, --list       Pretty-print tabular report of all staged candidates.
  --show <id>            Pretty-print detailed inspection card for a candidate.
  --once                 Run a single discovery cycle and exit immediately.
  --interval-secs <N>    Interval between discovery cycles in seconds (default: 30).
  --candidates-dir <dir> Destination directory for staged candidates (default: storage/data/strategies/candidates).
  --yaml-dir <dir>       Destination directory for staged strategy YAML files (default: configs/strategies/automated).
  --archetype <name>     Force specific archetype: pead_earnings_drift, order_flow_imbalance, volatility_breakout, crypto_regime_reversal, etc.
  --min-sharpe <N>       Minimum Sharpe ratio to stage candidate (default: 1.50).
  --max-drawdown <N>     Maximum allowed drawdown to stage candidate (default: 0.20).
  --min-trades <N>       Minimum trade count to stage candidate (default: 200).
  --help                 Show this help runbook.
`);
}

function parseCliArgs(argv) {
  const args = argv.slice(2);
  const options = {
    once: false,
    report: false,
    showId: null,
    intervalSecs: 30,
    candidatesDir: DEFAULT_CANDIDATES_DIR,
    yamlDir: DEFAULT_AUTOMATED_STRATEGIES_DIR,
    archetype: null,
    minSharpe: 1.50,
    maxDrawdown: 0.20,
    minTrades: 200,
    writeYaml: true,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--once') {
      options.once = true;
    } else if (arg === '--report' || arg === '--list') {
      options.report = true;
    } else if (arg === '--show') {
      options.showId = args[++i];
    } else if (arg === '--interval-secs' || arg === '--interval') {
      options.intervalSecs = Math.max(1, parseInt(args[++i], 10) || 30);
    } else if (arg === '--candidates-dir') {
      options.candidatesDir = path.resolve(args[++i]);
    } else if (arg === '--yaml-dir') {
      options.yamlDir = path.resolve(args[++i]);
    } else if (arg === '--archetype') {
      options.archetype = args[++i];
    } else if (arg === '--min-sharpe') {
      options.minSharpe = parseFloat(args[++i]);
    } else if (arg === '--max-drawdown') {
      options.maxDrawdown = parseFloat(args[++i]);
    } else if (arg === '--min-trades') {
      options.minTrades = parseInt(args[++i], 10) || 200;
    } else if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    }
  }

  return options;
}

async function runSingleCycle(options) {
  const spec = generateCandidateSpec({
    archetype: options.archetype,
  });

  const validation = validateRiskBounds(spec);
  if (!validation.valid) {
    console.error(`[INTERVAL-GENERATOR] Risk bounds rejected for ${spec.name}:`, validation.errors);
    return { success: false, errors: validation.errors };
  }

  console.log(`[INTERVAL-GENERATOR] [${new Date().toISOString()}] Generated: ${spec.name} (${spec.archetype} | ${spec.model} | ${spec.timeframe})`);
  console.log(`[INTERVAL-GENERATOR] Checksum: ${spec.checksum}`);

  const evaluation = await evaluateStrategy(spec);
  const score = calculateRiskAdjustedScore(evaluation);

  console.log(`[INTERVAL-GENERATOR] Backtest Engine: ${evaluation.engine} | Trades: ${evaluation.trades} | Sharpe: ${Number(evaluation.sharpe_ratio).toFixed(2)} | MaxDD: ${(evaluation.max_drawdown * 100).toFixed(2)}% | WinRate: ${(evaluation.win_rate * 100).toFixed(1)}% | Score: ${score}`);

  const staging = stageCandidate({
    spec,
    evaluation,
    score,
  }, {
    candidatesDir: options.candidatesDir,
    yamlDir: options.yamlDir,
    min_sharpe: options.minSharpe,
    max_drawdown: options.maxDrawdown,
    min_trades: options.minTrades,
    writeYaml: options.writeYaml !== false,
  });

  if (staging.staged) {
    console.log(`[INTERVAL-GENERATOR] STAGED CANDIDATE: ${staging.path} (Score: ${staging.score})`);
    if (staging.yaml_path) {
      console.log(`[INTERVAL-GENERATOR] STAGED STRATEGY YAML: ${staging.yaml_path}`);
    }
  } else {
    console.log(`[INTERVAL-GENERATOR] Discarded candidate: quality gate not met (${staging.reason})`);
  }

  return {
    success: true,
    spec,
    evaluation,
    score,
    staged: staging.staged,
    stagedPath: staging.path || null,
    yamlPath: staging.yaml_path || null,
  };
}

function printCandidatesReport(candidatesDir) {
  if (!fs.existsSync(candidatesDir)) {
    console.log(`No candidates directory found at: ${candidatesDir}`);
    return;
  }
  const files = fs.readdirSync(candidatesDir).filter((f) => f.endsWith('.json'));
  if (files.length === 0) {
    console.log(`No staged strategy candidates in ${candidatesDir}`);
    return;
  }

  const list = [];
  for (const f of files) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(candidatesDir, f), 'utf8'));
      const ev = data.evaluation || {};
      list.push({
        checksum: (data.checksum || f.replace('.json', '')).slice(0, 8),
        archetype: data.archetype || data.spec?.archetype || 'unknown',
        family: data.family || data.spec?.family || 'unknown',
        tf: data.timeframe || data.spec?.timeframe || '1h',
        trades: ev.trades ?? ev.trade_count ?? 0,
        sharpe: Number.isFinite(ev.sharpe_ratio) ? ev.sharpe_ratio.toFixed(2) : 'N/A',
        maxDd: Number.isFinite(ev.max_drawdown) ? (ev.max_drawdown * 100).toFixed(1) + '%' : 'N/A',
        winRate: Number.isFinite(ev.win_rate) ? (ev.win_rate * 100).toFixed(1) + '%' : 'N/A',
        score: Number.isFinite(data.score) ? data.score.toFixed(2) : '0.00',
        rawScore: data.score || 0,
      });
    } catch {}
  }

  list.sort((a, b) => b.rawScore - a.rawScore);

  console.log('\n' + '='.repeat(105));
  console.log('                              SOVEREIGN DISCOVERED STRATEGY CANDIDATES');
  console.log('='.repeat(105));
  console.log(
    'Checksum'.padEnd(10) + ' | ' +
    'Archetype'.padEnd(26) + ' | ' +
    'Family'.padEnd(16) + ' | ' +
    'TF'.padEnd(4) + ' | ' +
    'Trades'.padStart(6) + ' | ' +
    'Sharpe'.padStart(7) + ' | ' +
    'MaxDD'.padStart(7) + ' | ' +
    'WinRate'.padStart(7) + ' | ' +
    'Score'.padStart(8)
  );
  console.log('-'.repeat(10) + '-+-' + '-'.repeat(26) + '-+-' + '-'.repeat(16) + '-+-' + '-'.repeat(4) + '-+-' + '-'.repeat(6) + '-+-' + '-'.repeat(7) + '-+-' + '-'.repeat(7) + '-+-' + '-'.repeat(7) + '-+-' + '-'.repeat(8));

  for (const item of list) {
    console.log(
      item.checksum.padEnd(10) + ' | ' +
      item.archetype.padEnd(26) + ' | ' +
      item.family.padEnd(16) + ' | ' +
      item.tf.padEnd(4) + ' | ' +
      String(item.trades).padStart(6) + ' | ' +
      item.sharpe.padStart(7) + ' | ' +
      item.maxDd.padStart(7) + ' | ' +
      item.winRate.padStart(7) + ' | ' +
      item.score.padStart(8)
    );
  }
  console.log('='.repeat(105));
  console.log(`Total Staged Candidates: ${list.length} | Source: ${candidatesDir}\n`);
}

function printCandidateCard(candidatesDir, query) {
  if (!fs.existsSync(candidatesDir)) {
    console.log(`Candidates directory not found at: ${candidatesDir}`);
    return;
  }
  const files = fs.readdirSync(candidatesDir).filter((f) => f.endsWith('.json'));
  const match = files.find((f) => f.toLowerCase().includes(query.toLowerCase()));
  if (!match) {
    console.log(`Candidate matching "${query}" not found in ${candidatesDir}`);
    return;
  }
  const record = JSON.parse(fs.readFileSync(path.join(candidatesDir, match), 'utf8'));
  const ev = record.evaluation || {};
  const ml = record.ml_meta_labeling || {};
  const spec = record.spec || {};

  console.log('\n' + '='.repeat(70));
  console.log(`STRATEGY INSPECTION CARD: ${record.strategy_id || record.name || match.replace('.json', '')}`);
  console.log('='.repeat(70));
  console.log(`Checksum:    ${record.checksum || match.replace('.json', '')}`);
  console.log(`Family:      ${record.family || spec.family} (${record.archetype || spec.archetype})`);
  console.log(`Model:       ${record.model || spec.model} | Timeframe: ${record.timeframe || spec.timeframe}`);
  console.log(`Universe:    ${(spec.universe || []).join(', ') || 'N/A'}`);
  console.log(`Created At:  ${spec.created_at || 'N/A'}`);
  console.log('-'.repeat(70));
  console.log('EVALUATION METRICS (C++20 SOVEREIGN ENGINE):');
  console.log(`  Trades:         ${ev.trades ?? ev.trade_count ?? 0}`);
  console.log(`  Sharpe Ratio:   ${Number(ev.sharpe_ratio ?? 0).toFixed(2)}`);
  console.log(`  Max Drawdown:   ${(Number(ev.max_drawdown ?? 0) * 100).toFixed(2)}%`);
  console.log(`  Win Rate:       ${(Number(ev.win_rate ?? 0) * 100).toFixed(1)}%`);
  console.log(`  Net Return:     ${(Number(ev.net_return ?? 0) * 100).toFixed(2)}%`);
  console.log(`  Overall Score:  ${Number(record.score ?? 0).toFixed(2)}`);
  console.log('-'.repeat(70));
  console.log('ML META-LABELING VERIFICATION:');
  console.log(`  Status:         ${ml.status || 'not_configured'}`);
  console.log(`  Model Backend:  ${ml.model || 'N/A'} (${ml.prediction_backend || 'N/A'})`);
  console.log(`  Filter Logic:   ${ml.filter || 'N/A'}`);
  console.log('-'.repeat(70));
  console.log(`YAML Path:   ${record.yaml_path || 'N/A'}`);
  console.log('='.repeat(70) + '\n');
}

async function main() {
  const options = parseCliArgs(process.argv);

  if (options.report) {
    printCandidatesReport(options.candidatesDir);
    return;
  }

  if (options.showId) {
    printCandidateCard(options.candidatesDir, options.showId);
    return;
  }

  if (options.once) {
    try {
      const result = await runSingleCycle(options);
      if (!result.success) {
        process.exitCode = 1;
      }
    } catch (err) {
      console.error('[INTERVAL-GENERATOR] Fatal execution error:', err.message);
      process.exitCode = 1;
    }
    return;
  }

  const engine = new IntervalStrategyEngine({
    intervalSecs: options.intervalSecs,
    candidatesDir: options.candidatesDir,
    minSharpe: options.minSharpe,
    maxDrawdown: options.maxDrawdown,
    minTrades: options.minTrades,
    logger: console.log,
    onCandidate: (res) => {
      const now = new Date().toISOString();
      if (res.staged) {
        console.log(`[INTERVAL-GENERATOR] [${now}] STAGED CANDIDATE: ${res.spec?.name} -> ${res.stagedPath} (Score: ${Number(res.score || 0).toFixed(2)})`);
        if (res.yamlPath) {
          console.log(`[INTERVAL-GENERATOR] [${now}] STAGED STRATEGY YAML: ${res.yamlPath}`);
        }
      } else {
        const trades = res.evaluation?.trades ?? 0;
        const sharpe = Number.isFinite(res.evaluation?.sharpe_ratio) ? res.evaluation.sharpe_ratio.toFixed(2) : 'N/A';
        const dd = Number.isFinite(res.evaluation?.max_drawdown) ? (res.evaluation.max_drawdown * 100).toFixed(1) + '%' : 'N/A';
        console.log(`[INTERVAL-GENERATOR] [${now}] Evaluated ${res.spec?.name} (${res.spec?.family} | ${trades} trades | Sharpe ${sharpe} | DD ${dd}) - Discarded: ${res.reason || 'quality_gate'}`);
      }
    },
  });

  const shutdown = () => {
    console.log('\n[INTERVAL-GENERATOR] Stopping interval discovery daemon...');
    engine.stop();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  await engine.start();
}

if (require.main === module) {
  main();
}

module.exports = {
  parseCliArgs,
  runSingleCycle,
};
