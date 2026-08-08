'use strict';

const fs = require('node:fs');
const path = require('node:path');
const utils = require('../../../backend/cli/lib/utils.js');

const DEFAULT_TS_DIR = path.join(utils.REPO_ROOT, 'storage', 'data', 'ts');

/**
 * Discovers available binary time-series files from storage/data/ts/
 * and returns a random sample of at least `count` unique symbol names.
 *
 * @param {number} [count=30] - Minimum number of symbols to sample
 * @param {Object} [options={}] - Options
 * @param {string} [options.timeframe='1d'] - Timeframe suffix to match (e.g. '1d', '5m')
 * @param {string} [options.tsDir] - Custom ts directory path
 * @returns {string[]} Array of at least `count` symbol names
 */
function getRandomSymbols(count = 30, options = {}) {
  const tsDir = options.tsDir || DEFAULT_TS_DIR;
  const timeframe = options.timeframe || '1d';
  const symbols = new Set();

  if (fs.existsSync(tsDir)) {
    const files = fs.readdirSync(tsDir);
    const suffix = `_${timeframe}.bin`;
    for (const file of files) {
      if (file.endsWith(suffix)) {
        const symbol = file.slice(0, -suffix.length);
        if (symbol) symbols.add(symbol);
      }
    }
  }

  const symbolArray = Array.from(symbols);

  // If sufficient symbols exist on disk, shuffle and return a sample
  if (symbolArray.length >= count) {
    // Fisher-Yates shuffle
    const shuffled = [...symbolArray];
    for (let i = shuffled.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled.slice(0, count);
  }

  // Fallback: If disk contains fewer than `count` symbols, pad with synthetic symbol names
  const result = [...symbolArray];
  let synthIndex = 1;
  while (result.length < count) {
    result.push(`SYNTH_${synthIndex}`);
    synthIndex += 1;
  }
  return result;
}

module.exports = {
  getRandomSymbols,
  DEFAULT_TS_DIR,
};
