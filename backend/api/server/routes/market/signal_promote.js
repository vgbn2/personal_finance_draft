const { signalStatus } = require('../../services/cli_executor');
const {
  createSovereignSupabaseClient,
  getAuthStatus,
} = require('../../services/supabase_client');

module.exports = {
  path: '/api/signal/promote',
  status: (payload) => {
    if (payload && payload.ok) return 200;
    if (payload && payload.error === 'auth_required') return 401;
    if (payload && payload.error === 'Supabase not configured') return 503;
    return 400;
  },
  handle: async (query, { req }) => {
    if (req.method !== 'POST') {
      return { ok: false, error: 'Method Not Allowed' };
    }

    // app.js has already parsed and merged the JSON request body into query.
    const { signalIds } = query;
    if (!Array.isArray(signalIds) || signalIds.length === 0) {
      return { ok: false, error: 'Missing or invalid signalIds' };
    }

    const invalidIds = signalIds.filter((id) => (
      typeof id !== 'string' || id.length === 0 || id.length >= 128 || !/^[a-zA-Z0-9_-]+$/.test(id)
    ));
    if (invalidIds.length > 0) {
      return { ok: false, error: 'invalid_signal_ids', rejected_signal_ids: invalidIds };
    }
    const requestedIds = [...signalIds];

    const current = signalStatus();
    const activeIds = new Set((current.signals || [])
      .filter((signal) => signal.active && !signal.expired)
      .map((signal) => signal.signal_id));
    const rejectedIds = requestedIds.filter((id) => !activeIds.has(id));
    if (rejectedIds.length > 0) {
      return {
        ok: false,
        error: 'stale_or_inactive_signals',
        rejected_signal_ids: rejectedIds,
      };
    }

    const auth = await getAuthStatus(req);
    if (!auth.authenticated) {
      return { ok: false, error: 'auth_required' };
    }

    const supabase = createSovereignSupabaseClient(req);
    if (!supabase) {
      return { ok: false, error: 'Supabase not configured' };
    }

    try {
      // Log the promotion as an audit event
      const { data, error } = await supabase
        .from('audit_events')
        .insert({
          event_type: 'SIGNAL_PROMOTION',
          user_id: auth.user.id,
          severity: 'info',
          metadata: {
            signal_ids: requestedIds,
            source: 'dashboard',
            promoted_at: new Date().toISOString()
          }
        });

      if (error) throw error;

      // --- TELEMETRY EMISSION ---
      if (global.sovereignIo) {
        global.sovereignIo.emit('telemetry', {
          timestamp: new Date().toISOString(),
          msg: `Dashboard promoted ${requestedIds.length} signals: ${requestedIds.slice(0, 3).join(', ')}${requestedIds.length > 3 ? '...' : ''}`,
          level: 'info'
        });
      }

      return { 
        ok: true, 
        message: `${requestedIds.length} signal review decisions recorded; no order was executed`,
        promoted_count: requestedIds.length,
        execution_started: false,
      };
    } catch (err) {
      console.error('[BACKEND] Promotion persistence failed:', err.message);
      return { ok: false, error: err.message };
    }
  },
};
