#!/usr/bin/env node

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

require('../../../shared/lib/runtime/env');

function envValue(...keys) {
  for (const key of keys) {
    if (process.env[key]) return process.env[key];
  }
  return '';
}

const { findTool } = require('../../../shared/lib/runtime/paths');

function findTerminal() {
  return findTool('metatrader5', 'MT5_TERMINAL_PATH');
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

  const configPath = path.join(os.tmpdir(), `headway_mt5_${Date.now()}.ini`);
  const config = [
    '[Common]',
    `Login=${login}`,
    `Password=${password}`,
    `Server=${server}`,
    'ProxyEnable=0',
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
    server,
    login: String(login).replace(/^(.{2}).*(.{2})$/, '$1***$2'),
    config: 'temporary_file_deleted_after_launch',
  }, null, 2));
}

main();
