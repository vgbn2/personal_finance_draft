'use strict';

const { runAlpacaExitCheck, canOpenPosition } = require('../../../../shared/lib/runtime/alpaca_bot_cycle.js');
const { loadState: loadAlpacaBotState } = require('../../../../shared/lib/runtime/alpaca_bot_state.js');

/**
 * Establish broker-backed position truth before an automation pass may inspect
 * entry signals. A blocked exit reconciliation must never fall through to the
 * local state read or entry scan.
 */
async function reconcileAutomationInventory(args, dependencies = {}) {
  const runExitCheck = dependencies.runExitCheck || runAlpacaExitCheck;
  const loadState = dependencies.loadState || loadAlpacaBotState;

  const exitResult = await runExitCheck(args).catch((error) => ({
    errors: [error instanceof Error ? error.message : String(error)],
    blocked: true,
  }));

  if (exitResult.blocked) {
    return {
      ok: false,
      blocked: true,
      reason: 'alpaca_inventory_unavailable',
      exitResult,
    };
  }

  const snapshot = loadState();
  return {
    ok: true,
    blocked: false,
    exitResult,
    openPositionCount: snapshot.positions.length,
    maxOpenPositions: snapshot.config.maxPositions,
  };
}

module.exports = {
  canOpenPosition,
  reconcileAutomationInventory,
};
