#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const REPO_ROOT = path.resolve(__dirname, '../../..');
const SOURCE_EXPORT = path.join(REPO_ROOT, 'tools', 'mt5', 'SovereignExport.mq5');
const SOURCE_BRIDGE = path.join(REPO_ROOT, 'tools', 'mt5', 'SovereignTradeBridge.mq5');

function resolveTerminalRoots() {
  const roots = [];
  const terminalId = process.env.MT5_TERMINAL_ID;
  if (terminalId && process.env.APPDATA) {
    const candidate = path.join(process.env.APPDATA, 'MetaQuotes', 'Terminal', terminalId);
    if (fs.existsSync(candidate)) roots.push(candidate);
  }

  // Discover Wine AppData terminals
  const wineAppdata = path.join(os.homedir(), '.mt5', 'drive_c', 'users');
  if (fs.existsSync(wineAppdata)) {
    try {
      for (const user of fs.readdirSync(wineAppdata)) {
        const termBase = path.join(wineAppdata, user, 'AppData', 'Roaming', 'MetaQuotes', 'Terminal');
        if (fs.existsSync(termBase)) {
          for (const item of fs.readdirSync(termBase)) {
            const mql5 = path.join(termBase, item, 'MQL5');
            if (fs.existsSync(mql5) && !roots.includes(path.join(termBase, item))) {
              roots.push(path.join(termBase, item));
            }
          }
        }
      }
    } catch {}
  }

  // Discover direct terminal path from profiles or default Program Files
  try {
    const { getDefaultMt5TerminalPath } = require(path.join(REPO_ROOT, 'shared', 'lib', 'profiles', 'mt5_profiles'));
    const terminal = getDefaultMt5TerminalPath();
    if (terminal) {
      const termDir = path.dirname(terminal);
      const mql5Dir = path.join(termDir, 'MQL5');
      if (fs.existsSync(mql5Dir) && !roots.includes(termDir)) roots.push(termDir);
    }
  } catch {}

  const defaultProgFiles = path.join(os.homedir(), '.mt5', 'drive_c', 'Program Files', 'MetaTrader 5');
  if (fs.existsSync(path.join(defaultProgFiles, 'MQL5')) && !roots.includes(defaultProgFiles)) {
    roots.push(defaultProgFiles);
  }

  return roots;
}

function resolveMetaEditor(terminalRoot) {
  if (process.env.MT5_METAEDITOR_PATH && fs.existsSync(process.env.MT5_METAEDITOR_PATH)) {
    return process.env.MT5_METAEDITOR_PATH;
  }
  if (terminalRoot) {
    const direct = path.join(terminalRoot, 'MetaEditor64.exe');
    if (fs.existsSync(direct)) return direct;
  }
  const defaultProgFiles = path.join(os.homedir(), '.mt5', 'drive_c', 'Program Files', 'MetaTrader 5', 'MetaEditor64.exe');
  if (fs.existsSync(defaultProgFiles)) return defaultProgFiles;

  try {
    const { findTool } = require(path.join(REPO_ROOT, 'shared', 'lib', 'runtime', 'paths'));
    return findTool('metatrader5', 'MT5_METAEDITOR_PATH');
  } catch {}
  return null;
}

function compileMql5(metaeditor, targetFile, terminalRoot) {
  if (!metaeditor || !fs.existsSync(metaeditor)) return null;

  const isWine = process.platform !== 'win32' && metaeditor.toLowerCase().endsWith('.exe');
  const spawnBin = isWine ? 'wine' : metaeditor;
  const relFile = terminalRoot ? path.relative(terminalRoot, targetFile).replace(/\//g, '\\') : targetFile;
  const spawnArgs = isWine ? [metaeditor, `/compile:${relFile}`] : [`/compile:${targetFile}`];
  const spawnEnv = { ...process.env };
  if (isWine && metaeditor.includes('.mt5')) {
    spawnEnv.WINEPREFIX = spawnEnv.WINEPREFIX || path.join(os.homedir(), '.mt5');
  }

  return spawnSync(spawnBin, spawnArgs, {
    encoding: 'utf8',
    env: spawnEnv,
    cwd: terminalRoot || undefined,
  });
}

function main() {
  if (!fs.existsSync(SOURCE_EXPORT)) throw new Error(`Missing export source: ${SOURCE_EXPORT}`);
  if (!fs.existsSync(SOURCE_BRIDGE)) throw new Error(`Missing bridge source: ${SOURCE_BRIDGE}`);

  const terminalRoots = resolveTerminalRoots();
  if (terminalRoots.length === 0) {
    throw new Error('MT5 terminal data directory not found. Set MT5_TERMINAL_ID or SOVEREIGN_MT5_TERMINAL_PATH.');
  }

  const results = [];
  for (const terminalRoot of terminalRoots) {
    const targetExport = path.join(terminalRoot, 'MQL5', 'Scripts', 'SovereignExport.mq5');
    const targetBridge = path.join(terminalRoot, 'MQL5', 'Experts', 'SovereignTradeBridge.mq5');

    fs.mkdirSync(path.dirname(targetExport), { recursive: true });
    fs.copyFileSync(SOURCE_EXPORT, targetExport);

    fs.mkdirSync(path.dirname(targetBridge), { recursive: true });
    fs.copyFileSync(SOURCE_BRIDGE, targetBridge);

    const metaeditor = resolveMetaEditor(terminalRoot);
    const resultExport = metaeditor ? compileMql5(metaeditor, targetExport, terminalRoot) : null;
    const resultBridge = metaeditor ? compileMql5(metaeditor, targetBridge, terminalRoot) : null;

    const checkCompiled = (targetMq5) => {
      const targetEx5 = targetMq5.replace(/\.mq5$/i, '.ex5');
      if (!fs.existsSync(targetEx5)) return false;
      return fs.statSync(targetEx5).mtimeMs >= fs.statSync(targetMq5).mtimeMs - 2000;
    };

    const compiledExport = Boolean(resultExport && (resultExport.status === 0 || checkCompiled(targetExport)));
    const compiledBridge = Boolean(resultBridge && (resultBridge.status === 0 || checkCompiled(targetBridge)));

    results.push({
      terminal_root: terminalRoot,
      targets: [targetExport, targetBridge],
      compiled_export: compiledExport,
      compiled_bridge: compiledBridge,
      metaeditor: metaeditor || null,
    });
  }

  console.log(JSON.stringify({
    ok: true,
    sources: [SOURCE_EXPORT, SOURCE_BRIDGE],
    roots_installed: results,
    next: 'Attach Experts > SovereignTradeBridge to an MT5 chart to enable live/paper TCP bridge.',
  }, null, 2));
}

main();
