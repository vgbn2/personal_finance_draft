import { BrokerAdapter, TradeOrder } from '../adapters/types';
import { AlpacaAdapter } from '../adapters/alpaca_adapter';
import { RiskEngineBridge, RiskContext } from './risk_engine_bridge';

// @ts-ignore
const { PersistenceBridge } = require('../../../shared/lib/runtime/persistence_bridge');

export enum OrderStatus {
  SUBMITTED = 'submitted',
  FILLED = 'filled',
  FAILED = 'failed',
  RISK_REJECTED = 'risk_rejected',
}

export class ExecutionGateway {
  private dryRun: boolean;
  private adapter: BrokerAdapter;
  private riskEngine: RiskEngineBridge;
  private persistence: any;
  private paperMaxNotional: number | null;

  constructor(options: { dryRun?: boolean; adapter?: BrokerAdapter; paperMaxNotional?: number } = {}) {
    this.dryRun = options.dryRun ?? true;
    this.adapter = options.adapter || new AlpacaAdapter();
    this.riskEngine = new RiskEngineBridge();
    this.persistence = new PersistenceBridge();
    this.paperMaxNotional = Number.isFinite(options.paperMaxNotional) && Number(options.paperMaxNotional) > 0
      ? Number(options.paperMaxNotional)
      : null;
  }

  async validateOrder(order: TradeOrder & any): Promise<boolean> {
    console.log(`[EXECUTION] Validating order for ${order.instrumentId}`);

    if (order.quantity <= 0) {
      console.error('[RISK] Rejection: Quantity must be positive');
      return false;
    }
    if (order.type === 'limit' && (!Number.isFinite(order.price || NaN) || (order.price || 0) <= 0)) {
      console.error('[RISK] Rejection: Limit orders require a positive price');
      return false;
    }

    let riskContext: RiskContext;
    try {
      // @ts-ignore
      const { buildRiskContext } = require('../index');
      riskContext = await buildRiskContext(order, this.adapter, this.dryRun || Boolean(order.providerPaper));
    } catch (error: any) {
      console.error(`[RISK] Rejection: ${error.message}`);
      return false;
    }

    if (order.providerPaper && this.paperMaxNotional !== null) {
      const notional = riskContext.referencePrice * order.quantity;
      if (!Number.isFinite(notional) || notional > this.paperMaxNotional) {
        console.error(`[RISK] Rejection: Paper Alpaca notional ${notional} exceeds cap ${this.paperMaxNotional}`);
        return false;
      }
    }

    const riskResult = await this.riskEngine.checkRisk(order, riskContext);
    if (!riskResult.approved) {
      console.error(`[RISK] Rejection: ${riskResult.reason}`);
      return false;
    }

    return true;
  }

  async execute(order: TradeOrder & any): Promise<void> {
    const isValid = await this.validateOrder(order);
    if (!isValid) {
      order.status = OrderStatus.RISK_REJECTED;
      await this.persistence.logOrder(order, 'internal', { reason: 'risk_rejected' });
      return;
    }

    if (this.dryRun) {
      console.log(`[DRY-RUN] Would execute ${order.side} ${order.quantity} of ${order.instrumentId}`);
      order.status = OrderStatus.SUBMITTED;
      await this.persistence.logOrder(order, 'simulated');
    } else {
      try {
        const result = await this.adapter.placeOrder(order);
        const label = order.providerPaper ? 'PAPER-ALPACA' : 'LIVE';
        console.log(`[${label}] Order placed successfully: ${result.orderId} (Status: ${result.status})`);
        order.status = result.status === 'filled' ? OrderStatus.FILLED : OrderStatus.SUBMITTED;

        await this.persistence.logOrder(order, order.providerPaper ? 'alpaca_paper' : 'alpaca', {
          order_id: result.orderId,
          strategy: order.strategy || null,
          paper: Boolean(order.providerPaper),
        }, result);

      } catch (error: any) {
        const label = order.providerPaper ? 'PAPER-ALPACA' : 'LIVE';
        console.error(`[${label}] Execution failed: ${error}`);
        order.status = OrderStatus.FAILED;
        order.error = error.message ?? String(error);
        await this.persistence.logOrder(order, order.providerPaper ? 'alpaca_paper' : 'alpaca', {
          error: error.message,
          strategy: order.strategy || null,
          paper: Boolean(order.providerPaper),
        });
      }
    }
  }
}
