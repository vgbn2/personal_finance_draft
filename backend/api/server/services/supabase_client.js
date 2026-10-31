'use strict';

function isConfigured() {
  return false;
}

function getClient() {
  return null;
}

function createSovereignSupabaseClient(_req) {
  return null;
}

async function getAuthStatus(_req) {
  return {
    type: 'auth_status',
    ok: true,
    authenticated: false,
    configured: false,
    user: null,
  };
}

async function getDatabaseStatus(_req) {
  return {
    type: 'database_status',
    ok: false,
    configured: false,
    error: 'Database service not configured',
  };
}

async function recordAuditEvent(_event) {
  return {
    ok: true,
    skipped: true,
  };
}

async function getUserConfig(client, userId) {
  if (!client || !userId) {
    throw new Error('invalid_supabase_client_or_user_id');
  }
  try {
    const { data, error } = await client
      .from('user_configs')
      .select('*')
      .eq('user_id', userId);
    if (error) {
      throw new Error(`Unable to read user configuration: ${error.message}`);
    }
    return data || {};
  } catch (err) {
    if (err.message && err.message.startsWith('Unable to read user configuration')) {
      throw err;
    }
    throw new Error(`Unable to read user configuration: ${err.message}`);
  }
}

async function setUserConfig(client, userId, key, value) {
  if (!client || !userId || !key) {
    throw new Error('invalid_supabase_client_or_params');
  }
  try {
    const { error } = await client
      .from('user_configs')
      .upsert({ user_id: userId, [key]: value });
    if (error) {
      throw new Error(`Unable to write user configuration: ${error.message}`);
    }
    return { ok: true };
  } catch (err) {
    if (err.message && err.message.startsWith('Unable to write user configuration')) {
      throw err;
    }
    throw new Error(`Unable to write user configuration: ${err.message}`);
  }
}

module.exports = {
  isConfigured,
  getClient,
  createSovereignSupabaseClient,
  getAuthStatus,
  getDatabaseStatus,
  recordAuditEvent,
  getUserConfig,
  setUserConfig,
};
