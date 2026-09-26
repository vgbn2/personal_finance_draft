'use strict';

/**
 * STANDARDIZED VERSIONED FIXTURE CATALOG
 *
 * Provides centralized, typed access to recorded market anomaly fixtures,
 * synthetic stress-test datasets, and multi-asset time series without external I/O.
 */

const fs = require('node:fs');
const path = require('node:path');

const CATALOG_ROOT = __dirname;

function loadJson(filename) {
  const fullPath = path.join(CATALOG_ROOT, filename);
  return JSON.parse(fs.readFileSync(fullPath, 'utf8'));
}

const CATALOG_ENTRIES = Object.freeze({
  FLASH_CRASH_BTC_5M: 'flash_crash_btc_5m.json',
  FLATLINE_WEEKEND_EURUSD_1H: 'flatline_weekend_eurusd_1h.json',
  ILLIQUID_TOKEN_ZERO_VOLUME_15M: 'illiquid_token_zero_volume_15m.json',
  PARTIAL_FILL_ECN_ORDERS: 'partial_fill_ecn_orders.json',
});

let _cache = new Map();

function getCatalogFixture(entryKey) {
  const filename = CATALOG_ENTRIES[entryKey];
  if (!filename) {
    throw new Error(`Unknown fixture catalog entry key: ${entryKey}. Valid keys: ${Object.keys(CATALOG_ENTRIES).join(', ')}`);
  }
  if (!_cache.has(filename)) {
    _cache.set(filename, loadJson(filename));
  }
  return _cache.get(filename);
}

function getFlashCrashBtc() {
  return getCatalogFixture('FLASH_CRASH_BTC_5M');
}

function getFlatlineWeekendEurUsd() {
  return getCatalogFixture('FLATLINE_WEEKEND_EURUSD_1H');
}

function getIlliquidToken() {
  return getCatalogFixture('ILLIQUID_TOKEN_ZERO_VOLUME_15M');
}

function getPartialFillEcnOrders() {
  return getCatalogFixture('PARTIAL_FILL_ECN_ORDERS');
}

function clearCatalogCache() {
  _cache.clear();
}

module.exports = {
  CATALOG_ENTRIES,
  getCatalogFixture,
  getFlashCrashBtc,
  getFlatlineWeekendEurUsd,
  getIlliquidToken,
  getPartialFillEcnOrders,
  clearCatalogCache,
};
