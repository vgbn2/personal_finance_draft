const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const SUPABASE_SERVICE_PATH = require.resolve('../../../../backend/api/server/services/supabase_client');
const SUPABASE_MODULE_PATH = require.resolve('@supabase/supabase-js', {
  paths: [path.dirname(SUPABASE_SERVICE_PATH)],
});
const AUTH_ROUTE_PATH = require.resolve('../../../../backend/api/server/routes/account/auth');
const DATABASE_ROUTE_PATH = require.resolve('../../../../backend/api/server/routes/account/database');
const CONFIG_ROUTE_PATH = require.resolve('../../../../backend/api/server/routes/account/config');
const USER_CONFIG_MIGRATION = path.resolve(__dirname, '..', '..', '..', '..', 'supabase', 'migrations', '20260713110000_user_config.sql');

function clear(modulePath) {
  delete require.cache[modulePath];
}

function loadRoutes(mockClient) {
  const originalCreateClient = require.cache[SUPABASE_MODULE_PATH];
  const originalService = require.cache[SUPABASE_SERVICE_PATH];
  const originalAuthRoute = require.cache[AUTH_ROUTE_PATH];
  const originalDbRoute = require.cache[DATABASE_ROUTE_PATH];
  const originalConfigRoute = require.cache[CONFIG_ROUTE_PATH];

  // audit-ignore-loader: controlled dependency fixture restored by this test scope

  require.cache[SUPABASE_MODULE_PATH] = {
    id: SUPABASE_MODULE_PATH,
    filename: SUPABASE_MODULE_PATH,
    loaded: true,
    exports: {
      createClient: mockClient,
    },
  };

  clear(SUPABASE_SERVICE_PATH);
  clear(AUTH_ROUTE_PATH);
  clear(DATABASE_ROUTE_PATH);
  clear(CONFIG_ROUTE_PATH);

  const service = require(SUPABASE_SERVICE_PATH);
  const authRoute = require(AUTH_ROUTE_PATH);
  const dbRoute = require(DATABASE_ROUTE_PATH);
  const configRoute = require(CONFIG_ROUTE_PATH);

  return {
    service,
    authRoute,
    dbRoute,
    configRoute,
    restore() {
      if (originalCreateClient) require.cache[SUPABASE_MODULE_PATH] = originalCreateClient;
      else clear(SUPABASE_MODULE_PATH);
      if (originalService) require.cache[SUPABASE_SERVICE_PATH] = originalService;
      else clear(SUPABASE_SERVICE_PATH);
      if (originalAuthRoute) require.cache[AUTH_ROUTE_PATH] = originalAuthRoute;
      else clear(AUTH_ROUTE_PATH);
      if (originalDbRoute) require.cache[DATABASE_ROUTE_PATH] = originalDbRoute;
      else clear(DATABASE_ROUTE_PATH);
      if (originalConfigRoute) require.cache[CONFIG_ROUTE_PATH] = originalConfigRoute;
      else clear(CONFIG_ROUTE_PATH);
    },
  };
}

test('supabase auth and database routes follow the expected contract', async () => {
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test_key';
  delete process.env.SOVEREIGN_SUPABASE_URL;
  delete process.env.SOVEREIGN_SUPABASE_PUBLISHABLE_KEY;

  const mockClient = () => ({
    auth: {
      getUser: async (token) => ({
        data: token === 'good-token' ? { user: { id: 'user-123', email: 'a@example.com', role: 'authenticated' } } : { user: null },
        error: token === 'bad-token' ? new Error('invalid token') : null,
      }),
    },
    from: (table) => ({
      select: async () => ({
        count: 1,
        error: table === 'audit_events' ? null : null,
      }),
    }),
  });

  const { authRoute, dbRoute, restore } = loadRoutes(mockClient);
  try {
    const noAuth = await authRoute.handle({}, { req: { headers: {} } });
    assert.equal(noAuth.ok, true);
    assert.equal(noAuth.authenticated, false);
    assert.equal(authRoute.status(noAuth), 200);

    const goodAuth = await authRoute.handle({}, { req: { headers: { authorization: 'Bearer good-token' } } });
    assert.equal(goodAuth.ok, true);
    assert.equal(goodAuth.authenticated, true);
    assert.equal(goodAuth.user.email, 'a@example.com');
    assert.equal(authRoute.status(goodAuth), 200);

    const badAuth = await authRoute.handle({}, { req: { headers: { authorization: 'Bearer bad-token' } } });
    assert.equal(badAuth.ok, false);
    assert.equal(authRoute.status(badAuth), 401);

    const dbNoAuth = await dbRoute.handle({}, { req: { headers: {} } });
    assert.equal(dbNoAuth.ok, false);
    assert.equal(dbRoute.status(dbNoAuth), 401);

    const dbAuth = await dbRoute.handle({}, { req: { headers: { authorization: 'Bearer good-token' } } });
    assert.equal(dbAuth.ok, true);
    assert.equal(dbAuth.authenticated, true);
    assert.equal(Array.isArray(dbAuth.tables), true);
    assert.equal(dbAuth.tables.length >= 6, true);
    assert.equal(dbRoute.status(dbAuth), 200);

    console.log(JSON.stringify({
      type: 'supabase_route_contract',
      auth_status: authRoute.status(goodAuth),
      db_status: dbRoute.status(dbAuth),
      table_count: dbAuth.tables.length,
    }, null, 2));
  } finally {
    restore();
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_PUBLISHABLE_KEY;
  }
});

test('authorization decisions are revalidated when the same token is revoked', async () => {
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test_key';
  let revoked = false;
  let validationCalls = 0;

  const mockClient = () => ({
    auth: {
      getUser: async () => {
        validationCalls += 1;
        return revoked
          ? { data: { user: null }, error: new Error('token revoked') }
          : { data: { user: { id: 'user-123', email: 'a@example.com' } }, error: null };
      },
    },
  });

  const { service, restore } = loadRoutes(mockClient);
  const req = { headers: { authorization: 'Bearer same-token' } };
  try {
    const valid = await service.getAuthStatus(req);
    revoked = true;
    const invalid = await service.getAuthStatus(req);

    assert.equal(valid.authenticated, true);
    assert.equal(invalid.authenticated, false);
    assert.equal(invalid.ok, false);
    assert.equal(validationCalls, 2, 'every authorization decision must reach the provider');
  } finally {
    restore();
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_PUBLISHABLE_KEY;
  }
});

test('user config has a migrated own-user schema and validates persisted shapes', async () => {
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test_key';
  const stored = new Map();
  const mockClient = () => ({
    auth: {
      getUser: async (token) => ({
        data: token === 'good-token' ? { user: { id: 'user-123', email: 'a@example.com' } } : { user: null },
        error: token === 'good-token' ? null : new Error('invalid token'),
      }),
    },
    from: (table) => {
      assert.equal(table, 'user_config');
      return {
        select: () => ({
          eq: async (_field, userId) => ({
            data: [...stored.values()].filter((row) => row.user_id === userId),
            error: null,
          }),
        }),
        upsert: async (row) => {
          stored.set(`${row.user_id}:${row.config_key}`, row);
          return { error: null };
        },
      };
    },
  });

  const { configRoute, restore } = loadRoutes(mockClient);
  const req = { headers: { authorization: 'Bearer good-token' }, method: 'POST' };
  try {
    const saved = await configRoute.handle({
      key: 'risk_thresholds',
      value: { max_position_pct: 0.05, max_drawdown_pct: 0.15 },
    }, { req });
    assert.deepEqual(saved, { ok: true });

    const fetched = await configRoute.handle({}, { req: { ...req, method: 'GET' } });
    assert.equal(fetched.config.risk_thresholds.max_position_pct, 0.05);
    assert.equal(fetched.config.dashboard_layout.default_tab, 'overview');

    const invalid = await configRoute.handle({ key: 'risk_thresholds', value: { max_position_pct: 'bad' } }, { req });
    assert.equal(invalid.error, 'invalid_config');
    assert.equal(configRoute.status(invalid), 400);

    const unknown = await configRoute.handle({ key: 'private_key', value: 'never-store-secrets-here' }, { req });
    assert.equal(unknown.error, 'key_required');

    const migration = fs.readFileSync(USER_CONFIG_MIGRATION, 'utf8');
    assert.match(migration, /create table if not exists public\.user_config/i);
    assert.match(migration, /primary key \(user_id, config_key\)/i);
    assert.match(migration, /enable row level security/i);
    assert.match(migration, /user_config_update_own/i);
  } finally {
    restore();
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_PUBLISHABLE_KEY;
  }
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
    const supabaseConfigRoute = require('../../../../backend/api/server/routes/account/supabase_config');
    assert.equal(service.isConfigured(), true);
    const payload = supabaseConfigRoute.handle();
    assert.equal(payload.configured, true);
    assert.equal(payload.url, 'https://migrated.example.supabase.co');
    assert.equal(supabaseConfigRoute.status(payload), 200);
  } finally {
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
