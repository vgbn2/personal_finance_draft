/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { createSocketAuthProvider } from './socket_auth';

export const API_BASE_URL = import.meta.env.VITE_API_URL || '';

export const API_ENDPOINTS = {
  STATUS: `${API_BASE_URL}/api/status`,
  SYSTEM_STATUS: `${API_BASE_URL}/api/system/status`,
  MARKET_MONITOR: `${API_BASE_URL}/api/market/monitor`,
  SERVICE_HEALTH: `${API_BASE_URL}/api/system/service-health`,
  SIGNAL: `${API_BASE_URL}/api/signal`,
  UNIVERSE: `${API_BASE_URL}/api/universe`,
  DATA_SUMMARY: `${API_BASE_URL}/api/data/summary`,
  CORRELATION: `${API_BASE_URL}/api/correlation`,
  SCORECARD: `${API_BASE_URL}/api/scorecard`,
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
  INFRA:       `${API_BASE_URL}/api/system/infra`,
};

export const DEFAULT_HEADERS = {
  'Content-Type': 'application/json',
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

export async function getSocketAuth(): Promise<{ token?: string }> {
  const headers = await getAuthHeaders();
  const authorization = headers.Authorization;
  if (!authorization) return {};
  const match = /^Bearer\s+(.+)$/i.exec(authorization);
  return match?.[1] ? { token: match[1] } : {};
}

export const socketAuthProvider = createSocketAuthProvider(getSocketAuth);
