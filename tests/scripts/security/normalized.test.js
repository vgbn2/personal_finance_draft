'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  FORBIDDEN_SYMBOLS,
  FORBIDDEN_REGEX,
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
} = require('../../../shared/lib/security/normalized');

test('Normalized - Trim & CollapseSpace', () => {
  assert.equal(trim('   hello world   '), 'hello world');
  assert.equal(trim(''), '');
  assert.equal(trim(null), '');

  assert.equal(collapseSpace('   hello    multiple    spaces   '), 'hello multiple spaces');
  assert.equal(collapseSpace('single'), 'single');
  assert.equal(collapseSpace('   \t\n  '), '');
});

test('Normalized - Forbidden Symbols & Stripping', () => {
  // Test individual characters in FORBIDDEN_SYMBOLS
  for (const ch of FORBIDDEN_SYMBOLS) {
    assert.equal(containsForbiddenSymbols(`test${ch}val`), true, `Must detect '${ch}' in string`);
  }

  // Safe strings
  assert.equal(containsForbiddenSymbols('BTC_USDT-2026'), false);
  assert.equal(containsForbiddenSymbols('ETH-PERP'), false);
  assert.equal(containsForbiddenSymbols('Clean String 123'), false);

  // Strip special symbols
  assert.equal(stripSpecialSymbols('BTC|USDT{test}'), 'BTCUSDTtest');
  assert.equal(stripSpecialSymbols('BTC|USDT{test}', ' '), 'BTC USDT test');
  assert.equal(stripSpecialSymbols('foo;bar`id`', ''), 'foobarid');
  assert.equal(stripSpecialSymbols(''), '');
  assert.equal(stripSpecialSymbols(null), '');
});

test('Normalized - Market Symbol Validation & Normalization', () => {
  // Valid tickers
  assert.equal(isValidSymbol('BTCUSDT'), true);
  assert.equal(isValidSymbol('AAPL'), true);
  assert.equal(isValidSymbol('EUR_USD'), true);
  assert.equal(isValidSymbol('ETH-PERP'), true);
  assert.equal(isValidSymbol('BRK.B'), true);

  // Invalid tickers
  assert.equal(isValidSymbol(''), false);
  assert.equal(isValidSymbol('-BTC'), false); // Leading dash
  assert.equal(isValidSymbol('BTC/USDT'), false); // Slash
  assert.equal(isValidSymbol('BTC;DROP'), false);
  assert.equal(isValidSymbol(null), false);

  // Normalization
  assert.equal(normalizeSymbol('  btc/usdt  '), 'BTC_USDT');
  assert.equal(normalizeSymbol('eur / usd'), 'EUR_USD');
  assert.equal(normalizeSymbol('/btc/usdt/'), 'BTC_USDT');
  assert.equal(normalizeSymbol('_eur_usd_'), 'EUR_USD');
  assert.equal(normalizeSymbol('eth-perp'), 'ETH-PERP');
  assert.equal(normalizeSymbol('aapl'), 'AAPL');
  assert.equal(normalizeSymbol('invalid;symbol'), null);
  assert.equal(normalizeSymbol(''), null);
  assert.equal(normalizeSymbol(null), null);
});

test('Normalized - Strategy & Identifier Validation & Normalization', () => {
  // Valid identifiers
  assert.equal(isValidIdentifier('rsi_sweep_15m'), true);
  assert.equal(isValidIdentifier('trend_following_v1'), true);
  assert.equal(isValidIdentifier('alpha-1'), true);

  // Invalid identifiers
  assert.equal(isValidIdentifier(''), false);
  assert.equal(isValidIdentifier('-strategy'), false);
  assert.equal(isValidIdentifier('strategy;injection'), false);
  assert.equal(isValidIdentifier(null), false);

  // Normalization
  assert.equal(normalizeStrategyId('  RSI Sweep 15m  '), 'rsi_sweep_15m');
  assert.equal(normalizeStrategyId('- RSI Sweep 15m -'), 'rsi_sweep_15m');
  assert.equal(normalizeStrategyId('___alpha_model___'), 'alpha_model');
  assert.equal(normalizeStrategyId('Trend-Follow 1h'), 'trend_follow_1h');
  assert.equal(normalizeStrategyId('alpha#@!strategy'), 'alpha_strategy');
  assert.equal(normalizeStrategyId(''), null);
  assert.equal(normalizeStrategyId(null), null);
});

test('Normalized - gateSpecialSymbols Comprehensive Gate', () => {
  // Safe input
  const safe = gateSpecialSymbols('BTC_USDT');
  assert.equal(safe.ok, true);
  assert.equal(safe.sanitized, 'BTC_USDT');

  // Forbidden symbols rejected
  const evil = gateSpecialSymbols('BTC; DROP TABLE orders; --');
  assert.equal(evil.ok, false);
  assert.match(evil.error, /forbidden special characters/);
  assert.deepEqual(evil.forbidden_chars, [';']);

  // Shell injection attempted
  const injection = gateSpecialSymbols('$(whoami)`id`');
  assert.equal(injection.ok, false);
  assert.ok(injection.forbidden_chars.includes('`'));
  assert.ok(injection.forbidden_chars.includes('$'));
  assert.ok(injection.forbidden_chars.includes('('));
  assert.ok(injection.forbidden_chars.includes(')'));

  // Option flag injection rejected by default
  const flag = gateSpecialSymbols('--verbose');
  assert.equal(flag.ok, false);
  assert.match(flag.error, /must not begin with a dash/);

  // Length overflow
  const overflow = gateSpecialSymbols('A'.repeat(60), { maxLength: 30 });
  assert.equal(overflow.ok, false);
  assert.match(overflow.error, /Length exceeds maximum/);

  // Non-printable ASCII
  const nonPrintable = gateSpecialSymbols('hello\x00world');
  assert.equal(nonPrintable.ok, false);

  // Non-string
  const nonStr = gateSpecialSymbols(12345);
  assert.equal(nonStr.ok, false);
  assert.equal(nonStr.error, 'Input must be a string');

  // Empty string with required: true
  const emptyReq = gateSpecialSymbols('   ', { required: true });
  assert.equal(emptyReq.ok, false);
  assert.match(emptyReq.error, /cannot be empty/);

  // Formula injection rejection when enabled
  const formula = gateSpecialSymbols('=cmd|calc', { rejectFormulaInjection: true });
  assert.equal(formula.ok, false);
  assert.match(formula.error, /formula trigger character/);
});

test('Normalized - CSV Formula Injection Gating & Sanitization (CWE-1236)', () => {
  // Detection
  assert.equal(isFormulaInjection('=1+1'), true);
  assert.equal(isFormulaInjection('+SUM(A1:A5)'), true);
  assert.equal(isFormulaInjection('-100'), true);
  assert.equal(isFormulaInjection('@HYPERLINK("http://evil.com")'), true);
  assert.equal(isFormulaInjection('\tmalicious'), true);
  assert.equal(isFormulaInjection('\rmalicious'), true);

  // Safe values
  assert.equal(isFormulaInjection('BTCUSDT'), false);
  assert.equal(isFormulaInjection('100.5'), false);
  assert.equal(isFormulaInjection(''), false);
  assert.equal(isFormulaInjection(null), false);
  assert.equal(isFormulaInjection(123), false);

  // Sanitization (OWASP single quote prefix)
  assert.equal(sanitizeCsvCell('=cmd|/C calc'), "'=cmd|/C calc");
  assert.equal(sanitizeCsvCell('+SUM(A1:A5)'), "'+SUM(A1:A5)");
  assert.equal(sanitizeCsvCell('-100'), "'-100");
  assert.equal(sanitizeCsvCell('@HYPERLINK'), "'@HYPERLINK");
  assert.equal(sanitizeCsvCell('BTCUSDT'), 'BTCUSDT');
  assert.equal(sanitizeCsvCell(123.45), '123.45');
  assert.equal(sanitizeCsvCell(null), '');
  assert.equal(sanitizeCsvCell(undefined), '');
});

