const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const SUPABASE_SERVICE_PATH = require.resolve('../../../../backend/api/server/services/supabase_client');
const AUTH_ROUTE_PATH = require.resolve('../../../../backend/api/server/routes/account/auth');
const DATABASE_ROUTE_PATH = require.resolve('../../../../backend/api/server/routes/account/database');

function clear(modulePath) {
  delete require.cache[modulePath];
}

function loadRoutes(mockClient) {
  const originalCreateClient = require.cache[require.resolve('@supabase/supabase-js')];
  const originalService = require.cache[SUPABASE_SERVICE_PATH];
  const originalAuthRoute = require.cache[AUTH_ROUTE_PATH];
  const originalDbRoute = require.cache[DATABASE_ROUTE_PATH];

  require.cache[require.resolve('@supabase/supabase-js')] = {
    id: require.resolve('@supabase/supabase-js'),
    filename: require.resolve('@supabase/supabase-js'),
    loaded: true,
    exports: {
      createClient: mockClient,
    },
  };

  clear(SUPABASE_SERVICE_PATH);
  clear(AUTH_ROUTE_PATH);
  clear(DATABASE_ROUTE_PATH);

  const service = require(SUPABASE_SERVICE_PATH);
  const authRoute = require(AUTH_ROUTE_PATH);
  const dbRoute = require(DATABASE_ROUTE_PATH);

  return {
    service,
    authRoute,
    dbRoute,
    restore() {
      if (originalCreateClient) require.cache[require.resolve('@supabase/supabase-js')] = originalCreateClient;
      else clear(require.resolve('@supabase/supabase-js'));
      if (originalService) require.cache[SUPABASE_SERVICE_PATH] = originalService;
      else clear(SUPABASE_SERVICE_PATH);
      if (originalAuthRoute) require.cache[AUTH_ROUTE_PATH] = originalAuthRoute;
      else clear(AUTH_ROUTE_PATH);
      if (originalDbRoute) require.cache[DATABASE_ROUTE_PATH] = originalDbRoute;
      else clear(DATABASE_ROUTE_PATH);
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
