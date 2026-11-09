#!/usr/bin/env node
'use strict';

/**
 * Sovereign Deterministic Anti-Cheat Quantitative Strategy Research Harness
 *
 * Executes rigorous, anti-cheat quantitative research iterations against the Sovereign
 * C++20 core engine. Intercepts raw empirical metrics at the runtime module boundary
 * (via capture.cjs preload) to prevent LLM hallucination and ensure only validated
 * strategies are committed to workspace/RESEARCH_LEDGER.jsonl and configs/strategies/automated/.
 */

const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const LEDGER_PATH = path.join(REPO_ROOT, 'workspace', 'RESEARCH_LEDGER.jsonl');
const GOAL_PATH = path.join(REPO_ROOT, 'workspace', 'OVERNIGHT_GOAL.md');
const AUTOMATED_STRATEGIES_DIR = path.join(REPO_ROOT, 'configs', 'strategies', 'automated');
const CANDIDATES_DIR = path.join(REPO_ROOT, 'storage', 'data', 'strategies', 'candidates');
const INTERVAL_DISCOVERY_MODULE = path.join(REPO_ROOT, 'shared', 'lib', 'strategy', 'interval_discovery');

const {
  computeSpecChecksum,
  STRATEGY_ARCHETYPES,
} = require(INTERVAL_DISCOVERY_MODULE);

// Default Anti-Cheat Quality Invariants (Hard Quality Floors)
const DEFAULT_GATES = Object.freeze({
  min_trades: 30,         // Statistical sample size floor
  min_sharpe: 1.00,       // Minimum net annualized Sharpe ratio
  max_drawdown: 0.15,     // Maximum peak-to-trough drawdown ceiling (15.0%)
  min_win_rate: 0.40,     // Minimum trade win rate (40.0%)
});

function printUsage() {
  console.log(`
Sovereign Deterministic Anti-Cheat Quant Research Harness

Usage:
  node tools/agent/quant_research_harness.js [options]

Options:
  --cycles <N>          Number of research cycles to execute (default: 1).
  --once                Execute exactly one cycle and exit.
  --archetype <name>    Target specific archetype (e.g. bollinger_mean_reversion, pead_earnings_drift).
  --universe <symbols>  Comma-separated symbols (e.g. SPY,QQQ,BTCUSDT,ETHUSDT).
  --all-markets         Test candidate against all discovered markets.
  --from <date>         Start date filter (dd/mm/yy or ISO).
  --to <date>           End date filter (dd/mm/yy or ISO).
  --engine <name>       Engine: cpp_native (default) or cpp_frame.
  --min-sharpe <N>      Sharpe floor (default: 1.00).
  --max-drawdown <N>    Drawdown ceiling (default: 0.15).
  --min-trades <N>      Trades floor (default: 30).
  --min-win-rate <N>    Win rate floor (default: 0.40).
  --no-ai               Use deterministic algorithmic generation instead of AI synthesizer.
  --rationale <text>    Documented economic hypothesis / market inefficiency note.
  --dry-run             Probe ledger and simulate gates without disk mutation.
  --help, -h            Show this guide.
`);
}

function parseCliArgs(argv) {
  const args = argv.slice(2);
  const options = {
    cycles: 1,
    archetype: null,
    universe: null,
    allMarkets: true,
    from: null,
    to: null,
    engine: 'cpp_native',
    minSharpe: DEFAULT_GATES.min_sharpe,
    maxDrawdown: DEFAULT_GATES.max_drawdown,
    minTrades: DEFAULT_GATES.min_trades,
    minWinRate: DEFAULT_GATES.min_win_rate,
    noAi: false,
    rationale: null,
    dryRun: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--once') {
      options.cycles = 1;
    } else if (arg === '--cycles') {
      options.cycles = Math.max(1, parseInt(args[++i], 10) || 1);
    } else if (arg === '--archetype') {
      options.archetype = args[++i];
    } else if (arg === '--universe') {
      options.universe = args[++i];
    } else if (arg === '--all-markets') {
      options.allMarkets = true;
    } else if (arg === '--from') {
      options.from = args[++i];
    } else if (arg === '--to') {
      options.to = args[++i];
    } else if (arg === '--engine') {
      options.engine = args[++i];
    } else if (arg === '--min-sharpe') {
      options.minSharpe = parseFloat(args[++i]);
    } else if (arg === '--max-drawdown') {
      options.maxDrawdown = parseFloat(args[++i]);
    } else if (arg === '--min-trades') {
      options.minTrades = parseInt(args[++i], 10) || 30;
    } else if (arg === '--min-win-rate') {
      options.minWinRate = parseFloat(args[++i]);
    } else if (arg === '--no-ai') {
      options.noAi = true;
    } else if (arg === '--rationale') {
      options.rationale = args[++i];
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    }
  }

  return options;
}

function probeStateAndLedger() {
  const ledgerExists = fs.existsSync(LEDGER_PATH);
  const rawLedger = ledgerExists ? fs.readFileSync(LEDGER_PATH, 'utf8') : '';
  const lines = rawLedger.trim() ? rawLedger.trim().split('\n') : [];
  const history = [];

  for (const line of lines) {
    try {
      history.push(JSON.parse(line));
    } catch {}
  }

  const goalExists = fs.existsSync(GOAL_PATH);
  const goalContent = goalExists ? fs.readFileSync(GOAL_PATH, 'utf8') : '';

  return {
    ledgerExists,
    history,
    rawLedger,
    goalExists,
    goalContent,
  };
}

function runCycleWithInterception(options, cycleIdx) {
  // Enforce zero SSD wear: stage interceptor and capture strictly in RAM tmpfs (/dev/shm)
  const tmpDir = fs.mkdtempSync('/dev/shm/sovereign-research-');
  const captureFile = path.join(tmpDir, 'capture.json');
  const preloadFile = path.join(tmpDir, 'capture.cjs');

  try {
    // Generate minimal CommonJS preload hook to intercept evaluateStrategy directly
    const preloadCode = `
const fs = require('node:fs');
const m = require(${JSON.stringify(INTERVAL_DISCOVERY_MODULE)});
const original = m.evaluateStrategy;
m.evaluateStrategy = async function(spec, evalOptions) {
  const evaluation = await original(spec, evalOptions);
  try {
    fs.writeFileSync(process.env.RESEARCH_CAPTURE, JSON.stringify({
      spec,
      evaluation,
      intercepted_at: new Date().toISOString(),
    }), 'utf8');
  } catch (err) {
    console.error('[ANTI-CHEAT-HOOK] Failed to write capture:', err.message);
  }
  return evaluation;
};
`;
    fs.writeFileSync(preloadFile, preloadCode.trim(), 'utf8');

    // Snapshot automated strategy directory before execution
    const initialYamls = new Set(
      fs.existsSync(AUTOMATED_STRATEGIES_DIR) ? fs.readdirSync(AUTOMATED_STRATEGIES_DIR) : []
    );

    const childArgs = [
      path.join(REPO_ROOT, 'tools', 'agent', 'strategy_interval_generator.js'),
      '--once',
    ];
    if (options.archetype) childArgs.push('--archetype', options.archetype);
    if (options.allMarkets) childArgs.push('--all-markets');
    if (options.universe) childArgs.push('--universe', options.universe);
    if (options.from) childArgs.push('--from', options.from);
    if (options.to) childArgs.push('--to', options.to);
    if (options.engine) childArgs.push('--engine', options.engine);
    if (options.noAi) childArgs.push('--no-ai');

    const spawnResult = cp.spawnSync(process.execPath, childArgs, {
      cwd: REPO_ROOT,
      env: {
        ...process.env,
        NODE_OPTIONS: `-r ${preloadFile}`,
        RESEARCH_CAPTURE: captureFile,
      },
      encoding: 'utf8',
      timeout: 120000,
    });

    if (!fs.existsSync(captureFile)) {
      throw new Error(
        `Anti-cheat interceptor failed to capture evaluation payload.\n` +
        `Child Exit Code: ${spawnResult.status}\n` +
        `Child Stderr:\n${spawnResult.stderr}\n` +
        `Child Stdout:\n${spawnResult.stdout}`
      );
    }

    const rawCapture = JSON.parse(fs.readFileSync(captureFile, 'utf8'));
    const { spec, evaluation } = rawCapture;
    assert(spec && typeof spec === 'object', 'Captured spec must be a valid object');
    assert(evaluation && typeof evaluation === 'object', 'Captured evaluation must be a valid object');

    // Inspect newly generated YAML files in configs/strategies/automated/
    const currentYamls = new Set(
      fs.existsSync(AUTOMATED_STRATEGIES_DIR) ? fs.readdirSync(AUTOMATED_STRATEGIES_DIR) : []
    );
    const createdYamls = [...currentYamls].filter((f) => !initialYamls.has(f));

    // Evaluate Hard Anti-Cheat Oracle Gates
    const trades = Number(evaluation.trades ?? evaluation.trade_count ?? 0);
    const sharpe = Number(evaluation.sharpe_ratio ?? 0);
    const maxDd = Number(evaluation.max_drawdown ?? 1.0);
    const winRate = Number(evaluation.win_rate ?? 0);

    const failedGates = [];
    if (trades < options.minTrades) {
      failedGates.push(`trades (${trades}) < ${options.minTrades}`);
    }
    if (sharpe < options.minSharpe) {
      failedGates.push(`sharpe (${sharpe.toFixed(2)}) < ${options.minSharpe.toFixed(2)}`);
    }
    if (maxDd > options.maxDrawdown) {
      failedGates.push(`max_dd (${(maxDd * 100).toFixed(1)}%) > ${(options.maxDrawdown * 100).toFixed(1)}%`);
    }
    if (winRate < options.minWinRate) {
      failedGates.push(`win_rate (${(winRate * 100).toFixed(1)}%) < ${(options.minWinRate * 100).toFixed(1)}%`);
    }

    // Verify cryptographic checksum integrity of the spec
    const expectedChecksum = computeSpecChecksum(spec);
    if (spec.checksum && spec.checksum !== expectedChecksum) {
      failedGates.push(`checksum_mismatch: got ${spec.checksum.slice(0, 8)}, expected ${expectedChecksum.slice(0, 8)}`);
    }

    const passed = failedGates.length === 0;
    const status = passed ? 'PASS' : 'REJECT';

    // Anti-Cheat Staging Gate Action:
    let yamlPath = null;
    if (!passed) {
      // Actively purge any prematurely staged YAML
      for (const yamlFile of createdYamls) {
        const fullPath = path.join(AUTOMATED_STRATEGIES_DIR, yamlFile);
        try {
          fs.unlinkSync(fullPath);
        } catch {}
      }

      // Mark candidate record in storage as rejected
      const checksum = spec.checksum || expectedChecksum;
      if (checksum) {
        const candFile = path.join(CANDIDATES_DIR, `${checksum}.json`);
        if (fs.existsSync(candFile)) {
          try {
            const candData = JSON.parse(fs.readFileSync(candFile, 'utf8'));
            candData.status = 'rejected_candidate';
            candData.failed_gates = failedGates;
            candData.yaml_path = null;
            fs.writeFileSync(candFile, JSON.stringify(candData, null, 2), 'utf8');
          } catch {}
        }
      }
    } else {
      if (createdYamls.length > 0) {
        yamlPath = path.join('configs/strategies/automated', createdYamls[0]);
      }
    }

    return {
      cycle: cycleIdx,
      spec,
      evaluation,
      status,
      failedGates,
      metrics: { trades, sharpe, maxDd, winRate },
      checksum: spec.checksum || expectedChecksum,
      yamlPath,
    };
  } finally {
    // Zero SSD wear cleanup in tmpfs
    try {
      if (fs.existsSync(captureFile)) fs.unlinkSync(captureFile);
      if (fs.existsSync(preloadFile)) fs.unlinkSync(preloadFile);
      if (fs.existsSync(tmpDir)) fs.rmdirSync(tmpDir);
    } catch {}
  }
}

function commitLedgerRecord(record) {
  const beforeContent = fs.existsSync(LEDGER_PATH) ? fs.readFileSync(LEDGER_PATH, 'utf8') : '';
  const beforeLines = beforeContent.trim() ? beforeContent.trim().split('\n') : [];

  const line = JSON.stringify(record);
  fs.appendFileSync(LEDGER_PATH, line + '\n', 'utf8');

  // Cryptographic assertion of monotonic ledger progression
  const afterContent = fs.readFileSync(LEDGER_PATH, 'utf8');
  const afterLines = afterContent.trim().split('\n');
  assert.equal(afterLines.length, beforeLines.length + 1, 'Ledger line count must increment by exactly 1');
  assert.equal(afterLines[afterLines.length - 1], line, 'Last ledger entry must match appended record');
}

function main() {
  const options = parseCliArgs(process.argv);

  console.log(`=== Sovereign Deterministic Anti-Cheat Quant Research Harness ===`);
  console.log(`Cycles:          ${options.cycles}`);
  console.log(`Target Archetype:${options.archetype || 'Dynamic Multi-Asset Synthesis'}`);
  console.log(`Quality Floors:  Sharpe >= ${options.minSharpe.toFixed(2)} | MaxDD <= ${(options.maxDrawdown * 100).toFixed(0)}% | Trades >= ${options.minTrades} | WinRate >= ${(options.minWinRate * 100).toFixed(0)}%`);
  console.log(`Ledger Path:     ${LEDGER_PATH}\n`);

  // Phase 1: State & Ledger Probe
  const state = probeStateAndLedger();
  console.log(`[Phase 1: State Probe] Active Ledger History: ${state.history.length} records.`);
  if (state.history.length > 0) {
    const recent = state.history.slice(-3);
    console.log(`Recent evaluations:`);
    for (const r of recent) {
      console.log(`  - [${r.status}] ${r.name || r.checksum?.slice(0, 8)} (${r.archetype}) | Sharpe: ${r.sharpe} | DD: ${(r.max_dd * 100).toFixed(1)}% | Trades: ${r.trades}`);
    }
  }

  const results = [];
  for (let c = 1; c <= options.cycles; c++) {
    console.log(`\n--- [Cycle ${c}/${options.cycles}] Launching Intercepted Backtest ---`);

    const result = runCycleWithInterception(options, c);
    const { spec, metrics, status, failedGates, checksum, yamlPath } = result;

    console.log(`Strategy:    ${spec.name} (${spec.family} | ${spec.archetype} | ${spec.timeframe})`);
    console.log(`Universe:    [${spec.universe?.join(', ')}]`);
    console.log(`Checksum:    ${checksum.slice(0, 12)}...`);
    if (spec.ai_usage) {
      console.log(`Tokens:      Prompt: ${spec.ai_usage.prompt_tokens || 0} | Completion: ${spec.ai_usage.completion_tokens || 0} | Total: ${spec.ai_usage.total_tokens || 0} (${spec.ai_model || 'ag/gemini-3.8-flash'})`);
    }
    console.log(`Metrics:     Trades: ${metrics.trades} | Sharpe: ${metrics.sharpe.toFixed(2)} | MaxDD: ${(metrics.maxDd * 100).toFixed(2)}% | WinRate: ${(metrics.winRate * 100).toFixed(1)}%`);
    console.log(`Verdict:     ${status === 'PASS' ? '✅ PASS' : '❌ REJECT'}`);

    if (failedGates.length > 0) {
      console.log(`Failed Gates:`);
      for (const gate of failedGates) {
        console.log(`  - ${gate}`);
      }
    }

    if (status === 'PASS' && yamlPath) {
      console.log(`Verified YAML staged at: ${yamlPath}`);
    } else if (status === 'REJECT') {
      console.log(`Anti-cheat gate active: premature YAMLs purged from configs/strategies/automated/`);
    }

    const ledgerRecord = {
      timestamp: new Date().toISOString(),
      cycle: c,
      checksum,
      name: spec.name,
      archetype: spec.archetype || 'custom',
      family: spec.family || 'unknown',
      timeframe: spec.timeframe || '1h',
      universe: spec.universe || [],
      trades: metrics.trades,
      sharpe: Number(metrics.sharpe.toFixed(4)),
      max_dd: Number(metrics.maxDd.toFixed(4)),
      win_rate: Number(metrics.winRate.toFixed(4)),
      status,
      failed_gates: failedGates,
      yaml_path: yamlPath,
      tokens_used: spec.ai_usage ? (spec.ai_usage.total_tokens || null) : null,
      model: spec.ai_model || null,
      rationale: options.rationale || `Empirical verification for ${spec.archetype || 'synthesized strategy'} on ${spec.timeframe}`,
    };

    if (!options.dryRun) {
      commitLedgerRecord(ledgerRecord);
      console.log(`Committed verified record to: ${LEDGER_PATH}`);
    } else {
      console.log(`[DRY-RUN] Skipped ledger commit.`);
    }

    results.push(ledgerRecord);
  }

  // Print Summary Markdown Table
  console.log(`\n=== Cycle Summary Report ===\n`);
  console.log(`| Cycle | Strategy Name | Archetype | Timeframe | Trades | Sharpe | Max DD | Win Rate | Status | Failed Gates |`);
  console.log(`| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |`);
  for (const r of results) {
    const gatesSummary = r.failed_gates.length > 0 ? r.failed_gates.join('; ') : 'None (Passed)';
    console.log(
      `| ${r.cycle} | ${r.name} | ${r.archetype} | ${r.timeframe} | ${r.trades} | ${r.sharpe.toFixed(2)} | ${(r.max_dd * 100).toFixed(1)}% | ${(r.win_rate * 100).toFixed(1)}% | **${r.status}** | ${gatesSummary} |`
    );
  }
  console.log(`\nExecution complete. Verified integrity maintained.`);
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    console.error(`\n[FATAL HARNESS ERROR] ${err.message}`);
    process.exit(1);
  }
}

module.exports = {
  DEFAULT_GATES,
  probeStateAndLedger,
  runCycleWithInterception,
  commitLedgerRecord,
};
