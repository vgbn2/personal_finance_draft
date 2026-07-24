const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  checkAndCloseResolvedPositions,
  deriveMidprice,
  loadPortfolio,
  migrateLegacyPaperState,
  runPolymarketPaperRun,
  yesTokenForMarket,
} = require('../../../../backend/gateway/src/polymarket_paper');
const {
  appendLedgerEvents,
  initializeLedger,
  ledgerPaths,
  loadLedgerProjection,
  readLedger,
} = require('../../../../backend/gateway/src/paper_ledger');

function tempStorageDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'sovereign-paper-'));
}

const market = {
  id: 'm1',
  question: 'Will Bitcoin hit $150k in 2026?',
  liquidity: 1000,
  tokens: [
    { outcome: 'Yes', token_id: 'yes-token' },
    { outcome: 'No', token_id: 'no-token' },
  ],
};

test('deriveMidprice computes spread-aware midpoint from orderbook depth', () => {
  const price = deriveMidprice({
    book: {
      bids: [{ price: '0.10', size: '20' }],
      asks: [{ price: '0.12', size: '15' }],
    },
  });

  assert.equal(price.ok, true);
  assert.equal(price.bid, 0.10);
  assert.equal(price.ask, 0.12);
  assert.equal(Number(price.midprice.toFixed(2)), 0.11);
});

test('yesTokenForMarket prefers explicit Yes outcome', () => {
  assert.equal(yesTokenForMarket(market).token_id, 'yes-token');
});

test('paper run logs virtual fill, persists portfolio, and dedupes held token', async () => {
  const storageDir = tempStorageDir();
  const fetchOrderBook = async () => ({
    ok: true,
    book: {
      bids: [{ price: '0.10', size: '50' }],
      asks: [{ price: '0.12', size: '50' }],
    },
  });

  const first = await runPolymarketPaperRun({
    storageDir,
    markets: [market],
    fetchOrderBook,
    virtualBalance: 100,
    maxPositionUsd: 1,
    now: '2026-06-06T00:00:00.000Z',
  });

  assert.equal(first.ok, true);
  assert.equal(first.fills.length, 1);
  assert.equal(first.summary.open_positions, 1);
  assert.equal(first.summary.virtual_balance, 99);

  const ledger = readLedger(storageDir);
  assert.equal(ledger.ok, true);
  assert.equal(ledger.events.length, 2);
  assert.equal(ledger.events[1].paper_fill.token_id, 'yes-token');
  assert.equal(ledger.events[1].paper_fill.virtual, true);
  assert.equal(first.ledger_sequence, 2);
  assert.equal(first.ledger_checksum, ledger.last_checksum);

  const portfolio = loadPortfolio(storageDir, 100);
  assert.equal(portfolio.positions.length, 1);
  assert.equal(portfolio.positions[0].avg_price, 0.11);

  const second = await runPolymarketPaperRun({
    storageDir,
    markets: [market],
    fetchOrderBook,
    virtualBalance: 100,
    maxPositionUsd: 1,
    now: '2026-06-06T00:05:00.000Z',
  });

  assert.equal(second.fills.length, 0);
  assert.equal(second.skipped[0].reason, 'already holding token');
});

test('paper run skips markets whose orderbook fetch throws', async () => {
  const storageDir = tempStorageDir();
  const throwMarket = {
    ...market,
    id: 'm-fetch-throw',
    tokens: [
      { outcome: 'Yes', token_id: 'throw-token' },
      { outcome: 'No', token_id: 'throw-no-token' },
    ],
  };
  const result = await runPolymarketPaperRun({
    storageDir,
    markets: [throwMarket],
    fetchOrderBook: async () => {
      throw new Error('fetch failed');
    },
    virtualBalance: 100,
    maxPositionUsd: 1,
    now: '2026-06-06T00:00:00.000Z',
  });

  assert.equal(result.ok, true);
  assert.equal(result.fills.length, 0);
  const networkSkip = result.skipped.find((entry) => /fetch failed/.test(entry.reason));
  assert.ok(networkSkip, `expected fetch failed skip, got ${JSON.stringify(result.skipped)}`);
  assert.equal(networkSkip.error_category, 'network_unavailable');
});

test('checkAndCloseResolvedPositions closes a resolved position and credits balance', async () => {
  const storageDir = tempStorageDir();
  initializeLedger(storageDir, 100, { now: '2026-06-01T00:00:00.000Z' });
  const position = {
    token_id: 'yes-token-resolved',
    market_id: 'condition-abc',
    question: 'Will it rain?',
    outcome: 'Yes',
    shares: 10,
    avg_price: 0.1,
    opened_at: '2026-06-01T00:00:00.000Z',
    strategy: 'low_prob_dip',
  };
  appendLedgerEvents(storageDir, [{
    event_type: 'paper_fill',
    idempotency_key: 'seed:yes-token-resolved',
    cycle_id: 'seed',
    event_time: '2026-06-01T00:00:00.000Z',
    market_id: position.market_id,
    token_id: position.token_id,
    outcome: position.outcome,
    strategy: position.strategy,
    paper_fill: { side: 'buy', token_id: position.token_id, shares: 10, price: 0.1, virtual: true },
    position,
    position_effect: 'open',
    cash_delta: -1,
  }]);

  // Mock global.fetch to return a resolved market (active === false, YES won)
  const origFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    json: async () => [{ id: 'condition-abc', active: false, bestAsk: '0.95', outcomePrices: '["0.95","0.05"]' }],
  });

  try {
    const result = await checkAndCloseResolvedPositions(storageDir);
    assert.equal(result.ok, true);
    assert.equal(result.closed.length, 1);
    assert.equal(result.closed[0].resolution_price, 1.0);

    const updated = loadPortfolio(storageDir, 100);
    assert.equal(updated.positions.length, 0);
    // balance credited: 99 + 10 shares * 1.0 resolution = 109
    assert.ok(Math.abs(updated.virtual_balance - 109) < 0.001, `balance should be ~109, got ${updated.virtual_balance}`);

    const ledger = readLedger(storageDir);
    assert.equal(ledger.ok, true);
    assert.equal(ledger.events.length, 3);
    assert.equal(ledger.events[2].settlement.market_id, 'condition-abc');
    assert.equal(ledger.events[2].settlement.resolution_price, 1.0);
  } finally {
    global.fetch = origFetch;
  }
});

test('checkAndCloseResolvedPositions leaves active positions open', async () => {
  const storageDir = tempStorageDir();
  initializeLedger(storageDir, 100, { now: '2026-06-01T00:00:00.000Z' });
  const position = {
    token_id: 'yes-token-active',
    market_id: 'condition-xyz',
    question: 'Will BTC hit $200k?',
    outcome: 'Yes',
    shares: 5,
    avg_price: 0.08,
    opened_at: '2026-06-01T00:00:00.000Z',
    strategy: 'low_prob_dip',
  };
  appendLedgerEvents(storageDir, [{
    event_type: 'paper_fill',
    idempotency_key: 'seed:yes-token-active',
    cycle_id: 'seed',
    event_time: '2026-06-01T00:00:00.000Z',
    market_id: position.market_id,
    token_id: position.token_id,
    outcome: position.outcome,
    strategy: position.strategy,
    paper_fill: { side: 'buy', token_id: position.token_id, shares: 5, price: 0.08, virtual: true },
    position,
    position_effect: 'open',
    cash_delta: -0.4,
  }]);

  const origFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    // active === true → market still open
    json: async () => [{ id: 'condition-xyz', active: true, bestAsk: '0.10' }],
  });

  try {
    const result = await checkAndCloseResolvedPositions(storageDir);
    assert.equal(result.ok, true);
    assert.equal(result.closed.length, 0);

    const updated = loadPortfolio(storageDir, 100);
    assert.equal(updated.positions.length, 1, 'active position should remain');
    assert.ok(Math.abs(updated.virtual_balance - 99.6) < 0.001, 'balance should be unchanged');
  } finally {
    global.fetch = origFetch;
  }
});

test('reopened token settles as a distinct position lifecycle', async () => {
  const storageDir = tempStorageDir();
  initializeLedger(storageDir, 100, { now: '2026-06-01T00:00:00.000Z' });
  const origFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    json: async () => [{
      id: 'condition-repeat',
      active: false,
      outcomePrices: '["1","0"]',
    }],
  });

  const openPosition = (positionId, openedAt, cycleId) => {
    const position = {
      position_id: positionId,
      token_id: 'repeat-token',
      market_id: 'condition-repeat',
      outcome: 'Yes',
      shares: 10,
      avg_price: 0.1,
      opened_at: openedAt,
      strategy: 'repeat-test',
    };
    return appendLedgerEvents(storageDir, [{
      event_type: 'paper_fill',
      idempotency_key: `${cycleId}:buy:repeat-token`,
      cycle_id: cycleId,
      event_time: openedAt,
      market_id: position.market_id,
      token_id: position.token_id,
      position,
      position_effect: 'open',
      cash_delta: -1,
    }]);
  };

  try {
    openPosition('position-one', '2026-06-01T01:00:00.000Z', 'cycle-one');
    const first = await checkAndCloseResolvedPositions(storageDir);
    assert.equal(first.closed.length, 1);

    openPosition('position-two', '2026-06-02T01:00:00.000Z', 'cycle-two');
    const second = await checkAndCloseResolvedPositions(storageDir);
    assert.equal(second.closed.length, 1);

    const replayed = loadLedgerProjection(storageDir);
    assert.equal(replayed.projection.positions.length, 0);
    assert.equal(replayed.projection.settlements.length, 2);
    assert.equal(readLedger(storageDir).events.filter((event) => event.event_type === 'position_settled').length, 2);
  } finally {
    global.fetch = origFetch;
  }
});

test('concurrent resolution checks settle one position lifecycle only once', async () => {
  const storageDir = tempStorageDir();
  initializeLedger(storageDir, 100, { now: '2026-06-01T00:00:00.000Z' });
  appendLedgerEvents(storageDir, [{
    event_type: 'paper_fill',
    idempotency_key: 'concurrent-open:buy:token',
    cycle_id: 'concurrent-open',
    event_time: '2026-06-01T01:00:00.000Z',
    market_id: 'condition-concurrent',
    token_id: 'concurrent-token',
    position: {
      position_id: 'concurrent-position',
      token_id: 'concurrent-token',
      market_id: 'condition-concurrent',
      outcome: 'Yes',
      shares: 10,
      avg_price: 0.1,
      opened_at: '2026-06-01T01:00:00.000Z',
      strategy: 'concurrency-test',
    },
    position_effect: 'open',
    cash_delta: -1,
  }]);

  const origFetch = global.fetch;
  global.fetch = async () => {
    await new Promise((resolve) => setImmediate(resolve));
    return {
      ok: true,
      json: async () => [{
        id: 'condition-concurrent',
        active: false,
        outcomePrices: '["1","0"]',
      }],
    };
  };

  try {
    const results = await Promise.all([
      checkAndCloseResolvedPositions(storageDir),
      checkAndCloseResolvedPositions(storageDir),
    ]);
    assert.equal(results.reduce((sum, result) => sum + result.closed.length, 0), 1);

    const replayed = loadLedgerProjection(storageDir).projection;
    assert.equal(replayed.positions.length, 0);
    assert.equal(replayed.settlements.length, 1);
    assert.equal(replayed.virtual_balance, 109);
    assert.equal(replayed.realized_pnl, 9);
  } finally {
    global.fetch = origFetch;
  }
});

test('paper ledger replay is deterministic and duplicate intents are idempotent', () => {
  const storageDir = tempStorageDir();
  initializeLedger(storageDir, 100, { now: '2026-06-01T00:00:00.000Z' });
  const input = {
    event_type: 'paper_fill',
    idempotency_key: 'cycle-1:buy:token-1',
    cycle_id: 'cycle-1',
    event_time: '2026-06-01T00:01:00.000Z',
    market_id: 'market-1',
    token_id: 'token-1',
    outcome: 'Yes',
    strategy: 'test',
    paper_fill: { side: 'buy', token_id: 'token-1', shares: 10, price: 0.1, virtual: true },
    position: { token_id: 'token-1', shares: 10, avg_price: 0.1 },
    position_effect: 'open',
    cash_delta: -1,
  };
  const first = appendLedgerEvents(storageDir, [input]);
  const duplicate = appendLedgerEvents(storageDir, [input]);
  const replayed = loadLedgerProjection(storageDir);

  assert.equal(first.accepted.length, 1);
  assert.equal(duplicate.accepted.length, 0);
  assert.deepEqual(duplicate.duplicates, [input.idempotency_key]);
  assert.deepEqual(replayed.projection, first.projection);
  assert.equal(readLedger(storageDir).events.length, 2);
});

test('existing ledger ignores later attempts to change its starting balance', () => {
  const storageDir = tempStorageDir();
  initializeLedger(storageDir, 100, { now: '2026-06-01T00:00:00.000Z' });
  const reopened = initializeLedger(storageDir, 999, { now: '2026-06-02T00:00:00.000Z' });
  assert.equal(reopened.existing, true);
  assert.equal(reopened.projection.starting_balance, 100);
  assert.equal(readLedger(storageDir).events.length, 1);
});

test('paper ledger recovers its projection after a crash following durable append', () => {
  const storageDir = tempStorageDir();
  initializeLedger(storageDir, 100, { now: '2026-06-01T00:00:00.000Z' });
  assert.throws(() => appendLedgerEvents(storageDir, [{
    event_type: 'paper_fill',
    idempotency_key: 'crash-cycle:buy:token-2',
    cycle_id: 'crash-cycle',
    event_time: '2026-06-01T00:01:00.000Z',
    token_id: 'token-2',
    paper_fill: { side: 'buy', token_id: 'token-2', shares: 5, price: 0.2, virtual: true },
    position: { token_id: 'token-2', shares: 5, avg_price: 0.2 },
    position_effect: 'open',
    cash_delta: -1,
  }], { injectCrashAfterAppend: true }), /injected crash/);

  const recovered = appendLedgerEvents(storageDir, []);
  assert.equal(recovered.ok, true);
  assert.equal(recovered.projection.virtual_balance, 99);
  assert.equal(recovered.projection.positions.length, 1);
  assert.equal(recovered.projection.ledger_sequence, 2);
});

test('paper ledger rejects a second writer and fails closed on a truncated event', () => {
  const storageDir = tempStorageDir();
  initializeLedger(storageDir, 100, { now: '2026-06-01T00:00:00.000Z' });
  const lockPath = ledgerPaths(storageDir).lock;
  fs.writeFileSync(lockPath, JSON.stringify({
    token: 'other-writer',
    pid: process.pid,
    acquired_at: new Date().toISOString(),
  }));
  const blocked = appendLedgerEvents(storageDir, []);
  assert.equal(blocked.ok, false);
  assert.match(blocked.error, /another paper ledger writer/);
  fs.unlinkSync(lockPath);

  fs.appendFileSync(ledgerPaths(storageDir).ledger, '{"truncated":');
  const corrupted = readLedger(storageDir);
  assert.equal(corrupted.ok, false);
  assert.match(corrupted.error, /truncated final event/);
});

test('legacy migration imports only reconciled virtual positions and archives originals read-only', () => {
  const storageDir = tempStorageDir();
  const fill = {
    t: '2026-06-01T00:00:00.000Z',
    token_id: 'legacy-token',
    outcome: 'Yes',
    side: 'buy',
    shares: 10,
    price: 0.1,
    reason: 'legacy-strategy',
    virtual: true,
  };
  fs.writeFileSync(path.join(storageDir, 'fills.jsonl'), `${JSON.stringify(fill)}\n`);
  fs.writeFileSync(path.join(storageDir, 'portfolio.json'), JSON.stringify({
    virtual_balance: 99,
    starting_balance: 100,
    positions: [{
      token_id: 'legacy-token',
      market_id: 'legacy-market',
      outcome: 'Yes',
      shares: 10,
      avg_price: 0.1,
      opened_at: fill.t,
      strategy: 'legacy-strategy',
    }],
    opened_at: fill.t,
    updated_at: fill.t,
  }));

  const migrated = migrateLegacyPaperState(storageDir, { now: '2026-06-02T00:00:00.000Z' });
  assert.equal(migrated.ok, true);
  assert.equal(migrated.migrated, true);
  assert.deepEqual(migrated.migration_report, {
    accepted: 1,
    rejected: 0,
    duplicates: 0,
    ambiguous: 0,
    archive_dir: path.join(storageDir, 'legacy_read_only'),
  });
  assert.equal(migrated.projection.virtual_balance, 99);
  assert.equal(migrated.projection.positions.length, 1);
  assert.equal(fs.statSync(path.join(storageDir, 'legacy_read_only', 'portfolio.json')).mode & 0o777, 0o400);
});

test('ambiguous legacy state is preserved and refused without creating a ledger', () => {
  const storageDir = tempStorageDir();
  fs.writeFileSync(path.join(storageDir, 'fills.jsonl'), `${JSON.stringify({
    t: '2026-06-01T00:00:00.000Z',
    token_id: 'live-looking-token',
    side: 'buy',
    shares: 1,
    price: 0.5,
    virtual: false,
  })}\n`);
  fs.writeFileSync(path.join(storageDir, 'portfolio.json'), JSON.stringify({
    virtual_balance: 99.5,
    starting_balance: 100,
    positions: [{ token_id: 'live-looking-token', shares: 1, avg_price: 0.5 }],
  }));

  const migration = migrateLegacyPaperState(storageDir);
  assert.equal(migration.ok, false);
  assert.match(migration.error, /ambiguous/);
  assert.equal(fs.existsSync(ledgerPaths(storageDir).ledger), false);
  assert.equal(fs.existsSync(path.join(storageDir, 'portfolio.json')), true);
});
