'use strict';

/**
 * Robust symbol resolution utility.
 * Handles exact matches, fuzzy matches (prefixes/suffixes), and coordinate ID matching.
 */

/**
 * Resolves a list of input symbols against a provided universe.
 * 
 * @param {string|string[]} inputSymbols - The symbols to resolve (comma-separated string or array)
 * @param {Array} universe - Array of universe objects { symbol, coordinate_id }
 * @returns {string[]} Resolved symbol names
 */
function resolveSymbols(inputSymbols, universe = []) {
  if (!universe || universe.length === 0) {
    return Array.isArray(inputSymbols) 
      ? inputSymbols.map(s => String(s).toUpperCase())
      : String(inputSymbols || '').split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
  }

  const symbols = Array.isArray(inputSymbols) 
    ? inputSymbols 
    : String(inputSymbols || '').split(',').map(s => s.trim()).filter(Boolean);

  return symbols.map(s => {
    const upper = s.toUpperCase();

    // 1. Exact match (symbol or coordinate_id)
    const exact = universe.find(u => {
      const sym = String(u.symbol || '').toUpperCase();
      const cid = String(u.coordinate_id || '').toUpperCase();
      return sym === upper || cid === upper;
    });
    if (exact) return exact.symbol;

    // 2. Fuzzy match: starts with (e.g., BTC -> BTCUSDT)
    const startsWith = universe.find(u => {
      const sym = String(u.symbol || '').toUpperCase();
      return sym && sym.startsWith(upper);
    });
    if (startsWith) return startsWith.symbol;

    // 3. Fuzzy match: ends with (e.g., USDT -> BTCUSDT - less common but supported)
    const endsWith = universe.find(u => {
      const sym = String(u.symbol || '').toUpperCase();
      return sym && sym.endsWith(upper);
    });
    if (endsWith) return endsWith.symbol;

    // 4. Fallback to original input
    return upper;
  });
}

module.exports = {
  resolveSymbols,
};
