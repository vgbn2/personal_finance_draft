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
// Account namespace is supplied by the gateway's authenticated adapter, never
// inferred here. No unnamespaced mutation or automatic legacy migration exists.
function validateNamespace(namespace) {
  if (typeof namespace !== 'string' || !/^alpaca:(paper|live):[A-Za-z0-9][A-Za-z0-9_-]*$/.test(namespace) ||
      ['__proto__', 'prototype', 'constructor'].includes(namespace.split(':')[2])) {
    throw new Error('Authenticated Alpaca account namespace required');
  }
  return namespace;
}

function safeKey(value) {
  return typeof value === 'string' && value.trim() === value && value.length > 0 &&
    !['__proto__', 'prototype', 'constructor'].includes(value);
}

function plainRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) &&
    [Object.prototype, null].includes(Object.getPrototypeOf(value)) && Object.keys(value).every(safeKey);
}

function validatePlan(allocations, quantity, filled = 0) {
  if (!Array.isArray(allocations) || !allocations.length || allocations.some((item) =>
    !plainRecord(item) || !safeKey(item.strategyId) || !Number.isFinite(item.quantity) || item.quantity <= 0
  ) || new Set(allocations.map((item) => item.strategyId)).size !== allocations.length ||
      Math.abs(allocations.reduce((sum, item) => sum + item.quantity, 0) - quantity) > 1e-8) {
    throw new Error('Invalid ordered allocation plan');
  }
  let remaining = filled;
  for (const item of allocations) {
    const expected = Math.min(remaining, item.quantity);
    if (item.filled_qty !== undefined && (!Number.isFinite(item.filled_qty) ||
        item.filled_qty < 0 || Math.abs(item.filled_qty - expected) > 1e-8)) {
      throw new Error('Invalid allocation watermark');
    }
    remaining -= expected;
  }
}

function validateAccount(account, namespace) {
  if (!plainRecord(account) || !plainRecord(account.positions) || !Array.isArray(account.history) ||
      !plainRecord(account.pending_orders)) throw new Error('Invalid account ledger schema');
  for (const [symbol, rows] of Object.entries(account.positions)) {
    if (!Array.isArray(rows) || rows.some((row) => !plainRecord(row) || row.symbol !== symbol ||
      !safeKey(row.strategy_id) || !Number.isFinite(row.quantity) || row.quantity <= 0 ||
      !Number.isFinite(row.entry_price) || row.entry_price <= 0 || row.status !== 'open')) {
      throw new Error('Invalid account holdings schema');
    }
  }
  if (account.history.some((row) => !plainRecord(row))) throw new Error('Invalid account history schema');
  for (const [clientId, pending] of Object.entries(account.pending_orders)) {
    if (!plainRecord(pending) || pending.client_id !== clientId || pending.account_namespace !== namespace ||
        !safeKey(pending.symbol) || !['buy', 'sell'].includes(pending.side) ||
        !Number.isFinite(pending.quantity) || pending.quantity <= 0 ||
        !Number.isFinite(pending.filled_qty) || pending.filled_qty < 0 || pending.filled_qty > pending.quantity ||
        !Number.isFinite(pending.filled_notional) || pending.filled_notional < 0 ||
        typeof pending.terminal !== 'boolean' || typeof pending.status !== 'string' ||
        !(pending.order_id === null || safeKey(pending.order_id))) {
      throw new Error('Invalid account pending schema');
    }
    validatePlan(pending.allocations, pending.quantity, pending.filled_qty);
    if (pending.allocations.some((item) => item.filled_qty === undefined)) {
      throw new Error('Missing persisted allocation watermark');
    }
  }
}

function selectAccount(root, namespace) {
  validateNamespace(namespace);
  if (!plainRecord(root.positions) || !Array.isArray(root.history) ||
      (root.pending_orders !== undefined && !plainRecord(root.pending_orders))) {
    throw new Error('Invalid root ledger schema');
  }
  if (Object.keys(root.positions).length || root.history.length || Object.keys(root.pending_orders || {}).length) {
    throw new Error('Legacy ledger quarantined until explicit account mapping');
  }
  if (root.accounts !== undefined && !plainRecord(root.accounts)) throw new Error('Invalid accounts schema');
  for (const [key, account] of Object.entries(root.accounts || {})) {
    validateNamespace(key);
    validateAccount(account, key);
  }
  return Object.hasOwn(root.accounts || {}, namespace)
    ? root.accounts[namespace]
    : { positions: {}, history: [], pending_orders: {} };
}

/** Read a validated account partition; legacy records throw, never become zero holdings. */
function loadAccountLedger(filePath = DEFAULT_LEDGER_PATH, namespace) {
  return selectAccount(loadSubPositionsLedger(filePath), namespace);
}

function mutateAccount(filePath, namespace, update) {
  return withFileLockSync(`${filePath}.lock`, () => {
    const root = loadSubPositionsLedger(filePath);
    const account = selectAccount(root, namespace);
    const result = update(account);
    root.accounts ||= {};
    root.accounts[namespace] = account;
    saveSubPositionsLedger(root, filePath);
    return result;
  });
}

/** order: accountNamespace, clientOrderId, instrumentId, side, quantity,
 * allocations: [{strategyId, quantity}] in caller-approved persisted order.
 * All mutations share the existing file lock across every account partition.
 */
function beginPendingOrder(order, filePath = DEFAULT_LEDGER_PATH) {
  if (!plainRecord(order)) throw new Error('Invalid pending order');
  validateNamespace(order.accountNamespace);
  const symbol = typeof order.instrumentId === 'string' ? order.instrumentId.toUpperCase() : '';
  const quantity = order.quantity;
  const clientId = order.clientOrderId;
  if (!safeKey(symbol) || !safeKey(clientId) || !['buy', 'sell'].includes(order.side) ||
      !Number.isFinite(quantity) || quantity <= 0 ||
      (order.providerPaper !== undefined && order.providerPaper !== (order.accountNamespace.split(':')[1] === 'paper'))) {
    throw new Error('Invalid pending order');
  }
  validatePlan(order.allocations, quantity);
  if (order.allocations.some((item) => item.filled_qty !== undefined && item.filled_qty !== 0)) {
    throw new Error('New allocation plan cannot contain fills');
  }
  return mutateAccount(filePath, order.accountNamespace, (ledger) => {
    if (Object.hasOwn(ledger.pending_orders, clientId) || Object.values(ledger.pending_orders).some(
      (item) => !item.terminal && item.symbol === symbol
    )) throw new Error('Existing pending order requires reconciliation before submission');
    if (order.side === 'sell') {
      for (const allocation of order.allocations) {
        const available = (ledger.positions[symbol] || []).filter((row) => row.strategy_id === allocation.strategyId)
          .reduce((sum, row) => sum + row.quantity, 0);
        if (available + 1e-8 < allocation.quantity) throw new Error('Exit plan exceeds attributed holdings');
      }
    }
    const pending = {
      client_id: clientId,
      account_namespace: order.accountNamespace,
      allocations: order.allocations.map((item) => ({
        strategyId: item.strategyId,
        quantity: item.quantity,
        filled_qty: 0,
      })),
      order_id: null,
      symbol,
      side: order.side,
      quantity,
      source: order.source || 'bot',
      timeframe: order.timeframe || '1m',
      confidence: order.confidence ?? 1,
      submitted_at: order.submittedAt || new Date().toISOString(),
      filled_qty: 0,
      filled_notional: 0,
      terminal: false,
      status: 'submission_unknown',
      paper: order.accountNamespace.split(':')[1] === 'paper',
    };
    ledger.pending_orders[clientId] = pending;
    return pending;
  });
}

/** Identity mutations require the same authenticated namespace as beginPendingOrder. */
function attachPendingOrder(clientId, orderId, filePath = DEFAULT_LEDGER_PATH, namespace) {
  return mutateAccount(filePath, namespace, (ledger) => {
    const pending = Object.hasOwn(ledger.pending_orders, clientId) && ledger.pending_orders[clientId];
    if (!pending || !safeKey(orderId) || (pending.order_id && pending.order_id !== orderId) || pending.terminal) {
      throw new Error('Invalid pending order identity');
    }
    pending.order_id = orderId;
    pending.status = 'submitted';
    return pending;
  });
}

/** receipt: accountNamespace, orderId, symbol, side, quantity, filledQty,
 * filledAvgPrice, status. Returned pending includes per-allocation filled_qty.
 * Ledger and allocation watermarks commit together via the existing atomic rename.
 */
function applyPendingOrderReceipt(clientId, receipt, filePath = DEFAULT_LEDGER_PATH, namespace) {
  return mutateAccount(filePath, namespace, (ledger) => {
    const pending = Object.hasOwn(ledger.pending_orders, clientId) && ledger.pending_orders[clientId];
    if (!plainRecord(receipt) || !pending || receipt.accountNamespace !== namespace || !pending.order_id ||
        receipt.orderId !== pending.order_id || receipt.symbol !== pending.symbol ||
        receipt.side !== pending.side || receipt.quantity !== pending.quantity) {
      throw new Error('Receipt identity does not match pending order');
    }
    const filled = receipt.filledQty;
    const average = receipt.filledAvgPrice;
    if (!Number.isFinite(filled) || filled < 0 || filled > pending.quantity ||
        (filled > 0 && (!Number.isFinite(average) || average <= 0)) ||
        typeof receipt.status !== 'string' || !receipt.status ||
        (receipt.status === 'filled' && filled !== pending.quantity)) throw new Error('Invalid cumulative fill receipt');
    const notional = filled > 0 ? filled * average : 0;
    const delta = filled - pending.filled_qty;
    const cost = notional - pending.filled_notional;
    if (!Number.isFinite(notional) || delta < 0 || (delta === 0 && cost !== 0) ||
        (delta > 0 && (!Number.isFinite(cost) || cost <= 0))) {
      throw new Error('Cumulative receipt regressed or changed previously applied fills');
    }
    if (pending.terminal) {
      if (delta !== 0) throw new Error('Terminal receipt changed previously applied fills');
      return pending;
    }
    let remaining = delta;
    for (const allocation of pending.allocations) {
      const allocated = Math.min(remaining, allocation.quantity - allocation.filled_qty);
      if (allocated <= 0) continue;
      remaining -= allocated;
      const list = ledger.positions[pending.symbol] ||= [];
      if (pending.side === 'buy') {
        let sub = list.find((item) => item.order_id === pending.order_id && item.strategy_id === allocation.strategyId);
        if (!sub) {
          sub = {
            sub_id: `sub_${clientId}_${allocation.strategyId}`,
            symbol: pending.symbol,
            strategy_id: allocation.strategyId,
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
        const allocationCost = (cost / delta) * allocated;
        sub.entry_price = (sub.quantity * sub.entry_price + allocationCost) / (sub.quantity + allocated);
        sub.quantity += allocated;
      } else {
        const available = list.filter((item) => item.strategy_id === allocation.strategyId && item.status === 'open')
          .reduce((sum, item) => sum + item.quantity, 0);
        if (available + 1e-8 < allocated) throw new Error('Confirmed exit exceeds attributed holdings');
        let toClose = allocated;
        // Retain existing newest-lot-first policy within this strategy only.
        for (let i = list.length - 1; i >= 0 && toClose > 0; i--) {
          const sub = list[i];
          if (sub.strategy_id !== allocation.strategyId || sub.status !== 'open') continue;
          const closed = Math.min(sub.quantity, toClose);
          ledger.history.push({
            ...sub,
            quantity: closed,
            status: closed === sub.quantity ? 'closed' : 'partially_closed',
            closed_at: new Date().toISOString(),
            exit_price: cost / delta,
            exit_order_id: pending.order_id,
          });
          sub.quantity -= closed;
          toClose -= closed;
          if (sub.quantity === 0) list.splice(i, 1);
        }
        if (!list.length) delete ledger.positions[pending.symbol];
      }
      allocation.filled_qty += allocated;
    }
    pending.filled_qty = filled;
    pending.filled_notional = notional;
    pending.status = receipt.status;
    pending.terminal = ['filled', 'canceled', 'expired', 'rejected'].includes(receipt.status);
    return pending;
  });
}

function recordSubPositionEntry(entry, filePath = DEFAULT_LEDGER_PATH) {
  throw new Error('Legacy direct mutation quarantined; use namespaced confirmed receipts');

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
  throw new Error('Legacy direct mutation quarantined; use namespaced confirmed receipts');

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
function reconcilePositions(brokerPositions = [], filePath = DEFAULT_LEDGER_PATH, namespace) {
  const ledger = loadAccountLedger(filePath, namespace);
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
  loadAccountLedger,
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
