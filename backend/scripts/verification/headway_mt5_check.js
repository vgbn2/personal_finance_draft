#!/usr/bin/env node

require('../../../shared/lib/runtime/env');

function mask(value) {
  if (!value) return 'missing';
  if (value.length <= 4) return '****';
  return `${value.slice(0, 2)}***${value.slice(-2)}`;
}

function envValue(...keys) {
  for (const key of keys) {
    if (process.env[key]) return { key, value: process.env[key] };
  }
  return { key: null, value: '' };
}

function main() {
  const login = envValue('HEADWAY_MT5_LOGIN', 'MT5_LOGIN', 'MT5_LOGIN_ID');
  const password = envValue('HEADWAY_MT5_PASSWORD', 'MT5_PASSWORD');
  const server = envValue('HEADWAY_MT5_SERVER', 'MT5_SERVER');
  const exportPath = envValue('SOVEREIGN_HEADWAY_MT5_QUOTES_PATH', 'HEADWAY_MT5_QUOTES_PATH');

  console.log(JSON.stringify({
    provider: 'headway_mt5',
    account_configured: Boolean(login.value && password.value && server.value),
    quote_import_configured: Boolean(exportPath.value),
    login: mask(login.value),
    login_env: login.key,
    password: password.value ? `set (${password.value.length} chars)` : 'missing',
    password_env: password.key,
    server: server.value || 'missing',
    server_env: server.key,
    quote_import_env: exportPath.key,
    mode: exportPath.value ? 'local_mt5_export_bridge' : 'credentials_present_but_no_quote_export_bridge',
    note: 'MT5 account credentials alone are not enough for direct quotes unless Headway exposes a broker API or a local MT5/bridge process writes quotes for ingestion.',
  }, null, 2));
}

main();
