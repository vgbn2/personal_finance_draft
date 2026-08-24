import { BrokerAdapter, Position, TradeOrder } from './types';

export class SimulationAdapter implements BrokerAdapter {
  private simulatedBalance: number = 100000;
  private positions: Map<string, Position> = new Map();

  async placeOrder(order: TradeOrder): Promise<{ orderId: string; status: string }> {
    console.log(`[SIMULATION-ADAPTER] Execution Order: ${order.side.toUpperCase()} ${order.quantity} of ${order.instrumentId}`);
    const simulatedOrderId = `sim-ord-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const price = order.price ?? 100;
    const currentPos = this.positions.get(order.instrumentId) || {
      symbol: order.instrumentId,
      quantity: 0,
      averagePrice: 0,
      marketValue: 0,
      unrealizedPl: 0,
    };

    if (order.side === 'buy') {
      const totalQty = currentPos.quantity + order.quantity;
      const totalCost = (currentPos.quantity * currentPos.averagePrice) + (order.quantity * price);
      currentPos.quantity = totalQty;
      currentPos.averagePrice = totalQty > 0 ? totalCost / totalQty : 0;
      this.simulatedBalance -= order.quantity * price;
    } else {
      currentPos.quantity = Math.max(0, currentPos.quantity - order.quantity);
      this.simulatedBalance += order.quantity * price;
    }
    currentPos.marketValue = currentPos.quantity * price;
    this.positions.set(order.instrumentId, currentPos);

    return { orderId: simulatedOrderId, status: 'filled' };
  }

  async cancelOrder(orderId: string): Promise<boolean> {
    console.log(`[SIMULATION-ADAPTER] Canceled Simulated Order ${orderId}`);
    return true;
  }

  async getPortfolioBalance(): Promise<Record<string, number>> {
    return { USD: this.simulatedBalance };
  }

  async getPositions(): Promise<Position[]> {
    return Array.from(this.positions.values());
  }

  async getQuote(symbol: string): Promise<number> {
    return 100;
  }
}
