'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const A = require('../../../../shared/lib/ui/ansi');

// ---------------------------------------------------------------------------
// W2 — SEMANTIC color map contract
// Asserts that every key defined in the spec exists in SEMANTIC and maps to
// one of the raw ANSI codes also exported by ansi.js (so no orphan strings).
// ---------------------------------------------------------------------------

const EXPECTED_KEYS = ['HEADER', 'SELECTED', 'SUCCESS', 'WARN', 'PARTIAL', 'ERROR', 'MUTED', 'VALUE'];

// All raw color codes that SEMANTIC values should map to.
const VALID_CODES = new Set([
  A.RED, A.GREEN, A.YELLOW, A.BLUE, A.CYAN, A.WHITE,
  A.B_RED, A.B_GREEN, A.B_YELLOW, A.B_BLUE, A.B_MAGENTA, A.B_CYAN, A.B_WHITE,
  A.GRAY, A.BOLD, A.DIM,
]);

test('SEMANTIC map is exported from shared/lib/ui/ansi.js', () => {
  assert.ok(A.SEMANTIC, 'SEMANTIC should be exported');
  assert.equal(typeof A.SEMANTIC, 'object');
});

test('SEMANTIC map contains all required keys', () => {
  for (const key of EXPECTED_KEYS) {
    assert.ok(Object.prototype.hasOwnProperty.call(A.SEMANTIC, key),
      `SEMANTIC.${key} should exist`);
  }
});

test('SEMANTIC values map to known ANSI codes', () => {
  for (const [key, value] of Object.entries(A.SEMANTIC)) {
    assert.ok(VALID_CODES.has(value),
      `SEMANTIC.${key} = ${JSON.stringify(value)} is not a known ANSI code`);
  }
});

test('SEMANTIC does not shadow existing ansi.js exports', () => {
  // Adding SEMANTIC must not have removed any previously exported names.
  const REQUIRED_EXPORTS = [
    'ESC', 'RESET', 'BOLD', 'GRAY', 'RED', 'GREEN', 'YELLOW', 'CYAN',
    'B_CYAN', 'B_GREEN', 'B_YELLOW', 'B_RED',
    'GLYPH', 'c', 'bold', 'muted', 'status', 'statusColor',
    'KEY_ESC', 'KEY_CTRL_C', 'KEY_UP', 'KEY_DOWN', 'KEY_BS',
  ];
  for (const name of REQUIRED_EXPORTS) {
    assert.ok(name in A, `Export '${name}' must still be present after W2 changes`);
  }
});

test('SEMANTIC.HEADER resolves to bold-cyan (B_CYAN)', () => {
  assert.equal(A.SEMANTIC.HEADER, A.B_CYAN);
});

test('SEMANTIC.SELECTED and SEMANTIC.SUCCESS resolve to green (GREEN)', () => {
  assert.equal(A.SEMANTIC.SELECTED, A.GREEN);
  assert.equal(A.SEMANTIC.SUCCESS, A.GREEN);
});

test('SEMANTIC.WARN and SEMANTIC.PARTIAL resolve to yellow (YELLOW)', () => {
  assert.equal(A.SEMANTIC.WARN, A.YELLOW);
  assert.equal(A.SEMANTIC.PARTIAL, A.YELLOW);
});

test('SEMANTIC.ERROR resolves to red (RED)', () => {
  assert.equal(A.SEMANTIC.ERROR, A.RED);
});

test('SEMANTIC.MUTED resolves to gray (GRAY)', () => {
  assert.equal(A.SEMANTIC.MUTED, A.GRAY);
});

test('SEMANTIC.VALUE resolves to bold-white (B_WHITE)', () => {
  assert.equal(A.SEMANTIC.VALUE, A.B_WHITE);
});
