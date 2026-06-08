'use strict';

/**
 * Centralized asset picker for the Sovereign TUI.
 *
 * All commands that need symbol selection call pickAssets() instead of
 * reimplementing the two-step family-filter → symbol-select flow.
 *
 * Usage:
 *   const { pickAssets } = require('../tui/asset_picker');
 *
 *   // single symbol
 *   const symbol = await pickAssets({ label: 'Visualize' });
 *   if (!symbol) return { ok: false, error: 'Cancelled' };
 *
 *   // multi-symbol with pre-selection
 *   const symbols = await pickAssets({ multi: true, label: 'Backtest', preSelected: ['AAPL'] });
 *   if (!symbols) return { ok: false, error: 'Cancelled' };
 */

const { get_Full_Universe_Symbols, isRichTerminal } = require('../lib/utils');
const { promptMultiSelect, promptSelect } = require('./engine/engine');

/**
 * Build the hierarchical category → sector → symbol structure used in the picker.
 * Filters options, derivatives, and malformed entries automatically.
 */
function buildHierarchy(rawUniverse, selectedFamilies = [], filterFamilies = false) {
  const groups = {};
  for (const u of rawUniverse) {
    if (filterFamilies && selectedFamilies.length > 0 && !selectedFamilies.includes(u.family)) continue;
    if (!u.symbol || u.symbol.includes('_CALL') || u.symbol.includes('_PUT')) continue;

    const familyKey = (u.family || 'other').toUpperCase();
    const marketKey = u.market || 'GLOBAL';
    const category = `${familyKey}: ${marketKey}`;
    const sector = u.sector || u.family || 'Uncategorized';

    if (!groups[category]) groups[category] = {};
    if (!groups[category][sector]) groups[category][sector] = [];
    groups[category][sector].push(u);
  }
  return groups;
}

/**
 * Flatten a hierarchy into promptMultiSelect choices with sector headers.
 */
function buildChoices(groups, preSelected = []) {
  const choices = [];
  const preSet = new Set(preSelected);

  Object.keys(groups).sort().forEach(category => {
    const sectors = groups[category];
    Object.keys(sectors).sort().forEach(sector => {
      const items = sectors[sector];
      const sectorGroupKey = `${category}::${sector}`;
      const sectorLabel = sector.charAt(0).toUpperCase() + sector.slice(1).replace(/_/g, ' ');

      choices.push({
        label: `▸ ${sectorLabel}`,
        value: `__SECTOR:${category}:${sector}`,
        category,
        isSectorHeader: true,
        sectorGroup: sectorGroupKey,
      });

      [...items].sort((a, b) => a.symbol.localeCompare(b.symbol)).forEach(u => {
        choices.push({
          label: `  ${u.symbol}`,
          value: u.symbol,
          category,
          sectorGroup: sectorGroupKey,
        });
      });
    });
  });

  return choices;
}

/**
 * Resolve __SECTOR: prefixed values back to their constituent symbols.
 */
function resolveSectorValues(selected, groups) {
  const resolved = [];
  for (const s of selected) {
    if (s.startsWith('__SECTOR:')) {
      const [, cat1, cat2, sec] = s.split(':');
      const catKey = `${cat1}:${cat2}`;
      const sectorSymbols = (groups[catKey] && groups[catKey][sec]) || [];
      resolved.push(...sectorSymbols.map(u => u.symbol));
    } else {
      resolved.push(s);
    }
  }
  return [...new Set(resolved)].filter(Boolean);
}

/**
 * @param {object} opts
 * @param {string}   opts.label        — Label shown in the step header (e.g. 'Backtest')
 * @param {boolean}  [opts.multi]      — Allow multiple symbols (default false)
 * @param {string[]} [opts.preSelected]— Pre-checked symbols in multi mode
 * @param {number}   [opts.min]        — Minimum required symbols in multi mode (default 1)
 * @param {string[]} [opts.families]   — Skip family step and use these families directly
 * @param {string}   [opts.prompt]     — Override the symbol-step prompt text
 *
 * @returns {Promise<string|null>}        single mode — symbol string or null (cancelled)
 * @returns {Promise<string[]|null>}      multi mode  — array of symbols or null (cancelled)
 */
async function pickAssets(opts = {}) {
  const {
    label = 'Select',
    multi = false,
    preSelected = [],
    min = 1,
    families = null,
    prompt = null,
  } = opts;

  if (!isRichTerminal()) return null;

  let rawUniverse;
  try {
    rawUniverse = await get_Full_Universe_Symbols();
  } catch {
    rawUniverse = [];
  }

  // ── Step 1: optional family filter ───────────────────────────────────────
  let selectedFamilies = families ? [...families] : [];
  let filterFamilies = families !== null;

  if (!families) {
    const availableFamilies = [...new Set(rawUniverse.map(u => u.family).filter(Boolean))].sort();
    const familyChoices = availableFamilies.map(f => ({
      label: f.charAt(0).toUpperCase() + f.slice(1).replace(/_/g, ' '),
      value: f,
      category: '',
    }));

    if (familyChoices.length > 0) {
      console.log(`\n\x1b[1;36m${label}\x1b[0m \x1b[90m— Step 1 of 2: filter by family (none = all)\x1b[0m`);
      const picked = await promptMultiSelect('Include families:', familyChoices);
      if (picked === null) return null;
      selectedFamilies = picked;
      filterFamilies = picked.length > 0;
    }
  }

  // ── Step 2: symbol picker ─────────────────────────────────────────────────
  const groups = buildHierarchy(rawUniverse, selectedFamilies, filterFamilies);
  const choices = buildChoices(groups, preSelected);

  if (choices.length === 0) return multi ? [] : null;

  if (preSelected.length > 0) {
    const list = preSelected.slice(0, 4).join(', ') + (preSelected.length > 4 ? ` +${preSelected.length - 4}` : '');
    console.log(`\x1b[90mPre-selected: \x1b[36m${list}\x1b[90m — adjust freely\x1b[0m`);
  }

  console.log(`\x1b[1;36m${label}\x1b[0m \x1b[90m— Step 2 of 2: select symbol${multi ? 's' : ''}\x1b[0m`);

  if (multi) {
    const defaultPrompt = min > 1 ? `Select symbols (min ${min}):` : 'Select symbols:';
    const selected = await promptMultiSelect(prompt || defaultPrompt, choices, { initialValues: preSelected });
    if (selected === null) return null;
    const resolved = resolveSectorValues(selected, groups);
    return resolved.length >= min ? resolved : null;
  } else {
    const singleChoices = choices.filter(c => !c.isSectorHeader);
    const selected = await promptSelect(prompt || `Select symbol:`, singleChoices);
    return selected || null;
  }
}

module.exports = { pickAssets, buildHierarchy, buildChoices, resolveSectorValues };
