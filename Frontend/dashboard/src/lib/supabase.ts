/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { createClient } from '@supabase/supabase-js';

/**
 * Supabase client initialization for the Sovereign Trading Platform.
 * 
 * Keep all project-specific keys in environment variables.
 */

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
export const supabase = isSupabaseConfigured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

/**
 * Helper to get the current session token for passing to the local backend.
 */
export async function getSessionToken(): Promise<string | null> {
  if (!supabase) return null;
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token || null;
}

/**
 * Real-time subscription to order events.
 * Focused only on execution feedback to minimize throughput on the 512MB Supabase plan.
 */
export function subscribeToOrders(callback: (payload: any) => void) {
  if (!supabase) return () => {};

  try {
    const channel = supabase
      .channel('order-updates')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'orders' },
        (payload) => callback(payload)
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders' },
        (payload) => callback(payload)
      )
      .subscribe((status, err) => {
        if (status === 'CHANNEL_ERROR' || err) {
          console.warn('Realtime subscription warning:', err || status);
        }
      });

    return () => {
      try {
        supabase.removeChannel(channel);
      } catch (_) {}
    };
  } catch (err) {
    console.warn('Failed to subscribe to order updates:', err);
    return () => {};
  }
}
