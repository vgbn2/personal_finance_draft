const {
  appendWorkflowEvent,
  readWorkflow,
  workflowScope,
} = require('../../../../../shared/lib/analysis/promotion_store');

module.exports = {
  path: '/api/combined-analysis/paper-cycle',
  status: (payload) => (payload.ok ? 200 : payload.error === 'auth_required' ? 401 : 400),
  handle: async (query, { req }) => {
    if (req.method !== 'POST') return { ok: false, error: 'method_not_allowed' };
    const principal = req.sovereignPrincipal;
    const scopeId = workflowScope(principal);
    if (!scopeId) return { ok: false, error: 'auth_required' };
    const promotionId = String(query.promotion_id || '');
    const workflow = readWorkflow(undefined, scopeId);
    if (!workflow.ok) return workflow;
    const promotion = workflow.events.find((event) => (
      event.event_id === promotionId && event.event_type === 'combined_signal_promoted'
    ));
    if (!promotion) return { ok: false, error: 'promotion_not_found_in_principal_scope' };

    let stored;
    try {
      stored = appendWorkflowEvent({
        scopeId,
        eventType: 'combined_paper_operation',
        idempotencyKey: String(query.idempotency_key || `paper:${promotionId}`),
        actor: {
          principal_id: principal.id,
          identity_type: principal.identity_type,
          acting_user_id: principal.acting_user_id,
        },
        payload: {
          promotion_id: promotionId,
          asset_id: promotion.payload.asset_id,
          direction: promotion.payload.direction,
          mode: 'paper',
          operation: 'reviewed_signal_intent',
          live: false,
          provider_submission: false,
        },
      });
    } catch (error) {
      return { ok: false, error: error.message };
    }
    if (!stored.ok) return stored;
    return {
      ok: true,
      type: 'combined_paper_operation',
      operation_id: stored.event.event_id,
      promotion_id: promotionId,
      duplicate: stored.duplicate,
      mode: 'paper',
      provider_submission: false,
      live_authorized: false,
    };
  },
};
