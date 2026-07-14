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

const DEFAULT_STATE = {
  version: 1,
  config: DEFAULT_CONFIG,
  positions: [],
  cycleHistory: [],
  lastCycleAt: null,
};

function loadState() {
  if (fs.existsSync(STATE_PATH)) {
    try {
      const raw = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
      return {
        ...DEFAULT_STATE,
        ...raw,
        config: { ...DEFAULT_CONFIG, ...(raw.config || {}) },
        positions: Array.isArray(raw.positions) ? raw.positions : [],
        cycleHistory: Array.isArray(raw.cycleHistory) ? raw.cycleHistory : [],
      };
    } catch {
      // fall through to default
    }
  }
  return { ...DEFAULT_STATE, config: { ...DEFAULT_CONFIG }, positions: [], cycleHistory: [] };
}

function saveState(state) {
  writeJson(STATE_PATH, state);
}

module.exports = {
  STATE_PATH,
  LOCK_PATH,
  DEFAULT_CONFIG,
  loadState,
  saveState,
};
