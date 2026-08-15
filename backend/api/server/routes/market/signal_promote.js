const { signalStatus } = require('../../services/cli_executor');
const {
  createSovereignSupabaseClient,
  getAuthStatus,
} = require('../../services/supabase_client');
const {
  appendWorkflowEvent,
  digest,
  workflowScope,
} = require('../../../../../shared/lib/analysis/promotion_store');
const { isValidSignalId } = require('../../services/input_validator');

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

    const invalidIds = signalIds.filter((id) => !isValidSignalId(id));
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

    const principal = req.sovereignPrincipal;
    const scopeId = workflowScope(principal) || auth.user.id;

    // Cryptographic hash-chained workflow event logging
    const sortedIds = [...requestedIds].sort();
    const idsHash = digest(sortedIds);
    const idempotencyKey = String(query.idempotency_key || `promote:signal:${idsHash}`);
    let stored;
    try {
      stored = appendWorkflowEvent({
        scopeId,
        eventType: 'signal_promoted',
        idempotencyKey,
        actor: {
          principal_id: principal?.id || auth.user.id,
          identity_type: principal?.identity_type || 'user',
          acting_user_id: principal?.acting_user_id || auth.user.id,
        },
        payload: {
          signal_ids: sortedIds,
          promoted_at: new Date().toISOString(),
          source: 'dashboard',
          research_only: true,
          live_authorized: false,
        },
      });
    } catch (err) {
      console.warn('[BACKEND] Workflow promotion event failed:', err.message);
    }

    const supabase = createSovereignSupabaseClient(req);
    if (!supabase) {
      return { ok: false, error: 'Supabase not configured' };
    }

    try {
      // Log the promotion as an audit event in Supabase
      const { error } = await supabase
        .from('audit_events')
        .insert({
          event_type: 'SIGNAL_PROMOTION',
          user_id: auth.user.id,
          severity: 'info',
          metadata: {
            signal_ids: requestedIds,
            source: 'dashboard',
            promoted_at: new Date().toISOString(),
            checksum: stored?.event?.checksum || null,
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
        promotion_id: stored?.event?.event_id || null,
        duplicate: stored?.duplicate || false,
      };
    } catch (err) {
      console.error('[BACKEND] Promotion persistence failed:', err.message);
      return { ok: false, error: err.message };
    }
  },
};
