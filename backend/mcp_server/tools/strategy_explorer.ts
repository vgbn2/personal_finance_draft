import { z } from 'zod';
import { ToolResponse } from '../lib/schemas';
// @ts-ignore
const { runExplorationCycle } = require('../../../scripts/strategies/auto_strategy_explorer.js');

export const exploreStrategySchema = z.object({
  save_yaml: z.boolean().optional().default(true).describe('Whether to persist the strategy definition as a YAML file in config/strategies/'),
});

export async function exploreStrategy(_args: z.infer<typeof exploreStrategySchema>): Promise<ToolResponse> {
  try {
    const result = await runExplorationCycle();
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (error: any) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            ok: false,
            error: error?.message || 'Unknown error during strategy exploration',
          }, null, 2),
        },
      ],
      isError: true,
    };
  }
}
