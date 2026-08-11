'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { writeJson } = require('../market/validation');
const { STORAGE_DATA_DIR } = require('./paths');

/**
 * Persistent Alpaca bot position tracker. Mirrors backend/gateway/src/bot_state.ts's
 * shape (BotPosition/BotConfig/BotState) for the equities/crypto-via-Alpaca side of
 * the platform, which previously had no position memory at all -- the automation
 * loop (strategy.js's runAutomationPass) only ever opened positions, never tracked
 * or closed them.
 *
 * @typedef {Object} AlpacaBotPosition
 * @property {string} positionId
 * @property {string} symbol
 * @property {number} qty
 * @property {string} strategyName
 * @property {number} entryPrice      requested/signal price at entry
 * @property {number} fillPrice       broker-confirmed average price after entry
 * @property {string} entryTimestamp  ISO timestamp
 * @property {number} stopPrice
 * @property {number} targetPrice
 * @property {number} maxHoldingDays
 *
 * @typedef {Object} AlpacaBotConfig
 * @property {boolean} enabled
 * @property {number} defaultStopLossPct
 * @property {number} defaultTakeProfitPct
 * @property {number} maxPositions
 *
 * @typedef {Object} AlpacaCycleResult
 * @property {string} cycleId
 * @property {string} completedAt
 * @property {number} sellsExecuted
 * @property {string[]} errors
 *
 * @typedef {Object} AlpacaBotState
 * @property {number} version
 * @property {AlpacaBotConfig} config
 * @property {AlpacaBotPosition[]} positions
 * @property {AlpacaCycleResult[]} cycleHistory
 * @property {{signalId:string, utcDay:string, reservedNotional:number, status:'reserved'|'submitted'|'confirmed'|'released'}[]} entryIntents
 * @property {string|null} lastCycleAt
 */

const CACHE_DIR = path.join(STORAGE_DATA_DIR, 'cache');
const STATE_PATH = path.join(CACHE_DIR, 'alpaca_bot_state.json');
const LOCK_PATH = path.join(CACHE_DIR, 'alpaca_bot_cycle.lock');

const DEFAULT_CONFIG = {
  enabled: true,
  defaultStopLossPct: 0.08,
  defaultTakeProfitPct: 0.15,
  maxPositions: 10,
};

const MAX_ENTRY_INTENTS = 500;
const ENTRY_INTENT_RETENTION_DAYS = 14;

const DEFAULT_STATE = {
  version: 1,
  config: DEFAULT_CONFIG,
  positions: [],
  cycleHistory: [],
  entryIntents: [],
  lastCycleAt: null,
};

function normalizeEntryIntents(raw, now = Date.now()) {
  const oldest = now - (ENTRY_INTENT_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  return (Array.isArray(raw) ? raw : [])
    .filter((intent) => intent && typeof intent === 'object' && typeof intent.signalId === 'string'
      && /^\d{4}-\d{2}-\d{2}$/.test(String(intent.utcDay || ''))
      && Number.isFinite(Number(intent.reservedNotional)) && Number(intent.reservedNotional) > 0
      && ['reserved', 'submitted', 'confirmed', 'released'].includes(intent.status)
      && Number.isFinite(Date.parse(intent.createdAt)) && Date.parse(intent.createdAt) >= oldest)
    .slice(-MAX_ENTRY_INTENTS);
}

class AlpacaBotStateError extends Error {
  constructor(code, statePath, cause = null) {
    super(`${code}: ${statePath}`);
    this.name = 'AlpacaBotStateError';
    this.code = code;
    this.statePath = statePath;
    if (cause) this.cause = cause;
  }
}

function assertStateShape(raw, statePath) {
  const invalid = (
    !raw
    || typeof raw !== 'object'
    || Array.isArray(raw)
    || (raw.version !== undefined && raw.version !== 1)
    || (raw.config !== undefined && (
      !raw.config
      || typeof raw.config !== 'object'
      || Array.isArray(raw.config)
    ))
    || (raw.positions !== undefined && !Array.isArray(raw.positions))
    || (raw.cycleHistory !== undefined && !Array.isArray(raw.cycleHistory))
    || (raw.entryIntents !== undefined && !Array.isArray(raw.entryIntents))
    || (Array.isArray(raw.entryIntents) && raw.entryIntents.some((intent) => (
      !intent
      || typeof intent !== 'object'
      || !String(intent.signalId || '').trim()
      || !/^\d{4}-\d{2}-\d{2}$/.test(String(intent.utcDay || ''))
      || !Number.isFinite(Number(intent.reservedNotional))
      || Number(intent.reservedNotional) <= 0
      || !['reserved', 'submitted', 'confirmed', 'released'].includes(intent.status)
    )))
    || (Array.isArray(raw.positions) && raw.positions.some((position) => (
      !position
      || typeof position !== 'object'
      || !String(position.positionId || '').trim()
      || !String(position.symbol || '').trim()
      || !Number.isFinite(Number(position.qty))
      || Number(position.qty) <= 0
    )))
  );
  if (invalid) throw new AlpacaBotStateError('alpaca_bot_state_invalid', statePath);
}

function loadState(options = {}) {
  const statePath = options.statePath || STATE_PATH;
  const fileSystem = options.fs || fs;
  if (fileSystem.existsSync(statePath)) {
    let raw;
    try {
      raw = JSON.parse(fileSystem.readFileSync(statePath, 'utf8'));
    } catch (error) {
      throw new AlpacaBotStateError('alpaca_bot_state_corrupt', statePath, error);
    }
    assertStateShape(raw, statePath);
    return {
      ...DEFAULT_STATE,
      ...raw,
      config: { ...DEFAULT_CONFIG, ...(raw.config || {}) },
      positions: raw.positions || [],
      cycleHistory: raw.cycleHistory || [],
      entryIntents: normalizeEntryIntents(raw.entryIntents),
    };
  }
  return {
    ...DEFAULT_STATE,
    config: { ...DEFAULT_CONFIG },
    positions: [],
    cycleHistory: [],
    entryIntents: [],
  };
}

function reserveEntryIntent(state, intent) {
  const existing = state.entryIntents.find((entry) => entry.signalId === intent.signalId && entry.status !== 'released');
  if (existing) return { ok: false, reason: 'alpaca_paper_signal_already_reserved', intent: existing };
  const createdAt = new Date().toISOString();
  const entry = {
    signalId: String(intent.signalId),
    utcDay: String(intent.utcDay),
    reservedNotional: Number(intent.reservedNotional),
    status: 'reserved',
    createdAt,
  };
  state.entryIntents = normalizeEntryIntents([...state.entryIntents, entry]);
  return { ok: true, intent: entry };
}

function setEntryIntentStatus(state, signalId, status) {
  const entry = state.entryIntents.find((item) => item.signalId === signalId);
  if (!entry) throw new AlpacaBotStateError('alpaca_bot_entry_intent_missing', STATE_PATH);
  entry.status = status;
  entry.updatedAt = new Date().toISOString();
  state.entryIntents = normalizeEntryIntents(state.entryIntents);
  return entry;
}

function saveState(state, options = {}) {
  const statePath = options.statePath || STATE_PATH;
  assertStateShape(state, statePath);
  writeJson(statePath, state);
}

module.exports = {
  AlpacaBotStateError,
  STATE_PATH,
  LOCK_PATH,
  DEFAULT_CONFIG,
  MAX_ENTRY_INTENTS,
  assertStateShape,
  normalizeEntryIntents,
  reserveEntryIntent,
  setEntryIntentStatus,
  loadState,
  saveState,
};
