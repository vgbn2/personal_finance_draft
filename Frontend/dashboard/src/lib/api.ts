/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Centralized API configuration for the Sovereign Trading Platform.
 */

export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8787';
export const API_TOKEN = import.meta.env.VITE_API_TOKEN || '';

export const API_ENDPOINTS = {
  SYSTEM_STATUS: `${API_BASE_URL}/api/system/status`,
  SIGNAL: `${API_BASE_URL}/api/signal`,
  UNIVERSE: `${API_BASE_URL}/api/universe`,
  CORRELATION: `${API_BASE_URL}/api/correlation`,
  BACKTEST: `${API_BASE_URL}/api/backtest`,
  PORTFOLIO: `${API_BASE_URL}/api/backend/portfolio`,
  AUTH_STATUS: `${API_BASE_URL}/api/auth/status`,
  DATABASE_STATUS: `${API_BASE_URL}/api/database/status`,
  SUPABASE_CONFIG: `${API_BASE_URL}/api/supabase/config`,
};

export const DEFAULT_HEADERS = {
  'Content-Type': 'application/json',
  ...(API_TOKEN ? { 'X-Sovereign-Token': API_TOKEN } : {}),
};
