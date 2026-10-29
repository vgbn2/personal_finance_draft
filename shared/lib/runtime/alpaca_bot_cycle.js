'use strict';
const crypto = require('node:crypto');
const { acquireLock, releaseLock } = require('./process_lock');
const { runGatewayCommand } = require('./backend_bridge');
const botState = require('./alpaca_bot_state');

let parseTimeframeMs;
try {
  ({ parseTimeframeMs } = require('../../../backend/scripts/data_ops/ingest_market_data/constants.js'));
} catch {
  parseTimeframeMs = (tf) => {
    const match = /^(\d+)(m|h|d|w)$/.exec(String(tf || ''));
    if (!match) return null;
    const mult = { m: 60000, h: 3600000, d: 86400000, w: 604800000 }[match[2]] || 0;
    return parseInt(match[1], 10) * mult;
  };
}

/**
 * Pure exit decision -- no I/O, so it's trivially unit-testable.
 * @param {import('./alpaca_bot_state').AlpacaBotPosition} position
 * @param {number} currentPrice
 * @param {number} ageDays
 * @param {number|null} [elapsedBars]
 * @returns {'target'|'stop'|'age'|null}
 */
function decideExit(position, currentPrice, ageDays, elapsedBars = null) {
  if (currentPrice > 0 && currentPrice >= position.targetPrice) return 'target';
  if (currentPrice > 0 && currentPrice <= position.stopPrice) return 'stop';
  if (Number.isFinite(elapsedBars) && Number.isFinite(position.maxHoldingBars) && elapsedBars >= position.maxHoldingBars) return 'age';
  if (Number.isFinite(ageDays) && Number.isFinite(position.maxHoldingDays) && ageDays >= position.maxHoldingDays) return 'age';
  return null;
}

/**
 * Pure entry gate -- whether another live position may be opened given the
 * configured concurrency cap. Kept pure (no I/O) so the cap is unit-testable;
 * callers load the count from state and pass it in.
 * @param {number} openCount  currently-tracked open positions
 * @param {number} maxPositions  configured cap (config.maxPositions)
 * @returns {boolean}
 */
function canOpenPosition(openCount, maxPositions) {
  if (!Number.isFinite(maxPositions) || maxPositions <= 0) return true; // no/invalid cap = unlimited
  return openCount < maxPositions;
}

/**
 * Pure: the quantity to RECORD for a freshly-filled entry. Prefers the broker's
 * own reported position quantity (handles partial fills) over the requested qty,
 * mirroring why fillPrice is taken from the broker rather than the signal price.
 * @param {{quantity?: number|string}|undefined} brokerPos
 * @param {number|string} requestedQty
 * @returns {number}
 */
function resolveEntryQty(brokerPos, requestedQty) {
  const brokerQty = brokerPos ? Number(brokerPos.quantity) : NaN;
  return Number.isFinite(brokerQty) && brokerQty > 0 ? brokerQty : Number(requestedQty);
}

/**
 * Pure: the quantity to SELL on exit, clamped to what the broker actually holds
 * for that symbol. Prevents an oversell rejection when the tracked qty exceeds
 * the real holding (partial fill, manual partial sale, or two bot positions
 * stacked on the same symbol sharing one broker holding).
 * @param {number} positionQty  qty recorded for the tracked position
 * @param {number} availableQty  broker shares still available for this symbol
 * @returns {number}
 */
function resolveExitQty(positionQty, availableQty) {
  return Math.max(0, Math.min(Number(positionQty), Number(availableQty)));
}

/**
 * Pure: what to record/keep-tracking after exiting sellQty shares of a position.
 * sellQty may be less than position.qty (resolveExitQty clamped it to the
 * broker's available holding -- e.g. two tracked positions stacked on one
 * symbol sharing a single broker balance). realizedPnl reflects only the
 * shares actually sold, and the unsold remainder is returned as a still-open
 * position instead of being silently dropped from tracking.
 * @param {import('./alpaca_bot_state').AlpacaBotPosition} position
 * @param {'target'|'stop'|'age'} exitReason
 * @param {number} currentPrice
 * @param {number} sellQty
 * @param {string} cycleId
 * @param {boolean} isLive
 */
function buildExitOutcome(position, exitReason, currentPrice, sellQty, cycleId, isLive) {
  const soldQty = Math.max(0, Math.min(Number(sellQty), Number(position.qty)));
  const remainingQty = position.qty - soldQty;
  const historyEntry = {
    cycleId,
    positionId: position.positionId,
    strategyName: position.strategyName || position.strategy || null,
    symbol: position.symbol,
    exitReason,
    exitPrice: currentPrice,
    realizedPnl: (currentPrice - position.fillPrice) * soldQty,
    soldQty,
    completedAt: new Date().toISOString(),
    dryRun: !isLive,
  };
  const remainingPosition = remainingQty > 0 ? { ...position, qty: remainingQty } : null;
  return { historyEntry, remainingPosition };
}

function fetchAlpacaPositions(live, options = {}) {
  const runGateway = options.runGatewayCommand || runGatewayCommand;
  let payload;
  try {
    payload = runGateway(['positions', ...(live ? ['--live'] : []), '--json']);
  } catch (error) {
    return { status: 'unavailable', positions: [], reason: error.message };
  }
  if (!payload || payload.ok !== true) {
    return {
      status: 'unavailable',
      positions: [],
      reason: payload?.error || payload?.reason || 'alpaca_positions_unavailable',
    };
  }
  if (!Array.isArray(payload.positions)) {
    return { status: 'unavailable', positions: [], reason: 'alpaca_positions_invalid_payload' };
  }
  if (
    payload.complete === false
    || payload.truncated === true
    || payload.pagination?.complete === false
  ) {
    return { status: 'incomplete', positions: payload.positions, reason: 'alpaca_positions_incomplete' };
  }
  return {
    status: payload.positions.length === 0 ? 'confirmed_empty' : 'confirmed',
    positions: payload.positions,
    reason: null,
  };
}

/**
 * Records a freshly-filled live entry into the Alpaca bot's position tracker.
 * Re-reads the broker's own position for the symbol to get the real average
 * fill price (handles partial fills / pre-existing manual holdings) instead of
 * trusting the requested signal price.
 */
function recordAlpacaEntry({ symbol, qty, strategy, requestedPrice, live = true, timeframe }, options = {}) {
  const state = botState.loadState();
  const inventory = fetchAlpacaPositions(live, options);
  const brokerPositions = inventory.positions;
  const brokerPos = brokerPositions.find((p) => p.symbol === symbol);
  const fillPrice = brokerPos ? Number(brokerPos.averagePrice) : Number(requestedPrice);
  const filledQty = resolveEntryQty(brokerPos, qty);

  const risk = strategy?.risk || {};
  const stopLossPct = Number.isFinite(risk.stop_loss_pct) ? risk.stop_loss_pct : state.config.defaultStopLossPct;
  const takeProfitPct = Number.isFinite(risk.take_profit_pct) ? risk.take_profit_pct : state.config.defaultTakeProfitPct;
  const maxHoldingDays = Number.isFinite(risk.max_holding_days) ? risk.max_holding_days : 30;
  const maxHoldingBars = Number.isFinite(risk.max_holding_bars)
    ? risk.max_holding_bars
    : (Number.isFinite(strategy?.horizon) ? strategy.horizon : null);
  const positionTimeframe = timeframe || strategy?.timeframe || strategy?.market?.timeframe || '1d';

  const position = {
    positionId: `${symbol}_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
    symbol,
    qty: filledQty,
    strategyName: strategy?.name || 'unknown',
    timeframe: positionTimeframe,
    entryPrice: Number(requestedPrice),
    fillPrice,
    entryTimestamp: new Date().toISOString(),
    stopPrice: fillPrice * (1 - stopLossPct),
    targetPrice: fillPrice * (1 + takeProfitPct),
    maxHoldingDays,
    maxHoldingBars,
    brokerReconciliation: inventory.status === 'confirmed' ? 'confirmed' : 'pending',
  };

  state.positions.push(position);
  botState.saveState(state);
  return position;
}

/**
 * Review phase: checks every tracked position for a target/stop/age exit and,
 * in --live mode, closes it via a real sell order. Runs before the entry loop
 * in strategy.js's runAutomationPass, mirroring the Polymarket cycle's
 * review-then-buy ordering.
 */
async function runAlpacaExitCheck(args = [], options = {}) {
  const isLive = args.includes('--live');
  const providerPaper = args.includes('--paper-provider');
  const executionEnabled = isLive || providerPaper;
  const stateStore = options.stateStore || botState;
  const acquire = options.acquireLock || acquireLock;
  const release = options.releaseLock || releaseLock;
  const fetchPositions = options.fetchPositions || fetchAlpacaPositions;
  const result = {
    cycleId: `acycle_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
    sellsExecuted: 0,
    errors: [],
    blocked: false,
    inventoryStatus: null,
  };

  if (!acquire(stateStore.LOCK_PATH)) {
    result.errors.push('Alpaca bot cycle already in progress (lock held) -- skipping exit check.');
    result.blocked = true;
    return result;
  }

  try {
    const state = stateStore.loadState();
    if (state.positions.length === 0) return result;

    const inventory = fetchPositions(isLive);
    result.inventoryStatus = inventory.status;
    if (!['confirmed', 'confirmed_empty'].includes(inventory.status)) {
      result.blocked = true;
      result.errors.push(`Alpaca broker inventory ${inventory.status}: ${inventory.reason || 'unknown reason'}`);
      return result;
    }
    const brokerPositions = inventory.positions;
    const brokerBySymbol = new Map(brokerPositions.map((p) => [p.symbol, p]));
    // Broker shares still sellable per symbol, decremented as we exit -- so two
    // bot positions stacked on one symbol can't together oversell the holding.
    // Liquidity constraint: prioritize broker qty_available; fallback to gross quantity for backward compatibility
    const availableBySymbol = new Map(brokerPositions.map((p) => [
      p.symbol,
      p.qty_available !== undefined && p.qty_available !== null && Number.isFinite(Number(p.qty_available))
        ? Math.max(0, Number(p.qty_available))
        : Math.max(0, Number(p.quantity))
    ]));
    const remaining = [];
    const exitingBySymbol = new Map();

    for (const position of state.positions) {
      const brokerPos = brokerBySymbol.get(position.symbol);
      if (!brokerPos) {
        // Closed manually outside the bot -- drop tracking, not an error.
        continue;
      }

      const currentPrice = Number(brokerPos.quantity) > 0 ? Number(brokerPos.marketValue) / Number(brokerPos.quantity) : 0;
      const elapsedMs = Date.now() - new Date(position.entryTimestamp).getTime();
      const ageDays = elapsedMs / (24 * 60 * 60 * 1000);
      const tfMs = parseTimeframeMs(position.timeframe || '1d');
      const elapsedBars = tfMs && tfMs > 0 ? elapsedMs / tfMs : null;
      const exitReason = decideExit(position, currentPrice, ageDays, elapsedBars);

      if (!exitReason) {
        remaining.push(position);
        continue;
      }

      if (!exitingBySymbol.has(position.symbol)) {
        exitingBySymbol.set(position.symbol, []);
      }
      exitingBySymbol.get(position.symbol).push({ position, exitReason, currentPrice });
    }

    for (const [symbol, exitingItems] of exitingBySymbol.entries()) {
      const available = availableBySymbol.get(symbol) || 0;
      const totalDesiredQty = exitingItems.reduce((sum, item) => sum + Number(item.position.qty || 0), 0);
      const aggregateSellQty = resolveExitQty(totalDesiredQty, available);

      const brokerPos = brokerBySymbol.get(symbol);
      const brokerGrossQty = Math.max(0, Number(brokerPos?.quantity || 0));

      if (aggregateSellQty <= 0) {
        if (brokerGrossQty > 0) {
          // Concurrency safety: retain position tracking and suppress duplicate exit orders when shares are committed to an open order
          for (const item of exitingItems) remaining.push(item.position);
          result.errors.push(`Shares for ${symbol} are held by an open order (available: ${available}, held: ${brokerGrossQty - available}); skipping duplicate exit.`);
          continue;
        }
        // Broker holds nothing left for this symbol (already exited / sold
        // manually) -- drop stale tracking instead of firing an oversell.
        result.errors.push(`No broker shares left to exit ${symbol}; dropping stale tracking.`);
        continue;
      }

      if (executionEnabled) {
        try {
          const tradeFn = options.commandTrade || require('../../../backend/cli/commands/trade/trade.js').commandTrade;
          const { generateOrderSignature } = require('./sub_positions_ledger.js');
          const signature = generateOrderSignature({
            strategyId: exitingItems[0].position.strategyName || 'alpaca_paper',
            source: 'bot',
            symbol
          });
          const sellArgs = [
            'sell',
            symbol,
            String(aggregateSellQty),
            'market',
            ...(providerPaper ? ['--paper-provider'] : ['--live']),
            '--strategy',
            exitingItems[0].position.strategyName || 'alpaca_paper',
            '--signature',
            signature,
            '--source',
            'bot'
          ];
          if (process.env.SOVEREIGN_TRADE_PIN) sellArgs.push('--pin', process.env.SOVEREIGN_TRADE_PIN);
          const exitCode = await tradeFn(sellArgs);
          if (exitCode !== 0) {
            result.errors.push(`Exit sell failed for ${symbol}: non-zero exit ${exitCode}`);
            for (const item of exitingItems) remaining.push(item.position);
            continue;
          }
          availableBySymbol.set(symbol, available - aggregateSellQty);
        } catch (err) {
          result.errors.push(`Exit sell failed for ${symbol}: ${err.message}`);
          for (const item of exitingItems) remaining.push(item.position);
          continue;
        }
      }

      let remainingSold = aggregateSellQty;
      for (const item of exitingItems) {
        const itemQty = Number(item.position.qty || 0);
        const allocatedQty = Math.min(itemQty, remainingSold);
        remainingSold -= allocatedQty;

        if (allocatedQty > 0) {
          const { historyEntry, remainingPosition } = buildExitOutcome(
            item.position,
            item.exitReason,
            item.currentPrice,
            allocatedQty,
            result.cycleId,
            executionEnabled
          );
          state.cycleHistory = [historyEntry, ...state.cycleHistory].slice(0, 50);
          if (remainingPosition) remaining.push(remainingPosition);
          result.sellsExecuted++;
        } else {
          remaining.push(item.position);
        }
      }
    }

    state.positions = remaining;
    state.lastCycleAt = new Date().toISOString();
    stateStore.saveState(state);
    return result;
  } finally {
    release(stateStore.LOCK_PATH);
  }
}

module.exports = { decideExit, canOpenPosition, resolveEntryQty, resolveExitQty, buildExitOutcome, recordAlpacaEntry, runAlpacaExitCheck, fetchAlpacaPositions };
