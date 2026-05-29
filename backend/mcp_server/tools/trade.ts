import { z } from 'zod';
import { invokeSovereignCli } from '../lib/bridge';
import { ToolResponse } from '../lib/schemas';

export const tradeSchema = z.object({
  action: z.enum(['buy', 'sell']).describe('Order side'),
  symbol: z.string().describe('Symbol to trade (e.g. AAPL)'),
  qty: z.union([z.number(), z.string()]).describe('Quantity or amount (e.g. 10 or "amount:1000")'),
  type: z.enum(['market', 'limit']).optional().default('market').describe('Order type'),
  price: z.number().optional().describe('Limit price'),
  live: z.boolean().optional().default(false).describe('Whether to execute live (danger)')
});

export function trade(args: z.infer<typeof tradeSchema>): ToolResponse {
  const cliArgs = ['trade', args.action, args.symbol, args.qty.toString(), args.type];
  if (args.price !== undefined) cliArgs.push(args.price.toString());
  if (args.live) cliArgs.push('--live');

  return invokeSovereignCli(cliArgs);
}
