#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SOURCE = path.join(REPO_ROOT, 'tools', 'mt5', 'SovereignExport.mq5');
const TERMINAL_ID = process.env.MT5_TERMINAL_ID;
const TERMINAL_ROOT = TERMINAL_ID ? path.join(process.env.APPDATA || '', 'MetaQuotes', 'Terminal', TERMINAL_ID) : null;
const TARGET = TERMINAL_ROOT ? path.join(TERMINAL_ROOT, 'MQL5', 'Scripts', 'SovereignExport.mq5') : null;
const METAEDITOR = process.env.MT5_METAEDITOR_PATH;

function main() {
  if (!TERMINAL_ID) throw new Error('MT5_TERMINAL_ID must be set in .env or environment');
  if (!METAEDITOR) throw new Error('MT5_METAEDITOR_PATH must be set in .env or environment');
  if (!fs.existsSync(SOURCE)) throw new Error(`Missing bridge source: ${SOURCE}`);
  if (!fs.existsSync(TERMINAL_ROOT)) throw new Error(`Missing MT5 terminal data dir: ${TERMINAL_ROOT}`);

  fs.mkdirSync(path.dirname(TARGET), { recursive: true });
  fs.copyFileSync(SOURCE, TARGET);

  const result = fs.existsSync(METAEDITOR)
    ? spawnSync(METAEDITOR, [`/compile:${TARGET}`], { encoding: 'utf8' })
    : null;

  console.log(JSON.stringify({
    ok: true,
    source: SOURCE,
    target: TARGET,
    compiled: Boolean(result && result.status === 0),
    compile_status: result ? result.status : null,
    metaeditor: fs.existsSync(METAEDITOR) ? METAEDITOR : null,
    next: 'Run Scripts > SovereignExport inside MT5, then run mt5_quotes_read.js.',
  }, null, 2));

  if (result && result.status !== 0) {
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    process.exitCode = result.status || 1;
  }
}

main();
