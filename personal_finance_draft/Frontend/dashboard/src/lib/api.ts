/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8787';
export const API_TOKEN = import.meta.env.VITE_API_TOKEN || '';

export const API_ENDPOINTS = {
  SYSTEM_STATUS: `${API_BASE_URL}/api/system/status`,
  SIGNAL: `${API_BASE_URL}/api/signal`,
  UNIVERSE: `${API_BASE_URL}/api/universe`,
  DATA_SUMMARY: `${API_BASE_URL}/api/data/summary`,
  CORRELATION: `${API_BASE_URL}/api/correlation`,
  BACKTEST: `${API_BASE_URL}/api/backtest`,
  PORTFOLIO: `${API_BASE_URL}/api/backend/portfolio`,
  AUTH_STATUS: `${API_BASE_URL}/api/auth/status`,
  DATABASE_STATUS: `${API_BASE_URL}/api/database/status`,
  SUPABASE_CONFIG: `${API_BASE_URL}/api/supabase/config`,
  KILL_SWITCH: `${API_BASE_URL}/api/kill-switch`,
  CONFIG: `${API_BASE_URL}/api/config`,
  SIGMA_BAND:  `${API_BASE_URL}/api/sigma-band`,
  BOT_STATUS:  `${API_BASE_URL}/api/bot/status`,
  BOT_CYCLE:   `${API_BASE_URL}/api/bot/cycle`,
  BOT_SELL:    `${API_BASE_URL}/api/bot/sell`,
};

export const DEFAULT_HEADERS = {
  'Content-Type': 'application/json',
  ...(API_TOKEN ? { 'X-Sovereign-Token': API_TOKEN } : {}),
};

export async function getAuthHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = { ...DEFAULT_HEADERS };
  try {
    const { supabase } = await import('./supabase');
    if (supabase) {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;
    }
  } catch { /* supabase not available */ }
  return headers;
}
