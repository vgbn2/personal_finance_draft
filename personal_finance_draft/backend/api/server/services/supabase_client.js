const { createClient } = require('@supabase/supabase-js');
const fs = require('node:fs');
const path = require('node:path');
const { cached, isCacheEnabled } = require('./ttl_cache');
const { classifySupabaseError } = require('../../../../shared/lib/supabase/errors');

function loadRootEnv() {
  const envPath = path.resolve(__dirname, '..', '..', '..', '.env');
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const index = trimmed.indexOf('=');
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim();
    if (key && process.env[key] === undefined) {
      process.env[key] = value.replace(/^["']|["']$/g, '');
    }
  }
}

loadRootEnv();

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

function createSovereignSupabaseClient(req) {
  if (!isConfigured()) return null;
  const token = getBearerToken(req);
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  return createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: { headers },
  });
}

async function getAuthStatus(req) {
  const token = getBearerToken(req);
  return cached(`auth:${token || 'anonymous'}`, 30000, async () => {
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
          }
        : null;
    } catch (error) {
      status.ok = false;
      status.error = classifySupabaseError(error, 'reach the Supabase auth service');
      return status;
    }
    return status;
  });
}

async function getDatabaseStatus(req) {
  const token = getBearerToken(req);
  return cached(`db:${token || 'anonymous'}`, 15000, async () => {
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

    const auth = await getAuthStatus(req);
    status.authenticated = auth.authenticated;
    if (!auth.authenticated) {
      status.ok = false;
      status.error = 'auth_required';
      return status;
    }

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
  const { data, error } = await supabaseClient
    .from('user_config')
    .select('config_key, config_value')
    .eq('user_id', userId);
  if (error) throw error;
  const config = {};
  for (const row of data || []) config[row.config_key] = row.config_value;
  return config;
}

async function setUserConfig(supabaseClient, userId, key, value) {
  const { error } = await supabaseClient
    .from('user_config')
    .upsert(
      { user_id: userId, config_key: key, config_value: value, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,config_key' }
    );
  if (error) throw error;
}

module.exports = {
  EXPECTED_TABLES,
  createSovereignSupabaseClient,
  getAuthStatus,
  getDatabaseStatus,
  getUserConfig,
  setUserConfig,
  isConfigured,
};
