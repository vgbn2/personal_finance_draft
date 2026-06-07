import { z } from 'zod';
import { invokeSovereignCli } from '../lib/bridge';
import { agentTradingGate } from '../lib/agent_gate';
import { ToolResponse } from '../lib/schemas';

export const tradeSchema = z.object({
  action: z.enum(['buy', 'sell']).describe('Order side'),
  symbol: z.string().describe('Symbol to trade (e.g. AAPL)'),
  qty: z.union([z.number(), z.string()]).describe('Quantity or amount (e.g. 10 or "amount:1000")'),
  type: z.enum(['market', 'limit']).optional().default('market').describe('Order type'),
  price: z.number().optional().describe('Limit price'),
  live: z.boolean().optional().default(false).describe('Whether to execute live (requires ai_agent_trading feature flag)'),
  confirm_live: z.boolean().optional().default(false).describe('Must be true when live=true; prevents accidental live execution from agents'),
});

export function trade(args: z.infer<typeof tradeSchema>): ToolResponse {
  if (args.live) {
    if (!args.confirm_live) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            ok: false,
            error: 'Live trade blocked: set confirm_live=true alongside live=true to acknowledge real execution.',
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

  const cliArgs = ['trade', args.action, args.symbol, args.qty.toString(), args.type];
  if (args.price !== undefined) cliArgs.push(args.price.toString());
  if (args.live) cliArgs.push('--live');

  return invokeSovereignCli(cliArgs);
}
