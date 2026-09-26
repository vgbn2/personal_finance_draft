import { z } from 'zod';
import { ToolResponse } from '../lib/schemas';

// CommonJS shared imports
// @ts-ignore
const { getDefaultAnalyticsEngine } = require('../../../shared/lib/storage/sqlite_analytics');
// @ts-ignore
const { calculate25DeltaSkew } = require('../../../shared/lib/strategy/options_smile_model');
// @ts-ignore
const { buildDeribitReport, resolveDeribitSettings } = require('../../../shared/lib/brokers/deribit_env');

export const getOptionsAnalyticsSchema = z.object({
  currency: z.enum(['BTC', 'ETH', 'SOL']).optional().default('BTC').describe('Underlying crypto currency (default: BTC)'),
  include_smile: z.boolean().optional().default(true).describe('Whether to include raw volatility smile records'),
});

export const getDeribitStatusSchema = z.object({
  testnet: z.boolean().optional().describe('Check testnet mode configuration'),
});

export async function getOptionsAnalytics(args: z.infer<typeof getOptionsAnalyticsSchema>): Promise<ToolResponse> {
  const currency = args.currency || 'BTC';
  let greeks = null;
  let smileRecords: any[] = [];
  let skew = { rr25: 0, bf25: 0, atmIv: 0 };

  try {
    const analytics = getDefaultAnalyticsEngine();
    greeks = analytics.getNetGreekExposure(currency);
    smileRecords = analytics.getVolatilitySmile(currency);
    if (smileRecords && smileRecords.length > 0) {
      skew = calculate25DeltaSkew(smileRecords);
    }
  } catch (err: any) {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          ok: false,
          currency,
          error: err?.message || 'Analytics engine query failed',
        }),
      }],
      isError: true,
    };
  }

  const payload: Record<string, any> = {
    ok: true,
    currency,
    greeks: greeks || {
      currency,
      net_delta_oi: 0,
      net_gamma_oi: 0,
      net_vega_oi: 0,
      net_theta_oi: 0,
      total_open_interest: 0,
      total_volume_usd: 0,
      contracts_count: 0,
    },
    skew,
    smile_points: smileRecords.length,
  };

  if (args.include_smile) {
    payload.smile = smileRecords;
  }

  return {
    content: [{
      type: 'text',
      text: JSON.stringify(payload, null, 2),
    }],
  };
}

export async function getDeribitStatus(args: z.infer<typeof getDeribitStatusSchema>): Promise<ToolResponse> {
  const options = args.testnet !== undefined ? { testnet: args.testnet } : {};
  const settings = resolveDeribitSettings(process.env, options);
  const report = buildDeribitReport(process.env, options);

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        ok: report.ok,
        broker: 'deribit',
        testnet: settings.testnet,
        baseUrl: settings.baseUrl,
        configured: Boolean(settings.clientId && settings.clientSecret),
        report,
      }, null, 2),
    }],
  };
}
