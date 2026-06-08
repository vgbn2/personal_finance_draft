/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Shared Supabase admin client creation logic.
 */

const { createClient } = require('@supabase/supabase-js');
require('../runtime/env');

const SUPABASE_URL =
  process.env.SOVEREIGN_SUPABASE_URL ||
  process.env.SUPABASE_URL ||
  '';

const SUPABASE_SERVICE_KEY =
  process.env.SOVEREIGN_SUPABASE_SECRET_KEY ||
  process.env.SOVEREIGN_SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  '';

/**
 * Checks if Supabase admin credentials are provided.
 * @returns {boolean} True if configured.
 */
function isConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_SERVICE_KEY);
}

/**
 * Creates a Supabase client with admin (service_role) privileges.
 * @returns {import('@supabase/supabase-js').SupabaseClient}
 */
function getAdminClient() {
  if (!isConfigured()) {
    throw new Error('Supabase admin credentials not found. Ensure SOVEREIGN_SUPABASE_URL and SOVEREIGN_SUPABASE_SECRET_KEY are set.');
  }
  
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

module.exports = {
  isConfigured,
  getAdminClient,
  SUPABASE_URL
};
