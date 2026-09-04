import { z } from 'zod';
import { ToolResponse } from '../lib/schemas';
// @ts-ignore
const { evaluateAndRegisterSpec, runExplorationCycle } = require('../../../scripts/strategies/auto_strategy_explorer.js');

export const exploreStrategySchema = z.object({
  name: z.string().optional().describe('Unique descriptive strategy name (e.g. "vol_regime_svm_breakout_1h"). If omitted, auto-generated.'),
  hypothesis: z.string().optional().describe('The theoretical or empirical market edge thesis driving this strategy'),
  family: z.enum(['momentum', 'mean_reversion', 'breakout', 'volatility', 'ml_alpha', 'stat_arb', 'orderflow']).optional().default('momentum').describe('Quantitative strategy family/classification'),
  model: z.enum(['knn_pattern_v0', 'svm_margin_v0', 'random_forest_v0', 'cnn_window_v0', 'decision_tree_stump_v0', 'logistic_regression_v0']).optional().default('knn_pattern_v0').describe('Predictive ML/statistical model'),
  timeframe: z.enum(['5m', '15m', '30m', '1h', '4h', '1d']).optional().default('1h').describe('Primary bar interval for feature engineering and signals'),
  universe: z.array(z.string()).min(1).optional().default(['SPY', 'QQQ']).describe('Target asset symbols to evaluate (e.g. ["BTCUSDT", "ETHUSDT"] or ["SPY", "QQQ"])'),
  indicators: z.record(z.boolean()).optional().default({
    rsi: true,
    bollinger: true,
    atr: true,
    return_fast: true,
    return_slow: true,
    volatility: true,
  }).describe('Active indicator feature set used for ML feature extraction'),
  threshold: z.number().min(0.50).max(0.99).optional().default(0.60).describe('Model conviction probability/confidence trigger floor (0.50 - 0.99)'),
  max_holding_days: z.number().int().positive().optional().default(5).describe('Maximum trade holding period horizon in bars/days'),
  risk_weight: z.number().min(0.01).max(1.0).optional().default(0.10).describe('Target portfolio risk allocation fraction (0.01 - 1.00)'),
  entry_signal: z.string().optional().describe('Description of entry trigger condition'),
  exit_signal: z.string().optional().describe('Description of exit trigger condition'),
  save_yaml: z.boolean().optional().default(true).describe('Whether to persist the evaluated strategy definition as a YAML file in config/strategies/'),
});

export async function exploreStrategy(args: z.infer<typeof exploreStrategySchema>): Promise<ToolResponse> {
  try {
    let result;
    if (args.name || args.hypothesis) {
      const spec = {
        name: args.name || `agent_${args.family || 'custom'}_${args.model || 'knn'}_${args.timeframe || '1h'}_${Date.now().toString(36)}`,
        hypothesis: args.hypothesis || 'Autonomous AI agent generated market hypothesis',
        family: args.family,
        model: args.model,
        timeframe: args.timeframe,
        universe: args.universe,
        indicators: args.indicators,
        threshold: args.threshold,
        max_holding_days: args.max_holding_days,
        risk_weight: args.risk_weight,
        entry_signal: args.entry_signal,
        exit_signal: args.exit_signal,
      };
      result = await evaluateAndRegisterSpec(spec, { save_yaml: args.save_yaml !== false });
    } else {
      result = await runExplorationCycle();
    }

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
