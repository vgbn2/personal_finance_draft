/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Local offline stub for Supabase client.
 * Sovereign trading kernel operates local-first via native REST/WebSocket and paper ledger.
 */

export interface Session {
  access_token?: string;
  user?: {
    id: string;
    email?: string;
    role?: string;
  };
}

export const isSupabaseConfigured = false;
export const supabase: any = null;

/**
 * Helper to get the current session token for passing to the local backend.
 */
export async function getSessionToken(): Promise<string | null> {
  return null;
}

/**
 * Real-time subscription to order events (offline stub).
 */
export function subscribeToOrders(_callback: (payload: any) => void) {
  return () => {};
}

