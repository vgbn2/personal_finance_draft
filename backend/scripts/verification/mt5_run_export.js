#!/usr/bin/env node

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

require('../../../shared/lib/env');

function envValue(...keys) {
  for (const key of keys) {
    if (process.env[key]) return process.env[key];
  }
  return '';
}

function findTerminal() {
  const candidates = [
    process.env.MT5_TERMINAL_PATH,
    'C:\\Program Files\\MetaTrader 5\\terminal64.exe',
    'C:\\Program Files\\Five Percent Online MetaTrader 5\\terminal64.exe',
  ].filter(Boolean);
  return candidates.find((candidate) => fs.existsSync(candidate));
}

function main() {
  const login = envValue('HEADWAY_MT5_LOGIN', 'MT5_LOGIN', 'MT5_LOGIN_ID');
  const password = envValue('HEADWAY_MT5_PASSWORD', 'MT5_PASSWORD');
  const server = envValue('HEADWAY_MT5_SERVER', 'MT5_SERVER');
  const terminal = findTerminal();

  if (!terminal) throw new Error('MT5 terminal64.exe was not found. Set MT5_TERMINAL_PATH.');
  if (!login || !password || !server) {
    throw new Error('Missing MT5 login credentials. Required: login, password, server.');
  }

  const configPath = path.join(os.tmpdir(), `sovereign_mt5_export_${Date.now()}.ini`);
  const config = [
    '[Common]',
    `Login=${login}`,
    `Password=${password}`,
    `Server=${server}`,
    '',
    '[StartUp]',
    'Symbol=EURUSD',
    'Period=M1',
    'Script=SovereignExport',
    '',
  ].join('\r\n');

  fs.writeFileSync(configPath, config, { encoding: 'utf8', mode: 0o600 });
  const child = spawn(terminal, [`/config:${configPath}`], {
    detached: true,
    stdio: 'ignore',
    windowsHide: false,
  });
  child.unref();

  setTimeout(() => {
    try {
      fs.rmSync(configPath, { force: true });
    } catch {
      // Best-effort cleanup of the temporary credential file.
    }
  }, 5000);

  console.log(JSON.stringify({
    ok: true,
    terminal,
    script: 'SovereignExport',
    output: process.env.SOVEREIGN_HEADWAY_MT5_QUOTES_PATH || 
            process.env.HEADWAY_MT5_QUOTES_PATH || 
            path.join(process.env.APPDATA || '', 'MetaQuotes', 'Terminal', 'Common', 'Files', 'headway_mt5_quotes.json'),
    note: 'If MT5 does not auto-run startup scripts on this installation, run Scripts > SovereignExport manually in MT5.',
  }, null, 2));
}

main();
