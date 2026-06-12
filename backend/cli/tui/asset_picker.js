'use strict';

/**
 * Centralized asset picker for the Sovereign TUI.
 *
 * All commands that need symbol selection call pickAssets() instead of
 * reimplementing the family-filter -> symbol-select flow.
 */

const { get_Full_Universe_Symbols, isRichTerminal } = require('../lib/utils');
const { normalizeFavoriteSymbols } = require('../../../shared/lib/settings/user_settings');
const { promptMultiSelect, promptSelect } = require('./engine/engine');
const A = require('../../../shared/lib/ui/ansi');

// ---------------------------------------------------------------------------
// Hierarchy cache — avoids re-fetching the full universe on repeated calls
// within the same process (e.g. multi-symbol workflows).  TTL: 60 seconds.
// ---------------------------------------------------------------------------
let _hierarchyCache = null;
let _hierarchyCacheAt = 0;
const HIERARCHY_CACHE_TTL_MS = 60_000;

function _getCachedUniverse() {
  const now = Date.now();
  if (_hierarchyCache && (now - _hierarchyCacheAt) < HIERARCHY_CACHE_TTL_MS) {
    return _hierarchyCache;
  }
  return null;
}

function _setCachedUniverse(value) {
  _hierarchyCache = value;
  _hierarchyCacheAt = Date.now();
}

/** Exposed for tests only — resets the in-process cache. */
function _clearHierarchyCache() {
  _hierarchyCache = null;
  _hierarchyCacheAt = 0;
}

/**
 * Render a step-header line using semantic ANSI codes.
 * e.g.  "Label - Step 1 of 2: filter by family (none = all)"
 */
function _stepHeader(label, step, total, hint) {
  return `\n${A.c(A.SEMANTIC.HEADER, label)} ${A.muted('- Step ' + step + ' of ' + total + ': ' + hint)}`;
}

/**
 * Build the hierarchical category -> sector -> symbol structure used in the picker.
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

  Object.keys(groups).sort().forEach((category) => {
    const sectors = groups[category];
    Object.keys(sectors).sort().forEach((sector) => {
      const items = sectors[sector];
      const sectorGroupKey = `${category}::${sector}`;
      const sectorLabel = sector.charAt(0).toUpperCase() + sector.slice(1).replace(/_/g, ' ');

      choices.push({
        label: `- ${sectorLabel}`,
        value: `__SECTOR:${category}:${sector}`,
        category,
        isSectorHeader: true,
        sectorGroup: sectorGroupKey,
      });

      [...items].sort((a, b) => a.symbol.localeCompare(b.symbol)).forEach((u) => {
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
      resolved.push(...sectorSymbols.map((u) => u.symbol));
    } else {
      resolved.push(s);
    }
  }
  return [...new Set(resolved)].filter(Boolean);
}

function buildSimpleChoices(universe = []) {
  return universe
    .slice()
    .sort((a, b) => {
      const famA = String(a.family || '').localeCompare(String(b.family || ''));
      if (famA !== 0) return famA;
      return String(a.symbol || '').localeCompare(String(b.symbol || ''));
    })
    .map((u) => ({
      label: `${u.symbol}${u.family ? `  (${String(u.family).toUpperCase()})` : ''}`,
      value: u.symbol,
      category: (u.family || 'Favorites').toUpperCase(),
    }));
}

/**
 * @param {object} opts
 * @param {string}   opts.label        Label shown in the step header.
 * @param {boolean}  [opts.multi]      Allow multiple symbols (default false)
 * @param {string[]} [opts.preSelected] Pre-checked symbols in multi mode
 * @param {number}   [opts.min]        Minimum required symbols in multi mode (default 1)
 * @param {string[]} [opts.families]   Skip family step and use these families directly
 * @param {string[]} [opts.favoriteSymbols] Favorite symbols source list
 * @param {string}   [opts.prompt]     Override the symbol-step prompt text
 *
 * @returns {Promise<string|null>}   single mode - symbol string or null (cancelled)
 * @returns {Promise<string[]|null>} multi mode  - array of symbols or null (cancelled)
 */
async function pickAssets(opts = {}) {
  const {
    label = 'Select',
    multi = false,
    preSelected = [],
    min = 1,
    families = null,
    favoriteSymbols = [],
    prompt = null,
  } = opts;

  if (!isRichTerminal()) return null;

  // Use cached universe when available to avoid redundant fetches.
  let rawUniverse = _getCachedUniverse();
  if (!rawUniverse) {
    try {
      rawUniverse = await get_Full_Universe_Symbols();
    } catch {
      rawUniverse = [];
    }
    _setCachedUniverse(rawUniverse);
  }

  const normalizedFavorites = normalizeFavoriteSymbols(favoriteSymbols);
  let sourceUniverse = rawUniverse;
  let selectedFamilies = families ? [...families] : [];
  let filterFamilies = families !== null;
  let skipFamilyStep = Boolean(families);

  if (normalizedFavorites.length > 0) {
    const favoriteSet = new Set(normalizedFavorites);
    const favoriteUniverse = rawUniverse.filter((u) => u && favoriteSet.has(u.symbol));
    if (favoriteUniverse.length > 0) {
      console.log(_stepHeader(label, 1, 2, 'choose symbol source'));
      const source = await promptSelect('Symbol source:', [
        { label: 'Favourite symbols', value: 'favorites' },
        { label: 'Browse all symbols', value: 'all' },
        { label: 'Cancel', value: 'cancel' },
      ]);
      if (source === 'cancel') return null;
      if (source === 'favorites') {
        sourceUniverse = favoriteUniverse;
        selectedFamilies = [...new Set(sourceUniverse.map((u) => u.family).filter(Boolean))];
        filterFamilies = true;
        skipFamilyStep = true;
      }
    }
  }

  // Step 1: optional family filter
  if (!skipFamilyStep) {
    const availableFamilies = [...new Set(sourceUniverse.map((u) => u.family).filter(Boolean))].sort();
    const familyChoices = availableFamilies.map((f) => ({
      label: f.charAt(0).toUpperCase() + f.slice(1).replace(/_/g, ' '),
      value: f,
      category: '',
    }));

    if (familyChoices.length > 0) {
      console.log(_stepHeader(label, 1, 2, 'filter by family (none = all)'));
      const picked = await promptMultiSelect('Include families:', familyChoices);
      if (picked === null) return null;
      selectedFamilies = picked;
      filterFamilies = picked.length > 0;
    }
  }

  // Step 2: symbol picker
  if (normalizedFavorites.length > 0 && skipFamilyStep) {
    const favoriteChoices = buildSimpleChoices(sourceUniverse);
    if (favoriteChoices.length === 0) return multi ? [] : null;

    console.log(_stepHeader(label, 2, 2, `select symbol${multi ? 's' : ''}`));
    if (multi) {
      const defaultPrompt = min > 1 ? `Select symbols (min ${min}):` : 'Select symbols:';
      const selected = await promptMultiSelect(prompt || defaultPrompt, favoriteChoices, { initialValues: preSelected });
      if (selected === null) return null;
      const resolved = [...new Set(selected)].filter(Boolean);
      return resolved.length >= min ? resolved : null;
    }
    const selected = await promptSelect(prompt || 'Select symbol:', favoriteChoices);
    return selected || null;
  }

  const groups = buildHierarchy(sourceUniverse, selectedFamilies, filterFamilies);
  const choices = buildChoices(groups, preSelected);

  if (choices.length === 0) return multi ? [] : null;

  if (preSelected.length > 0) {
    const list = preSelected.slice(0, 4).join(', ') + (preSelected.length > 4 ? ` +${preSelected.length - 4}` : '');
    console.log(`${A.muted('Pre-selected:')} ${A.c(A.CYAN, list)} ${A.muted('- adjust freely')}`);
  }

  console.log(_stepHeader(label, 2, 2, `select symbol${multi ? 's' : ''}`));

  if (multi) {
    const defaultPrompt = min > 1 ? `Select symbols (min ${min}):` : 'Select symbols:';
    const selected = await promptMultiSelect(prompt || defaultPrompt, choices, { initialValues: preSelected });
    if (selected === null) return null;
    const resolved = resolveSectorValues(selected, groups);
    return resolved.length >= min ? resolved : null;
  }

  const singleChoices = choices.filter((c) => !c.isSectorHeader);
  const selected = await promptSelect(prompt || 'Select symbol:', singleChoices);
  return selected || null;
}

module.exports = { pickAssets, buildHierarchy, buildChoices, resolveSectorValues, _clearHierarchyCache, _stepHeader };
