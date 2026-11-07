'use strict';

/**
 * Normalized Symbol & Special Character Gating
 *
 * Centralized security boundary for Sovereign Trading Platform:
 * - Gates shell metacharacters, delimiters, and command injection vectors
 * - Normalizes market ticker symbols (crypto, equities, FX, commodities)
 * - Normalizes strategy and signal identifiers
 * - Collapses irregular whitespace and trims safe strings
 */

// Shell metacharacters, command chainers, and dangerous delimiters
const FORBIDDEN_SYMBOLS = '|&;$`><~#@!%*{}():"\'\\/\0';
const FORBIDDEN_REGEX = /[|&;$`><~#@!%*{}():"'\\/\0]/;

// Spreadsheet formula triggers (CWE-1236): =, +, -, @, tab, CR
const CSV_FORMULA_REGEX = /^[=+\-@\t\r]/;

// Sovereign ticker symbol format: alphanumeric start, up to 32 chars of [A-Z0-9._-]
const SAFE_SYMBOL_REGEX = /^[A-Z0-9][A-Z0-9._-]{0,31}$/;

// Sovereign strategy/signal identifier: alphanumeric start, lowercase [a-z0-9_-]
const SAFE_IDENTIFIER_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/;

/**
 * Trim leading and trailing whitespace
 * @param {string} str
 * @returns {string}
 */
function trim(str) {
  return String(str ?? '').trim();
}

/**
 * Compress multiple whitespace characters into a single space and trim ends
 * @param {string} str
 * @returns {string}
 */
function collapseSpace(str) {
  const trimmed = trim(str);
  if (!trimmed) return '';
  return trimmed.replace(/\s+/g, ' ');
}

/**
 * Check if a string contains any forbidden shell or injection symbol
 * @param {string} str
 * @returns {boolean}
 */
function containsForbiddenSymbols(str) {
  if (typeof str !== 'string') return false;
  return FORBIDDEN_REGEX.test(str);
}

/**
 * Strip all forbidden special characters from a string
 * @param {string} str
 * @param {string} [replacement='']
 * @returns {string}
 */
function stripSpecialSymbols(str, replacement = '') {
  if (!str) return '';
  // ponytail: regex replace covers all forbidden tokens in one pass
  return collapseSpace(String(str).replace(/[|&;$`><~#@!%*{}():"'\\/\0]/g, replacement));
}

/**
 * Validate a market ticker symbol (e.g. BTCUSDT, AAPL, EUR_USD, ETH-PERP)
 * Prohibits CLI flag injection ('-'), directory traversal ('..', '/'), and shell symbols
 *
 * @param {string} symbol
 * @returns {boolean}
 */
function isValidSymbol(symbol) {
  if (typeof symbol !== 'string') return false;
  const upper = symbol.trim().toUpperCase();
  return SAFE_SYMBOL_REGEX.test(upper);
}

/**
 * Normalize and canonicalize a market ticker symbol:
 * - Converts slashes to underscores (e.g. "EUR/USD" -> "EUR_USD")
 * - Converts spaces to underscores (e.g. "BTC USDT" -> "BTC_USDT")
 * - Uppercases and strips surrounding whitespace
 * - Rejects any symbol that does not match SAFE_SYMBOL_REGEX
 *
 * @param {string} rawSymbol
 * @returns {string|null} Canonical uppercase symbol or null if invalid
 */
function normalizeSymbol(rawSymbol) {
  if (!rawSymbol) return null;
  const cleaned = String(rawSymbol)
    .trim()
    .replace(/[/\s]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();

  return isValidSymbol(cleaned) ? cleaned : null;
}

/**
 * Validate an identifier (strategy ID, signal ID, model name)
 * @param {string} id
 * @returns {boolean}
 */
function isValidIdentifier(id) {
  if (typeof id !== 'string') return false;
  return SAFE_IDENTIFIER_REGEX.test(id.trim());
}

/**
 * Normalize a strategy or model identifier:
 * - Trims and converts spaces/hyphens to underscores
 * - Lowercases for canonical internal representation (e.g. "RSI Sweep 15m" -> "rsi_sweep_15m")
 *
 * @param {string} rawId
 * @returns {string|null} Canonical identifier or null if invalid
 */
function normalizeStrategyId(rawId) {
  if (!rawId) return null;
  const stripped = stripSpecialSymbols(rawId, ' ');
  const cleaned = stripped
    .replace(/[\s-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();

  return isValidIdentifier(cleaned) ? cleaned : null;
}

/**
 * Check if a string begins with a spreadsheet formula trigger character (CWE-1236)
 * @param {*} value
 * @returns {boolean}
 */
function isFormulaInjection(value) {
  if (typeof value !== 'string') return false;
  return CSV_FORMULA_REGEX.test(value);
}

/**
 * Sanitize a CSV cell value against formula injection:
 * Prefixes formula triggers (=, +, -, @, \t, \r) with an apostrophe (')
 *
 * @param {*} value
 * @returns {string}
 */
function sanitizeCsvCell(value) {
  if (value == null) return '';
  const str = String(value);
  // ponytail: prefix formula trigger with apostrophe to force text interpretation in Excel/Calc
  return CSV_FORMULA_REGEX.test(str) ? `'${str}` : str;
}

/**
 * Comprehensive special symbol gate:
 * Validates any string input against forbidden characters and returns diagnostic report
 *
 * @param {string} input
 * @param {object} [options={}]
 * @returns {{ ok: boolean, error?: string, sanitized?: string, forbidden_chars?: string[] }}
 */
function gateSpecialSymbols(input, options = {}) {
  if (typeof input !== 'string') {
    return { ok: false, error: 'Input must be a string' };
  }

  const maxLength = options.maxLength || 128;
  const trimmed = trim(input);

  if (options.required && !trimmed) {
    return { ok: false, error: 'Input cannot be empty' };
  }

  if (trimmed.length > maxLength) {
    return { ok: false, error: `Length exceeds maximum of ${maxLength} characters` };
  }

  // Prevent CLI option injection if string starts with '-'
  if (options.rejectOptionFlags !== false && trimmed.startsWith('-')) {
    return { ok: false, error: 'Input must not begin with a dash (CLI option injection prevention)' };
  }

  // Reject spreadsheet formula injection (CWE-1236) if enabled
  if (options.rejectFormulaInjection && isFormulaInjection(trimmed)) {
    return { ok: false, error: 'Input begins with spreadsheet formula trigger character (=, +, -, @, \\t, \\r)' };
  }

  if (containsForbiddenSymbols(trimmed)) {
    const found = [...new Set(trimmed.match(/[|&;$`><~#@!%*{}():"'\\/\0]/g) || [])];
    return {
      ok: false,
      error: `Input contains forbidden special characters: ${found.join(', ')}`,
      forbidden_chars: found,
    };
  }

  // Printable ASCII boundary [32, 126]
  for (let i = 0; i < trimmed.length; i++) {
    const code = trimmed.charCodeAt(i);
    if (code < 32 || code > 126) {
      return { ok: false, error: 'Input must contain only printable ASCII characters (32-126)' };
    }
  }

  return {
    ok: true,
    sanitized: trimmed,
  };
}

module.exports = {
  FORBIDDEN_SYMBOLS,
  FORBIDDEN_REGEX,
  CSV_FORMULA_REGEX,
  SAFE_SYMBOL_REGEX,
  SAFE_IDENTIFIER_REGEX,
  trim,
  collapseSpace,
  containsForbiddenSymbols,
  stripSpecialSymbols,
  isValidSymbol,
  normalizeSymbol,
  isValidIdentifier,
  normalizeStrategyId,
  isFormulaInjection,
  sanitizeCsvCell,
  gateSpecialSymbols,
};
