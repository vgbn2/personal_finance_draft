'use strict';

/**
 * Sub-Positions Ledger & Strategy Signature Engine
 *
 * Provides deterministic order signature generation, persistent sub-position accounting,
 * and reconciliation of broker physical holdings with strategy allocations and manual residual trades.
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { withFileLockSync } = require('./file_lock');
const { STORAGE_DATA_DIR } = require('./paths.js');

const DEFAULT_LEDGER_PATH = path.join(STORAGE_DATA_DIR, 'runtime', 'ledger', 'sub_positions.json');

/**
 * Generate a deterministic strategy signature string
 * @param {Object} params
 * @param {string} [params.strategyId='manual']
 * @param {string} [params.timeframe='1m']
 * @param {number} [params.confidence=1.0]
 * @param {string} [params.source='bot'] - 'bot' | 'manual'
 * @param {string} [params.symbol='']
 * @param {number} [params.timestamp=Date.now()]
 * @returns {string} e.g. "strat_trend_5m_1756148200000_a1b2c3" or "manual_cli_AAPL_1756148200000_d4e5f6"
 */
function generateOrderSignature({
  strategyId = 'manual',
  timeframe = '1m',
  confidence = 1.0,
  source = 'bot',
  symbol = '',
  timestamp = Date.now()
} = {}) {
  const cleanId = String(strategyId).replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
  const cleanTf = String(timeframe).replace(/[^a-zA-Z0-9]/g, '').toLowerCase() || '1m';
  const hex = crypto.randomBytes(3).toString('hex');

  if (source === 'manual' || cleanId === 'manual') {
    const sym = String(symbol).replace(/[^a-zA-Z0-9]/g, '').toUpperCase() || 'POS';
    return `manual_cli_${sym}_${timestamp}_${hex}`;
  }

  return `strat_${cleanId}_${cleanTf}_${timestamp}_${hex}`;
}

/**
 * Parse an order signature string back into metadata
 * @param {string} signature
 * @returns {Object|null}
 */
function parseOrderSignature(signature) {
  if (!signature || typeof signature !== 'string') return null;

  if (signature.startsWith('manual_cli_')) {
    const parts = signature.split('_');
    if (parts.length >= 4) {
      const hex = parts[parts.length - 1];
      const tsRaw = parts[parts.length - 2];
      const sym = parts.slice(2, parts.length - 2).join('_');
      const tsNum = Number(tsRaw);
      const isValidTs = Number.isFinite(tsNum) && tsNum > 0;
      return {
        source: 'manual',
        strategy_id: 'manual',
        symbol: sym || '',
        timestamp: isValidTs ? tsNum : null,
        submitted_at: isValidTs ? new Date(tsNum).toISOString() : null,
        signature
      };
    }
  }

  if (signature.startsWith('strat_')) {
    const parts = signature.split('_');
    // Format: strat_<strategy_id>_<timeframe>_<timestamp>_<hex>
    if (parts.length >= 5) {
      const hex = parts[parts.length - 1];
      const tsRaw = parts[parts.length - 2];
      const tf = parts[parts.length - 3];
      const stratId = parts.slice(1, parts.length - 3).join('_');
      const tsNum = Number(tsRaw);
      const isValidTs = Number.isFinite(tsNum) && tsNum > 0;
      return {
        source: 'bot',
        strategy_id: stratId,
        timeframe: tf,
        timestamp: isValidTs ? tsNum : null,
        submitted_at: isValidTs ? new Date(tsNum).toISOString() : null,
        signature
      };
    }
  }

  return null;
}

/**
 * Load the persistent sub-positions ledger
 * @param {string} [filePath=DEFAULT_LEDGER_PATH]
 * @returns {Object}
 */
function loadSubPositionsLedger(filePath = DEFAULT_LEDGER_PATH) {
  if (fs.existsSync(filePath)) {
    try {
      const data = fs.readFileSync(filePath, 'utf8');
      const parsed = JSON.parse(data);
      if (parsed && typeof parsed === 'object' && parsed.positions &&
          !Array.isArray(parsed.positions) && typeof parsed.positions === 'object' &&
          Array.isArray(parsed.history) &&
          (parsed.pending_orders === undefined || (parsed.pending_orders &&
            typeof parsed.pending_orders === 'object' && !Array.isArray(parsed.pending_orders)))) {
        return parsed;
      }
      throw new Error('Invalid sub_positions ledger schema');
    } catch (err) {
      throw new Error(`Failed to load sub-positions ledger from ${filePath}: ${err.message}`);
    }
  }

  return {
    version: 1,
    last_updated: new Date().toISOString(),
    positions: {},
    history: []
  };
}

/**
 * Save the sub-positions ledger atomically
 * @param {Object} ledger
 * @param {string} [filePath=DEFAULT_LEDGER_PATH]
 */
function saveSubPositionsLedger(ledger, filePath = DEFAULT_LEDGER_PATH) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Cap history to last 100 entries to prevent NVMe write amplification
  if (Array.isArray(ledger.history) && ledger.history.length > 100) {
    ledger.history = ledger.history.slice(-100);
  }

  ledger.last_updated = new Date().toISOString();
  const tmpPath = `${filePath}.${Date.now()}.${crypto.randomBytes(2).toString('hex')}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(ledger, null, 2), 'utf8');
  fs.renameSync(tmpPath, filePath);
}

/**
 * Record a new or scaled sub-position entry upon order execution (with lock safety)
 * @param {Object} entry
 * @param {string} entry.symbol
 * @param {string} [entry.strategyId='manual']
 * @param {number} entry.quantity
 * @param {number} entry.entryPrice
 * @param {string} [entry.source='bot']
 * @param {string} [entry.timeframe='1m']
 * @param {number} [entry.confidence=1.0]
 * @param {string} [entry.signature='']
 * @param {string} [entry.orderId='']
 * @param {string} [entry.submittedAt='']
 * @param {string} [filePath=DEFAULT_LEDGER_PATH]
 * @returns {Object} the recorded sub-position
 */
function beginPendingOrder(order, filePath = DEFAULT_LEDGER_PATH) {
  const symbol = String(order.instrumentId || '').toUpperCase();
  const quantity = Number(order.quantity);
  const clientId = order.clientOrderId;
  if (!symbol || !clientId || !['buy', 'sell'].includes(order.side) || !Number.isFinite(quantity) || quantity <= 0) {
    throw new Error('Invalid pending order');
  }
  return withFileLockSync(`${filePath}.lock`, () => {
    const ledger = loadSubPositionsLedger(filePath);
    ledger.pending_orders ||= {};
    if (Object.hasOwn(ledger.pending_orders, clientId) || Object.values(ledger.pending_orders).some(
      (item) => !item.terminal && item.symbol === symbol
    )) {
      throw new Error('Existing pending order requires reconciliation before submission');
    }
    const pending = {
      client_id: clientId,
      order_id: null,
      symbol,
      side: order.side,
      quantity,
      strategy_id: order.strategyId || order.strategy || 'manual',
      source: order.source || (order.strategyId || order.strategy ? 'bot' : 'manual'),
      timeframe: order.timeframe || '1m',
      confidence: order.confidence ?? 1,
      submitted_at: order.submittedAt || new Date().toISOString(),
      filled_qty: 0,
      filled_notional: 0,
      terminal: false,
      status: 'submission_unknown',
      paper: Boolean(order.providerPaper),
    };
    ledger.pending_orders[clientId] = pending;
    saveSubPositionsLedger(ledger, filePath);
    return pending;
  });
}

function attachPendingOrder(clientId, orderId, filePath = DEFAULT_LEDGER_PATH) {
  return withFileLockSync(`${filePath}.lock`, () => {
    const ledger = loadSubPositionsLedger(filePath);
    const pending = ledger.pending_orders?.[clientId];
    if (!pending || typeof orderId !== 'string' || !orderId || (pending.order_id && pending.order_id !== orderId)) {
      throw new Error('Invalid pending order identity');
    }
    pending.order_id = orderId;
    pending.status = 'submitted';
    saveSubPositionsLedger(ledger, filePath);
    return pending;
  });
}

function applyPendingOrderReceipt(clientId, receipt, filePath = DEFAULT_LEDGER_PATH) {
  return withFileLockSync(`${filePath}.lock`, () => {
    const ledger = loadSubPositionsLedger(filePath);
    const pending = ledger.pending_orders?.[clientId];
    if (!pending || !pending.order_id || receipt.orderId !== pending.order_id ||
        receipt.symbol !== pending.symbol || receipt.side !== pending.side || receipt.quantity !== pending.quantity) {
      throw new Error('Receipt identity does not match pending order');
    }
    const filled = receipt.filledQty;
    const average = receipt.filledAvgPrice;
    if (!Number.isFinite(filled) || filled < 0 || filled > pending.quantity ||
        (filled > 0 && (!Number.isFinite(average) || average <= 0)) ||
        typeof receipt.status !== 'string' || !receipt.status ||
        (receipt.status === 'filled' && filled !== pending.quantity)) {
      throw new Error('Invalid cumulative fill receipt');
    }
    const notional = filled > 0 ? filled * average : 0;
    const delta = filled - pending.filled_qty;
    const cost = notional - pending.filled_notional;
    if (delta < 0 || (delta === 0 && cost !== 0) || (delta > 0 && (!Number.isFinite(cost) || cost <= 0))) {
      throw new Error('Cumulative receipt regressed or changed previously applied fills');
    }
    if (pending.terminal) {
      if (delta !== 0) throw new Error('Terminal receipt changed previously applied fills');
      return pending;
    }
    if (delta > 0) {
      const list = ledger.positions[pending.symbol] ||= [];
      if (pending.side === 'buy') {
        let sub = list.find((item) => item.order_id === pending.order_id);
        if (!sub) {
          sub = {
            sub_id: `sub_${clientId}`,
            symbol: pending.symbol,
            strategy_id: pending.strategy_id,
            source: pending.source,
            timeframe: pending.timeframe,
            confidence: pending.confidence,
            signature: clientId,
            order_id: pending.order_id,
            submitted_at: pending.submitted_at,
            status: 'open',
            quantity: 0,
            entry_price: 0,
          };
          list.push(sub);
        }
        sub.entry_price = (sub.quantity * sub.entry_price + cost) / (sub.quantity + delta);
        sub.quantity += delta;
      } else {
        const available = list.filter((item) => item.strategy_id === pending.strategy_id && item.status === 'open')
          .reduce((sum, item) => sum + item.quantity, 0);
        if (available + 1e-8 < delta) throw new Error('Confirmed exit exceeds attributed holdings');
        let remaining = delta;
        for (let i = list.length - 1; i >= 0 && remaining > 0; i--) {
          const sub = list[i];
          if (sub.strategy_id !== pending.strategy_id || sub.status !== 'open') continue;
          const closed = Math.min(sub.quantity, remaining);
          ledger.history.push({
            ...sub,
            quantity: closed,
            status: closed === sub.quantity ? 'closed' : 'partially_closed',
            closed_at: new Date().toISOString(),
            exit_price: cost / delta,
            exit_order_id: pending.order_id,
          });
          sub.quantity -= closed;
          remaining -= closed;
          if (sub.quantity === 0) list.splice(i, 1);
        }
        if (!list.length) delete ledger.positions[pending.symbol];
      }
    }
    pending.filled_qty = filled;
    pending.filled_notional = notional;
    pending.status = receipt.status;
    pending.terminal = ['filled', 'canceled', 'expired', 'rejected'].includes(receipt.status);
    saveSubPositionsLedger(ledger, filePath);
    return pending;
  });
}

function recordSubPositionEntry(entry, filePath = DEFAULT_LEDGER_PATH) {
  const sym = String(entry.symbol || '').toUpperCase();
  const qty = Number(entry.quantity);
  if (!sym || !Number.isFinite(qty) || qty <= 0) {
    throw new Error('Invalid sub-position entry payload');
  }

  const lockPath = `${filePath}.lock`;
  return withFileLockSync(lockPath, () => {
    const ledger = loadSubPositionsLedger(filePath);
    if (!ledger.positions[sym]) {
      ledger.positions[sym] = [];
    }

    const now = new Date().toISOString();
    const subId = `sub_${sym}_${entry.strategyId || 'manual'}_${Date.now()}`;

    const subPos = {
      sub_id: subId,
      symbol: sym,
      strategy_id: entry.strategyId || (entry.source === 'manual' ? 'manual' : 'unknown'),
      source: entry.source || (entry.strategyId === 'manual' ? 'manual' : 'bot'),
      quantity: qty,
      entry_price: Number(entry.entryPrice || 0),
      timeframe: entry.timeframe || '1m',
      confidence: Number(entry.confidence || 1.0),
      signature: entry.signature || generateOrderSignature({
        strategyId: entry.strategyId,
        timeframe: entry.timeframe,
        confidence: entry.confidence,
        source: entry.source,
        symbol: sym
      }),
      order_id: entry.orderId || '',
      submitted_at: entry.submittedAt || now,
      status: 'open'
    };

    ledger.positions[sym].push(subPos);
    saveSubPositionsLedger(ledger, filePath);
    return subPos;
  });
}

/**
 * Record a sub-position exit (close or partial reduction) (with lock safety)
 * @param {string} symbol
 * @param {string} strategyId
 * @param {number} quantityToClose
 * @param {Object} [exitMeta={}]
 * @param {string} [filePath=DEFAULT_LEDGER_PATH]
 * @returns {number} actual closed quantity
 */
function recordSubPositionExit(symbol, strategyId, quantityToClose, exitMeta = {}, filePath = DEFAULT_LEDGER_PATH) {
  const qtyToClose = Number(quantityToClose);
  if (!Number.isFinite(qtyToClose) || qtyToClose <= 0) return 0;

  const sym = String(symbol || '').toUpperCase();
  const lockPath = `${filePath}.lock`;

  return withFileLockSync(lockPath, () => {
    const ledger = loadSubPositionsLedger(filePath);
    const list = ledger.positions[sym];
    if (!list || list.length === 0) return 0;

    let remainingToClose = qtyToClose;
    let totalClosed = 0;
    const now = new Date().toISOString();

    for (let i = list.length - 1; i >= 0; i--) {
      const sub = list[i];
      if (sub.strategy_id === strategyId && sub.status === 'open') {
        if (sub.quantity <= remainingToClose + 1e-8) {
          // Fully close this sub-position
          const closedQty = sub.quantity;
          sub.status = 'closed';
          sub.closed_at = now;
          sub.exit_price = Number(exitMeta.exitPrice || 0);
          remainingToClose -= closedQty;
          totalClosed += closedQty;
          ledger.history.push({ ...sub });
          list.splice(i, 1);
        } else {
          // Partial close
          sub.quantity = Math.max(0, sub.quantity - remainingToClose);
          totalClosed += remainingToClose;
          ledger.history.push({
            ...sub,
            quantity: remainingToClose,
            status: 'partially_closed',
            closed_at: now,
            exit_price: Number(exitMeta.exitPrice || 0)
          });
          remainingToClose = 0;
        }
      }
      if (remainingToClose <= 0) break;
    }

    if (list.length === 0) {
      delete ledger.positions[sym];
    }

    saveSubPositionsLedger(ledger, filePath);
    return totalClosed;
  });
}

/**
 * Reconcile physical broker positions with internal virtual sub-positions.
 * Computes:
 * - Active bot sub-positions
 * - Auto-detected residual [MANUAL] positions
 * - Total broker aggregate
 *
 * @param {Array<{ symbol: string, quantity: number, averagePrice: number, marketValue: number, unrealizedPl: number }>} brokerPositions
 * @param {string} [filePath=DEFAULT_LEDGER_PATH]
 * @returns {Array<Object>} Enriched positions containing both aggregate and itemized sub-positions
 */
function reconcilePositions(brokerPositions = [], filePath = DEFAULT_LEDGER_PATH) {
  const ledger = loadSubPositionsLedger(filePath);
  const reconciled = [];

  for (const bp of brokerPositions) {
    const sym = String(bp.symbol || '').toUpperCase();
    const brokerQty = Math.max(0, Number(bp.quantity || 0));
    // Position invariant: prioritize broker qty_available with fallback to gross position quantity
    const brokerQtyAvailable = (bp.qty_available !== undefined && bp.qty_available !== null && Number.isFinite(Number(bp.qty_available)))
      ? Number(bp.qty_available)
      : brokerQty;
    const avgPrice = Number(bp.averagePrice || bp.average_price || 0);
    const marketVal = Number(bp.marketValue || bp.market_value || 0);
    const unrPl = Number(bp.unrealizedPl || bp.unrealized_pl || 0);
    const currentPrice = brokerQty > 0 ? (marketVal / brokerQty) : avgPrice;

    const subList = (ledger.positions[sym] || []).filter(s => s.status === 'open');
    let claimedBotQty = 0;
    const itemized = [];

    // Add bot sub-positions
    for (const sub of subList) {
      if (sub.source === 'bot' || (sub.strategy_id && sub.strategy_id !== 'manual')) {
        const subQty = Number(sub.quantity || 0);
        claimedBotQty += subQty;
        const subEntryPrice = Number(sub.entry_price || avgPrice);
        const subMktVal = subQty * currentPrice;
        const subUnrPl = (currentPrice - subEntryPrice) * subQty;

        itemized.push({
          sub_id: sub.sub_id,
          strategy_id: sub.strategy_id,
          source: 'bot',
          quantity: subQty,
          averagePrice: subEntryPrice,
          marketValue: subMktVal,
          unrealizedPl: subUnrPl,
          confidence: sub.confidence || null,
          timeframe: sub.timeframe || null,
          signature: sub.signature || null,
          submittedAt: sub.submitted_at || null
        });
      }
    }

    // Compute residual manual shares
    const residualManualQty = Math.max(0, brokerQty - claimedBotQty);
    if (residualManualQty > 0 || itemized.length === 0) {
      const manualQty = residualManualQty > 0 ? residualManualQty : brokerQty;
      const manualMktVal = manualQty * currentPrice;
      const manualUnrPl = (currentPrice - avgPrice) * manualQty;

      // Find if an explicit manual entry exists in ledger
      const manualLedgerEntry = subList.find(s => s.source === 'manual' || s.strategy_id === 'manual');

      itemized.unshift({
        sub_id: manualLedgerEntry?.sub_id || `sub_${sym}_manual_residual`,
        strategy_id: 'manual',
        source: 'manual',
        quantity: manualQty,
        averagePrice: avgPrice,
        marketValue: manualMktVal,
        unrealizedPl: manualUnrPl,
        confidence: 1.0,
        timeframe: 'manual',
        signature: manualLedgerEntry?.signature || `manual_cli_${sym}_${Date.now()}`,
        submittedAt: manualLedgerEntry?.submitted_at || bp.submittedAt || null
      });
    }

    reconciled.push({
      symbol: sym,
      quantity: brokerQty,
      qty_available: brokerQtyAvailable,
      averagePrice: avgPrice,
      marketValue: marketVal,
      unrealizedPl: unrPl,
      subPositions: itemized
    });
  }

  return reconciled;
}

module.exports = {
  beginPendingOrder,
  attachPendingOrder,
  applyPendingOrderReceipt,
  generateOrderSignature,
  parseOrderSignature,
  loadSubPositionsLedger,
  saveSubPositionsLedger,
  recordSubPositionEntry,
  recordSubPositionExit,
  reconcilePositions,
  DEFAULT_LEDGER_PATH
};
