#!/usr/bin/env node

const { readOpenSkyCredentials } = require('./shared');

function mask(value) {
  if (!value) return 'missing';
  if (value.length <= 4) return '****';
  return `${value.slice(0, 2)}***${value.slice(-2)}`;
}

function main() {
  const { clientId, clientSecret } = readOpenSkyCredentials();
  const hasToken = Boolean(process.env.OPENSKY_ACCESS_TOKEN);
  console.log(JSON.stringify({
    configured: Boolean(clientId && clientSecret),
    auth_mode: hasToken ? 'bearer_token' : 'oauth2_client_credentials',
    client_id_configured: Boolean(clientId),
    client_secret_configured: Boolean(clientSecret),
    authorization_header: clientId && clientSecret ? 'will_fetch_bearer_token' : 'missing',
  }, null, 2));
}

main();
