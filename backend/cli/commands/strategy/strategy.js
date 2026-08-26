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
const { normalizeSizingIntent } = require('../../../../shared/lib/trading/position_sizing.js');

const utils = require('../../lib/utils.js');
const { usage, helpText, pageText, optionValue, hasFlag, printPayload, currentPhaseLabel, formatHumanNumber, formatHumanPayload, renderHumanValue, safeReadJson, labelState, numericOption, get_Current_Universe_Symbols } = utils;
const { REPO_ROOT, DEFAULT_SNAPSHOT, DEFAULT_QUALITY_REPORT, DEFAULT_HISTORY, DEFAULT_FEATURES, DEFAULT_MODEL_REPORT, DEFAULT_BACKTEST, DEFAULT_STATE_PATH, BACKEND_CANDIDATES, HELP_TOPICS } = utils;



const {
  slugifyStrategyName,
  get_Current_Universe_Symbols: getPresenterUniverseSymbols,
  buildStrategyPlan,
  parseStrategyYaml,
  strategySectionPresent,
  inspectStrategyFile,
  buildAutomationTrustDecision,
  buildStrategySizingDecision,
  resolveStrategyTimeframe,
} = require('./strategy_presenter.js');

const {
  generateOrderSignature,
  parseOrderSignature,
  recordSubPositionEntry,
  recordSubPositionExit
} = require('../../../../shared/lib/runtime/sub_positions_ledger.js');
const { STORAGE_DATA_DIR } = require('../../../../shared/lib/runtime/paths.js');

const DEAD_STUB_TRACKER = new Map(); // strategyName -> { consecutiveZeroSignals, lastSignalAt, deadStub, flags: [] }
const LOW_TF_DEAD_STUB_THRESHOLDS = {
  '1m': 120,  // 120 bars = 2h
  '5m': 120,  // 120 bars = 10h
  '15m': 120, // 120 bars = 30h
  '1h': 120,  // 120 bars = 5 days
  '4h': 240,  // 240 ticks
  '1d': 1000, // 1000 ticks (~3.5 days on 5m cadence)
  '1w': 5000  // 5000 ticks
};

const STRATEGY_AUDIT_LOG_PATH = path.join(STORAGE_DATA_DIR, 'logs', 'strategy_automation.jsonl');

function logStrategyAuditRecord(record) {
  try {
    const dir = path.dirname(STRATEGY_AUDIT_LOG_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const payload = JSON.stringify({ timestamp: new Date().toISOString(), ...record }) + '\n';
    fs.appendFileSync(STRATEGY_AUDIT_LOG_PATH, payload, 'utf8');
  } catch (_) {
    // Non-blocking telemetry
  }
}

function scanDeadStubsFromLogs(lookbackHours = 24) {
  if (!fs.existsSync(STRATEGY_AUDIT_LOG_PATH)) return { deadStubs: [], summary: {} };
  try {
    const content = fs.readFileSync(STRATEGY_AUDIT_LOG_PATH, 'utf8');
    const lines = content.split('\n').filter(Boolean);
    const cutoff = Date.now() - lookbackHours * 60 * 60 * 1000;
    const historyByStrategy = new Map();

    for (const line of lines) {
      try {
        const row = JSON.parse(line);
        if (!row.strategy || !row.timestamp) continue;
        const ts = Date.parse(row.timestamp);
        if (Number.isFinite(ts) && ts >= cutoff) {
          if (!historyByStrategy.has(row.strategy)) {
            historyByStrategy.set(row.strategy, { totalPasses: 0, signalsGenerated: 0, deadStubFlags: 0, lastSignalAt: null });
          }
          const stats = historyByStrategy.get(row.strategy);
          stats.totalPasses++;
          if (row.signals_count > 0) {
            stats.signalsGenerated += row.signals_count;
            stats.lastSignalAt = row.timestamp;
          }
          if (row.dead_stub) stats.deadStubFlags++;
        }
      } catch (_) {}
    }

    const deadStubs = [];
    for (const [name, stats] of historyByStrategy.entries()) {
      if (stats.totalPasses >= 10 && stats.signalsGenerated === 0) {
        deadStubs.push({ strategy: name, ...stats });
      }
    }
    return { deadStubs, summary: Object.fromEntries(historyByStrategy) };
  } catch (_) {
    return { deadStubs: [], summary: {} };
  }
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

const {
  commandPropFirmProfiles,
  summarizePropFirmProfile,
  renderPropFirmProfileDetails,
  renderPropFirmProfileList,
  promptPropFirmProfilePayload,
} = require('./prop_firm_profiles.js');


const EXECUTION_MEMORY = require('../../../../shared/lib/runtime/execution_memory.js');
const alpacaBotState = require('../../../../shared/lib/runtime/alpaca_bot_state.js');
const { acquireLock, releaseLock } = require('../../../../shared/lib/runtime/process_lock.js');
const { parseAllowedTimeframes, decideEntryBudget } = require('../../../../shared/lib/runtime/alpaca_intraday_policy.js');
const {
  canOpenPosition,
  reconcileAutomationInventory,
} = require('./automation_guard.js');

function reserveAlpacaPaperEntry({ signalId, requestedNotional, perOrderMaxNotional, dailyMaxNotional }) {
    if (!acquireLock(alpacaBotState.LOCK_PATH)) {
        return { ok: false, reason: 'alpaca_paper_cycle_lock_held' };
    }
    try {
        const state = alpacaBotState.loadState();
        const budget = decideEntryBudget({
            requestedNotional,
            perOrderMaxNotional,
            dailyMaxNotional,
            entryIntents: state.entryIntents,
        });
        if (!budget.ok) return budget;
        const reservation = alpacaBotState.reserveEntryIntent(state, {
            signalId,
            utcDay: budget.utcDay,
            reservedNotional: budget.approvedNotional,
        });
        if (!reservation.ok) return reservation;
        alpacaBotState.saveState(state);
        return { ...budget, reservation: reservation.intent };
    } finally {
        releaseLock(alpacaBotState.LOCK_PATH);
    }
}

function updateAlpacaPaperEntryIntent(signalId, status) {
    if (!acquireLock(alpacaBotState.LOCK_PATH)) return false;
    try {
        const state = alpacaBotState.loadState();
        alpacaBotState.setEntryIntentStatus(state, signalId, status);
        alpacaBotState.saveState(state);
        return true;
    } finally {
        releaseLock(alpacaBotState.LOCK_PATH);
    }
}

async function runAutomationPass(args, strategiesOverride = null) {
    const settings = loadRuntimeSettings();
    const isLive = hasFlag(args, '--live');
    const providerPaper = hasFlag(args, '--paper-provider');
    if (isLive && providerPaper) throw new Error('--paper-provider cannot be combined with --live');
    const executionEnabled = isLive || providerPaper;
    const refreshDays = numericOption(args, '--refresh-days', 2);
    const minTrustScore = numericOption(args, '--min-trust-score', 70);
    const refreshGroups = new Map();

    // Review existing tracked positions for a target/stop/age exit BEFORE
    // looking for new entries -- same ordering as the Polymarket bot cycle.
    const inventory = await reconcileAutomationInventory(args);
    const { exitResult } = inventory;
    if (exitResult.sellsExecuted) {
        console.log(`[\x1b[1;33mEXIT\x1b[0m] Closed ${exitResult.sellsExecuted} position(s) on target/stop/age.`);
    }
    (exitResult.errors || []).forEach((e) => console.warn(`[AUTOMATION] Exit check: ${e}`));
    if (inventory.blocked) {
        console.warn('[AUTOMATION] Entry scan blocked because position or broker inventory truth is unavailable.');
        return { ok: false, blocked: true, reason: inventory.reason };
    }

    // Read the post-exit position count + configured cap so new live entries
    // below respect config.maxPositions (the auto-trade status view already
    // implies this cap; it was previously never enforced on the entry path).
    let openPositionCount = inventory.openPositionCount;
    const maxOpenPositions = inventory.maxOpenPositions;

    let targetStrategies;
    if (strategiesOverride) {
        targetStrategies = strategiesOverride;
    } else {
        const files = readStrategyRegistry();
        targetStrategies = files.map(inspectStrategyFile).filter(s => s.enabled);
    }

    const allowedTimeframes = providerPaper
        ? parseAllowedTimeframes(optionValue(args, '--allowed-timeframes', '5m,15m'))
        : null;
    if (allowedTimeframes) {
        const excluded = targetStrategies.filter((strategy) => !allowedTimeframes.includes(resolveStrategyTimeframe(strategy, args)));
        excluded.forEach((strategy) => console.log(`[AUTOMATION] ${strategy.name} skipped: timeframe_not_allowed (${resolveStrategyTimeframe(strategy, args)}).`));
        targetStrategies = targetStrategies.filter((strategy) => allowedTimeframes.includes(resolveStrategyTimeframe(strategy, args)));
    }

    if (targetStrategies.length === 0) {
        console.log(`[\x1b[90m${new Date().toLocaleTimeString()}\x1b[0m] [AUTOMATION] No strategies to process.`);
        return;
    }

    const modeLabel = isLive ? '\x1b[1;31mLIVE\x1b[0m' : (providerPaper ? '\x1b[1;33mPAPER-ALPACA (TRADE)\x1b[0m' : '\x1b[1;32mDRY-RUN\x1b[0m');
    console.log(`[\x1b[36m${new Date().toLocaleTimeString()}\x1b[0m] [AUTOMATION] Scanning ${targetStrategies.length} strategies... (Mode: ${modeLabel})`);
    
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
            await commandBackfill(['--symbol', list.join(','), '--days', String(refreshDays), '--timeframe', timeframe]);
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

    const verifyGatewayMode = hasFlag(args, '--verify-gateway');
    const probeConfidence = numericOption(args, '--probe-confidence', 0.35);

    for (const strategy of targetStrategies) {
        console.log(`[AUTOMATION] Analyzing ${strategy.name}...`);

        const universeArgs = (strategy.universe || []).flatMap(s => ['--symbol', s]);
        const strategyTimeframe = resolveStrategyTimeframe(strategy, args);
        const thresholdToUse = verifyGatewayMode
            ? String(probeConfidence)
            : String(strategy.risk?.signal_threshold || 0.65);

        global.suppressLogs = true;
        let report;
        try {
            report = await commandBacktest([
                '--strategy', strategy.path,
                '--model', strategy.model,
                '--timeframe', strategyTimeframe,
                '--threshold', thresholdToUse,
                '--signal-only',
                '--allow-degraded',
                '--json',
                ...universeArgs
            ]);
        } finally {
            global.suppressLogs = false;
        }
        // Yield event loop between strategy signal passes to prevent CPU starvation
        await new Promise((resolve) => setTimeout(resolve, 50));

        // Dead Stub Tracking for low-timeframe strategies
        if (!DEAD_STUB_TRACKER.has(strategy.name)) {
            DEAD_STUB_TRACKER.set(strategy.name, { consecutiveZeroSignals: 0, lastSignalAt: null, deadStub: false });
        }
        const tracker = DEAD_STUB_TRACKER.get(strategy.name);

        const tradeList = Array.isArray(report?.trade_logs) ? report.trade_logs : (Array.isArray(report?.trades) ? report.trades : []);
        const hasValidTrades = tradeList.length > 0;
        if (!hasValidTrades) {
            tracker.consecutiveZeroSignals += 1;
            const threshold = LOW_TF_DEAD_STUB_THRESHOLDS[strategyTimeframe] || 50;
            if (tracker.consecutiveZeroSignals >= threshold) {
                tracker.deadStub = true;
                console.warn(`[\x1b[1;31mDEAD_STUB\x1b[0m] Strategy ${strategy.name} flagged as DEAD_STUB (${tracker.consecutiveZeroSignals} consecutive zero-signal ticks on ${strategyTimeframe}). Use --verify-gateway to probe execution.`);
            }
        } else {
            tracker.consecutiveZeroSignals = 0;
            tracker.deadStub = false;
            tracker.lastSignalAt = new Date().toISOString();
        }

        // Log audit record for historical dead stub analytics
        logStrategyAuditRecord({
            strategy: strategy.name,
            timeframe: strategyTimeframe,
            model: strategy.model,
            signals_count: tradeList.length,
            consecutive_zero_signals: tracker.consecutiveZeroSignals,
            dead_stub: tracker.deadStub,
            report_status: report?.status || (hasValidTrades ? 'success' : 'zero_signals'),
        });

        if (hasValidTrades) {
            const lastTrade = tradeList[tradeList.length - 1];
            const tradeType = 'buy'; // runBacktest currently only generates long signals
            const signalTime = lastTrade.entry_time || lastTrade.entryTime || lastTrade.timestamp || new Date().toISOString();
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
            const trust = trustDecision.trust || {};
            console.log(`[AUTOMATION] ${strategy.name} signal evaluated: symbol=${lastTrade.symbol} | trust_score=${trust.score ?? 'n/a'}/100 (min=${minTrustScore}) grade=${trust.grade || 'n/a'} verdict=${trust.verdict || 'n/a'}`);
            if (!trustDecision.allowed) {
                console.log(`[AUTOMATION] Live execution gated for ${strategy.name}: ${trustDecision.reason}.`);
                continue;
            }

           
            const riskWeight = strategy.risk?.risk_weight || 0.1;
            const currentPrice = Number(signalPrice);
            const fixedPositionSize = Number(settings.trading?.position_size);
            const allocationUsd = Number.isFinite(fixedPositionSize) && fixedPositionSize > 0
                ? Math.min(totalEquity * riskWeight, fixedPositionSize)
                : totalEquity * riskWeight;
            const sizing = buildStrategySizingDecision({
                symbol: lastTrade.symbol,
                allocationUsd,
                referencePrice: currentPrice,
            });

            if (!sizing.ok) {
                console.warn(`[AUTOMATION] Sizing rejected for ${lastTrade.symbol}: ${sizing.code} (${sizing.reason}). Skipping.`);
                continue;
            }
            let qty = sizing.quantity;
            const perOrderMaxNotional = numericOption(args, '--paper-max-notional', 25);
            const dailyMaxNotional = numericOption(args, '--paper-daily-max-notional', 250);
            let reservation = null;

            if (providerPaper) {
                const budget = reserveAlpacaPaperEntry({
                    signalId,
                    requestedNotional: qty * currentPrice,
                    perOrderMaxNotional,
                    dailyMaxNotional,
                });
                if (!budget.ok) {
                    console.log(`[AUTOMATION] Paper entry skipped for ${lastTrade.symbol}: ${budget.reason || 'alpaca_paper_budget_rejected'}.`);
                    continue;
                }
                qty = Math.floor(budget.approvedNotional / currentPrice);
                if (qty <= 0) {
                    updateAlpacaPaperEntryIntent(signalId, 'released');
                    console.log(`[AUTOMATION] Paper entry skipped for ${lastTrade.symbol}: alpaca_paper_notional_below_one_share.`);
                    continue;
                }
                reservation = budget.reservation;
            }

            console.log(`[\x1b[1;32mSIGNAL\x1b[0m] Strategy ${strategy.name} trigger: ${tradeType.toUpperCase()} ${lastTrade.symbol} @ ${currentPrice} | Qty: ${qty} ($${(qty * currentPrice).toFixed(2)})`);

            if (executionEnabled && !canOpenPosition(openPositionCount, maxOpenPositions)) {
                if (reservation) updateAlpacaPaperEntryIntent(signalId, 'released');
                console.log(`[AUTOMATION] Max open positions (${maxOpenPositions}) reached — skipping entry for ${lastTrade.symbol}.`);
                continue;
            }

            if (executionEnabled) {
                const mode = providerPaper ? 'PAPER-ALPACA' : 'LIVE';
                console.log(`[\x1b[1;33m${mode}\x1b[0m] Sending order for ${lastTrade.symbol} (Qty: ${qty})...`);
                const signature = generateOrderSignature({
                    strategyId: strategy.name,
                    timeframe: strategyTimeframe,
                    confidence: trust.score ? trust.score / 100 : Number(strategy.risk?.signal_threshold || 0.65),
                    source: 'bot',
                    symbol: lastTrade.symbol
                });

                const tradeArgs = [
                    tradeType,
                    lastTrade.symbol,
                    String(qty),
                    'market',
                    ...(providerPaper ? ['--paper-provider', '--paper-max-notional', String(perOrderMaxNotional)] : ['--live']),
                    '--strategy',
                    strategy.name,
                    '--signature',
                    signature,
                    '--timeframe',
                    strategyTimeframe,
                    '--confidence',
                    String(trust.score ? trust.score / 100 : (strategy.risk?.signal_threshold || 0.65)),
                    '--source',
                    'bot'
                ];
                if (process.env.SOVEREIGN_TRADE_PIN) tradeArgs.push('--pin', process.env.SOVEREIGN_TRADE_PIN);
                const tradeExitCode = await commandTrade(tradeArgs);
                if (tradeExitCode !== 0) {
                    if (reservation) updateAlpacaPaperEntryIntent(signalId, 'released');
                    continue;
                }
                if (reservation) updateAlpacaPaperEntryIntent(signalId, 'submitted');
                if (providerPaper && tradeType === 'buy') {
                    const { fetchAlpacaPositions, recordAlpacaEntry } = require('../../../../shared/lib/runtime/alpaca_bot_cycle.js');
                    const brokerInventory = fetchAlpacaPositions(false);
                    const brokerPosition = brokerInventory.positions.find((position) => position.symbol === lastTrade.symbol);
                    if (brokerInventory.status === 'confirmed' && brokerPosition) {
                        recordAlpacaEntry({ symbol: lastTrade.symbol, qty, strategy, requestedPrice: currentPrice, live: false });
                        if (reservation) updateAlpacaPaperEntryIntent(signalId, 'confirmed');
                        openPositionCount++;
                    } else {
                        console.warn(`[AUTOMATION] Paper order submitted for ${lastTrade.symbol}; position confirmation is pending broker reconciliation.`);
                    }
                }
            } else {
                console.log(`[\x1b[1;32mDRY-RUN\x1b[0m] Order simulated for ${lastTrade.symbol} | Calculated Qty: ${qty}.`);
            }

            EXECUTION_MEMORY.add(signalId);
        }
    }
}

async function runAutomatedStrategies(args) {
    const settings = loadRuntimeSettings();
    const providerPaper = hasFlag(args, '--paper-provider');
    const once = hasFlag(args, '--once');

    const gate = featureGate(providerPaper ? 'bot_autopilot' : 'ai_agent_trading', {
        settings,
        surface: 'Strategy automation'
    });
    if (!gate.ok) {
        printPayload({ ok: false, type: 'feature_gate', feature_flag: gate.flag, reason: gate.reason, hint: gate.hint }, args);
        return 1;
    }

    // One-shot mode: run single pass and exit
    if (once) {
        console.log('[AUTOMATION] Running one-shot automation pass...');
        await runAutomationPass(args);
        return 0;
    }

    // Persistent loop mode for direct CLI invocation
    const intervalMinutes = numericOption(args, '--interval', settings.trading.polling_interval || 15);
    const intervalMs = intervalMinutes * 60 * 1000;
    let passes = 0;
    const maxPasses = numericOption(args, '--passes', 0); // 0 = run indefinitely
    const passLabel = maxPasses === 0 ? '∞' : String(maxPasses);

    console.log(`[\x1b[1;35mAUTO\x1b[0m] Starting ${providerPaper ? 'Alpaca Paper' : 'Strategy'} Automation Loop (Interval: ${intervalMinutes} min, Max Passes: ${passLabel})`);
    console.log('Press Ctrl+C to stop.');

    return new Promise((resolve) => {
        const loop = async () => {
            try {
                passes++;
                console.log(`[AUTOMATION] Starting Pass ${passes}/${passLabel}...`);
                await runAutomationPass(args);

                // Analyze historical execution logs to detect chronic dead stubs
                const audit = scanDeadStubsFromLogs(24);
                if (audit.deadStubs.length > 0) {
                    console.warn(`[\x1b[1;31mDEAD_STUB_SCAN\x1b[0m] Found ${audit.deadStubs.length} chronic dead stub strategies in last 24h: ${audit.deadStubs.map(s => `${s.strategy} (${s.totalPasses} passes, 0 signals)`).join(', ')}`);
                }
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

  // In-pane (non-interactive, e.g. the dashboard's piped child) can't drive the
  // picker; promptSelect would auto-resolve to the first option ('new') and
  // fail with "strategy new requires a name". Show the registry list instead,
  // matching how prop-firms/run render a read-only summary in the same context.
  if (!isRichTerminal()) return commandStrategy(['list']);

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
  slugifyStrategyName, get_Current_Universe_Symbols, buildStrategyPlan, getStrategyRegistryPath, getStrategyDirectory, readStrategyRegistry, listStrategyFiles, strategySectionPresent, inspectStrategyFile, syncStrategyRegistry, strategyRegistryReport, registeredStrategyOptions, writeStrategyRegistry, interactiveStrategyWizard, commandPropFirmProfiles, commandStrategy, commandStrategyMenu, commandPropFirmMenu, runAutomatedStrategies, buildAutomationTrustDecision, buildStrategySizingDecision
};

