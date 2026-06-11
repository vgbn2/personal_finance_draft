#!/usr/bin/env node

const { classifyStrategyAssetMode, formatStrategyAssetModeLabel, normalizeStrategyUniverse } = require('../shared/lib/strategy_registry');
const { inspectStrategyFile, readStrategyRegistry } = require('../backend/cli/commands/strategy');

function parseArgs(argv) {
  const args = {
    json: false,
    mode: null,
    strategy: null,
    registryPath: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--json') {
      args.json = true;
    } else if (token === '--mode') {
      args.mode = String(argv[index + 1] || '').trim() || null;
      index += 1;
    } else if (token === '--strategy') {
      args.strategy = String(argv[index + 1] || '').trim() || null;
      index += 1;
    } else if (token === '--registry') {
      args.registryPath = String(argv[index + 1] || '').trim() || null;
      index += 1;
    }
  }

  return args;
}

function classifyFile(filePath) {
  const info = inspectStrategyFile(filePath);
  if (!info.exists) {
    return {
      path: filePath,
      exists: false,
      ok: false,
      error: 'missing_file',
      universe_size: 0,
      asset_mode: 'single_asset',
      asset_mode_label: 'Single Asset',
    };
  }

  const assetMode = classifyStrategyAssetMode(info);
  return {
    path: info.path,
    name: info.name || null,
    kind: info.kind || null,
    family: info.family || null,
    lane: info.lane || null,
    role: info.role || null,
    grade: info.grade || null,
    score: Number.isFinite(Number(info.score)) ? Number(info.score) : null,
    ok: info.ok !== false,
    enabled: info.enabled === true,
    universe: normalizeStrategyUniverse(info),
    universe_size: normalizeStrategyUniverse(info).length,
    asset_mode: assetMode,
    asset_mode_label: formatStrategyAssetModeLabel(assetMode),
    issues: info.issues || [],
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const entries = args.strategy
    ? [classifyFile(args.strategy)]
    : readStrategyRegistry({ registryPath: args.registryPath }).map(classifyFile);

  const filtered = args.mode
    ? entries.filter((entry) => entry.asset_mode === args.mode)
    : entries;

  const payload = {
    ok: true,
    count: filtered.length,
    total: entries.length,
    mode: args.mode || null,
    strategies: filtered,
  };

  if (args.json) {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    return 0;
  }

  console.log('Strategy Asset Classification');
  console.log('-----------------------------');
  if (args.mode) {
    console.log(`Filter: ${args.mode}`);
  }
  for (const entry of filtered) {
    console.log(`${entry.asset_mode_label} | ${entry.path} | ${entry.universe_size} assets`);
  }
  console.log(`Total: ${filtered.length} / ${entries.length}`);
  return 0;
}

if (require.main === module) {
  process.exitCode = main();
}

module.exports = {
  parseArgs,
  classifyFile,
  main,
};
