'use strict';

// ---------------------------------------------------------------------------
// W4 — Dynamic page-size derivation unit tests.
//
// Tests the pure derivePageSize(cap, rows, chromeLines) function that converts
// terminal height + preset cap into an effective page size.
// ---------------------------------------------------------------------------

const test = require('node:test');
const assert = require('node:assert/strict');

const { _test } = require('../../../../backend/cli/tui/engine');
const { layoutConfig } = require('../../../../shared/lib/settings/runtime');

const { derivePageSize } = _test;

// ---------------------------------------------------------------------------
// Core derivation logic
// ---------------------------------------------------------------------------

test('derivePageSize: non-TTY (undefined rows) returns preset cap unchanged', () => {
  assert.equal(derivePageSize(10, undefined), 10);
  assert.equal(derivePageSize(8, undefined), 8);
  assert.equal(derivePageSize(16, undefined), 16);
});

test('derivePageSize: rows=0 (non-TTY edge) returns preset cap', () => {
  assert.equal(derivePageSize(10, 0), 10);
});

test('derivePageSize: derives from rows minus default chrome (4)', () => {
  // rows=24, cap=10 → derived=24-4=20 → clamped to cap=10
  assert.equal(derivePageSize(10, 24), 10);
  // rows=15, cap=14 → derived=15-4=11 → clamped by cap=14 → 11
  assert.equal(derivePageSize(14, 15), 11);
});

test('derivePageSize: minimum is 5 even when rows is very small', () => {
  // rows=8, cap=20 → derived=8-4=4 → floored to 5
  assert.equal(derivePageSize(20, 8), 5);
  // rows=6, cap=20 → derived=6-4=2 → floored to 5
  assert.equal(derivePageSize(20, 6), 5);
  // rows=5 → derived=1 → floored to 5
  assert.equal(derivePageSize(20, 5), 5);
});

test('derivePageSize: cap wins when terminal is large', () => {
  // rows=100, cap=12 → derived=96 → capped at 12
  assert.equal(derivePageSize(12, 100), 12);
});

test('derivePageSize: derived equals cap exactly', () => {
  // rows=14, cap=10 → derived=14-4=10 → exactly cap
  assert.equal(derivePageSize(10, 14), 10);
});

test('derivePageSize: custom chromeLines override', () => {
  // rows=24, cap=20, chrome=6 → derived=24-6=18 → 18 (< cap)
  assert.equal(derivePageSize(20, 24, 6), 18);
  // rows=24, cap=10, chrome=6 → derived=18 → capped at 10
  assert.equal(derivePageSize(10, 24, 6), 10);
});

test('derivePageSize: all three layout presets behave as caps', () => {
  // Simulate compact layout on a 30-row terminal
  const compact = layoutConfig({ layout: 'compact' });
  assert.equal(derivePageSize(compact.selectPageSize, 30), compact.selectPageSize);     // 8
  assert.equal(derivePageSize(compact.multiSelectPageSize, 30), compact.multiSelectPageSize); // 10

  // Research layout on a 20-row terminal
  const research = layoutConfig({ layout: 'research' });
  // rows=20 → derived=20-4=16 → selectPageSize cap=14 → capped at 14
  assert.equal(derivePageSize(research.selectPageSize, 20), 14);
  // multiSelectPageSize cap=16 → derived=16 exactly → 16
  assert.equal(derivePageSize(research.multiSelectPageSize, 20), 16);

  // Default layout on a 12-row terminal
  const def = layoutConfig({ layout: 'default' });
  // rows=12 → derived=12-4=8 → less than cap 10 → 8
  assert.equal(derivePageSize(def.selectPageSize, 12), 8);
});

test('layoutConfig preset values are unchanged by W4 (default presets)', () => {
  const c = layoutConfig({ layout: 'compact' });
  assert.equal(c.selectPageSize, 8);
  assert.equal(c.multiSelectPageSize, 10);

  const r = layoutConfig({ layout: 'research' });
  assert.equal(r.selectPageSize, 14);
  assert.equal(r.multiSelectPageSize, 16);

  const d = layoutConfig({});
  assert.equal(d.selectPageSize, 10);
  assert.equal(d.multiSelectPageSize, 12);
});

test('derivePageSize: non-TTY null rows treated same as undefined', () => {
  assert.equal(derivePageSize(12, null), 12);
});
