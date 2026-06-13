'use strict';

// ---------------------------------------------------------------------------
// render_helpers.js — pure render functions extracted from engine.js (W3).
//
// These helpers centralise the three near-identical render() bodies inside
// promptSelect, promptMultiSelect, and promptText.  All functions are pure
// (no side-effects, no process.stdout writes) so they are trivially testable.
//
// The ONE permitted visual change vs. the pre-W3 engine:
//   separator width = Math.min(process.stdout.columns || 80, 80)
//   instead of the previous hardcoded 80.
// On an 80-column (or wider) terminal output is byte-identical.
// ---------------------------------------------------------------------------

const A = require('../../../../shared/lib/ui/ansi');

/**
 * Compute the current separator width.
 * Cap at 80 so wide terminals do not produce very long lines.
 */
function sepWidth() {
  return Math.min(process.stdout.columns || 80, 80);
}

/**
 * Render a horizontal separator line.
 * @param {number} [width] - override; defaults to sepWidth().
 * @returns {string} separator line ending with \n
 */
function renderSeparator(width) {
  const w = (width !== undefined) ? width : sepWidth();
  return `${A.GRAY}${A.GLYPH.hline.repeat(w)}${A.RESET}\n`;
}

/**
 * Render the SOVEREIGN title bar for a prompt.
 * @param {string} question - the prompt question text
 * @param {string} time     - formatted time string
 * @param {object} [opts]
 * @param {number} [opts.selCount] - selected-item count to show after question
 * @returns {string} single line ending with \n
 */
function renderHeader(question, time, opts) {
  const selCount = (opts && opts.selCount) || 0;
  let line = `${A.c(A.SEMANTIC.HEADER, 'SOVEREIGN')} ${A.muted(`| ${time} |`)} ${A.c(A.BOLD, question)}`;
  if (selCount > 0) line += ` ${A.c(A.SEMANTIC.SELECTED, `(${selCount})`)}`;
  line += '\n';
  return line;
}

/**
 * Render the search bar / item-count line at the bottom of a prompt.
 * Mirrors the engine-local searchBar() function exactly.
 * @param {string}  filterText  - current filter text
 * @param {boolean} searchMode  - whether search mode is active
 * @param {number}  matchCount  - number of visible matches
 * @returns {string} search bar string (no trailing \n — caller adds it)
 */
function renderSearchBar(filterText, searchMode, matchCount) {
  const suffix = matchCount === 1 ? 'match' : 'matches';
  if (searchMode && filterText) {
    return `${A.c(A.B_CYAN, A.GLYPH.pointer)} ${A.c(A.BOLD, filterText)}${A.c(A.BLINK, '_')}  ${A.muted(`${matchCount} ${suffix}`)}`;
  }
  if (searchMode) {
    return `${A.c(A.B_CYAN, A.GLYPH.pointer)} ${A.muted('type to search...')}${A.c(A.BLINK, '_')}  ${A.muted(`(${matchCount} items)`)}`;
  }
  return A.muted(`${A.GLYPH.pointer} / to search...  (${matchCount} items)`);
}

/**
 * Render a single item row for promptSelect.
 * @param {object|string} item       - grouped item ({type, label, value, ...})
 * @param {boolean}       isSelected - whether this row has the cursor
 * @returns {string} row string ending with \n
 */
function renderSelectRow(item, isSelected) {
  if (item.type === 'header') {
    return `\n  ${A.c(A.B_YELLOW, `--- ${item.label.toUpperCase()} ---`)}\n`;
  }
  const label = item.label || item.value || item;
  const line = isSelected
    ? `  ${A.c(A.SEMANTIC.SELECTED, A.GLYPH.pointer)} ${A.c(A.SEMANTIC.VALUE, label)}`
    : `    ${label}`;
  return line + '\n';
}

/**
 * Render a single item row for promptMultiSelect.
 * @param {object}  item          - grouped item
 * @param {boolean} isSelected    - cursor on this row
 * @param {boolean} isChecked     - item is in selectedIndices (regular items)
 * @param {object}  [sectorState] - for sector headers: { selCount, total }
 * @param {object}  [selectAll]   - for select_all row: { allChecked }
 * @returns {string} row string ending with \n
 */
function renderMultiSelectRow(item, isSelected, isChecked, sectorState, selectAll) {
  if (item.type === 'select_all') {
    const allChecked = selectAll && selectAll.allChecked;
    const saPrefix = allChecked ? A.c(A.SEMANTIC.SELECTED, A.GLYPH.selected) : A.GLYPH.empty;
    const saLabel = allChecked ? 'Deselect All' : 'Select All';
    return isSelected
      ? `  ${A.c(A.SEMANTIC.SELECTED, A.GLYPH.pointer)} ${saPrefix} ${A.c(A.SEMANTIC.WARN, saLabel)}\n`
      : `    ${saPrefix} ${A.c(A.SEMANTIC.WARN, saLabel)}\n`;
  }

  if (item.type === 'header') {
    return `\n  ${A.c(A.B_YELLOW, `--- ${item.label.toUpperCase()} ---`)}\n`;
  }

  if (item.isSectorHeader) {
    const { selCount: sc = 0, total = 0 } = sectorState || {};
    const prefix = sc === total && total > 0
      ? A.c(A.SEMANTIC.SELECTED, A.GLYPH.selected)
      : sc > 0
        ? A.c(A.SEMANTIC.PARTIAL, A.GLYPH.partial)
        : A.GLYPH.empty;
    const label = item.label || item.value;
    return isSelected
      ? `  ${A.c(A.SEMANTIC.SELECTED, A.GLYPH.pointer)} ${prefix} ${A.c(A.B_YELLOW, label)}\n`
      : `    ${prefix} ${A.c(A.SEMANTIC.WARN, label)}\n`;
  }

  // Regular item
  const prefix = isChecked ? A.c(A.SEMANTIC.SELECTED, A.GLYPH.selected) : A.GLYPH.empty;
  const label = item.label || item.value;
  return isSelected
    ? `  ${A.c(A.SEMANTIC.SELECTED, A.GLYPH.pointer)} ${prefix} ${A.c(A.SEMANTIC.VALUE, label)}\n`
    : `    ${prefix} ${label}\n`;
}

// ---------------------------------------------------------------------------
// Help overlay — shows keybind reference when user presses '?'.
// Rendered in-place via the same line-counting repaint model so that
// CUR_SAVE/CUR_RESTORE (broken on Windows ConPTY) are never emitted.
// ---------------------------------------------------------------------------

const HELP_KEYBINDS_SELECT = [
  ['Up / Down',  'Move selection'],
  ['Enter',      'Confirm'],
  ['/',          'Enter search'],
  ['Backspace',  'Delete search char'],
  ['ESC',        'Cancel / clear search'],
  ['?',          'Show this help (any key to close)'],
];

const HELP_KEYBINDS_MULTI = [
  ['Up / Down',  'Move cursor'],
  ['Space',      'Toggle selection'],
  ['Enter',      'Confirm'],
  ['/',          'Enter search'],
  ['Backspace',  'Delete search char'],
  ['ESC',        'Cancel / clear search'],
  ['?',          'Show this help (any key to close)'],
];

/**
 * Render the ? help overlay.
 * @param {string}   question   - current prompt question (shown in header)
 * @param {string}   time       - formatted time
 * @param {'select'|'multi'} mode
 * @returns {string} rendered buffer (no side effects)
 */
function renderHelpOverlay(question, time, mode) {
  const binds = mode === 'multi' ? HELP_KEYBINDS_MULTI : HELP_KEYBINDS_SELECT;
  const w = sepWidth();
  let buffer = '';
  buffer += renderHeader(question, time);
  buffer += renderSeparator(w);
  buffer += `  ${A.c(A.SEMANTIC.HEADER, 'Keyboard shortcuts')}\n`;
  buffer += '\n';
  for (const [key, desc] of binds) {
    const keyCol = A.c(A.SEMANTIC.VALUE, key.padEnd(14));
    buffer += `    ${keyCol}  ${A.muted(desc)}\n`;
  }
  buffer += '\n';
  buffer += renderSeparator(w);
  buffer += `  ${A.muted('Press any key to close help.')}\n`;
  return buffer;
}

module.exports = {
  sepWidth,
  renderSeparator,
  renderHeader,
  renderSearchBar,
  renderSelectRow,
  renderMultiSelectRow,
  renderHelpOverlay,
  HELP_KEYBINDS_SELECT,
  HELP_KEYBINDS_MULTI,
};
