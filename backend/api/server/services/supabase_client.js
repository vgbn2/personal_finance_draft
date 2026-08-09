const { createClient } = require('@supabase/supabase-js');
const crypto = require('node:crypto');
const { cached, isCacheEnabled } = require('./ttl_cache');
const { classifySupabaseError } = require('../../../../shared/lib/supabase/errors');
const { loadLocalEnv } = require('../../../../shared/lib/runtime/env');

loadLocalEnv();

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.SOVEREIGN_SUPABASE_URL || '';
const SUPABASE_PUBLISHABLE_KEY =
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.SOVEREIGN_SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  '';

const EXPECTED_TABLES = [
  'profiles',
  'portfolios',
  'holdings',
  'watchlist_items',
  'saved_backtests',
  'audit_events',
];

function isConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY);
}

function getBearerToken(req) {
  const header = req && req.headers ? req.headers.authorization || '' : '';
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match ? match[1] : '';
}

function tokenCacheKey(token) {
  return token ? crypto.createHash('sha256').update(token).digest('hex').slice(0, 24) : 'anonymous';
}

const clientPool = new Map();
const MAX_POOLED_CLIENTS = 100;

function createSovereignSupabaseClient(req) {
  if (!isConfigured()) return null;
  const token = getBearerToken(req);
  const key = tokenCacheKey(token);

  if (clientPool.has(key)) {
    return clientPool.get(key);
  }

  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const client = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: { headers },
  });

  if (clientPool.size >= MAX_POOLED_CLIENTS) {
    const oldestKey = clientPool.keys().next().value;
    clientPool.delete(oldestKey);
  }
  clientPool.set(key, client);
  return client;
}

function clearClientPool() {
  clientPool.clear();
}

async function getAuthStatus(req) {
  const token = getBearerToken(req);
  const status = {
    ok: true,
    type: 'auth_status',
    configured: isConfigured(),
    authenticated: false,
    user: null,
    cache_enabled: isCacheEnabled(),
  };

  if (!status.configured) {
    status.ok = false;
    status.error = 'supabase_not_configured';
    return status;
  }
  if (!token) return status;

  const supabase = createSovereignSupabaseClient(req);
  try {
    const { data, error } = await supabase.auth.getUser(token);
    if (error) {
      status.ok = false;
      status.error = classifySupabaseError(error, 'reach the Supabase auth service');
      return status;
    }

    status.authenticated = Boolean(data.user);
    status.user = data.user
      ? {
          id: data.user.id,
          email: data.user.email || null,
          role: data.user.role || null,
          access_role: data.user.app_metadata
            ? data.user.app_metadata.sovereign_role || null
            : null,
        }
      : null;
  } catch (error) {
    status.ok = false;
    status.error = classifySupabaseError(error, 'reach the Supabase auth service');
    return status;
  }
  return status;
}

async function getDatabaseStatus(req) {
  const token = getBearerToken(req);
  const auth = await getAuthStatus(req);
  if (!auth.authenticated) {
    return {
      ok: false,
      type: 'database_status',
      configured: isConfigured(),
      authenticated: false,
      tables: EXPECTED_TABLES.map((name) => ({ name, readable: false, count: null })),
      cache_enabled: isCacheEnabled(),
      error: auth.error || 'auth_required',
    };
  }

  return cached(`db:${tokenCacheKey(token)}`, 15000, async () => {
    const status = {
      ok: true,
      type: 'database_status',
      configured: isConfigured(),
      authenticated: false,
      tables: EXPECTED_TABLES.map((name) => ({ name, readable: false, count: null })),
      cache_enabled: isCacheEnabled(),
    };

    if (!status.configured) {
      status.ok = false;
      status.error = 'supabase_not_configured';
      return status;
    }

    status.authenticated = true;

    const supabase = createSovereignSupabaseClient(req);
    const checks = await Promise.all(
      EXPECTED_TABLES.map(async (name) => {
        try {
          const { count, error } = await supabase.from(name).select('*', {
            count: 'exact',
            head: true,
          });
          return {
            name,
            readable: !error,
            count: error ? null : count,
            error: error ? classifySupabaseError(error, `read the ${name} table`) : undefined,
          };
        } catch (error) {
          return {
            name,
            readable: false,
            count: null,
            error: classifySupabaseError(error, `read the ${name} table`),
          };
        }
      }),
    );

    status.tables = checks;
    status.ok = checks.every((table) => table.readable);
    if (!status.ok) status.error = 'database_read_check_failed';
    return status;
  });
}

async function getUserConfig(supabaseClient, userId) {
  if (!supabaseClient || !userId) throw new Error('invalid_supabase_client_or_user_id');
  try {
    const { data, error } = await supabaseClient
      .from('user_config')
      .select('config_key, config_value')
      .eq('user_id', userId);
    if (error) {
      throw new Error(classifySupabaseError(error, 'read user configuration'));
    }
    const config = {};
    for (const row of data || []) config[row.config_key] = row.config_value;
    return config;
  } catch (error) {
    if (error && error.message && error.message.includes('Unable to read user configuration')) {
      throw error;
    }
    throw new Error(classifySupabaseError(error, 'read user configuration'));
  }
}

async function setUserConfig(supabaseClient, userId, key, value) {
  if (!supabaseClient || !userId || !key) throw new Error('invalid_supabase_client_or_params');
  try {
    const { error } = await supabaseClient
      .from('user_config')
      .upsert(
        { user_id: userId, config_key: key, config_value: value, updated_at: new Date().toISOString() },
        { onConflict: 'user_id,config_key' }
      );
    if (error) {
      throw new Error(classifySupabaseError(error, 'write user configuration'));
    }
  } catch (error) {
    if (error && error.message && error.message.includes('Unable to write user configuration')) {
      throw error;
    }
    throw new Error(classifySupabaseError(error, 'write user configuration'));
  }
}

module.exports = {
  EXPECTED_TABLES,
  createSovereignSupabaseClient,
  clearClientPool,
  getAuthStatus,
  getDatabaseStatus,
  getUserConfig,
  setUserConfig,
  isConfigured,
};
