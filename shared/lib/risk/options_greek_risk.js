'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { REPO_ROOT } = require('../runtime/paths.js');

const SOVEREIGN_WEALTH_BIN = path.join(REPO_ROOT, 'backend/core/build/sovereign_wealth');

/**
 * Options Greek Pre-Trade Risk Verification Bridge
 *
 * Validates Net Gamma, Net Vega, and Net Delta against hard exposure limits.
 * Uses native C++ PreTradeRisk engine via POSIX process bridge when binary is present,
 * with zero-overhead JS fallback for zero-key test environments.
 *
 * ponytail: spawnSync CLI bridge; direct N-API / shared memory ringbuffer when cycle frequency exceeds 100Hz
 */
function validateOptionsGreeks(greeks = {}, limits = {}) {
  const delta = Number(greeks.delta ?? 0);
  const gamma = Number(greeks.gamma ?? 0);
  const vega = Number(greeks.vega ?? 0);
  const theta = Number(greeks.theta ?? 0);

  const maxGamma = limits.max_gamma != null ? Number(limits.max_gamma) : 50.0;
  const maxVega = limits.max_vega != null ? Number(limits.max_vega) : 10000.0;
  const maxDelta = limits.max_delta != null ? Number(limits.max_delta) : 5.0;
  const failClosed = limits.fail_closed !== false;

  // 1. Try native C++ binary if available
  if (fs.existsSync(SOVEREIGN_WEALTH_BIN)) {
    try {
      const args = [
        'risk',
        'options',
        '--delta', String(delta),
        '--gamma', String(gamma),
        '--vega', String(vega),
        '--theta', String(theta),
        '--max-gamma', String(maxGamma),
        '--max-vega', String(maxVega),
        '--max-delta', String(maxDelta),
      ];

      const res = spawnSync(SOVEREIGN_WEALTH_BIN, args, {
        encoding: 'utf8',
        timeout: 2000,
      });

      if (res.stdout) {
        const parsed = JSON.parse(res.stdout.trim());
        if (parsed && typeof parsed.approved === 'boolean') {
          return parsed;
        }
      }
    } catch {
      // Fall through to JS fallback
    }
  }

  // 2. JS Fallback (identical semantics to PreTradeRisk::validateOptionsGreeks)
  const nonFinite = !Number.isFinite(delta) || !Number.isFinite(gamma) || !Number.isFinite(vega) || !Number.isFinite(theta);
  if (nonFinite) {
    return {
      type: 'options_risk_decision',
      approved: !failClosed,
      halt_trading: failClosed,
      limit: maxGamma,
      observed_value: 0,
      reason: 'CRITICAL: Non-finite Greek values detected (fail-closed).',
    };
  }

  const absGamma = Math.abs(gamma);
  const absVega = Math.abs(vega);
  const absDelta = Math.abs(delta);

  if (maxGamma > 0 && absGamma > maxGamma) {
    return {
      type: 'options_risk_decision',
      approved: false,
      halt_trading: failClosed,
      limit: maxGamma,
      observed_value: absGamma,
      reason: 'CRITICAL: Net Gamma limit exceeded.',
    };
  }

  if (maxVega > 0 && absVega > maxVega) {
    return {
      type: 'options_risk_decision',
      approved: false,
      halt_trading: failClosed,
      limit: maxVega,
      observed_value: absVega,
      reason: 'CRITICAL: Net Vega limit exceeded.',
    };
  }

  if (maxDelta > 0 && absDelta > maxDelta) {
    return {
      type: 'options_risk_decision',
      approved: false,
      halt_trading: failClosed,
      limit: maxDelta,
      observed_value: absDelta,
      reason: 'CRITICAL: Net Delta limit exceeded.',
    };
  }

  return {
    type: 'options_risk_decision',
    approved: true,
    halt_trading: false,
    limit: maxGamma,
    observed_value: absGamma,
    reason: 'Risk parameters cleared: Options Greeks within authorized bounds.',
  };
}

module.exports = {
  validateOptionsGreeks,
};
