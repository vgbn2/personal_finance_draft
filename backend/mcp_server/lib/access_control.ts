// Shared auth modules are CommonJS and compile outside this TypeScript package.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { authenticateServiceToken } = require('../../../shared/lib/auth/service_principals');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { authorize, CAPABILITIES } = require('../../../shared/lib/auth/access_policy');

const TOOL_CAPABILITIES: Record<string, string> = Object.freeze({
  get_system_status: CAPABILITIES.STATUS_READ,
  run_backtest: CAPABILITIES.RESEARCH_RUN,
  get_market_universe: CAPABILITIES.DATA_READ,
  trade: CAPABILITIES.PAPER_OPERATE,
  get_portfolio: CAPABILITIES.PORTFOLIO_READ,
  backfill: CAPABILITIES.DATA_WRITE,
  get_data_summary: CAPABILITIES.DATA_READ,
  get_correlation: CAPABILITIES.RESEARCH_READ,
  get_data_availability: CAPABILITIES.DATA_READ,
  get_sigma_bands: CAPABILITIES.RESEARCH_READ,
  get_indicators: CAPABILITIES.RESEARCH_READ,
  get_price: CAPABILITIES.DATA_READ,
  get_market_bias: CAPABILITIES.RESEARCH_READ,
  get_scorecard: CAPABILITIES.RESEARCH_READ,
  get_combined_analysis: CAPABILITIES.RESEARCH_READ,
  get_market_signal: CAPABILITIES.RESEARCH_READ,
  backfill_family: CAPABILITIES.DATA_WRITE,
  backfill_all: CAPABILITIES.DATA_WRITE,
  get_polymarket_markets: CAPABILITIES.RESEARCH_READ,
  get_polymarket_portfolio: CAPABILITIES.PORTFOLIO_READ,
  place_polymarket_order: CAPABILITIES.PAPER_OPERATE,
});

export interface McpAccessDecision {
  allowed: boolean;
  reason: string;
  required: string[];
  missing: string[];
  principalId: string | null;
}

export function resolveMcpPrincipal(env: NodeJS.ProcessEnv = process.env): any | null {
  return authenticateServiceToken(env.SOVEREIGN_MCP_SERVICE_TOKEN || '', { env });
}

export function authorizeMcpTool(
  toolName: string,
  args: Record<string, unknown> = {},
  env: NodeJS.ProcessEnv = process.env,
): McpAccessDecision {
  const principal = resolveMcpPrincipal(env);
  const baseCapability = TOOL_CAPABILITIES[toolName];
  if (!baseCapability) {
    return {
      allowed: false,
      reason: 'unclassified_mcp_tool',
      required: [],
      missing: [],
      principalId: principal?.id || null,
    };
  }
  const required = [baseCapability];
  if (
    (toolName === 'trade' || toolName === 'place_polymarket_order')
    && args.live === true
  ) {
    required.push(CAPABILITIES.LIVE_EXECUTE);
  }
  const decision = authorize(principal, required);
  return {
    ...decision,
    principalId: principal?.id || null,
  };
}

export function authorizeMcpResource(env: NodeJS.ProcessEnv = process.env): McpAccessDecision {
  const principal = resolveMcpPrincipal(env);
  const decision = authorize(principal, [CAPABILITIES.RESEARCH_READ]);
  return {
    ...decision,
    principalId: principal?.id || null,
  };
}

export { TOOL_CAPABILITIES };
