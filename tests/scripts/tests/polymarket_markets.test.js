const test = require('node:test');
const assert = require('node:assert/strict');

const {
  fetchPolymarketGammaMarkets,
  fetchPolymarketGammaEvents,
  groupPolymarketMarketsBySection,
  looksLikeCryptoMarket,
  normalizePolymarketGammaMarket,
  normalizePolymarketGammaEvent,
} = require('../../../backend/gateway/src/polymarket_markets');

test('polymarket gamma markets normalize crypto sections like the browse page', () => {
  const raw = [
    {
      id: '1',
      question: 'Will Bitcoin hit $150k in 2026?',
      slug: 'will-bitcoin-hit-150k-in-2026',
      category: 'Crypto',
      outcomes: '["Yes","No"]',
      clobTokenIds: '["btc_yes","btc_no"]',
      volumeNum: 1000,
    },
    {
      id: '2',
      question: 'Will Ethereum ETF flows be positive this week?',
      slug: 'ethereum-etf-flows-positive',
      category: 'Crypto',
      tags: [{ label: 'Ethereum', slug: 'ethereum' }],
      outcomes: '["Yes","No"]',
      clobTokenIds: '["eth_yes","eth_no"]',
      volumeNum: 500,
    },
    {
      id: '3',
      question: 'Will it rain in NYC tomorrow?',
      category: 'Weather',
      outcomes: '["Yes","No"]',
      clobTokenIds: '["rain_yes","rain_no"]',
      volumeNum: 9000,
    },
  ];

  const cryptoMarkets = raw.filter(looksLikeCryptoMarket).map(normalizePolymarketGammaMarket);
  const sections = groupPolymarketMarketsBySection(cryptoMarkets);

  assert.equal(cryptoMarkets.length, 2);
  assert.deepEqual(cryptoMarkets[0].tokens, [
    { outcome: 'Yes', token_id: 'btc_yes' },
    { outcome: 'No', token_id: 'btc_no' },
  ]);
  assert.deepEqual(sections.map((section) => section.section), ['Bitcoin', 'Ethereum']);
  assert.equal(sections[0].count, 1);
});

test('normalizePolymarketGammaMarket includes groupItemTitle when present', () => {
  const raw = {
    id: '100',
    question: 'Will Bitcoin exceed $200k by December 2026?',
    slug: 'btc-200k-dec-2026',
    groupItemTitle: 'by December 31, 2026',
    category: 'Crypto',
    outcomes: '["Yes","No"]',
    clobTokenIds: '["yes_tok","no_tok"]',
    volumeNum: 800,
  };
  const market = normalizePolymarketGammaMarket(raw);
  assert.equal(market.groupItemTitle, 'by December 31, 2026');
  assert.equal(market.tokens.length, 2);
  assert.equal(market.tokens[0].token_id, 'yes_tok');
});

test('normalizePolymarketGammaEvent normalizes title, volume, and sub-markets', () => {
  const raw = {
    id: 'ev1',
    title: 'When will Bitcoin hit $200k?',
    slug: 'btc-200k-event',
    volume: 5000,
    markets: [
      {
        id: 'm1',
        question: 'Will Bitcoin hit $200k by June 2026?',
        groupItemTitle: 'by June 30, 2026',
        category: 'Crypto',
        outcomes: '["Yes","No"]',
        clobTokenIds: '["m1_yes","m1_no"]',
        volumeNum: 2000,
      },
      {
        id: 'm2',
        question: 'Will Bitcoin hit $200k by December 2026?',
        groupItemTitle: 'by December 31, 2026',
        category: 'Crypto',
        outcomes: '["Yes","No"]',
        clobTokenIds: '["m2_yes","m2_no"]',
        volumeNum: 3000,
      },
    ],
  };
  const event = normalizePolymarketGammaEvent(raw);
  assert.equal(event.id, 'ev1');
  assert.equal(event.title, 'When will Bitcoin hit $200k?');
  assert.equal(event.volume, 5000);
  assert.equal(event.markets.length, 2);
  assert.equal(event.markets[0].groupItemTitle, 'by June 30, 2026');
  assert.equal(event.markets[1].groupItemTitle, 'by December 31, 2026');
});

test('normalizePolymarketGammaEvent filters sub-markets with no tokens', () => {
  const raw = {
    id: 'ev2',
    title: 'Test event',
    markets: [
      { id: 'm1', question: 'Q1', outcomes: '["Yes","No"]', clobTokenIds: '["t1","t2"]' },
      { id: 'm2', question: 'Q2', outcomes: '[]', clobTokenIds: '[]' },
    ],
  };
  const event = normalizePolymarketGammaEvent(raw);
  assert.equal(event.markets.length, 1, 'Only the market with tokens should survive');
  assert.equal(event.markets[0].id, 'm1');
});

test('non-crypto categories do not get re-filtered through the crypto matcher', async () => {
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    const text = String(url);
    if (text.includes('/tags/slug/')) {
      return {
        ok: true,
        async json() {
          return { id: 'sports-tag' };
        },
      };
    }
    return {
      ok: true,
      async json() {
        return [{
          id: 'sport-1',
          question: 'Will Team A win the final?',
          category: 'Sports',
          outcomes: '["Yes","No"]',
          clobTokenIds: '["yes","no"]',
          volumeNum: 1234,
        }];
      },
    };
  };

  try {
    const result = await fetchPolymarketGammaMarkets(10, { category: 'sports' });
    assert.equal(result.count, 1);
    assert.equal(result.data[0].category, 'Sports');
  } finally {
    global.fetch = originalFetch;
  }
});
