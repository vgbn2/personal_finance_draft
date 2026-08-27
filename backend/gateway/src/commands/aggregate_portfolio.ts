import type { GatewayPosition } from '../polymarket_read_adapter';
import { renderPolymarketSection } from './polymarket_private';
import {
  buildAggregatedPortfolioSnapshot,
  summarizePortfolio as summarizeInternalPaperPortfolio,
} from '../polymarket';

const ansi = {
  reset: '\x1b[0m', bold: '\x1b[1m', red: '\x1b[31m', green: '\x1b[32m',
  boldGreen: '\x1b[1;32m', boldCyan: '\x1b[1;36m',
} as const;

export interface AggregateAdapterResult {
  name: string;
  ok: boolean;
  balance?: Record<string, number>;
  positions?: GatewayPosition[];
  error?: string;
}

export interface AggregatePortfolioInputs {
  liveResults: AggregateAdapterResult[];
  livePaperResults: AggregateAdapterResult[];
  polymarket: any;
  internalPaperPortfolio: any;
}

export interface AggregatePortfolioSource {
  collect(scope: string): Promise<AggregatePortfolioInputs>;
}

export interface AggregatePortfolioOutput {
  log(...values: unknown[]): void;
  error(...values: unknown[]): void;
}

function dedupePositions(positions: GatewayPosition[]): GatewayPosition[] {
  const merged = new Map<string, GatewayPosition>();
  for (const position of positions) {
    const existing = merged.get(position.symbol);
    if (!existing) {
      merged.set(position.symbol, { ...position });
      continue;
    }
    const totalQuantity = existing.quantity + position.quantity;
    const averagePrice = totalQuantity === 0
      ? 0
      : ((existing.quantity * existing.averagePrice) + (position.quantity * position.averagePrice)) / totalQuantity;
    merged.set(position.symbol, {
      symbol: position.symbol,
      quantity: totalQuantity,
      averagePrice: Number(averagePrice.toFixed(4)),
      marketValue: existing.marketValue + position.marketValue,
      unrealizedPl: existing.unrealizedPl + position.unrealizedPl,
    });
  }
  return Array.from(merged.values());
}

export function projectAggregatePortfolio(inputs: AggregatePortfolioInputs): any {
  const live = buildAggregatedPortfolioSnapshot(inputs.liveResults, inputs.polymarket);
  live.positions = dedupePositions(live.positions);

  const livePaper = buildAggregatedPortfolioSnapshot(inputs.livePaperResults, null);
  livePaper.positions = dedupePositions(livePaper.positions);

  const internalPaperSummary = summarizeInternalPaperPortfolio(inputs.internalPaperPortfolio);
  const paper = {
    name: 'Internal Paper Bot (Polymarket dry-run)',
    ...internalPaperSummary,
    positions: inputs.internalPaperPortfolio.positions || [],
  };
  return { live, live_paper: livePaper, paper };
}

function renderBucket(title: string, bucket: any, output: AggregatePortfolioOutput): void {
  output.log(`${ansi.boldCyan}--- ${title} ---${ansi.reset}`);
  output.log(`Total Equity: $${ansi.boldGreen}${bucket.total_equity.toLocaleString()}${ansi.reset}`);
  output.log(`Total Cash: $${ansi.green}${bucket.total_usd.toLocaleString()}${ansi.reset}`);
  output.log(`${ansi.bold}Brokers:${ansi.reset}`);
  bucket.brokers.forEach((broker: any) => {
    const statusColor = broker.status === 'connected' ? ansi.green : ansi.red;
    output.log(`  - ${broker.name}: ${statusColor}${broker.status}${ansi.reset} ${broker.error ? `(${broker.error})` : ''}`);
  });
  output.log(`${ansi.bold}Active Positions (${bucket.positions.length}):${ansi.reset}`);
  bucket.positions.forEach((position: GatewayPosition) => {
    const plColor = position.unrealizedPl >= 0 ? ansi.green : ansi.red;
    output.log(`  ${position.symbol.padEnd(6)} | Qty: ${position.quantity.toString().padEnd(6)} | Value: $${position.marketValue.toLocaleString().padEnd(10)} | PnL: ${plColor}$${position.unrealizedPl.toLocaleString()}${ansi.reset}`);
  });
}

export function renderAggregatePortfolio(aggregated: any, output: AggregatePortfolioOutput): void {
  renderBucket('LIVE  (real funds: Alpaca Live, Gate.io, Polymarket)', aggregated.live, output);
  renderPolymarketSection(aggregated.live.prediction_markets.polymarket, output);
  renderBucket('LIVE-PAPER  (broker-hosted simulation: Alpaca Paper)', aggregated.live_paper, output);

  const paper = aggregated.paper;
  output.log(`${ansi.boldCyan}--- PAPER  (internal Polymarket dry-run ledger) ---${ansi.reset}`);
  output.log(`Virtual Balance: $${ansi.green}${paper.virtual_balance}${ansi.reset} (started at $${paper.starting_balance})`);
  output.log(`Open Positions: ${paper.open_positions} | Open Cost: $${paper.open_cost} | Equity (marked at cost): $${ansi.boldGreen}${paper.equity_marked_at_cost}${ansi.reset}`);
  paper.positions.forEach((position: any) => {
    output.log(`  ${String(position.question || position.market_id || '').slice(0, 56).padEnd(56)} | ${String(position.outcome || '').padEnd(4)} | shares ${Number(position.shares).toFixed(2).padStart(10)} @ ${position.avg_price}`);
  });
}

export async function runAggregatePortfolioCommand(context: {
  scope: string;
  source: AggregatePortfolioSource;
  output: AggregatePortfolioOutput;
  useJson: boolean;
}): Promise<boolean> {
  if (!context.useJson) context.output.log('[GATEWAY] Aggregating portfolios — live / live-paper / paper...');
  try {
    const aggregated = projectAggregatePortfolio(await context.source.collect(context.scope));
    if (context.useJson) context.output.log(JSON.stringify(aggregated));
    else renderAggregatePortfolio(aggregated, context.output);
    return true;
  } catch (error: any) {
    if (context.useJson) context.output.log(JSON.stringify({ ok: false, error: error.message }));
    else context.output.error(`[GATEWAY] Aggregation failed: ${error.message}`);
    return false;
  }
}
