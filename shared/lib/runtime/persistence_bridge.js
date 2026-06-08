const { createClient } = require('@supabase/supabase-js');

class PersistenceBridge {
  constructor() {
    const url = process.env.SOVEREIGN_SUPABASE_URL;
    const key = process.env.SOVEREIGN_SUPABASE_SECRET_KEY || process.env.SOVEREIGN_SUPABASE_SERVICE_ROLE_KEY;
    this.client = (url && key) ? createClient(url, key) : null;
    // Intentionally silent — startup noise suppressed
  }

  async logOrder(order, provider, metadata = {}, rawResponse = null) {
    if (!this.client) {
      console.log(`[AUDIT-FALLBACK] ${String(order.side).toUpperCase()} ${order.quantity} ${order.instrumentId} (Status: ${order.status})`);
      return;
    }
    try {
      const { error } = await this.client.from('orders').insert({
        instrument_id: order.instrumentId,
        side:          order.side,
        quantity:      order.quantity,
        price:         order.price || null,
        order_type:    order.type,
        status:        order.status,
        provider,
        metadata,
        raw_response:  rawResponse,
        timestamp:     order.timestamp?.toISOString?.() ?? new Date().toISOString(),
      });
      if (error) console.warn(`[PERSISTENCE] Failed to log order: ${error.message}`);
      else console.log(`[PERSISTENCE] Order logged to Supabase: ${order.instrumentId}`);
    } catch (err) {
      console.warn(`[PERSISTENCE] Error during order logging: ${err.message}`);
    }
  }
}

module.exports = { PersistenceBridge };
