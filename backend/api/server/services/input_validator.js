'use strict';

const path = require('node:path');
const { REPO_ROOT, STORAGE_DATA_DIR } = require('../../../../shared/lib/runtime/paths');

const SYMBOL_REGEX = /^[A-Z0-9_.-]{1,20}$/i;
const TIMEFRAME_REGEX = /^(1m|3m|5m|15m|30m|1h|2h|4h|6h|8h|12h|1d|1w|1M)$/;
const SIGNAL_ID_REGEX = /^[a-zA-Z0-9_-]{1,128}$/;
const PROMOTION_ID_REGEX = /^[a-zA-Z0-9:_.-]{1,160}$/;
const POSITION_ID_REGEX = /^[a-zA-Z0-9_-]{1,128}$/;

function isValidSymbol(symbol) {
  if (typeof symbol !== 'string') return false;
  return SYMBOL_REGEX.test(symbol.trim());
}

function isValidTimeframe(tf) {
  if (typeof tf !== 'string') return false;
  return TIMEFRAME_REGEX.test(tf.trim());
}

function isValidSignalId(id) {
  if (typeof id !== 'string') return false;
  return SIGNAL_ID_REGEX.test(id.trim());
}

function isValidPromotionId(id) {
  if (typeof id !== 'string') return false;
  return PROMOTION_ID_REGEX.test(id.trim());
}

function isValidPositionId(id) {
  if (typeof id !== 'string') return false;
  return POSITION_ID_REGEX.test(id.trim());
}

function isPathWithinAllowedRoots(targetPath, allowedRoots = [REPO_ROOT, STORAGE_DATA_DIR]) {
  if (typeof targetPath !== 'string' || !targetPath.trim()) return false;
  try {
    const resolvedTarget = path.resolve(targetPath);
    return allowedRoots.some((root) => {
      const resolvedRoot = path.resolve(root);
      return resolvedTarget === resolvedRoot || resolvedTarget.startsWith(resolvedRoot + path.sep);
    });
  } catch (_err) {
    return false;
  }
}

function sanitizeSymbol(symbol) {
  if (!isValidSymbol(symbol)) return null;
  return String(symbol).trim().toUpperCase();
}

module.exports = {
  SYMBOL_REGEX,
  TIMEFRAME_REGEX,
  SIGNAL_ID_REGEX,
  PROMOTION_ID_REGEX,
  POSITION_ID_REGEX,
  isValidSymbol,
  isValidTimeframe,
  isValidSignalId,
  isValidPromotionId,
  isValidPositionId,
  isPathWithinAllowedRoots,
  sanitizeSymbol,
};
