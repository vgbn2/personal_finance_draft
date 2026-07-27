import { z } from 'zod';
import { extractJsonPayload, invokeSovereignCli } from '../lib/bridge';
import { ToolResponse } from '../lib/schemas';

export const getMarketBiasSchema = z.object({
  symbol: z.string().optional().default('BTCUSDT').describe('Symbol to analyze from the local cache (e.g. BTCUSDT)'),
});

export const getScorecardSchema = z.object({
  family: z.enum(['equities', 'crypto', 'indices', 'commodities', 'fx']).optional().default('crypto'),
  timeframes: z.string().optional().default('1h,4h,1d').describe('Comma-separated cached timeframes'),
  min_confidence: z.number().min(0).max(1).optional().default(0.55).describe('Research confidence floor; 0.55 is the practical default'),
  top: z.number().int().min(1).max(100).optional().default(10),
  direction: z.enum(['long', 'short', 'neutral']).optional(),
  allow_degraded: z.boolean().optional().default(false).describe('Include incomplete rows for research only'),
});

export function buildMarketBiasArgs(args: z.infer<typeof getMarketBiasSchema>): string[] {
  return ['bias', args.symbol.toUpperCase(), '--no-backfill'];
}

export function buildScorecardArgs(args: z.infer<typeof getScorecardSchema>): string[] {
  const cliArgs = [
    'scorecard',
    '--family', args.family,
    '--tf', args.timeframes,
    '--min-conf', args.min_confidence.toString(),
    '--top', args.top.toString(),
    '--no-backfill',
    '--envelope',
  ];
  if (args.direction) cliArgs.push('--direction', args.direction);
  if (args.allow_degraded) cliArgs.push('--allow-degraded');
  return cliArgs;
}

// These are intentionally cached-only diagnostics. Freshness and degraded state remain in the CLI payload.
export async function getMarketBias(args: z.infer<typeof getMarketBiasSchema>): Promise<ToolResponse> {
  return invokeSovereignCli(buildMarketBiasArgs(args));
}

export async function getScorecard(args: z.infer<typeof getScorecardSchema>): Promise<ToolResponse> {
  return invokeSovereignCli(buildScorecardArgs(args));
}

export const getCombinedAnalysisSchema = z.object({
  asset_id: z.string().min(3).describe('Canonical exact asset id, for example fx_pair:OTC:EURUSD'),
  decision_at: z.string().datetime().optional().describe('ISO-8601 decision timestamp; defaults to now'),
  timeframes: z.string().optional().default('1h,4h,1d').describe('Comma-separated cached technical timeframes'),
});

export function buildCombinedAnalysisArgs(args: z.infer<typeof getCombinedAnalysisSchema>): string[] {
  const cliArgs = [
    'combined',
    '--asset-id', args.asset_id,
    '--tf', args.timeframes,
    '--json',
  ];
  if (args.decision_at) cliArgs.push('--decision-at', args.decision_at);
  return cliArgs;
}

export async function getCombinedAnalysis(args: z.infer<typeof getCombinedAnalysisSchema>): Promise<ToolResponse> {
  return invokeSovereignCli(buildCombinedAnalysisArgs(args));
}

export const getMarketSignalSchema = z.object({
  symbol: z.string().optional().default('BTCUSDT').describe('Cached symbol to evaluate (e.g. BTCUSDT)'),
  timeframes: z.string().optional().default('1h,4h,1d').describe('Comma-separated cached timeframes'),
  min_confidence: z.number().min(0).max(1).optional().default(0.55).describe('Research confidence floor; 0.55 is the practical default'),
});

function toolPayload(result: ToolResponse): any | null {
  if (result.isError) return null;
  return extractJsonPayload(result.content?.[0]?.text || '');
}

export function buildMarketSignalDecision(symbol: string, biasPayload: any | null, scorecardPayload: any | null) {
  const normalizedSymbol = symbol.toUpperCase();
  const frames = Array.isArray(biasPayload?.timeframes) ? biasPayload.timeframes : [];
  const fresh = frames.length > 0 && frames.every((frame: any) => frame?.fresh === true);
  const rows = Array.isArray(scorecardPayload?.rows) ? scorecardPayload.rows : [];
  const row = rows.find((candidate: any) => String(candidate?.symbol || '').toUpperCase() === normalizedSymbol);

  if (!fresh) {
    return { ok: false, decision: 'no_trade', symbol: normalizedSymbol, reason: 'Cached bias data is missing or stale.' };
  }
  if (!row) {
    return { ok: false, decision: 'no_trade', symbol: normalizedSymbol, reason: 'No eligible cached scorecard row was found.' };
  }
  if (row.decision_state !== 'eligible') {
    return { ok: false, decision: 'no_trade', symbol: normalizedSymbol, reason: `Scorecard is ${row.decision_state || 'ineligible'}.` };
  }

  return {
    ok: true,
    decision: 'review_only',
    symbol: normalizedSymbol,
    direction: row.bias || biasPayload?.aggregate?.direction || 'neutral',
    confidence: row.confidence,
    reason: 'Fresh cached research meets the scorecard eligibility gate. This tool never places orders.',
  };
}

// This is a research-only reconciliation of cached diagnostics. It does not invoke any trading command.
export async function getMarketSignal(args: z.infer<typeof getMarketSignalSchema>): Promise<ToolResponse> {
  const [biasResult, scorecardResult] = await Promise.all([
    getMarketBias({ symbol: args.symbol }),
    getScorecard({
      family: 'crypto',
      timeframes: args.timeframes,
      min_confidence: args.min_confidence,
      top: 100,
      allow_degraded: false,
    }),
  ]);
  const decision = buildMarketSignalDecision(args.symbol, toolPayload(biasResult), toolPayload(scorecardResult));
  return { content: [{ type: 'text', text: JSON.stringify(decision, null, 2) }] };
}
