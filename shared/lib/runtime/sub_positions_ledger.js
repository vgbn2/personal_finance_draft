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
  try {
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf8');
      const parsed = JSON.parse(data);
      if (parsed && typeof parsed === 'object' && parsed.positions) {
        return parsed;
      }
    }
  } catch (err) {
    // If corrupt or missing, start fresh
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
      averagePrice: avgPrice,
      marketValue: marketVal,
      unrealizedPl: unrPl,
      subPositions: itemized
    });
  }

  return reconciled;
}

module.exports = {
  generateOrderSignature,
  parseOrderSignature,
  loadSubPositionsLedger,
  saveSubPositionsLedger,
  recordSubPositionEntry,
  recordSubPositionExit,
  reconcilePositions,
  DEFAULT_LEDGER_PATH
};
