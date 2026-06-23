'use strict';
const crypto = require('node:crypto');
const { acquireLock, releaseLock } = require('./process_lock');
const { runGatewayCommand } = require('./backend_bridge');
const botState = require('./alpaca_bot_state');

/**
 * Pure exit decision -- no I/O, so it's trivially unit-testable.
 * @param {import('./alpaca_bot_state').AlpacaBotPosition} position
 * @param {number} currentPrice
 * @param {number} ageDays
 * @returns {'target'|'stop'|'age'|null}
 */
function decideExit(position, currentPrice, ageDays) {
  if (currentPrice > 0 && currentPrice >= position.targetPrice) return 'target';
  if (currentPrice > 0 && currentPrice <= position.stopPrice) return 'stop';
  if (ageDays >= position.maxHoldingDays) return 'age';
  return null;
}

function fetchAlpacaPositions(live) {
  const payload = runGatewayCommand(['positions', ...(live ? ['--live'] : []), '--json']);
  if (!payload.ok) return [];
  return Array.isArray(payload.positions) ? payload.positions : [];
}

/**
 * Records a freshly-filled live entry into the Alpaca bot's position tracker.
 * Re-reads the broker's own position for the symbol to get the real average
 * fill price (handles partial fills / pre-existing manual holdings) instead of
 * trusting the requested signal price.
 */
function recordAlpacaEntry({ symbol, qty, strategy, requestedPrice, live = true }) {
  const state = botState.loadState();
  const brokerPositions = fetchAlpacaPositions(live);
  const brokerPos = brokerPositions.find((p) => p.symbol === symbol);
  const fillPrice = brokerPos ? Number(brokerPos.averagePrice) : Number(requestedPrice);

  const risk = strategy?.risk || {};
  const stopLossPct = Number.isFinite(risk.stop_loss_pct) ? risk.stop_loss_pct : state.config.defaultStopLossPct;
  const takeProfitPct = Number.isFinite(risk.take_profit_pct) ? risk.take_profit_pct : state.config.defaultTakeProfitPct;
  const maxHoldingDays = Number.isFinite(risk.max_holding_days) ? risk.max_holding_days : 30;

  const position = {
    positionId: `${symbol}_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
    symbol,
    qty: Number(qty),
    strategyName: strategy?.name || 'unknown',
    entryPrice: Number(requestedPrice),
    fillPrice,
    entryTimestamp: new Date().toISOString(),
    stopPrice: fillPrice * (1 - stopLossPct),
    targetPrice: fillPrice * (1 + takeProfitPct),
    maxHoldingDays,
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
async function runAlpacaExitCheck(args = []) {
  const isLive = args.includes('--live');
  const result = { cycleId: `acycle_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`, sellsExecuted: 0, errors: [] };

  if (!acquireLock(botState.LOCK_PATH)) {
    result.errors.push('Alpaca bot cycle already in progress (lock held) -- skipping exit check.');
    return result;
  }

  try {
    const state = botState.loadState();
    if (state.positions.length === 0) return result;

    const brokerPositions = fetchAlpacaPositions(isLive);
    const brokerBySymbol = new Map(brokerPositions.map((p) => [p.symbol, p]));
    const remaining = [];

    for (const position of state.positions) {
      const brokerPos = brokerBySymbol.get(position.symbol);
      if (!brokerPos) {
        // Closed manually outside the bot -- drop tracking, not an error.
        continue;
      }

      const currentPrice = Number(brokerPos.quantity) > 0 ? Number(brokerPos.marketValue) / Number(brokerPos.quantity) : 0;
      const ageDays = (Date.now() - new Date(position.entryTimestamp).getTime()) / (24 * 60 * 60 * 1000);
      const exitReason = decideExit(position, currentPrice, ageDays);

      if (!exitReason) {
        remaining.push(position);
        continue;
      }

      if (isLive) {
        try {
          const { commandTrade } = require('../../../backend/cli/commands/trade/trade.js');
          const sellArgs = ['sell', position.symbol, String(position.qty), 'market', '--live'];
          if (process.env.SOVEREIGN_TRADE_PIN) sellArgs.push('--pin', process.env.SOVEREIGN_TRADE_PIN);
          const exitCode = await commandTrade(sellArgs);
          if (exitCode !== 0) {
            result.errors.push(`Exit sell failed for ${position.symbol} (${exitReason}): non-zero exit ${exitCode}`);
            remaining.push(position);
            continue;
          }
        } catch (err) {
          result.errors.push(`Exit sell failed for ${position.symbol} (${exitReason}): ${err.message}`);
          remaining.push(position);
          continue;
        }
      }

      const realizedPnl = (currentPrice - position.fillPrice) * position.qty;
      state.cycleHistory = [{
        cycleId: result.cycleId,
        positionId: position.positionId,
        symbol: position.symbol,
        exitReason,
        exitPrice: currentPrice,
        realizedPnl,
        completedAt: new Date().toISOString(),
        dryRun: !isLive,
      }, ...state.cycleHistory].slice(0, 50);
      result.sellsExecuted++;
    }

    state.positions = remaining;
    state.lastCycleAt = new Date().toISOString();
    botState.saveState(state);
    return result;
  } finally {
    releaseLock(botState.LOCK_PATH);
  }
}

module.exports = { decideExit, recordAlpacaEntry, runAlpacaExitCheck, fetchAlpacaPositions };
