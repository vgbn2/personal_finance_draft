import { spawnSync } from 'node:child_process';
import { BrokerAdapter, TradeOrder } from '../adapters/types';

const ansi = {
  boldYellow: '\x1b[1;33m',
  reset: '\x1b[0m',
};

export interface RiskContext {
  portfolioEquity: number;
  referencePrice: number;
  currentDrawdown: number;
  maxDrawdown: number;
}

export async function buildRiskContext(order: TradeOrder, adapter: BrokerAdapter, isDryRun: boolean = false): Promise<RiskContext> {
  let portfolioEquity = 0;
  let currentDrawdown = 0;
  let maxDrawdown = 0.05; // 5% max drawdown threshold default

  try {
    const balances = await adapter.getPortfolioBalance();
    portfolioEquity = balances.EQUITY || balances.USD || 0;
  } catch (error) {
    if (!isDryRun) {
      throw new Error(`Failed to fetch portfolio equity for risk check: ${error}`);
    }
  }

  // Dry run fallback to baseline if equity is zero or unconfigured
  if (isDryRun && portfolioEquity <= 0) {
    portfolioEquity = 100000;
  }

  // Fetch reference price
  let referencePrice = order.price || 0;
  if (!referencePrice || referencePrice <= 0) {
    if (adapter.getQuote) {
      try {
        referencePrice = await adapter.getQuote(order.instrumentId);
      } catch (err) {
        console.warn(`[RISK] Failed to fetch current price for ${order.instrumentId}: ${err}`);
      }
    }
  }

  if (isDryRun && (!referencePrice || referencePrice <= 0)) {
    referencePrice = 100; // Baseline fallback for simulation
  }

  if (!referencePrice || referencePrice <= 0) {
    throw new Error(`Invalid reference price ($${referencePrice}) for instrument ${order.instrumentId}`);
  }

  return {
    portfolioEquity,
    referencePrice,
    currentDrawdown,
    maxDrawdown,
  };
}

export class RiskEngineBridge {
  async checkRisk(order: TradeOrder, context: RiskContext): Promise<{ approved: boolean; reason?: string }> {
    console.log(`[RISK-ENGINE] Pre-trade check for ${order.instrumentId} (${order.quantity} units)`);

    // @ts-ignore
    const { findBackendBinary } = require('../../../../shared/lib/runtime/paths');
    const binary: string | null = findBackendBinary();

    if (!binary) {
      const message = 'CRITICAL: Risk Engine binary not found or non-executable (FAIL-CLOSED)';
      if (process.env.LIVE_TRADING !== 'true' && !process.argv.includes('--live')) {
        console.warn(`${ansi.boldYellow}[WARNING] ${message}${ansi.reset}`);
        console.warn(`${ansi.boldYellow}[WARNING] Proceeding without C++ risk checks (DRY-RUN ONLY)${ansi.reset}`);
        return { approved: true };
      }
      return {
        approved: false,
        reason: message
      };
    }

    const result = spawnSync(binary, ['kill-switch', 'status'], { encoding: 'utf8' });
    if (result.status === 0) {
      try {
        const status = JSON.parse(result.stdout);
        if (status.status === 'engaged') {
          return { approved: false, reason: 'GLOBAL KILL SWITCH ENGAGED' };
        }
      } catch (e) {
        return {
          approved: false,
          reason: 'CRITICAL: Risk Engine returned invalid status payload'
        };
      }
    } else {
      return {
        approved: false,
        reason: 'CRITICAL: Risk Engine process failed during safety check'
      };
    }

    const notional = context.referencePrice * order.quantity;

    const riskCheckArgs = [
      'risk', 'check',
      '--notional', notional.toString(),
      '--equity', context.portfolioEquity.toString(),
      '--volatility', context.portfolioEquity.toString(),
      '--drawdown', context.currentDrawdown.toString(),
      '--max-drawdown', context.maxDrawdown.toString()
    ];

    console.log(`[RISK-ENGINE-BRIDGE] Invoking: ${binary} ${riskCheckArgs.join(' ')}`);
    const riskResult = spawnSync(binary, riskCheckArgs, { encoding: 'utf8' });

    if (riskResult.status === 0 || riskResult.status === 2) {
       try {
          const decision = JSON.parse(riskResult.stdout);
          return {
             approved: decision.approved,
             reason: decision.reason
          };
       } catch (e) {
          return {
             approved: false,
             reason: `CRITICAL: Risk Engine returned malformed JSON: ${riskResult.stdout}`
          };
       }
    }

    return {
      approved: false,
      reason: `CRITICAL: Risk Engine execution failed (Code: ${riskResult.status})`
    };
  }
}
