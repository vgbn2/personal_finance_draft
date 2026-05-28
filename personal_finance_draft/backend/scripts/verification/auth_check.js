#!/usr/bin/env node

const { readOpenSkyCredentials } = require('./shared');

function mask(value) {
  if (!value) return 'missing';
  if (value.length <= 4) return '****';
  return `${value.slice(0, 2)}***${value.slice(-2)}`;
}

function main() {
  const { clientId, clientSecret } = readOpenSkyCredentials();
  console.log(JSON.stringify({
    configured: Boolean(clientId && clientSecret),
    auth_mode: process.env.OPENSKY_ACCESS_TOKEN ? 'bearer_token' : 'oauth2_client_credentials',
    client_id: mask(clientId),
    client_secret: clientSecret ? `set (${clientSecret.length} chars)` : 'missing',
    authorization_header: clientId && clientSecret ? 'will_fetch_bearer_token' : 'missing',
  }, null, 2));
}

main();
