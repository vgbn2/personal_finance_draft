const { createSovereignSupabaseClient } = require('../services/supabase_client');

module.exports = {
  path: '/api/signal/promote',
  status: (payload) => (payload && payload.ok ? 200 : 400),
  handle: async (query, { req }) => {
    if (req.method !== 'POST') {
      return { ok: false, error: 'Method Not Allowed' };
    }

    // Parse body (simple JSON parsing)
    let body = {};
    try {
      const buffers = [];
      for await (const chunk of req) {
        buffers.push(chunk);
      }
      const data = Buffer.concat(buffers).toString();
      body = JSON.parse(data);
    } catch (err) {
      return { ok: false, error: 'Invalid JSON body' };
    }

    const { signalIds } = body;
    if (!Array.isArray(signalIds) || signalIds.length === 0) {
      return { ok: false, error: 'Missing or invalid signalIds' };
    }

    // SANITIZATION: Ensure all IDs are strings and within reasonable length
    const sanitizedIds = signalIds
      .filter(id => typeof id === 'string' && id.length > 0 && id.length < 128)
      .map(id => id.replace(/[^a-zA-Z0-9\-_]/g, ''));

    if (sanitizedIds.length === 0) {
      return { ok: false, error: 'No valid signal IDs provided after sanitization' };
    }

    const supabase = createSovereignSupabaseClient();
    if (!supabase) {
      return { ok: false, error: 'Supabase not configured' };
    }

    try {
      // Log the promotion as an audit event
      const { data, error } = await supabase
        .from('audit_events')
        .insert({
          event_type: 'SIGNAL_PROMOTION',
          severity: 'info',
          metadata: {
            signal_ids: sanitizedIds,
            source: 'dashboard',
            promoted_at: new Date().toISOString()
          }
        });

      if (error) throw error;

      return { 
        ok: true, 
        message: `${signalIds.length} signals promoted successfully`,
        promoted_count: signalIds.length 
      };
    } catch (err) {
      console.error('[BACKEND] Promotion persistence failed:', err.message);
      return { ok: false, error: err.message };
    }
  },
};
