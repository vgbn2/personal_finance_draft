function toFiniteNumber(value: any, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function parseArray(value: any): any[] {
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function normalizePolymarketSide(side: any): 'buy' | 'sell' | null {
  if (typeof side === 'string') {
    const upper = side.toUpperCase();
    if (upper === 'BUY') return 'buy';
    if (upper === 'SELL') return 'sell';
  }
  if (side === 0) return 'buy';
  if (side === 1) return 'sell';
  return null;
}

export interface PolymarketPosition {
  assetId: string;
  symbol: string;
  quantity: number;
  averagePrice: number;
  marketValue: number;
  unrealizedPl: number;
  lifecycle: 'active' | 'ended' | 'unknown';
  valuationStatus: 'live_quote' | 'unavailable';
  question?: string;
  outcome?: string;
  historyStatus?: string;
  currentPrice?: number | null;
  resolutionPrice?: number | null;
}

export function aggregatePolymarketFilledPositions(trades: any[] = []): PolymarketPosition[] {
  const buckets = new Map<string, { assetId: string; symbol: string; quantity: number; costBasis: number }>();
  const sortedTrades = [...trades].sort((a, b) => {
    const ta = Date.parse(String(a.match_time || a.last_update || ''));
    const tb = Date.parse(String(b.match_time || b.last_update || ''));
    return (Number.isFinite(ta) ? ta : 0) - (Number.isFinite(tb) ? tb : 0);
  });

  for (const trade of sortedTrades) {
    const assetId = String(trade.asset_id || '');
    const side = normalizePolymarketSide(trade.side);
    if (!assetId || !side) continue;

    const size = toFiniteNumber(trade.size) / 10;
    const price = toFiniteNumber(trade.price);
    if (size <= 0 || price < 0) continue;

    const bucket = buckets.get(assetId) || {
      assetId,
      symbol: String(trade.outcome || trade.market || assetId),
      quantity: 0,
      costBasis: 0,
    };
    bucket.symbol = String(trade.outcome || trade.market || assetId);

    if (side === 'buy') {
      bucket.quantity += size;
      bucket.costBasis += size * price;
    } else if (bucket.quantity > 0) {
      const averagePrice = bucket.costBasis / bucket.quantity;
      const closedSize = Math.min(bucket.quantity, size);
      bucket.quantity -= closedSize;
      bucket.costBasis = Math.max(0, bucket.costBasis - averagePrice * closedSize);
    }

    buckets.set(assetId, bucket);
  }

  return [...buckets.values()]
    .filter((bucket) => bucket.quantity > 0)
    .map((bucket) => ({
      assetId: bucket.assetId,
      symbol: bucket.symbol,
      quantity: bucket.quantity,
      averagePrice: bucket.costBasis / bucket.quantity,
      marketValue: 0,
      unrealizedPl: 0,
      lifecycle: 'unknown' as const,
      valuationStatus: 'unavailable' as const,
    }))
    .sort((a, b) => a.symbol.localeCompare(b.symbol));
}

export function lifecycleForMarket(market: any = {}): 'active' | 'ended' | 'unknown' {
  if (market.closed === true || market.active === false) return 'ended';
  if (market.active === true && market.closed !== true) return 'active';
  return 'unknown';
}

export interface TokenMetadata {
  tokenId: string;
  question: string;
  outcome: string;
  lifecycle: 'active' | 'ended' | 'unknown';
  closed: boolean;
  resolutionPrice: number | null;
}

export function buildPolymarketTokenMetadata(markets: any[] = []): Map<string, TokenMetadata> {
  const byToken = new Map<string, TokenMetadata>();
  for (const market of markets) {
    const tokenIds = parseArray(market.clobTokenIds ?? market.clob_token_ids).map(String);
    const outcomes = parseArray(market.outcomes).map(String);
    const outcomePrices = parseArray(market.outcomePrices ?? market.outcome_prices)
      .map((value) => toFiniteNumber(value, Number.NaN));
    const lifecycle = lifecycleForMarket(market);

    tokenIds.forEach((tokenId, index) => {
      if (!tokenId) return;
      byToken.set(tokenId, {
        tokenId,
        question: String(market.question || ''),
        outcome: outcomes[index] || '',
        lifecycle,
        closed: lifecycle === 'ended',
        resolutionPrice: lifecycle === 'ended' && Number.isFinite(outcomePrices[index])
          ? outcomePrices[index]
          : null,
      });
    });
  }
  return byToken;
}

export function mergeTokenMetadata(target: Map<string, TokenMetadata>, source: Map<string, TokenMetadata>): Map<string, TokenMetadata> {
  for (const [tokenId, metadata] of source || []) {
    const current = target.get(tokenId);
    if (!current || current.lifecycle === 'unknown') target.set(tokenId, metadata);
  }
  return target;
}

export function projectPolymarketPosition(position: any, metadata?: TokenMetadata, currentPrice?: number): PolymarketPosition {
  const historyComplete = !position?.historyStatus || position.historyStatus === 'complete';
  const lifecycle = historyComplete ? metadata?.lifecycle || 'unknown' : 'unknown';
  const price = toFiniteNumber(currentPrice);
  const hasLiveQuote = lifecycle === 'active' && price > 0;
  const question = String(metadata?.question || '');
  const outcome = String(metadata?.outcome || position.symbol || '');
  const questionLabel = question.length > 38 ? `${question.slice(0, 38)}…` : question;
  const symbol = question ? `${questionLabel} (${outcome})` : position.symbol;

  return {
    ...position,
    symbol,
    question: question || undefined,
    outcome: outcome || undefined,
    lifecycle,
    historyStatus: historyComplete ? 'complete' : position.historyStatus,
    currentPrice: hasLiveQuote ? price : null,
    marketValue: hasLiveQuote ? price * position.quantity : 0,
    unrealizedPl: hasLiveQuote ? (price - position.averagePrice) * position.quantity : 0,
    valuationStatus: hasLiveQuote ? 'live_quote' : 'unavailable',
    resolutionPrice: lifecycle === 'ended' ? metadata?.resolutionPrice ?? null : undefined,
  };
}

export function markPolymarketHistoryIncomplete(positions: any[] = [], reason = 'trade_history_truncated'): PolymarketPosition[] {
  return positions.map((position) => ({
    ...position,
    lifecycle: 'unknown' as const,
    historyStatus: reason,
    currentPrice: null,
    marketValue: 0,
    unrealizedPl: 0,
    valuationStatus: 'unavailable' as const,
  }));
}

export function partitionPolymarketPositions(positions: any[] = []) {
  return {
    active: positions.filter((position) => position?.lifecycle === 'active'),
    ended: positions.filter((position) => position?.lifecycle === 'ended'),
    unknown: positions.filter((position) => !position || !['active', 'ended'].includes(position.lifecycle)),
  };
}

export function isMarkedActivePolymarketPosition(position: any): boolean {
  return position?.lifecycle === 'active'
    && position?.valuationStatus === 'live_quote'
    && Number.isFinite(Number(position.marketValue));
}
