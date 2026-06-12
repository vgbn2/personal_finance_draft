'use strict';

// Phase B contract tests:
//   1. ansi.js richGlyph / GLYPH_RICH exports
//   2. asset_picker hierarchy cache
//   3. render_helpers renderHelpOverlay
//   4. manifest label tuning (edge-decay double-space removed)

const test = require('node:test');
const assert = require('node:assert/strict');

// ---------------------------------------------------------------------------
// 1. ansi.js — new exports
// ---------------------------------------------------------------------------

const A = require('../../shared/lib/ui/ansi');

test('ansi.js exports GLYPH_RICH with dline and indicator keys', () => {
  assert.ok(A.GLYPH_RICH, 'GLYPH_RICH should be exported');
  assert.equal(typeof A.GLYPH_RICH.dline, 'string');
  assert.equal(typeof A.GLYPH_RICH.indicator, 'string');
  // Rich values should be the Unicode chars
  assert.equal(A.GLYPH_RICH.dline, '═');
  assert.equal(A.GLYPH_RICH.indicator, '■');
});

test('ansi.js exports richGlyph function', () => {
  assert.equal(typeof A.richGlyph, 'function');
});

test('richGlyph returns ASCII fallback when isRichFn returns false', () => {
  const ascii = A.richGlyph('dline', () => false);
  assert.equal(ascii, A.GLYPH.dline);  // '='
});

test('richGlyph returns Unicode when isRichFn returns true', () => {
  const rich = A.richGlyph('dline', () => true);
  assert.equal(rich, '═');
});

test('richGlyph returns ASCII fallback when no isRichFn provided', () => {
  const fallback = A.richGlyph('indicator');
  assert.equal(fallback, A.GLYPH.indicator);  // '*'
});

test('richGlyph falls back gracefully for unknown keys', () => {
  const val = A.richGlyph('nonexistent_key', () => true);
  assert.equal(val, 'nonexistent_key');
});

test('GLYPH still has ASCII dline and indicator fallbacks', () => {
  assert.equal(A.GLYPH.dline, '=');
  assert.equal(A.GLYPH.indicator, '*');
});

// ---------------------------------------------------------------------------
// 2. asset_picker — hierarchy cache
// ---------------------------------------------------------------------------

const { _clearHierarchyCache, _stepHeader } = require('../../backend/cli/tui/asset_picker');

test('asset_picker exports _clearHierarchyCache', () => {
  assert.equal(typeof _clearHierarchyCache, 'function');
  // Should not throw
  _clearHierarchyCache();
});

test('asset_picker exports _stepHeader helper', () => {
  assert.equal(typeof _stepHeader, 'function');
});

test('_stepHeader renders label and step info without raw escape literals', () => {
  // The output uses A.c() which wraps with ANSI codes; we just check structure.
  const header = _stepHeader('TestLabel', 1, 2, 'filter by family');
  // Should contain the label text
  assert.ok(header.includes('TestLabel'), 'should contain label');
  // Should contain step text
  assert.ok(header.includes('Step 1 of 2'), 'should contain step info');
  assert.ok(header.includes('filter by family'), 'should contain hint');
});

// ---------------------------------------------------------------------------
// 3. render_helpers — renderHelpOverlay
// ---------------------------------------------------------------------------

const { renderHelpOverlay, HELP_KEYBINDS_SELECT, HELP_KEYBINDS_MULTI } = require('../../backend/cli/tui/engine/render_helpers');

test('render_helpers exports renderHelpOverlay', () => {
  assert.equal(typeof renderHelpOverlay, 'function');
});

test('render_helpers exports HELP_KEYBINDS_SELECT and HELP_KEYBINDS_MULTI arrays', () => {
  assert.ok(Array.isArray(HELP_KEYBINDS_SELECT));
  assert.ok(Array.isArray(HELP_KEYBINDS_MULTI));
  assert.ok(HELP_KEYBINDS_SELECT.length > 0);
  assert.ok(HELP_KEYBINDS_MULTI.length > 0);
});

test('HELP_KEYBINDS_SELECT contains ? entry', () => {
  const hasHelp = HELP_KEYBINDS_SELECT.some(([key]) => key.includes('?'));
  assert.ok(hasHelp, 'SELECT keybinds should include ? entry');
});

test('HELP_KEYBINDS_MULTI contains Space entry', () => {
  const hasSpace = HELP_KEYBINDS_MULTI.some(([key]) => key.toLowerCase().includes('space'));
  assert.ok(hasSpace, 'MULTI keybinds should include Space entry');
});

test('renderHelpOverlay returns a non-empty string for select mode', () => {
  const overlay = renderHelpOverlay('Test question', '12:00:00', 'select');
  assert.equal(typeof overlay, 'string');
  assert.ok(overlay.length > 0);
  assert.ok(overlay.includes('Keyboard shortcuts'));
  assert.ok(overlay.includes('any key to close'));
});

test('renderHelpOverlay returns a non-empty string for multi mode', () => {
  const overlay = renderHelpOverlay('Test question', '12:00:00', 'multi');
  assert.equal(typeof overlay, 'string');
  assert.ok(overlay.includes('Keyboard shortcuts'));
  assert.ok(overlay.includes('Space'));
});

test('renderHelpOverlay does not emit CUR_SAVE or CUR_RESTORE sequences', () => {
  const overlay = renderHelpOverlay('Test', '12:00:00', 'select');
  // ESC[s = CUR_SAVE, ESC[u = CUR_RESTORE — both broken on Windows ConPTY
  assert.ok(!overlay.includes('\x1b[s'), 'must not emit CUR_SAVE');
  assert.ok(!overlay.includes('\x1b[u'), 'must not emit CUR_RESTORE');
});

// ---------------------------------------------------------------------------
// 4. manifest label tuning
// ---------------------------------------------------------------------------

const manifest = require('../../backend/cli/tui/manifest');

test('manifest edge-decay label has no double space', () => {
  const edgeDecay = manifest.commands.research.find((entry) => entry.id === 'edge-decay');
  assert.ok(edgeDecay, 'edge-decay command should exist');
  assert.ok(!edgeDecay.label.includes('  '), 'label should not contain double spaces');
});

test('manifest backend status and stats have args array', () => {
  const status = manifest.commands.backend.find((e) => e.id === 'status');
  const stats = manifest.commands.backend.find((e) => e.id === 'stats');
  assert.ok(status && Array.isArray(status.args), 'backend status should have args: []');
  assert.ok(stats && Array.isArray(stats.args), 'backend stats should have args: []');
});
