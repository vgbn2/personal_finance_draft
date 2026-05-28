const DEFAULT_URL = 'https://opensky-network.org/api/states/all';
const TOKEN_URL = 'https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token';

require('../../../shared/lib/env');

let cachedToken = null;
let cachedTokenExpiresAt = 0;

function readOpenSkyCredentials() {
  const username = process.env.OPENSKY_CLIENT_ID || '';
  const password = process.env.OPENSKY_CLIENT_SECRET || '';
  return { clientId: username, clientSecret: password };
}

async function authHeaderFromEnv() {
  if (process.env.OPENSKY_ACCESS_TOKEN) {
    return `Bearer ${process.env.OPENSKY_ACCESS_TOKEN}`;
  }

  const { clientId, clientSecret } = readOpenSkyCredentials();
  if (!clientId || !clientSecret) return null;

  const now = Date.now();
  if (cachedToken && now < cachedTokenExpiresAt) {
    return `Bearer ${cachedToken}`;
  }

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
  });

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.access_token) {
    const message = payload?.error_description || payload?.error || `HTTP ${response.status}`;
    throw new Error(`OpenSky token request failed: ${message}`);
  }

  cachedToken = payload.access_token;
  cachedTokenExpiresAt = now + Math.max(1, Number(payload.expires_in || 1800) - 30) * 1000;
  return `Bearer ${cachedToken}`;
}

function buildUrl(baseUrl, params = {}) {
  const url = new URL(baseUrl || DEFAULT_URL);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  }
  return url;
}

async function fetchJson(url) {
  const headers = { accept: 'application/json' };
  const auth = await authHeaderFromEnv();
  if (auth) headers.authorization = auth;
  const response = await fetch(url, { headers });
  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch (error) {
    throw new Error(`OpenSky returned non-JSON response (${response.status}): ${text.slice(0, 200)}`);
  }
  if (!response.ok) {
    const message = payload && payload.message ? payload.message : `HTTP ${response.status}`;
    const err = new Error(`OpenSky request failed: ${message}`);
    err.status = response.status;
    err.payload = payload;
    throw err;
  }
  return payload;
}

function summarizeStates(payload) {
  const states = Array.isArray(payload?.states) ? payload.states : [];
  const aircraftCount = states.filter(Array.isArray).length;
  const onGroundCount = states.filter((state) => Array.isArray(state) && state[8] === true).length;
  const withCallsign = states.filter((state) => Array.isArray(state) && state[1]).length;
  return {
    time: payload?.time ?? null,
    aircraft_count: aircraftCount,
    on_ground_count: onGroundCount,
    airborne_count: aircraftCount - onGroundCount,
    callsign_count: withCallsign,
  };
}

function printSummary(label, payload) {
  const summary = summarizeStates(payload);
  console.log(label);
  console.log(JSON.stringify(summary, null, 2));
  const sample = Array.isArray(payload?.states) ? payload.states.slice(0, 3) : [];
  console.log('sample_states');
  console.log(JSON.stringify(sample, null, 2));
}

module.exports = {
  authHeaderFromEnv,
  buildUrl,
  fetchJson,
  printSummary,
  readOpenSkyCredentials,
  summarizeStates,
};
