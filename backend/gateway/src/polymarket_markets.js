function toFiniteNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseJsonArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function polymarketMarketSection(market = {}, tags = [], categories = []) {
  const generic = new Set(['crypto', 'cryptocurrency', 'cryptocurrencies', 'markets']);
  const category = categories
    .map((item) => item && (item.label || item.slug))
    .find((value) => value && !generic.has(String(value).toLowerCase()));
  if (category) return String(category);

  const direct = market.subcategory || market.category;
  if (direct && !generic.has(String(direct).toLowerCase())) return String(direct);

  const tag = tags
    .map((item) => item && (item.label || item.slug))
    .find((value) => value && !generic.has(String(value).toLowerCase()));
  if (tag) return String(tag);

  const text = String(`${market.question || ''} ${market.slug || ''}`).toLowerCase();
  if (/\b(bitcoin|btc)\b/.test(text)) return 'Bitcoin';
  if (/\b(ethereum|eth)\b/.test(text)) return 'Ethereum';
  if (/\b(solana|sol)\b/.test(text)) return 'Solana';
  if (/\b(xrp|ripple)\b/.test(text)) return 'XRP';
  if (/\b(dogecoin|doge|shib|pepe|meme)\b/.test(text)) return 'Meme Coins';
  return 'Crypto';
}

function normalizePolymarketGammaMarket(market = {}) {
  const outcomes = parseJsonArray(market.outcomes).map(String);
  const tokenIds = parseJsonArray(market.clobTokenIds ?? market.clob_token_ids).map(String);
  const tags = Array.isArray(market.tags) ? market.tags : [];
  const categories = Array.isArray(market.categories) ? market.categories : [];
  const tokens = tokenIds.map((token_id, index) => ({
    token_id,
    outcome: outcomes[index] || String(index),
  }));
  return {
    id: market.id ? String(market.id) : undefined,
    condition_id: market.conditionId || market.condition_id || undefined,
    slug: market.slug ? String(market.slug) : undefined,
    question: String(market.question || market.title || market.slug || market.id || ''),
    groupItemTitle: market.groupItemTitle ? String(market.groupItemTitle) : undefined,
    active: market.active !== false,
    closed: Boolean(market.closed),
    category: String(market.category || (categories[0] && (categories[0].label || categories[0].slug)) || 'crypto'),
    section: polymarketMarketSection(market, tags, categories),
    volume: toFiniteNumber(market.volumeNum ?? market.volume, 0),
    liquidity: toFiniteNumber(market.liquidityNum ?? market.liquidity, 0),
    tokens,
  };
}

function looksLikeCryptoMarket(market = {}) {
  const text = [
    market.category,
    market.subcategory,
    market.question,
    market.slug,
    ...(Array.isArray(market.tags) ? market.tags.map((tag) => `${tag && tag.label || ''} ${tag && tag.slug || ''}`) : []),
    ...(Array.isArray(market.categories) ? market.categories.map((category) => `${category && category.label || ''} ${category && category.slug || ''}`) : []),
  ].join(' ').toLowerCase();
  return /\b(crypto|bitcoin|btc|ethereum|eth|solana|sol\b|xrp|dogecoin|doge|shib|pepe|defi|stablecoin|binance|coinbase)\b/.test(text);
}

function groupPolymarketMarketsBySection(markets = []) {
  const groups = new Map();
  for (const market of markets) {
    const section = market.section || 'Crypto';
    if (!groups.has(section)) groups.set(section, []);
    groups.get(section).push(market);
  }
  return Array.from(groups.entries())
    .map(([section, data]) => ({
      section,
      count: data.length,
      volume: data.reduce((sum, market) => sum + (market.volume || 0), 0),
      data: data.sort((a, b) => (b.volume || 0) - (a.volume || 0)),
    }))
    .sort((a, b) => b.volume - a.volume || a.section.localeCompare(b.section));
}

async function fetchPolymarketTagId(slug) {
  const res = await fetch(`https://gamma-api.polymarket.com/tags/slug/${encodeURIComponent(slug)}`, {
    headers: { accept: 'application/json', 'user-agent': 'sovereign-gateway/1.0' },
  });
  if (!res.ok) return null;
  const body = await res.json();
  return body && body.id ? String(body.id) : null;
}

async function fetchPolymarketGammaMarkets(limit = 10, options = {}) {
  const category = options.category || 'crypto';
  const url = new URL('https://gamma-api.polymarket.com/markets');
  url.searchParams.set('limit', String(Math.max(1, limit * 4)));
  url.searchParams.set('active', 'true');
  url.searchParams.set('closed', 'false');
  url.searchParams.set('include_tag', 'true');
  url.searchParams.set('order', 'volumeNum');
  url.searchParams.set('ascending', 'false');
  if (category && category !== 'all') {
    const tagId = await fetchPolymarketTagId(category);
    if (tagId) {
      url.searchParams.set('tag_id', tagId);
      url.searchParams.set('related_tags', 'true');
    }
  }
  const res = await fetch(url.toString(), {
    headers: { accept: 'application/json', 'user-agent': 'sovereign-gateway/1.0' },
  });
  if (!res.ok) throw new Error(`Gamma markets returned HTTP ${res.status}`);
  const body = await res.json();
  const rawMarkets = Array.isArray(body) ? body : (Array.isArray(body && body.markets) ? body.markets : []);
  const normalizedCategory = String(category || 'crypto').trim().toLowerCase();
  const filtered = normalizedCategory === 'crypto'
    ? rawMarkets.filter(looksLikeCryptoMarket)
    : rawMarkets;
  const data = filtered.map(normalizePolymarketGammaMarket).filter((market) => market.question).slice(0, limit);
  return { source: url.toString(), count: data.length, data, sections: groupPolymarketMarketsBySection(data) };
}

function looksLikeCryptoEvent(event = {}) {
  const text = [
    event.title,
    event.slug,
    ...(Array.isArray(event.tags) ? event.tags.map((tag) => `${tag && tag.label || ''} ${tag && tag.slug || ''}`) : []),
  ].join(' ').toLowerCase();
  return /\b(crypto|bitcoin|btc|ethereum|eth|solana|sol\b|xrp|dogecoin|doge|shib|pepe|defi|stablecoin|binance|coinbase)\b/.test(text);
}

function normalizePolymarketGammaEvent(event = {}) {
  return {
    id: event.id ? String(event.id) : undefined,
    title: String(event.title || event.slug || ''),
    slug: event.slug ? String(event.slug) : undefined,
    volume: toFiniteNumber(event.volume ?? event.volumeNum, 0),
    markets: (Array.isArray(event.markets) ? event.markets : [])
      .map(normalizePolymarketGammaMarket)
      .filter((m) => m.tokens.length > 0),
  };
}

async function fetchPolymarketGammaEvents(limit = 10, options = {}) {
  const category = options.category || 'crypto';
  const url = new URL('https://gamma-api.polymarket.com/events');
  url.searchParams.set('limit', String(Math.max(1, limit * 4)));
  url.searchParams.set('active', 'true');
  url.searchParams.set('closed', 'false');
  url.searchParams.set('order', 'volume');
  url.searchParams.set('ascending', 'false');
  if (category && category !== 'all') {
    const tagId = await fetchPolymarketTagId(category);
    if (tagId) {
      url.searchParams.set('tag_id', tagId);
      url.searchParams.set('related_tags', 'true');
    }
  }
  const res = await fetch(url.toString(), {
    headers: { accept: 'application/json', 'user-agent': 'sovereign-gateway/1.0' },
  });
  if (!res.ok) throw new Error(`Gamma events returned HTTP ${res.status}`);
  const body = await res.json();
  const rawEvents = Array.isArray(body) ? body : (Array.isArray(body && body.events) ? body.events : []);
  const normalizedCategory = String(category || 'crypto').trim().toLowerCase();
  const filtered = normalizedCategory === 'crypto'
    ? rawEvents.filter(looksLikeCryptoEvent)
    : rawEvents;
  const data = filtered
    .map(normalizePolymarketGammaEvent)
    .filter((ev) => ev.markets.length > 0)
    .slice(0, limit);
  return { source: url.toString(), count: data.length, data };
}

module.exports = {
  fetchPolymarketGammaMarkets,
  fetchPolymarketGammaEvents,
  groupPolymarketMarketsBySection,
  looksLikeCryptoMarket,
  normalizePolymarketGammaMarket,
  normalizePolymarketGammaEvent,
};
