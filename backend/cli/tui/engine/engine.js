const readline = require('node:readline');
const MANIFEST = require('../manifest');
const A = require('../../../../shared/lib/ui/ansi');
const { formatTimeForSettings, layoutConfig } = require('../../../../shared/lib/settings/runtime');
const { registerCtrlCPress } = require('../../lib/exit_guard');
const { renderSigmaSparkline, renderCorrelationHeatmap, centerCell } = require('../visualizations');
const {
  renderSeparator,
  renderHeader,
  renderSearchBar: renderSearchBarHelper,
  renderSelectRow,
  renderMultiSelectRow,
  renderHelpOverlay,
} = require('./render_helpers');

let _authEmail = null;
function setAuthEmail(email) { _authEmail = email; }

let _statusLine = null;
function setStatusLine(line) { _statusLine = line; }

// Count visual lines a buffer occupies, accounting for terminal line-wrap.
// Strips ANSI escape codes before measuring so colour sequences don't inflate widths.
function visualLineCount(buf) {
  const cols = (process.stdout.columns || 80);
  const stripped = buf.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');
  const lines = stripped.split('\n');
  // A buffer ending in \n produces a trailing empty element — don't count it
  // as a visual line, only as the newline that moved the cursor down.
  if (lines[lines.length - 1] === '') lines.pop();
  let count = 0;
  for (const line of lines) {
    count += Math.max(1, Math.ceil((line.length || 0) / cols));
  }
  return count;
}

/**
 * TUI ENGINE
 * 
 * Generic interactive primitives (Select, Text, Confirm) and the main 
 * category/command navigation loop.
 */

function isRichTerminal() {
  if (process.env.SOVEREIGN_FORCE_TUI === 'true') return true;
  return process.stdout.isTTY && !process.env.CI;
}

// Set by callers (e.g. the Ink dashboard's in-pane child spawns) whose stdin
// is a piped, never-written, never-closed pipe -- without this, the non-TTY
// readline fallback below still blocks on rl.question() forever instead of
// erroring or returning. Also doubles as the AI-testability bypass: any test
// runner can set this to get guaranteed non-blocking prompt resolution.
function isNonInteractive() {
  return process.env.SOVEREIGN_NONINTERACTIVE === 'true';
}

// ---------------------------------------------------------------------------
// W4 — Dynamic page-size derivation.
//
// Preset values from layoutConfig() are now treated as *caps* (maximum).
// On a live TTY the effective page size is derived from the terminal height:
//   effectivePageSize = clamp(rows - chromeLines, 5, cap)
// On non-TTY (CI, pipe, --json) process.stdout.rows is undefined and the
// preset cap is returned unchanged, preserving prior behavior.
//
// chromeLines: number of non-list rows the prompt renders
//   (title + top-sep + bottom-sep + search = 4 for both prompts).
// ---------------------------------------------------------------------------
const CHROME_LINES = 4;

/**
 * Derive effective page size from terminal rows and a preset cap.
 * Pure function — no side effects.
 *
 * @param {number} cap         - maximum page size (preset from layoutConfig)
 * @param {number|undefined} rows - process.stdout.rows (undefined in non-TTY)
 * @param {number} [chromeLines]  - non-list rows the prompt occupies (default 4)
 * @returns {number} effective page size
 */
function derivePageSize(cap, rows, chromeLines) {
  const chrome = (chromeLines !== undefined) ? chromeLines : CHROME_LINES;
  if (!rows || rows <= 0) return cap;  // non-TTY: fall back to preset
  const derived = rows - chrome;
  return Math.max(5, Math.min(cap, derived));
}

function paint(code, text) {
  return A.c(code, text);
}

function separator(width) {
  return renderSeparator(width);
}

function searchBar(filterText, searchMode, matchCount) {
  return renderSearchBarHelper(filterText, searchMode, matchCount);
}

function searchText(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function optionSearchText(option) {
  return searchText([
    option.label,
    option.value,
    option.category,
    option.sectorGroup,
  ].filter(Boolean).join(' '));
}

function optionSearchFields(option) {
  return [
    option.label,
    option.value,
    option.category,
    option.sectorGroup,
  ].filter(Boolean).map(searchText).filter(Boolean);
}

function searchTerms(filterText) {
  return String(filterText || '')
    .split(/&+/)
    .map(searchText)
    .filter(Boolean);
}

function matchesSearch(option, filterText) {
  const terms = searchTerms(filterText);
  if (!terms.length) return true;
  const targets = optionSearchFields(option);
  return terms.some(term => targets.some(target => target.includes(term)));
}

function groupedOptions(options, filterText) {
  const filtered = options.filter(o => matchesSearch(o, filterText));
  const grouped = [];
  let lastCat = null;
  filtered.forEach(o => {
    if (o.category && o.category !== lastCat) {
      grouped.push({ type: 'header', label: o.category });
      lastCat = o.category;
    }
    grouped.push({ type: 'item', ...o });
  });
  return { filtered, grouped };
}

function optionValue(option) {
  return option && option.value !== undefined ? option.value : option;
}

function uniqueValues(values) {
  const seen = new Set();
  return values.filter(value => {
    const key = String(value);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildCustomSelection(options, filterText) {
  const terms = searchTerms(filterText);
  const selectable = options.filter(option => !option.isSectorHeader);
  const custom = [];
  const missing = [];

  for (const term of terms) {
    const matches = selectable.filter(option =>
      optionSearchFields(option).some(target => target.includes(term)));
    if (matches.length === 0) {
      missing.push(term);
    } else {
      custom.push(...matches.map(optionValue));
    }
  }

  return {
    terms,
    custom: uniqueValues(custom),
    missing: uniqueValues(missing)
  };
}

function customSelectionBar(customState) {
  if (!customState.terms.length) return '';
  const custom = customState.custom.slice(0, 8).join(', ');
  const more = customState.custom.length > 8 ? ` +${customState.custom.length - 8} more` : '';
  const missing = customState.missing.length
    ? ` ${paint(A.SEMANTIC.ERROR, `Missing: ${customState.missing.join(', ')}`)}`
    : '';
  const useText = customState.custom.length
    ? `${paint(A.SEMANTIC.SUCCESS, `Custom: ${custom}${more}`)}`
    : paint(A.SEMANTIC.WARN, 'Custom: no selectable matches');
  return `  ${useText}${missing}\n`;
}

function keyTokens(input) {
  const text = String(input || '');
  const tokens = [];
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === A.KEY_ESC && text[index + 1] === '[' && text[index + 2]) {
      tokens.push(text.slice(index, index + 3));
      index += 2;
    } else {
      tokens.push(text[index]);
    }
  }
  return tokens;
}

async function promptMultiSelect(question, options, { initialValues = [] } = {}) {
  if (isNonInteractive()) return initialValues;
  process.stdin.removeAllListeners('data');
  process.stdin.removeAllListeners('keypress');
  process.stdin.removeAllListeners('line');
  process.stdin.removeAllListeners('data');
  process.stdin.removeAllListeners('keypress');
  process.stdin.removeAllListeners('line');
  if (process.stdin.setRawMode) process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding('utf8');

  let selectedIndex = 0;
  let filterText = '';
  let searchMode = false;
  let helpMode = false;
  const rawOptions = typeof options === 'function' ? await options() : options;
  const resolvedOptions = rawOptions.map(o => (typeof o === 'object' ? o : { label: String(o), value: o }));
  const initSet = new Set(initialValues);
  const selectedIndices = new Set(
    resolvedOptions.reduce((acc, o, i) => { if (initSet.has(o.value)) acc.push(i); return acc; }, [])
  );

  const PAGE_SIZE = derivePageSize(layoutConfig().multiSelectPageSize, process.stdout.rows);
  let scrollOffset = 0;

  return new Promise(resolve => {
    let prevLineCount = 0;

    const getFiltered = () => resolvedOptions.filter(o => matchesSearch(o, filterText));

    const buildGrouped = () => {
      const filtered = getFiltered();
      const groups = filtered.length > 0 ? [{ type: 'select_all' }] : [];
      let lastCat = null;
      filtered.forEach(o => {
        if (o.category && o.category !== lastCat) { groups.push({ type: 'header', label: o.category }); lastCat = o.category; }
        groups.push({ type: 'item', ...o });
      });
      return groups;
    };

    const getFilteredIndices = () =>
      getFiltered().map(fi => resolvedOptions.findIndex(o => o.value === fi.value && o.label === fi.label)).filter(i => i >= 0);

    const render = () => {
      const time = formatTimeForSettings();
      if (helpMode) {
        const buffer = renderHelpOverlay(question, time, 'multi');
        if (prevLineCount > 0) {
          process.stdout.write(`\x1b[${prevLineCount}A`);
          process.stdout.write('\x1b[J');
        }
        process.stdout.write(buffer);
        prevLineCount = visualLineCount(buffer);
        return;
      }
      const grouped = buildGrouped();
      const customState = buildCustomSelection(resolvedOptions, filterText);
      if (selectedIndex >= grouped.length) selectedIndex = Math.max(0, grouped.length - 1);
      while (grouped[selectedIndex]?.type === 'header' && selectedIndex < grouped.length - 1) selectedIndex++;
      if (selectedIndex < scrollOffset) scrollOffset = selectedIndex;
      else if (selectedIndex >= scrollOffset + PAGE_SIZE) scrollOffset = selectedIndex - PAGE_SIZE + 1;
      const visible = grouped.slice(scrollOffset, scrollOffset + PAGE_SIZE);
      let buffer = '';
      const selCount = selectedIndices.size;
      // Title bar
      buffer += renderHeader(question, time, { selCount });
      buffer += separator();
      const matchCount = filterText
        ? getFiltered().filter(o => !o.isSectorHeader).length
        : resolvedOptions.filter(o => !o.isSectorHeader).length;
      const searchDisplay = searchBar(filterText, searchMode, matchCount);
      if (visible.length === 0) {
        buffer += `    ${A.muted('No matches')}\n`;
      }
      visible.forEach((item, i) => {
        const actualIndex = i + scrollOffset;
        const isSelected = actualIndex === selectedIndex;
        if (item.type === 'select_all') {
          const fi = getFilteredIndices();
          const allChecked = fi.length > 0 && fi.every(idx => selectedIndices.has(idx));
          buffer += renderMultiSelectRow(item, isSelected, false, null, { allChecked });
        } else if (item.isSectorHeader) {
          // Tri-state sector header: shows selected/total child count
          const childIndices = resolvedOptions.reduce((acc, o, idx) => {
            if (o.sectorGroup === item.sectorGroup && !o.isSectorHeader) acc.push(idx);
            return acc;
          }, []);
          const sc = childIndices.filter(idx => selectedIndices.has(idx)).length;
          const total = childIndices.length;
          buffer += renderMultiSelectRow(item, isSelected, false, { selCount: sc, total }, null);
        } else {
          const foundIdx = resolvedOptions.findIndex(o => o.value === item.value && o.label === item.label);
          const isChecked = selectedIndices.has(foundIdx);
          buffer += renderMultiSelectRow(item, isSelected, isChecked, null, null);
        }
      });
      buffer += separator();
      if (searchMode && filterText) buffer += customSelectionBar(customState);
      buffer += `  ${searchDisplay}\n`;
      // Line-counting redraw: reliable on Windows ConPTY where CUR_SAVE/CUR_RESTORE fail.
      if (prevLineCount > 0) {
        process.stdout.write(`\x1b[${prevLineCount}A`); // move cursor up
        process.stdout.write('\x1b[J');                  // clear to end of screen
      }
      process.stdout.write(buffer);
      prevLineCount = visualLineCount(buffer);
    };

    render();

    const handleKey = (key) => {
      // '?' toggles help overlay; any other key dismisses it (Ctrl-C falls
      // through to the normal exit path so help cannot swallow it).
      if (helpMode && key !== A.KEY_CTRL_C) { helpMode = false; render(); return; }
      if (helpMode) { helpMode = false; }
      if (key === '?') { helpMode = true; render(); return; }

      const isEnter = /[\r\n]/.test(key);
      const isControl = key === A.KEY_CTRL_C || isEnter || key === A.KEY_ESC || key === A.KEY_BS || key === '\b' || key === ' ';
      const isArrow = key === A.KEY_UP || key === A.KEY_DOWN;
      const isPrintable = key.length === 1 && key >= ' ' && key <= '~' && key !== ' ';
      if (!isControl && !isArrow && !isPrintable) return;

      if (key === A.KEY_CTRL_C) {
        const shouldExit = registerCtrlCPress();
        process.stdout.write('\n');
        if (shouldExit) {
          process.stdin.removeListener('data', onData);
          if (process.stdin.setRawMode) process.stdin.setRawMode(false);
          process.exit(130);
        } else {
          process.stdout.write('Press Ctrl+C again to exit.\n');
          render();
        }
      } else if (key === A.KEY_ESC) {
        if (searchMode && filterText.length > 0) {
          filterText = ''; selectedIndex = 1; render();
        } else if (searchMode) {
          searchMode = false; selectedIndex = 0; render();
        } else {
          process.stdin.removeListener('data', onData);
          if (process.stdin.setRawMode) process.stdin.setRawMode(false);
          process.stdout.write('\n');
          resolve(null);
        }
      } else if (key === A.KEY_BS || key === '\b') {
        if (searchMode) { filterText = filterText.slice(0, -1); selectedIndex = filterText.length > 0 ? 1 : 0; render(); }
      } else if (isPrintable && key === '/') {
        if (!searchMode) { searchMode = true; selectedIndex = 1; render(); }
        else { selectedIndex = filterText.length > 0 ? 1 : 0; render(); }
      } else if (isPrintable) {
        if (searchMode) { filterText += key; selectedIndex = 1; render(); }
      } else if (key === ' ') {
        const grouped = buildGrouped();
        const item = grouped[selectedIndex];
        if (item?.type === 'select_all') {
          const fi = getFilteredIndices();
          const allChecked = fi.length > 0 && fi.every(idx => selectedIndices.has(idx));
          if (allChecked) fi.forEach(idx => selectedIndices.delete(idx));
          else fi.forEach(idx => selectedIndices.add(idx));
        } else if (item?.type === 'item' && item?.isSectorHeader) {
          const childIndices = resolvedOptions.reduce((acc, o, idx) => {
            if (o.sectorGroup === item.sectorGroup && !o.isSectorHeader) acc.push(idx);
            return acc;
          }, []);
          const allChecked = childIndices.length > 0 && childIndices.every(idx => selectedIndices.has(idx));
          if (allChecked) childIndices.forEach(idx => selectedIndices.delete(idx));
          else childIndices.forEach(idx => selectedIndices.add(idx));
        } else if (item?.type === 'item') {
          const origIdx = resolvedOptions.findIndex(o => o.value === item.value && o.label === item.label);
          if (selectedIndices.has(origIdx)) selectedIndices.delete(origIdx); else selectedIndices.add(origIdx);
        }
        render();
      } else if (key === A.KEY_UP) {
        const grouped = buildGrouped();
        if (grouped.length === 0) return;
        let nextIdx = selectedIndex;
        do { nextIdx = nextIdx > 0 ? nextIdx - 1 : grouped.length - 1; }
        while (grouped[nextIdx]?.type === 'header' && grouped.length > 1);
        selectedIndex = nextIdx; render();
      } else if (key === A.KEY_DOWN) {
        const grouped = buildGrouped();
        if (grouped.length === 0) return;
        let nextIdx = selectedIndex;
        do { nextIdx = nextIdx < grouped.length - 1 ? nextIdx + 1 : 0; }
        while (grouped[nextIdx]?.type === 'header' && grouped.length > 1);
        selectedIndex = nextIdx; render();
      } else if (isEnter) {
        process.stdin.removeListener('data', onData);
        if (process.stdin.setRawMode) process.stdin.setRawMode(false);
        process.stdout.write('\n');
        const customState = buildCustomSelection(resolvedOptions, filterText);
        const shouldUseCustom = searchMode && filterText && customState.custom.length > 0;
        resolve(shouldUseCustom
          ? customState.custom
          : Array.from(selectedIndices).map(idx => optionValue(resolvedOptions[idx])));
      }
    };
    const onData = (chunk) => {
      for (const key of keyTokens(chunk)) handleKey(key);
    };
    process.stdin.on('data', onData);
  });

}

async function promptSelect(question, options) {
  if (isNonInteractive()) {
    const resolved = typeof options === 'function' ? await options() : options;
    const first = resolved[0];
    return first && first.value !== undefined ? first.value : first;
  }
  if (!isRichTerminal()) {
    console.log(`\n? ${question}`);
    const resolved = typeof options === 'function' ? await options() : options;
    resolved.forEach((opt, i) => console.log(`${i + 1}) ${opt.label || opt}`));
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise(resolve => {
      rl.question('Select number: ', (answer) => {
        rl.close();
        const idx = parseInt(answer, 10) - 1;
        const selected = resolved[idx] || resolved[0];
        resolve(selected.value !== undefined ? selected.value : selected);
      });
    });
  }

  if (process.stdin.setRawMode) process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding('utf8');

  let selectedIndex = 0;
  let filterText = '';
  let searchMode = false;
  let helpMode = false;
  const rawOptions = typeof options === 'function' ? await options() : options;

  // Normalize options to object shape
  const resolvedOptions = rawOptions.map(o => {
    if (typeof o === 'object' && o !== null) return o;
    return { label: String(o), value: o };
  });

  const PAGE_SIZE = derivePageSize(layoutConfig().selectPageSize, process.stdout.rows);
  let scrollOffset = 0;

  return new Promise(resolve => {
    let prevLineCount = 0;

    const getGrouped = () => groupedOptions(resolvedOptions, filterText);

    const render = () => {
      const time = formatTimeForSettings();
      if (helpMode) {
        const buffer = renderHelpOverlay(question, time, 'select');
        if (prevLineCount > 0) {
          process.stdout.write(`\x1b[${prevLineCount}A`);
          process.stdout.write('\x1b[J');
        }
        process.stdout.write(buffer);
        prevLineCount = visualLineCount(buffer);
        return;
      }

      const { filtered, grouped } = getGrouped();

      if (selectedIndex >= grouped.length) selectedIndex = Math.max(0, grouped.length - 1);
      while (grouped[selectedIndex]?.type === 'header' && selectedIndex < grouped.length - 1) selectedIndex++;

      if (selectedIndex < scrollOffset) scrollOffset = selectedIndex;
      else if (selectedIndex >= scrollOffset + PAGE_SIZE) scrollOffset = selectedIndex - PAGE_SIZE + 1;

      const visible = grouped.slice(scrollOffset, scrollOffset + PAGE_SIZE);

      let buffer = '';

      buffer += renderHeader(question, time);
      buffer += separator();
      if (visible.length === 0) {
        buffer += `    ${A.muted('No matches')}\n`;
      }

      for (let i = 0; i < visible.length; i++) {
        const item = visible[i];
        const isSelected = (i + scrollOffset) === selectedIndex;
        buffer += renderSelectRow(item, isSelected);
      }
      buffer += separator();
      buffer += `  ${searchBar(filterText, searchMode, filtered.length)}\n`;

      if (prevLineCount > 0) {
        process.stdout.write(`\x1b[${prevLineCount}A`);
        process.stdout.write('\x1b[J');
      }
      process.stdout.write(buffer);
      prevLineCount = visualLineCount(buffer);
    };

    render();

    const handleKey = (key) => {
      // '?' toggles help overlay; any other key dismisses it (Ctrl-C falls
      // through to the normal exit path so help cannot swallow it).
      if (helpMode && key !== A.KEY_CTRL_C) { helpMode = false; render(); return; }
      if (helpMode) { helpMode = false; }
      if (key === '?') { helpMode = true; render(); return; }

      // Recognize standard keys
      const isEnter = /[\r\n]/.test(key);
      const isControl = key === A.KEY_CTRL_C || isEnter || key === A.KEY_ESC || key === A.KEY_BS || key === '\b';
      const isArrow = key === A.KEY_UP || key === A.KEY_DOWN;
      const isPrintable = key.length === 1 && key >= ' ' && key <= '~' && key !== ' ';

      if (!isControl && !isArrow && !isPrintable) return;

      if (key === A.KEY_CTRL_C) { process.exit(0); }
      else if (key === A.KEY_ESC) {
        if (searchMode && filterText.length > 0) {
          filterText = '';
          selectedIndex = 0;
          render();
        } else if (searchMode) {
          searchMode = false;
          selectedIndex = 0;
          render();
        } else {
          process.stdin.removeListener('data', onData);
          if (process.stdin.setRawMode) process.stdin.setRawMode(false);
          process.stdout.write('\n');
          resolve(null);
        }
      } else if (key === A.KEY_BS || key === '\b') {
        if (searchMode) {
          filterText = filterText.slice(0, -1);
          selectedIndex = 0;
          render();
        }
      } else if (isPrintable && key === '/') {
        if (!searchMode) {
          searchMode = true;
          selectedIndex = 0;
          render();
        } else {
          selectedIndex = 0;
          render();
        }
      } else if (isPrintable) {
        if (searchMode) {
          filterText += key;
          selectedIndex = 0;
          render();
        }
      } else if (key === A.KEY_UP) {
        const { grouped } = getGrouped();
        if (grouped.length === 0) return;
        // Skip headers when navigating
        let nextIdx = selectedIndex;
        do {
            nextIdx = (nextIdx > 0) ? nextIdx - 1 : grouped.length - 1;
        } while (grouped[nextIdx]?.type === 'header' && grouped.length > 1);
        selectedIndex = nextIdx;
        render();
      } else if (key === A.KEY_DOWN) {
        const { grouped } = getGrouped();
        if (grouped.length === 0) return;
        let nextIdx = selectedIndex;
        do {
            nextIdx = (nextIdx < grouped.length - 1) ? nextIdx + 1 : 0;
        } while (grouped[nextIdx]?.type === 'header' && grouped.length > 1);
        selectedIndex = nextIdx;
        render();
      } else if (isEnter) {
        process.stdin.removeListener('data', onData);
        if (process.stdin.setRawMode) process.stdin.setRawMode(false);
        process.stdout.write('\n');
        const { grouped } = getGrouped();
        const finalSelection = grouped[selectedIndex];
        resolve(finalSelection && finalSelection.type === 'item'
          ? (finalSelection.value !== undefined ? finalSelection.value : finalSelection)
          : null);
      }
    };
    const onData = (chunk) => {
      for (const key of keyTokens(chunk)) handleKey(key);
    };
    process.stdin.on('data', onData);
  });
}

async function promptText(question, defaultValue = '') {
  if (isNonInteractive()) return defaultValue;
  if (!isRichTerminal()) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise(resolve => {
      rl.question(`? ${question} ${defaultValue ? `(${defaultValue}) ` : ''}`, answer => { rl.close(); resolve(answer.trim() || defaultValue); });
    });
  }
  // Pure raw-mode: no readline. Fixes stdin drift from repeated raw/cooked cycling.
  process.stdin.removeAllListeners('data');
  process.stdin.removeAllListeners('keypress');
  process.stdin.removeAllListeners('line');
  if (process.stdin.setRawMode) process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding('utf8');
  let input = '';
  process.stdout.write(`${paint(A.SEMANTIC.HEADER, '?')} ${paint(A.BOLD, question)} ${defaultValue ? `${A.muted(`(${defaultValue})`)} ` : ''}`);
  return new Promise(resolve => {
    const onKey = (key) => {
      if (/[\r\n]/.test(key)) {
        process.stdin.removeListener('data', onData);
        if (process.stdin.setRawMode) process.stdin.setRawMode(false);
        process.stdout.write('\n');
        resolve(input.trim() || defaultValue);
        return true;
      } else if (key === A.KEY_CTRL_C) {
        process.exit(0);
      } else if (key === A.KEY_BS || key === '\b' || key === '\x7f') {
        if (input.length > 0) { input = input.slice(0, -1); process.stdout.write('\b \b'); }
      } else if (key.length === 1 && key >= ' ') {
        input += key; process.stdout.write(key);
      }
      return false;
    };
    // A single 'data' chunk can carry multiple keystrokes (fast typing, paste, or
    // terminal coalescing) — tokenize before dispatching, like promptSelect does,
    // or multi-char chunks get silently dropped (key.length === 1 never matches).
    const onData = (chunk) => {
      for (const key of keyTokens(chunk)) {
        if (onKey(key)) break;
      }
    };
    process.stdin.on('data', onData);
  });
}

async function promptConfirm(question) {
  // Explicit check (not just delegating to promptSelect's non-interactive
  // path) -- a destructive action must default to "No", not promptSelect's
  // generic "first option" rule, which here would be "Yes".
  if (isNonInteractive()) return false;
  return await promptSelect(question, [
    { label: 'Yes', value: true },
    { label: 'No', value: false }
  ]);
}

async function resolveFlags(flags) {
  const finalArgs = [];
  if (!flags) return finalArgs;

  for (const [flagKey, spec] of Object.entries(flags)) {
    let value;
    const label = spec.label || flagKey;
    if (spec.type === 'select') {
      value = await promptSelect(`${label}:`, spec.options);
    } else if (spec.type === 'text') {
      value = await promptText(`${label}:`, spec.default);
      if (spec.required && !value) {
        process.stdout.write(`\n${paint(A.SEMANTIC.ERROR, `${A.GLYPH.warning} ${label} is required.`)}\n`);
        return null;
      }
    } else if (spec.type === 'confirm') {
      value = await promptConfirm(label);
    }

    if (value !== undefined && value !== false) {
      if (flagKey.startsWith('--')) {
        finalArgs.push(flagKey);
        if (value !== true) finalArgs.push(String(value));
      } else {
        finalArgs.push(String(value));
      }
    }
  }
  return finalArgs;
}

function postCommandActionForKey(key) {
  if (/[\r\n]/.test(key)) return 'menu';
  const normalized = String(key || '').toLowerCase();
  if (normalized === 'r') return 'rerun';
  if (normalized === 'b' || key === A.KEY_ESC) return 'back';
  if (key === A.KEY_CTRL_C) return 'exit';
  return null;
}

async function waitForPostCommandAction() {
  process.stdin.removeAllListeners('data');
  process.stdin.removeAllListeners('keypress');
  process.stdin.removeAllListeners('line');
  if (process.stdin.setRawMode) process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding('utf8');
  return new Promise(resolve => {
    const onKey = (key) => {
      const action = postCommandActionForKey(key);
      if (!action) return;
      process.stdin.removeListener('data', onKey);
      if (process.stdin.setRawMode) process.stdin.setRawMode(false);
      process.stdout.write('\n');
      if (action === 'exit') process.exit(0);
      resolve(action);
    };
    process.stdin.on('data', onKey);
  });
}

function clearScreen() {
  // \x1b[2J clears visible screen, \x1b[3J clears scrollback, \x1b[H moves to home.
  // More reliable than console.clear() on Windows ConPTY.
  process.stdout.write('\x1b[2J\x1b[3J\x1b[H');
}

async function runInteractiveMenu(handleCommand) {
  clearScreen();
  console.log(`${paint(A.SEMANTIC.HEADER, 'SOVEREIGN TERMINAL')} ${A.muted('v1.2.2')}`);
  console.log(`${A.muted('Navigate with Up/Down arrows and Enter.')}\n`);

  let lastFullArgs = null;

  while (true) {
    const categories = MANIFEST.categories || [];
    const categoryChoices = [
      ...(lastFullArgs ? [{ label: `↩  Rerun: ${lastFullArgs.join(' ')}`, value: '__rerun__' }] : []),
      ...categories.map(c => ({ label: c.label, value: c.id })),
      { label: 'Exit', value: 'exit' }
    ];
    const categoryId = await promptSelect('Select Category:', categoryChoices);

    if (categoryId === 'exit') {
      console.log('Exiting Sovereign CLI.');
      process.exit(0);
    }

    // Global R: rerun last command directly from category menu
    if (categoryId === '__rerun__' && lastFullArgs) {
      let action = 'rerun';
      while (action === 'rerun') {
        clearScreen();
        console.log(`${paint(A.SEMANTIC.HEADER, 'SOVEREIGN')} ${A.muted(`> ${lastFullArgs.join(' ')}`)}\n`);
        try {
          await handleCommand(lastFullArgs);
        } catch (error) {
          console.error(`${paint(A.SEMANTIC.ERROR, 'Error:')} ${error.message}`);
        }
        process.stdout.write(`\n${A.muted(A.GLYPH.hline.repeat(60))}\n`);
        process.stdout.write(A.muted('  Enter: menu | R: rerun function | B/Esc: back'));
        action = await waitForPostCommandAction();
      }
      clearScreen();
      continue;
    }

    let returnToCategoryMenu = true;
    while (returnToCategoryMenu) {
      const commandList = (MANIFEST.commands && MANIFEST.commands[categoryId]) || [];
      const commandChoices = [
        ...commandList.map(c => ({ label: c.label, value: c })),
        { label: '< Back', value: 'back' }
      ];
      const categorySpec = MANIFEST.categories.find(c => c.id === categoryId);
      const commandSpec = await promptSelect(`${categorySpec.label}:`, commandChoices);

      if (commandSpec === 'back') break;

      const extraArgs = await resolveFlags(commandSpec.flags);
      if (extraArgs === null) continue;

      const fullArgs = [...(commandSpec.prefix || []), commandSpec.id, ...extraArgs];
      lastFullArgs = fullArgs;
      let action = 'rerun';

      while (action === 'rerun') {
        clearScreen();
        console.log(`${paint(A.SEMANTIC.HEADER, 'SOVEREIGN')} ${A.muted(`> ${fullArgs.join(' ')}`)}\n`);

        try {
          await handleCommand(fullArgs);
        } catch (error) {
          console.error(`${paint(A.SEMANTIC.ERROR, 'Error:')} ${error.message}`);
        }

        process.stdout.write(`\n${A.muted(A.GLYPH.hline.repeat(60))}\n`);
        process.stdout.write(A.muted('  Enter: menu | R: rerun function | B/Esc: back'));
        action = await waitForPostCommandAction();
      }

      clearScreen();
      returnToCategoryMenu = action === 'back';
    }
  }
}


module.exports = {
  promptSelect,
  promptMultiSelect,
  promptText,
  promptConfirm,
  runInteractiveMenu,
  setAuthEmail,
  setStatusLine,
  isRichTerminal,
  renderSigmaSparkline,
  renderCorrelationHeatmap,
  _test: {
    searchText,
    optionSearchText,
    optionSearchFields,
    searchTerms,
    matchesSearch,
    groupedOptions,
    keyTokens,
    postCommandActionForKey,
    centerCell,
    buildCustomSelection,
    derivePageSize,
  }
};
