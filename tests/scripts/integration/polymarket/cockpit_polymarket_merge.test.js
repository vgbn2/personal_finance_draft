const assert = require('node:assert/strict');
const test = require('node:test');

const { mergePolymarketIntoPortfolio, summarizePortfolioCard, buildCockpitModel } =
  require('../../../../backend/cli/commands/operational/status.js');

// Pure-function coverage for the cockpit's Polymarket merge step. Synthetic
// fixtures only -- no live credentials, no network, no spawned subprocess.

test('cockpit portfolio card stays "unavailable" when Polymarket is unreachable/null', () => {
  const card = summarizePortfolioCard(mergePolymarketIntoPortfolio({ mode: 'paper' }, null));
  assert.equal(card.state, 'warn');
  assert.equal(card.title, 'portfolio unavailable');
  assert.equal(card.metrics.equity, null);
});

test('cockpit portfolio card stays "unavailable" when Polymarket is explicitly not configured', () => {
  const card = summarizePortfolioCard(mergePolymarketIntoPortfolio({ mode: 'paper' }, { ok: false, configured: false }));
  assert.equal(card.state, 'warn');
  assert.equal(card.title, 'portfolio unavailable');
  assert.equal(card.metrics.equity, null);
});

test('cockpit portfolio card shows Polymarket equity when connected', () => {
  const polymarket = { ok: true, configured: true, balance: { pUSD: 12.5 }, positions: [{ symbol: 'YES', quantity: 1, averagePrice: 0.5, marketValue: 0.5, unrealizedPl: 0 }] };
  const card = summarizePortfolioCard(mergePolymarketIntoPortfolio({ mode: 'paper' }, polymarket));
  assert.equal(card.state, 'ok');
  assert.equal(card.metrics.equity, 12.5);
  assert.equal(card.payload.polymarket.name, 'Polymarket');
  assert.equal(card.payload.polymarket.status, 'connected');
  assert.equal(card.payload.polymarket.position_count, 1);
});

test('cockpit portfolio card adds Polymarket on top of an existing base equity (additive, not a replacement)', () => {
  const polymarket = { ok: true, configured: true, balance: { pUSD: 12.5 }, positions: [] };
  const card = summarizePortfolioCard(mergePolymarketIntoPortfolio({ mode: 'paper', equity: 500 }, polymarket));
  assert.equal(card.metrics.equity, 512.5);
});

test('cockpit portfolio card preserves a pre-existing base equity when Polymarket is null', () => {
  const card = summarizePortfolioCard(mergePolymarketIntoPortfolio({ mode: 'paper', equity: 500 }, null));
  assert.equal(card.metrics.equity, 500);
});

test('mergePolymarketIntoPortfolio never sets equity to a literal null (Number(null) is 0, which would be misread as a real zero-equity portfolio)', () => {
  const merged = mergePolymarketIntoPortfolio({ mode: 'paper' }, null);
  assert.equal('equity' in merged, false);
});

test('buildCockpitModel() without includePolymarket does not pay the Polymarket subprocess cost (fast, offline default)', () => {
  // This is the contract every existing caller (tests, the dashboard's
  // periodic health-dot poller in dashboard_exec.js's loadDashboardHealth(),
  // cockpitInspectPayload()) already depends on -- buildCockpitModel() must
  // stay file-read-only unless a caller explicitly opts in. A real
  // spawnSync-based gateway round-trip takes several real seconds (proven
  // empirically against this live environment); finishing well under that
  // is strong evidence the opt-in gate is working, not just convenient.
  const start = Date.now();
  const model = buildCockpitModel();
  const elapsedMs = Date.now() - start;
  assert.ok(elapsedMs < 2000, `expected buildCockpitModel() with no opts to stay fast (no subprocess), took ${elapsedMs}ms`);
  const portfolioCard = model.cards.find((c) => c.payload && 'polymarket' in c.payload);
  assert.equal(portfolioCard.payload.polymarket, null);
});
