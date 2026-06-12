'use strict';

// ---------------------------------------------------------------------------
// W3 — Render-helper frame-identity fixture test.
//
// Asserts that render_helpers.js produces byte-identical output to the
// inline render logic that was previously inside engine.js promptSelect and
// promptMultiSelect.  The ONE permitted change (separator width from
// Math.min(process.stdout.columns || 80, 80)) produces 80-char separators
// on an 80-col terminal, so output is byte-identical at that column width.
// ---------------------------------------------------------------------------

const test = require('node:test');
const assert = require('node:assert/strict');

const A = require('../../../shared/lib/ui/ansi');
const RH = require('../../../backend/cli/tui/engine/render_helpers');

// Force 80-column terminal for all tests in this file.
const origColumns = Object.getOwnPropertyDescriptor(process.stdout, 'columns');
function setColumns(n) {
  Object.defineProperty(process.stdout, 'columns', { get: () => n, configurable: true });
}

// ---------------------------------------------------------------------------
// Inline reference implementations (pre-W3 logic, unchanged)
// ---------------------------------------------------------------------------
function refSeparator(width) {
  return `${A.GRAY}${A.GLYPH.hline.repeat(width)}${A.RESET}\n`;
}

function refSearchBar(filterText, searchMode, matchCount) {
  const suffix = matchCount === 1 ? 'match' : 'matches';
  if (searchMode && filterText) {
    return `${A.c(A.B_CYAN, A.GLYPH.pointer)} ${A.c(A.BOLD, filterText)}${A.c(A.BLINK, '_')}  ${A.muted(`${matchCount} ${suffix}`)}`;
  }
  if (searchMode) {
    return `${A.c(A.B_CYAN, A.GLYPH.pointer)} ${A.muted('type to search...')}${A.c(A.BLINK, '_')}  ${A.muted(`(${matchCount} items)`)}`;
  }
  return A.muted(`${A.GLYPH.pointer} / to search...  (${matchCount} items)`);
}

function refHeaderSelect(question, time) {
  return `${A.c(A.SEMANTIC.HEADER, 'SOVEREIGN')} ${A.muted(`| ${time} |`)} ${A.c(A.BOLD, question)}\n`;
}

function refHeaderMultiSelect(question, time, selCount) {
  let line = `${A.c(A.SEMANTIC.HEADER, 'SOVEREIGN')} ${A.muted(`| ${time} |`)} ${A.c(A.BOLD, question)}`;
  if (selCount > 0) line += ` ${A.c(A.SEMANTIC.SELECTED, `(${selCount})`)}`;
  line += '\n';
  return line;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const TIME = '12:00:00';
const QUESTION = 'Select Category:';

const SELECT_OPTIONS = [
  { type: 'item', label: 'Option A', value: 'a' },
  { type: 'item', label: 'Option B', value: 'b' },
  { type: 'header', label: 'Cat2' },
  { type: 'item', label: 'Option C', value: 'c' },
];

const MULTI_OPTIONS = [
  { type: 'select_all' },
  { type: 'header', label: 'Cat1' },
  { type: 'item', label: 'Option A', value: 'a' },
  { type: 'item', label: 'Option B', value: 'b' },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('renderSeparator produces byte-identical output to inline separator(80) at 80 cols', () => {
  setColumns(80);
  const ref = refSeparator(80);
  const got = RH.renderSeparator();
  assert.equal(got, ref, 'separator mismatch');
});

test('renderSeparator caps at 80 even on wide terminals', () => {
  setColumns(200);
  const got = RH.renderSeparator();
  const ref = refSeparator(80);
  assert.equal(got, ref, 'separator should cap at 80 on wide terminals');
  setColumns(80);
});

test('renderSeparator respects narrow terminals (<80 cols)', () => {
  setColumns(40);
  const got = RH.renderSeparator();
  const ref = refSeparator(40);
  assert.equal(got, ref, 'separator should use terminal width on narrow terminal');
  setColumns(80);
});

test('renderHeader (select) byte-identical to pre-W3 header at 80 cols', () => {
  setColumns(80);
  const ref = refHeaderSelect(QUESTION, TIME);
  const got = RH.renderHeader(QUESTION, TIME);
  assert.equal(got, ref);
});

test('renderHeader (multiselect with selCount) byte-identical to pre-W3 header', () => {
  setColumns(80);
  const ref = refHeaderMultiSelect(QUESTION, TIME, 3);
  const got = RH.renderHeader(QUESTION, TIME, { selCount: 3 });
  assert.equal(got, ref);
});

test('renderSearchBar byte-identical to pre-W3 searchBar (idle mode)', () => {
  const ref = refSearchBar('', false, 5);
  const got = RH.renderSearchBar('', false, 5);
  assert.equal(got, ref);
});

test('renderSearchBar byte-identical to pre-W3 searchBar (search active, no text)', () => {
  const ref = refSearchBar('', true, 5);
  const got = RH.renderSearchBar('', true, 5);
  assert.equal(got, ref);
});

test('renderSearchBar byte-identical to pre-W3 searchBar (search active with text)', () => {
  const ref = refSearchBar('btc', true, 2);
  const got = RH.renderSearchBar('btc', true, 2);
  assert.equal(got, ref);
});

test('renderSearchBar singular match count uses "match" not "matches"', () => {
  const got = RH.renderSearchBar('x', true, 1);
  const plain = got.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');
  assert.match(plain, /1 match$/);
});

test('promptSelect frame byte-identical at 80 cols (W3 refactor vs reference)', () => {
  setColumns(80);
  const selectedIndex = 0;
  const filteredLen = 3;

  // Reference frame (pre-W3 inline logic)
  let ref = refHeaderSelect(QUESTION, TIME);
  ref += refSeparator(80);
  SELECT_OPTIONS.forEach((item, i) => {
    const isSelected = i === selectedIndex;
    if (item.type === 'header') {
      ref += `\n  ${A.c(A.B_YELLOW, `--- ${item.label.toUpperCase()} ---`)}\n`;
    } else {
      const line = isSelected
        ? `  ${A.c(A.SEMANTIC.SELECTED, A.GLYPH.pointer)} ${A.c(A.SEMANTIC.VALUE, item.label || item.value)}`
        : `    ${item.label || item.value}`;
      ref += line + '\n';
    }
  });
  ref += refSeparator(80);
  ref += `  ${refSearchBar('', false, filteredLen)}\n`;

  // W3 refactored frame
  let got = RH.renderHeader(QUESTION, TIME);
  got += RH.renderSeparator();
  SELECT_OPTIONS.forEach((item, i) => {
    got += RH.renderSelectRow(item, i === selectedIndex);
  });
  got += RH.renderSeparator();
  got += `  ${RH.renderSearchBar('', false, filteredLen)}\n`;

  assert.equal(got, ref, 'promptSelect frame must be byte-identical after W3 refactor');
});

test('promptMultiSelect frame byte-identical at 80 cols (W3 refactor vs reference)', () => {
  setColumns(80);
  const selectedIndex = 2; // Option A is focused
  const selectedIndices = new Set([1]); // resolvedOptions[1] = Option B is checked
  const selCount = selectedIndices.size;
  const filteredLen = 2;

  // Reference frame (pre-W3 inline logic)
  let ref = refHeaderMultiSelect(QUESTION, TIME, selCount);
  ref += refSeparator(80);
  MULTI_OPTIONS.forEach((item, i) => {
    const isSelected = i === selectedIndex;
    if (item.type === 'select_all') {
      const allChecked = false;
      const saPrefix = allChecked ? A.c(A.SEMANTIC.SELECTED, A.GLYPH.selected) : A.GLYPH.empty;
      const saLabel = allChecked ? 'Deselect All' : 'Select All';
      ref += isSelected
        ? `  ${A.c(A.SEMANTIC.SELECTED, A.GLYPH.pointer)} ${saPrefix} ${A.c(A.SEMANTIC.WARN, saLabel)}\n`
        : `    ${saPrefix} ${A.c(A.SEMANTIC.WARN, saLabel)}\n`;
    } else if (item.type === 'header') {
      ref += `\n  ${A.c(A.B_YELLOW, `--- ${item.label.toUpperCase()} ---`)}\n`;
    } else {
      const foundIdx = item.value === 'a' ? 0 : 1;
      const isChecked = selectedIndices.has(foundIdx);
      const prefix = isChecked ? A.c(A.SEMANTIC.SELECTED, A.GLYPH.selected) : A.GLYPH.empty;
      ref += isSelected
        ? `  ${A.c(A.SEMANTIC.SELECTED, A.GLYPH.pointer)} ${prefix} ${A.c(A.SEMANTIC.VALUE, item.label || item.value)}\n`
        : `    ${prefix} ${item.label || item.value}\n`;
    }
  });
  ref += refSeparator(80);
  ref += `  ${refSearchBar('', false, filteredLen)}\n`;

  // W3 refactored frame
  let got = RH.renderHeader(QUESTION, TIME, { selCount });
  got += RH.renderSeparator();
  MULTI_OPTIONS.forEach((item, i) => {
    const isSelected = i === selectedIndex;
    if (item.type === 'select_all') {
      got += RH.renderMultiSelectRow(item, isSelected, false, null, { allChecked: false });
    } else if (item.type === 'header') {
      got += RH.renderMultiSelectRow(item, isSelected, false, null, null);
    } else {
      const foundIdx = item.value === 'a' ? 0 : 1;
      const isChecked = selectedIndices.has(foundIdx);
      got += RH.renderMultiSelectRow(item, isSelected, isChecked, null, null);
    }
  });
  got += RH.renderSeparator();
  got += `  ${RH.renderSearchBar('', false, filteredLen)}\n`;

  assert.equal(got, ref, 'promptMultiSelect frame must be byte-identical after W3 refactor');
});

// Restore original columns descriptor on exit
test.after(() => {
  if (origColumns) {
    Object.defineProperty(process.stdout, 'columns', origColumns);
  }
});
