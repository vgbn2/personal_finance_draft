const fs = require('node:fs/promises');
const path = require('node:path');

/**
 * Robust recursive YAML parser for Sovereign configuration files.
 * Handles nested objects and [a, b, c] lists.
 */
function parseYamlList(raw) {
  const match = raw.match(/\[(.*)\]/);
  if (!match) return [];
  return match[1]
    .split(',')
    .map((item) => item.trim().replace(/^"|"$/g, ''))
    .filter(Boolean);
}

function parseYamlRecursive(lines, startLine = 0, targetIndent = 0) {
  const result = {};
  let i = startLine;
  while (i < lines.length) {
    const line = lines[i];
    const indent = line.match(/^\s*/)?.[0].length || 0;
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('#')) { i++; continue; }
    if (indent < targetIndent) return [result, i];

    if (indent === targetIndent) {
      const [key, ...valParts] = trimmed.split(':');
      const val = valParts.join(':').trim();
      const cleanKey = key.trim();

      if (val === '') {
        // Look ahead past blank/comment lines to determine if child is list or object
        let la = i + 1;
        while (la < lines.length && (!lines[la].trim() || lines[la].trim().startsWith('#'))) la++;

        const laLine = la < lines.length ? lines[la] : '';
        const laIndent = laLine.match(/^\s*/)?.[0].length || 0;
        const laTrimmed = laLine.trim();

        if (la < lines.length && laIndent > indent && (laTrimmed.startsWith('- ') || laTrimmed === '-')) {
          // Block list: collect all `- item` lines at the child indent level
          const listIndent = laIndent;
          const items = [];
          let c = i + 1;
          while (c < lines.length) {
            const ct = lines[c].trim();
            if (!ct || ct.startsWith('#')) { c++; continue; }
            const ci = lines[c].match(/^\s*/)?.[0].length || 0;
            if (ci < listIndent) break;
            if (ci === listIndent) {
              const m = ct.match(/^-\s*(.*)$/);
              if (m) items.push(m[1].replace(/^["']|["']$/g, '').trim());
            }
            c++;
          }
          result[cleanKey] = items;
          i = c;
        } else if (la < lines.length && laIndent > indent) {
          // Nested object — recurse
          const [subObj, nextI] = parseYamlRecursive(lines, i + 1, indent + 2);
          result[cleanKey] = subObj;
          i = nextI;
        } else {
          result[cleanKey] = '';
          i++;
        }
      } else {
        const cleanVal = val.replace(/^["']|["']$/g, '');
        let finalVal;
        if (cleanVal === 'true') finalVal = true;
        else if (cleanVal === 'false') finalVal = false;
        else if (cleanVal !== '' && !Number.isNaN(Number(cleanVal))) finalVal = Number(cleanVal);
        else finalVal = cleanVal;
        result[cleanKey] = val.startsWith('[') ? parseYamlList(val) : finalVal;
        i++;
      }
    } else {
      i++;
    }
  }
  return [result, i];
}

/**
 * Loads the main market data configuration.
 */
async function loadMarketConfig(configPath) {
  const content = await fs.readFile(configPath, 'utf8');
  const lines = content.split(/\r?\n/);
  const [fullConfig] = parseYamlRecursive(lines);
  
  const sources = fullConfig.sources || {};
  const families = [
    'equities', 'indices', 'commodities', 'fx', 'quote_feeds', 'crypto',
    'pmi', 'macro', 'macro_alt', 'breadth', 'sentiment', 'onchain',
    'prediction_market', 'weather', 'flight', 'crypto_tx', 'satellite_nrt',
    'cargo', 'holdings', 'reserves'
  ];
  families.forEach(f => {
    if (!sources[f]) sources[f] = { enabled: false, providers: [], symbols: [], timeframes: [] };
  });

  return {
    ...sources,
    fred_mappings: fullConfig.fred_mappings || {},
    world_bank_mappings: fullConfig.world_bank_mappings || {},
    prediction_market_keywords: fullConfig.prediction_market_keywords || {},
    breadth_ratios: fullConfig.breadth_ratios || {},
    quality: fullConfig.quality || {}
  };
}

module.exports = {
  parseYamlList,
  parseYamlRecursive,
  loadMarketConfig
};
