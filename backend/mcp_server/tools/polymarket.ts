import { z } from 'zod';
import { invokeSovereignCli } from '../lib/bridge';
import { agentTradingGate } from '../lib/agent_gate';
import { ToolResponse } from '../lib/schemas';

export const getPolymarketMarketsSchema = z.object({
  category: z.string().optional().default('crypto').describe('Market category slug (e.g. crypto, politics, sports)'),
  limit: z.number().int().min(1).max(50).optional().default(25).describe('Max markets to return (1-50)'),
});

export async function getPolymarketMarkets(args: z.infer<typeof getPolymarketMarketsSchema>): Promise<ToolResponse> {
  return invokeSovereignCli(['polymarket', 'markets', String(args.limit), '--category', args.category]);
}

export const getPolymarketPortfolioSchema = z.object({});

export async function getPolymarketPortfolio(): Promise<ToolResponse> {
  return invokeSovereignCli(['polymarket', 'portfolio']);
}

export const placePolymarketOrderSchema = z.object({
  token_id: z.string().describe('CLOB token ID for the outcome to buy'),
  size: z.number().describe('Number of shares (USDC-denominated)'),
  price: z.number().optional().describe('Limit price per share (0-1). Live TUI orders use an explicit limit price.'),
  max_cost_usdc: z.number().optional().describe('Optional safety cap; refuse the order if size * price exceeds this amount'),
  live: z.boolean().optional().default(false).describe('Execute live order (requires ai_agent_trading feature flag)'),
  confirm_live: z.boolean().optional().default(false).describe('Must be true when live=true; prevents accidental live execution from agents'),
});

export async function placePolymarketOrder(args: z.infer<typeof placePolymarketOrderSchema>): Promise<ToolResponse> {
  if (args.price !== undefined && (args.price <= 0 || args.price >= 1)) {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ ok: false, error: 'Polymarket price must be between 0 and 1 (exclusive).' }),
      }],
      isError: true,
    };
  }

  if (args.max_cost_usdc !== undefined && args.price !== undefined) {
    const estimatedCost = args.size * args.price;
    if (estimatedCost > args.max_cost_usdc) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            ok: false,
            error: `Estimated order cost ${estimatedCost.toFixed(4)} exceeds max_cost_usdc ${args.max_cost_usdc}.`,
          }),
        }],
        isError: true,
      };
    }
  }

  if (args.live) {
    if (!args.confirm_live) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            ok: false,
            error: 'Live Polymarket order blocked: set confirm_live=true alongside live=true to acknowledge real execution.',
          }),
        }],
        isError: true,
      };
    }
    if (args.price === undefined) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            ok: false,
            error: 'Live Polymarket orders require an explicit limit price for TUI/MCP parity.',
          }),
        }],
        isError: true,
      };
    }
    const gate = agentTradingGate();
    if (!gate.allowed) {
      return {
        content: [{ type: 'text', text: JSON.stringify({ ok: false, error: gate.error }) }],
        isError: true,
      };
    }
  }

  const cliArgs = ['polymarket', 'buy', args.token_id, String(args.size)];
  if (args.price !== undefined) cliArgs.push(String(args.price));
  if (args.live) cliArgs.push('--live');
  return invokeSovereignCli(cliArgs);
}
