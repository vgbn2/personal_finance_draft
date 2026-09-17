#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SOURCE_EXPORT = path.join(REPO_ROOT, 'tools', 'mt5', 'SovereignExport.mq5');
const SOURCE_BRIDGE = path.join(REPO_ROOT, 'tools', 'mt5', 'SovereignTradeBridge.mq5');
const TERMINAL_ID = process.env.MT5_TERMINAL_ID;
const TERMINAL_ROOT = TERMINAL_ID ? path.join(process.env.APPDATA || '', 'MetaQuotes', 'Terminal', TERMINAL_ID) : null;
const TARGET_EXPORT = TERMINAL_ROOT ? path.join(TERMINAL_ROOT, 'MQL5', 'Scripts', 'SovereignExport.mq5') : null;
const TARGET_BRIDGE = TERMINAL_ROOT ? path.join(TERMINAL_ROOT, 'MQL5', 'Experts', 'SovereignTradeBridge.mq5') : null;
const METAEDITOR = process.env.MT5_METAEDITOR_PATH;

function main() {
  if (!TERMINAL_ID) throw new Error('MT5_TERMINAL_ID must be set in .env or environment');
  if (!METAEDITOR) throw new Error('MT5_METAEDITOR_PATH must be set in .env or environment');
  if (!fs.existsSync(SOURCE_EXPORT)) throw new Error(`Missing export source: ${SOURCE_EXPORT}`);
  if (!fs.existsSync(SOURCE_BRIDGE)) throw new Error(`Missing bridge source: ${SOURCE_BRIDGE}`);
  if (!fs.existsSync(TERMINAL_ROOT)) throw new Error(`Missing MT5 terminal data dir: ${TERMINAL_ROOT}`);

  fs.mkdirSync(path.dirname(TARGET_EXPORT), { recursive: true });
  fs.copyFileSync(SOURCE_EXPORT, TARGET_EXPORT);

  fs.mkdirSync(path.dirname(TARGET_BRIDGE), { recursive: true });
  fs.copyFileSync(SOURCE_BRIDGE, TARGET_BRIDGE);

  const resultExport = fs.existsSync(METAEDITOR)
    ? spawnSync(METAEDITOR, [`/compile:${TARGET_EXPORT}`], { encoding: 'utf8' })
    : null;

  const resultBridge = fs.existsSync(METAEDITOR)
    ? spawnSync(METAEDITOR, [`/compile:${TARGET_BRIDGE}`], { encoding: 'utf8' })
    : null;

  console.log(JSON.stringify({
    ok: true,
    sources: [SOURCE_EXPORT, SOURCE_BRIDGE],
    targets: [TARGET_EXPORT, TARGET_BRIDGE],
    compiled_export: Boolean(resultExport && resultExport.status === 0),
    compiled_bridge: Boolean(resultBridge && resultBridge.status === 0),
    metaeditor: fs.existsSync(METAEDITOR) ? METAEDITOR : null,
    next: 'Attach Experts > SovereignTradeBridge to an MT5 chart to enable live/paper TCP bridge.',
  }, null, 2));

  if (resultExport && resultExport.status !== 0) {
    if (resultExport.stdout) process.stdout.write(resultExport.stdout);
    if (resultExport.stderr) process.stderr.write(resultExport.stderr);
    process.exitCode = resultExport.status || 1;
  }
  if (resultBridge && resultBridge.status !== 0) {
    if (resultBridge.stdout) process.stdout.write(resultBridge.stdout);
    if (resultBridge.stderr) process.stderr.write(resultBridge.stderr);
    process.exitCode = resultBridge.status || 1;
  }
}

main();
