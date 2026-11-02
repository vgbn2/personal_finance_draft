class PersistenceBridge {
  constructor() {
    this.client = null;
  }

  async logOrder(order, _provider, _metadata = {}, _rawResponse = null) {
    console.log(`[AUDIT-FALLBACK] ${String(order?.side || '').toUpperCase()} ${order?.quantity || 0} ${order?.instrumentId || ''} (Status: ${order?.status || 'unknown'})`);
  }
}

module.exports = { PersistenceBridge };
