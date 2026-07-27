const { buildCachedCombinedResearch } = require('../../../../cli/commands/research/combined');
const {
  appendWorkflowEvent,
  digest,
  workflowScope,
} = require('../../../../../shared/lib/analysis/promotion_store');

module.exports = {
  path: '/api/combined-analysis/promote',
  status: (payload) => (payload.ok ? 200 : payload.error === 'auth_required' ? 401 : 400),
  handle: async (query, { req }) => {
    if (req.method !== 'POST') return { ok: false, error: 'method_not_allowed' };
    const principal = req.sovereignPrincipal;
    const scopeId = workflowScope(principal);
    if (!scopeId) return { ok: false, error: 'auth_required' };

    const envelope = await buildCachedCombinedResearch({
      assetId: String(query.asset_id || ''),
      decisionAt: String(query.decision_at || new Date().toISOString()),
      timeframes: String(query.tf || '1h,4h,1d'),
    });
    if (!envelope.ok || !envelope.eligible || envelope.degraded) {
      return {
        ok: false,
        error: 'combined_envelope_not_eligible',
        reasons: envelope.reasons,
        envelope,
      };
    }

    const envelopeHash = digest(envelope);
    const idempotencyKey = String(query.idempotency_key || `promote:${envelopeHash}`);
    let stored;
    try {
      stored = appendWorkflowEvent({
        scopeId,
        eventType: 'combined_signal_promoted',
        idempotencyKey,
        actor: {
          principal_id: principal.id,
          identity_type: principal.identity_type,
          acting_user_id: principal.acting_user_id,
        },
        payload: {
          asset_id: envelope.asset_id,
          decision_at: envelope.decision_at,
          direction: envelope.scorecard_row.direction,
          composite_strength: envelope.scorecard_row.composite_strength,
          engine_version: envelope.engine_version,
          policy_version: envelope.policy_version,
          envelope_hash: envelopeHash,
          research_only: true,
          live_authorized: false,
        },
      });
    } catch (error) {
      return { ok: false, error: error.message };
    }
    if (!stored.ok) return stored;
    return {
      ok: true,
      type: 'combined_promotion',
      promotion_id: stored.event.event_id,
      duplicate: stored.duplicate,
      paper_operation_required: true,
      live_authorized: false,
    };
  },
};
