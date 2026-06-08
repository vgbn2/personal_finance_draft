const GAMMA_API = 'https://gamma-api.polymarket.com';

export interface TradingInfo {
  yesTokenId: string;
  noTokenId: string;
  negRisk: boolean;
  active: boolean;
}

export async function fetchTradingInfo(slug: string): Promise<TradingInfo | null> {
  const parts = slug.split('--');
  const eventSlug  = parts[0];
  const marketSlug = parts.slice(1).join('--'); // re-join in case market slug contains '--'

  let events: any[];
  try {
    const res = await fetch(`${GAMMA_API}/events?slug=${encodeURIComponent(eventSlug)}`);
    if (!res.ok) return null;
    const body = await res.json();
    events = Array.isArray(body) ? body : body?.data ?? [];
  } catch {
    return null;
  }

  for (const event of events) {
    const markets: any[] = Array.isArray(event.markets) ? event.markets : [];
    const market = markets.find(
      (m: any) => m.marketSlug === marketSlug || m.slug === marketSlug
    );
    if (!market) continue;

    // clobTokenIds may arrive as a JSON string
    let tokenIds: string[] = [];
    try {
      const raw = market.clobTokenIds ?? market.clob_token_ids ?? '[]';
      tokenIds = typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch {
      return null;
    }

    if (tokenIds.length < 2) return null;

    return {
      yesTokenId: tokenIds[0],
      noTokenId:  tokenIds[1],
      negRisk:    Boolean(market.negRisk ?? market.neg_risk ?? false),
      active:     Boolean(market.active ?? true),
    };
  }

  return null;
}
