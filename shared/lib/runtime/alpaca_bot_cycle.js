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
    payload = runGateway([
      'positions',
      ...(live ? ['--live'] : (options.paperProvider ? ['--paper-provider'] : [])),
      '--json',
    ]);
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
    ...(payload.accountNamespace ? { accountNamespace: payload.accountNamespace } : {}),
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
  const stateStore = options.stateStore || botState;
  const acquire = options.acquireLock || acquireLock;
  const release = options.releaseLock || releaseLock;
  if (!acquire(stateStore.LOCK_PATH)) throw new Error('Alpaca bot cycle lock held');
  try {
  const state = stateStore.loadState();
  const inventory = fetchAlpacaPositions(live, {
    ...options,
    paperProvider: options.paperProvider ?? !live,
  });
  const brokerPositions = inventory.positions;
  const brokerPos = brokerPositions.find((p) => p.symbol === symbol);
  let fillPrice = brokerPos ? Number(brokerPos.averagePrice) : Number(requestedPrice);
  let filledQty = Number(qty);
  let accountNamespace;
  if (inventory.status !== 'confirmed' || typeof inventory.accountNamespace !== 'string') {
    throw new Error('Alpaca entry requires confirmed authenticated inventory namespace');
  }
  if (inventory.status === 'confirmed' && inventory.accountNamespace) {
    const { loadAccountLedger } = require('./sub_positions_ledger');
    const ledger = loadAccountLedger(options.ledgerPath, inventory.accountNamespace);
    const rows = (ledger.positions[symbol] || []).filter((row) => row.strategy_id === strategy?.name);
    const provenQty = rows.reduce((sum, row) => sum + row.quantity, 0);
    const trackedQty = state.positions.filter((row) => row.accountNamespace === inventory.accountNamespace
      && row.symbol === symbol && row.strategyName === strategy?.name)
      .reduce((sum, row) => sum + Number(row.qty), 0);
    filledQty = Math.min(filledQty, provenQty - trackedQty);
    if (!(filledQty > 0)) throw new Error('Alpaca entry has no untracked ledger-confirmed fill');
    fillPrice = rows.reduce((sum, row) => sum + row.quantity * row.entry_price, 0) / provenQty;
    accountNamespace = inventory.accountNamespace;
  }
  if (!Number.isFinite(filledQty) || filledQty <= 0 || !Number.isFinite(fillPrice) || fillPrice <= 0) {
    throw new Error('Invalid Alpaca entry fill');
  }

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
    ...(accountNamespace ? { accountNamespace } : {}),
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
    brokerReconciliation: accountNamespace ? 'confirmed' : 'pending',
  };

  state.positions.push(position);
  stateStore.saveState(state);
  return position;
  } finally {
    release(stateStore.LOCK_PATH);
  }
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

    const inventory = fetchPositions(isLive, { paperProvider: providerPaper });
    result.inventoryStatus = inventory.status;
    if (!['confirmed', 'confirmed_empty'].includes(inventory.status)) {
      result.blocked = true;
      result.errors.push(`Alpaca broker inventory ${inventory.status}: ${inventory.reason || 'unknown reason'}`);
      return result;
    }
    if (executionEnabled && (typeof inventory.accountNamespace !== 'string'
      || !new RegExp(`^alpaca:${isLive ? 'live' : 'paper'}:[A-Za-z0-9][A-Za-z0-9_-]*$`).test(inventory.accountNamespace))) {
      result.blocked = true;
      result.errors.push('Alpaca authenticated inventory account namespace unavailable');
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
    const pendingBySymbol = new Map();

    // Inventory changes cannot identify which order filled.
    for (const position of state.positions) {
      if (position.exit_pending) {
        const key = `${position.accountNamespace}:${position.exitClientOrderId || position.exitOrderId || `legacy:${position.symbol}`}`;
        if (!pendingBySymbol.has(key)) {
          pendingBySymbol.set(key, []);
        }
        pendingBySymbol.get(key).push(position);
      }
    }

    for (const pendingList of pendingBySymbol.values()) {
      const first = pendingList[0];
      try {
        if (!first.exitOrderId) throw new Error('legacy pending exit needs order reconciliation');
        if (first.accountNamespace !== inventory.accountNamespace || !Array.isArray(first.exitPlan)
          || !Array.isArray(first.exitAllocations) || !first.exitClientOrderId) {
          throw new Error('Pending exit account or persisted allocation plan unavailable');
        }
        const fetchOrder = options.fetchOrder || ((orderId) => runGatewayCommand([
          'order',
          orderId,
          ...(isLive ? ['--live'] : []),
          ...(providerPaper ? ['--paper-provider'] : []),
          '--json',
        ]));
        const receipt = await fetchOrder(first.exitOrderId);
        const order = receipt?.order;
        const pending = receipt?.pending;
        const previousQty = Number(first.exitFilledQty || 0);
        const previousNotional = Number(first.exitFilledNotional || 0);
        const filledQty = Number(order?.filledQty);
        const notional = filledQty === 0 ? 0 : filledQty * Number(order?.filledAvgPrice);
        const pendingQty = pendingList.reduce((sum, position) => sum + Number(position.qty), 0);
        if (receipt?.ok !== true || order?.orderId !== first.exitOrderId ||
            order.accountNamespace !== first.accountNamespace || pending?.account_namespace !== first.accountNamespace ||
            pending.client_id !== first.exitClientOrderId || pending.order_id !== first.exitOrderId ||
            pending.symbol !== first.symbol || pending.side !== 'sell' ||
            pending.quantity !== first.exitAllocations.reduce((sum, item) => sum + item.quantity, 0) ||
            order.quantity !== pending.quantity || pending.filled_qty !== filledQty || pending.filled_notional !== notional ||
            !Array.isArray(pending.allocations) || pending.allocations.length !== first.exitAllocations.length ||
            pending.allocations.some((allocation, index) => allocation.strategyId !== first.exitAllocations[index].strategyId
              || allocation.quantity !== first.exitAllocations[index].quantity
              || !Number.isFinite(allocation.filled_qty) || allocation.filled_qty < 0 || allocation.filled_qty > allocation.quantity) ||
            Math.abs(pending.allocations.reduce((sum, item) => sum + item.filled_qty, 0) - filledQty) > 1e-9 ||
            order.symbol !== first.symbol || order.side !== 'sell' ||
            typeof order.status !== 'string' || !order.status ||
            !Number.isFinite(previousQty) || previousQty < 0 ||
            !Number.isFinite(previousNotional) || previousNotional < 0 ||
            !Number.isFinite(pendingQty) || pendingQty <= 0 ||
            !Number.isFinite(filledQty) || filledQty < previousQty ||
            filledQty - previousQty > pendingQty + 1e-9 ||
            !Number.isFinite(notional) || notional < previousNotional ||
            (filledQty === previousQty && notional !== previousNotional) ||
            (order.status === 'filled' && Math.abs(filledQty - previousQty - pendingQty) > 1e-9) ||
            (filledQty > previousQty && notional <= previousNotional) ||
            pendingList.some((position) => position.symbol !== first.symbol ||
              position.accountNamespace !== first.accountNamespace || position.exitClientOrderId !== first.exitClientOrderId ||
              JSON.stringify(position.exitPlan) !== JSON.stringify(first.exitPlan) ||
              JSON.stringify(position.exitAllocations) !== JSON.stringify(first.exitAllocations) ||
              !Number.isFinite(Number(position.qty)) || Number(position.qty) <= 0 ||
              position.exitFilledQty !== first.exitFilledQty ||
              position.exitFilledNotional !== first.exitFilledNotional)) {
          throw new Error('invalid or regressed order fill receipt');
        }
        const filledToAllocate = filledQty - previousQty;
        const exitPrice = filledToAllocate > 0 ? (notional - previousNotional) / filledToAllocate : null;
        const terminal = ['filled', 'canceled', 'expired', 'rejected'].includes(order.status);
        if (pending.terminal !== terminal) throw new Error('Invalid terminal order watermark');
        const fills = new Map();
        for (const allocation of pending.allocations) {
          let offset = 0;
          for (const item of first.exitPlan.filter((row) => row.strategyId === allocation.strategyId)) {
            fills.set(item.positionId, Math.max(0, Math.min(item.quantity, allocation.filled_qty - offset)));
            offset += item.quantity;
          }
          if (Math.abs(offset - allocation.quantity) > 1e-9) throw new Error('Invalid persisted position allocation plan');
        }
        let delta = 0;
        for (const position of pendingList) {
          const applied = Number(position.exitPositionFilledQty || 0);
          const sold = fills.get(position.positionId) - applied;
          if (!Number.isFinite(sold) || sold < 0 || sold > Number(position.qty)) throw new Error('Invalid position fill watermark');
          delta += sold;
        }
        if (Math.abs(delta - filledToAllocate) > 1e-9) throw new Error('Position allocation fill mismatch');
        for (const position of pendingList) {
          const soldQty = fills.get(position.positionId) - Number(position.exitPositionFilledQty || 0);
          let retained = position;
          if (soldQty > 0) {
            const outcome = buildExitOutcome(
              position,
              position.exitReason || 'target',
              exitPrice,
              soldQty,
              result.cycleId,
              executionEnabled,
            );
            state.cycleHistory = [outcome.historyEntry, ...state.cycleHistory].slice(0, 50);
            result.sellsExecuted++;
            retained = outcome.remainingPosition;
          }
          if (retained) {
            remaining.push({
              ...retained,
              exit_pending: !terminal,
              exitOrderId: terminal ? null : first.exitOrderId,
              exitFilledQty: terminal ? 0 : filledQty,
              exitFilledNotional: terminal ? 0 : notional,
              exitPositionFilledQty: terminal ? 0 : fills.get(position.positionId),
            });
          }
        }
      } catch (error) {
        remaining.push(...pendingList);
        result.errors.push(`${first.symbol}: ${error.message}`);
      }
    }

    for (const position of state.positions) {
      if (position.exit_pending) {
        continue;
      }
      if (executionEnabled && position.accountNamespace !== inventory.accountNamespace) {
        remaining.push(position);
        result.errors.push(`${position.symbol}: legacy or different-account position quarantined`);
        continue;
      }
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

      const key = `${position.accountNamespace || 'dry'}:${position.symbol}`;
      if (!exitingBySymbol.has(key)) {
        exitingBySymbol.set(key, []);
      }
      exitingBySymbol.get(key).push({ position, exitReason, currentPrice });
    }

    for (const exitingItems of exitingBySymbol.values()) {
      const symbol = exitingItems[0].position.symbol;
      if (remaining.some((position) => position.symbol === symbol && position.exit_pending
        && position.accountNamespace === exitingItems[0].position.accountNamespace)) {
        remaining.push(...exitingItems.map((item) => item.position));
        result.errors.push(`Pending exit for ${symbol} requires reconciliation; skipping duplicate exit.`);
        continue;
      }
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
        let pendingDispatchId = null;
        try {
          const tradeFn = options.commandTrade || require('../../../frontend/cli-tui/commands/trade/trade.js').commandTrade;
          const clientOrderId = `bot_exit_${result.cycleId}_${symbol}_${crypto.randomBytes(3).toString('hex')}`;
          pendingDispatchId = clientOrderId;
          const exitPlan = [];
          const allocationByStrategy = new Map();
          let remainingToPlan = aggregateSellQty;
          for (const item of exitingItems) {
            const allocatedQty = Math.min(Number(item.position.qty), remainingToPlan);
            if (allocatedQty <= 0) continue;
            remainingToPlan -= allocatedQty;
            const strategyId = item.position.strategyName || 'unknown';
            exitPlan.push({ positionId: item.position.positionId, strategyId, quantity: allocatedQty });
            allocationByStrategy.set(strategyId, (allocationByStrategy.get(strategyId) || 0) + allocatedQty);
          }
          const exitAllocations = [...allocationByStrategy].map(([strategyId, quantity]) => ({ strategyId, quantity }));
          const pendingExitPositions = [];
          const pendingPositions = exitingItems.flatMap((item) => {
            const plan = exitPlan.find((row) => row.positionId === item.position.positionId);
            if (!plan) return [item.position];
            const pending = {
              ...item.position,
              qty: plan.quantity,
              exit_pending: true,
              exitOrderId: null,
              exitClientOrderId: clientOrderId,
              exitPlan,
              exitAllocations,
              exitFilledQty: 0,
              exitFilledNotional: 0,
              exitPositionFilledQty: 0,
              exitPendingAt: new Date().toISOString(),
              exitReason: item.exitReason,
              exitPrice: item.currentPrice,
            };
            pendingExitPositions.push(pending);
            const remainder = Number(item.position.qty) - plan.quantity;
            return remainder > 0 ? [pending, { ...item.position, qty: remainder }] : [pending];
          });
          remaining.push(...pendingPositions);
          state.positions = remaining;
          // Persist the client ID and ordered plan before dispatch: replay can reconcile, not resubmit.
          stateStore.saveState(state);
          const sellArgs = [
            'sell',
            symbol,
            String(aggregateSellQty),
            'market',
            ...(providerPaper ? ['--paper-provider'] : ['--live']),
            '--strategy',
            exitingItems[0].position.strategyName || 'alpaca_paper',
            '--client-order-id',
            clientOrderId,
            '--allocations',
            JSON.stringify(exitAllocations),
            '--source',
            'bot'
          ];
          if (process.env.SOVEREIGN_TRADE_PIN) sellArgs.push('--pin', process.env.SOVEREIGN_TRADE_PIN);
          const receipt = await tradeFn(sellArgs, { receipt: true });
          if (receipt?.ok !== true || typeof receipt.order?.orderId !== 'string' || !receipt.order.orderId) {
            result.errors.push(typeof receipt === 'number' && receipt !== 0
              ? `Exit sell failed for ${symbol}: non-zero exit ${receipt}`
              : `Exit sell for ${symbol}: order receipt unavailable; reconciliation required`);
            if (typeof receipt !== 'number' || receipt === 0) {
              for (const position of pendingExitPositions) position.exit_pending = true;
              continue;
            }
            continue;
          }
          if (receipt.order.accountNamespace !== inventory.accountNamespace
            || receipt.order.clientOrderId !== clientOrderId) {
            throw new Error('Exit receipt account or client identity mismatch');
          }
          availableBySymbol.set(symbol, available - aggregateSellQty);
          for (const position of pendingExitPositions) position.exitOrderId = receipt.order.orderId;
          result.sellsSubmitted = (result.sellsSubmitted || 0) + pendingExitPositions.length;
          continue;
        } catch (err) {
          result.errors.push(`Exit sell failed for ${symbol}: ${err.message}`);
          // Submission may have reached the broker before a transport/parser failure.
          if (!remaining.some((position) => position.exitClientOrderId === pendingDispatchId)) {
            for (const item of exitingItems) remaining.push({ ...item.position, exit_pending: true });
          }
          continue;
        }
      }

      // Dry-run mode: immediate simulated fill outcome
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
            false
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
