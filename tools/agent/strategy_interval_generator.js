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
  --once                 Run a single discovery cycle and exit immediately.
  --interval-secs <N>    Interval between discovery cycles in seconds (default: 30).
  --candidates-dir <dir> Destination directory for staged candidates (default: storage/data/strategies/candidates).
  --yaml-dir <dir>       Destination directory for staged strategy YAML files (default: configs/strategies/automated).
  --archetype <name>     Force specific archetype: pead_earnings_drift, order_flow_imbalance, volatility_breakout, crypto_regime_reversal, etc.
  --min-sharpe <N>       Minimum Sharpe ratio to stage candidate (default: 1.50).
  --max-drawdown <N>     Maximum allowed drawdown to stage candidate (default: 0.20).
  --min-trades <N>       Minimum trade count to stage candidate (default: 20).
  --help                 Show this help runbook.
`);
}

function parseCliArgs(argv) {
  const args = argv.slice(2);
  const options = {
    once: false,
    intervalSecs: 30,
    candidatesDir: DEFAULT_CANDIDATES_DIR,
    yamlDir: DEFAULT_AUTOMATED_STRATEGIES_DIR,
    archetype: null,
    minSharpe: 1.50,
    maxDrawdown: 0.20,
    minTrades: 20,
    writeYaml: true,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--once') {
      options.once = true;
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
      options.minTrades = parseInt(args[++i], 10) || 20;
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

async function main() {
  const options = parseCliArgs(process.argv);

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
    logger: console.log,
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
