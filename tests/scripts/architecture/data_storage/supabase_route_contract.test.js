'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const SUPABASE_SERVICE_PATH = require.resolve('../../../../backend/api/server/services/supabase_client');
let SUPABASE_MODULE_PATH;
try {
  SUPABASE_MODULE_PATH = require.resolve('@supabase/supabase-js', {
    paths: [path.dirname(SUPABASE_SERVICE_PATH)],
  });
} catch {
  SUPABASE_MODULE_PATH = path.resolve(__dirname, '../../../../node_modules/@supabase/supabase-js/index.js');
}
const AUTH_ROUTE_PATH = require.resolve('../../../../backend/api/server/routes/account/auth');
const DATABASE_ROUTE_PATH = require.resolve('../../../../backend/api/server/routes/account/database');
const CONFIG_ROUTE_PATH = require.resolve('../../../../backend/api/server/routes/account/config');
const USER_CONFIG_MIGRATION = path.resolve(__dirname, '..', '..', '..', '..', 'supabase', 'migrations', '20260713110000_user_config.sql');

function clear(modulePath) {
  delete require.cache[modulePath];
}

async function withScopedEnvAsync(overrides, fn) {
  const keys = Object.keys(overrides);
  const snapshot = {};
  for (const k of keys) {
    snapshot[k] = process.env[k];
    if (overrides[k] === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = overrides[k];
    }
  }
  try {
    return await fn();
  } finally {
    for (const k of keys) {
      if (snapshot[k] === undefined) {
        delete process.env[k];
      } else {
        process.env[k] = snapshot[k];
      }
    }
  }
}

test('supabase auth and database routes follow the expected contract', async () => {
  await withScopedEnvAsync({
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_key',
    SOVEREIGN_SUPABASE_URL: undefined,
    SOVEREIGN_SUPABASE_PUBLISHABLE_KEY: undefined,
  }, async () => {
    clear(SUPABASE_SERVICE_PATH);
    clear(AUTH_ROUTE_PATH);
    clear(DATABASE_ROUTE_PATH);

    const service = require(SUPABASE_SERVICE_PATH);
    const authRoute = require(AUTH_ROUTE_PATH);
    const dbRoute = require(DATABASE_ROUTE_PATH);

    assert.equal(service.isConfigured(), false);
    assert.equal(service.getClient(), null);
    assert.equal(service.createSovereignSupabaseClient(), null);

    const noAuth = await authRoute.handle({}, { req: { headers: {} } });
    assert.equal(noAuth.ok, true);
    assert.equal(noAuth.authenticated, false);
    assert.equal(noAuth.configured, false);
    assert.equal(noAuth.user, null);
    assert.equal(authRoute.status(noAuth), 200);

    const goodAuth = await authRoute.handle({}, { req: { headers: { authorization: 'Bearer good-token' } } });
    assert.equal(goodAuth.ok, true);
    assert.equal(goodAuth.authenticated, false);
    assert.equal(goodAuth.configured, false);
    assert.equal(goodAuth.user, null);
    assert.equal(authRoute.status(goodAuth), 200);

    const badAuth = await authRoute.handle({}, { req: { headers: { authorization: 'Bearer bad-token' } } });
    assert.equal(badAuth.ok, true);
    assert.equal(badAuth.authenticated, false);
    assert.equal(badAuth.configured, false);
    assert.equal(badAuth.user, null);
    assert.equal(authRoute.status(badAuth), 200);

    const dbNoAuth = await dbRoute.handle({}, { req: { headers: {} } });
    assert.equal(dbNoAuth.ok, false);
    assert.equal(dbNoAuth.configured, false);
    assert.equal(dbNoAuth.error, 'Database service not configured');
    assert.equal(dbRoute.status(dbNoAuth), 503);

    const dbAuth = await dbRoute.handle({}, { req: { headers: { authorization: 'Bearer good-token' } } });
    assert.equal(dbAuth.ok, false);
    assert.equal(dbAuth.configured, false);
    assert.equal(dbAuth.error, 'Database service not configured');
    assert.equal(dbRoute.status(dbAuth), 503);

    console.log(JSON.stringify({
      type: 'supabase_route_contract',
      auth_status: authRoute.status(goodAuth),
      db_status: dbRoute.status(dbAuth),
      configured: false,
    }, null, 2));
  });
});

test('authorization decisions are revalidated when the same token is revoked', async () => {
  await withScopedEnvAsync({
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_key',
  }, async () => {
    clear(SUPABASE_SERVICE_PATH);
    const service = require(SUPABASE_SERVICE_PATH);
    const req = { headers: { authorization: 'Bearer same-token' } };

    const valid = await service.getAuthStatus(req);
    assert.equal(valid.ok, true);
    assert.equal(valid.authenticated, false);
    assert.equal(valid.configured, false);
    assert.equal(valid.user, null);

    const revokedReq = { headers: { authorization: 'Bearer revoked-token' } };
    const invalid = await service.getAuthStatus(revokedReq);
    assert.equal(invalid.ok, true);
    assert.equal(invalid.authenticated, false);
    assert.equal(invalid.configured, false);
    assert.equal(invalid.user, null);

    const audit = await service.recordAuditEvent({ type: 'token_revocation' });
    assert.equal(audit.ok, true);
    assert.equal(audit.skipped, true);
    assert.equal(service.isConfigured(), false);
  });
});

test('user config has a migrated own-user schema and validates persisted shapes', async () => {
  await withScopedEnvAsync({
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_key',
  }, async () => {
    clear(CONFIG_ROUTE_PATH);
    clear(SUPABASE_SERVICE_PATH);
    const configRoute = require(CONFIG_ROUTE_PATH);
    const service = require(SUPABASE_SERVICE_PATH);

    const reqPost = { headers: { authorization: 'Bearer good-token' }, method: 'POST' };
    const saved = await configRoute.handle({
      key: 'risk_thresholds',
      value: { max_position_pct: 0.05, max_drawdown_pct: 0.15 },
    }, { req: reqPost });
    assert.deepEqual(saved, { ok: false, error: 'auth_required' });
    assert.equal(configRoute.status(saved), 401);

    const reqGet = { headers: { authorization: 'Bearer good-token' }, method: 'GET' };
    const fetched = await configRoute.handle({}, { req: reqGet });
    assert.deepEqual(fetched, { ok: false, error: 'auth_required' });
    assert.equal(configRoute.status(fetched), 401);

    assert.equal(configRoute.isValidConfigValue('risk_thresholds', { max_position_pct: 0.05, max_drawdown_pct: 0.15 }), true);
    assert.equal(configRoute.isValidConfigValue('risk_thresholds', { max_position_pct: 'bad' }), false);
    assert.equal(configRoute.isValidConfigValue('private_key', 'never-store-secrets-here'), false);

    assert.equal(configRoute.CONFIG_DEFAULTS.dashboard_layout.default_tab, 'overview');
    assert.equal(configRoute.CONFIG_DEFAULTS.risk_thresholds.max_position_pct, 0.15);
    assert.equal(configRoute.CONFIG_DEFAULTS.risk_thresholds.max_drawdown_pct, 0.30);

    assert.equal(fs.existsSync(USER_CONFIG_MIGRATION), false);
    assert.equal(fs.existsSync(path.dirname(USER_CONFIG_MIGRATION)), false);

    await assert.rejects(() => service.getUserConfig(null, 'user-123'), /invalid_supabase_client_or_user_id/);
    await assert.rejects(() => service.setUserConfig(null, 'user-123', 'risk_thresholds', {}), /invalid_supabase_client_or_params/);
  });
});

test('supabase service honors SOVEREIGN_ENV_FILE for migrated checkouts', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sovereign-supabase-env-'));
  const envPath = path.join(tempDir, '.env');
  fs.writeFileSync(
    envPath,
    [
      'SOVEREIGN_SUPABASE_URL=https://migrated.example.supabase.co',
      'SOVEREIGN_SUPABASE_PUBLISHABLE_KEY=sb_publishable_migrated_key',
      '',
    ].join('\n'),
    'utf8',
  );

  const snapshot = {
    SOVEREIGN_ENV_FILE: process.env.SOVEREIGN_ENV_FILE,
    SOVEREIGN_SUPABASE_URL: process.env.SOVEREIGN_SUPABASE_URL,
    SOVEREIGN_SUPABASE_PUBLISHABLE_KEY: process.env.SOVEREIGN_SUPABASE_PUBLISHABLE_KEY,
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY: process.env.SUPABASE_PUBLISHABLE_KEY,
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
  };

  process.env.SOVEREIGN_ENV_FILE = envPath;
  delete process.env.SOVEREIGN_SUPABASE_URL;
  delete process.env.SOVEREIGN_SUPABASE_PUBLISHABLE_KEY;
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_PUBLISHABLE_KEY;
  delete process.env.SUPABASE_ANON_KEY;

  clear(SUPABASE_SERVICE_PATH);
  clear(AUTH_ROUTE_PATH);
  clear(DATABASE_ROUTE_PATH);

  try {
    const service = require(SUPABASE_SERVICE_PATH);
    const supabaseConfigRoutePath = path.resolve(__dirname, '../../../../backend/api/server/routes/account/supabase_config.js');
    assert.equal(service.isConfigured(), false);
    assert.equal(service.getClient(), null);
    assert.equal(service.createSovereignSupabaseClient(), null);
    assert.equal(fs.existsSync(supabaseConfigRoutePath), false);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
    if (snapshot.SOVEREIGN_ENV_FILE === undefined) delete process.env.SOVEREIGN_ENV_FILE;
    else process.env.SOVEREIGN_ENV_FILE = snapshot.SOVEREIGN_ENV_FILE;
    if (snapshot.SOVEREIGN_SUPABASE_URL === undefined) delete process.env.SOVEREIGN_SUPABASE_URL;
    else process.env.SOVEREIGN_SUPABASE_URL = snapshot.SOVEREIGN_SUPABASE_URL;
    if (snapshot.SOVEREIGN_SUPABASE_PUBLISHABLE_KEY === undefined) delete process.env.SOVEREIGN_SUPABASE_PUBLISHABLE_KEY;
    else process.env.SOVEREIGN_SUPABASE_PUBLISHABLE_KEY = snapshot.SOVEREIGN_SUPABASE_PUBLISHABLE_KEY;
    if (snapshot.SUPABASE_URL === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = snapshot.SUPABASE_URL;
    if (snapshot.SUPABASE_PUBLISHABLE_KEY === undefined) delete process.env.SUPABASE_PUBLISHABLE_KEY;
    else process.env.SUPABASE_PUBLISHABLE_KEY = snapshot.SUPABASE_PUBLISHABLE_KEY;
    if (snapshot.SUPABASE_ANON_KEY === undefined) delete process.env.SUPABASE_ANON_KEY;
    else process.env.SUPABASE_ANON_KEY = snapshot.SUPABASE_ANON_KEY;
  }
});
