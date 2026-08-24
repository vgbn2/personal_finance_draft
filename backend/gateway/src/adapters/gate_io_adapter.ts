import { BrokerAdapter, Position, TradeOrder } from './types';

export interface GateIoAdapterOptions {
  apiKey?: string;
  apiSecret?: string;
}

export class GateIoAdapter implements BrokerAdapter {
  private readonly apiKey?: string;
  private readonly apiSecret?: string;

  constructor(options: GateIoAdapterOptions = {}) {
    this.apiKey = options.apiKey || process.env.GATEIO_API_KEY;
    this.apiSecret = options.apiSecret || process.env.GATEIO_API_SECRET;
  }

  async placeOrder(order: TradeOrder): Promise<{ orderId: string; status: string }> {
    console.log(`[GATE.IO-ADAPTER] (Stub) Submitting ${order.side.toUpperCase()} for ${order.instrumentId}`);
    return { orderId: `gate-sim-${Date.now()}`, status: 'submitted' };
  }

  async cancelOrder(orderId: string): Promise<boolean> {
    console.log(`[GATE.IO-ADAPTER] (Stub) Canceling ${orderId}`);
    return true;
  }

  async getPortfolioBalance(): Promise<Record<string, number>> {
    return { USDT: 5000 };
  }

  async getPositions(): Promise<Position[]> {
    return [];
  }
}
