'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

require('../../../../shared/lib/runtime/ts_register');
const {
  replayLedger,
  buildEvent,
  appendLedgerEvents,
  loadLedgerProjection,
  GENESIS_CHECKSUM,
} = require('../../../../backend/gateway/src/polymarket/paper_ledger');
const {
  runPolymarketPaperRun,
} = require('../../../../backend/gateway/src/polymarket/paper');

describe('Paper Trading Settlement & Accounting Ledger', () => {
  let tempLedgerDir;

  before(() => {
    tempLedgerDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sovereign_paper_ledger_test_'));
  });

  after(() => {
    try {
      if (tempLedgerDir && fs.existsSync(tempLedgerDir)) {
        fs.rmSync(tempLedgerDir, { recursive: true, force: true });
      }
    } catch {}
  });

  test('replayLedger initializes with settled_cash matching starting balance', () => {
    const initEvent = buildEvent(
      {
        event_type: 'ledger_initialized',
        idempotency_key: 'init_1',
        cash_after: 500,
        event_time: '2026-10-08T00:00:00Z',
      },
      1,
      GENESIS_CHECKSUM
    );

    const projection = replayLedger([initEvent]);
    assert.equal(projection.virtual_balance, 500);
    assert.equal(projection.settled_cash, 500);
    assert.equal(projection.pending_receivables, 0);
    assert.equal(projection.available_cash, 500);
    assert.equal(projection.funding_fees, 0);
  });

  test('settlement delay locks sale proceeds into pending_receivables until maturity', () => {
    const t0 = '2026-10-08T10:00:00Z';
    const tDue = '2026-10-08T12:00:00Z'; // 2 hours later

    const initEvent = buildEvent(
      {
        event_type: 'ledger_initialized',
        idempotency_key: 'init_2',
        cash_after: 100,
        event_time: t0,
      },
      1,
      GENESIS_CHECKSUM
    );

    // Simulate selling an asset for $50 cash_delta with settlement_due_at = tDue
    const sellFillEvent = buildEvent(
      {
        event_type: 'paper_fill',
        idempotency_key: 'sell_fill_1',
        event_time: t0,
        cash_delta: 50,
        settlement_due_at: tDue,
        paper_fill: { shares: 50, price: 1.0, side: 'sell' },
      },
      2,
      initEvent.event_checksum
    );

    const events = [initEvent, sellFillEvent];

    // As-of 10:30 (BEFORE settlement due at 12:00)
    const asOfBefore = replayLedger(events, 100, { asOf: '2026-10-08T10:30:00Z' });
    assert.equal(asOfBefore.virtual_balance, 150); // Total nominal cash is 100 + 50
    assert.equal(asOfBefore.pending_receivables, 50); // $50 is locked
    assert.equal(asOfBefore.settled_cash, 100); // Only $100 is settled
    assert.equal(asOfBefore.available_cash, 100); // Cannot spend pending $50

    // As-of 12:30 (AFTER settlement due at 12:00)
    const asOfAfter = replayLedger(events, 100, { asOf: '2026-10-08T12:30:00Z' });
    assert.equal(asOfAfter.virtual_balance, 150);
    assert.equal(asOfAfter.pending_receivables, 0); // Unlocked!
    assert.equal(asOfAfter.settled_cash, 150); // Full $150 now settled
    assert.equal(asOfAfter.available_cash, 150);
  });

  test('funding_fee events adjust cash balance without corrupting positions', () => {
    const t0 = '2026-10-08T10:00:00Z';
    const initEvent = buildEvent(
      {
        event_type: 'ledger_initialized',
        idempotency_key: 'init_3',
        cash_after: 1000,
        event_time: t0,
      },
      1,
      GENESIS_CHECKSUM
    );

    // Add a position
    const buyEvent = buildEvent(
      {
        event_type: 'paper_fill',
        idempotency_key: 'buy_1',
        event_time: t0,
        cash_delta: -200,
        token_id: 'TOKEN_XYZ',
        position: { token_id: 'TOKEN_XYZ', shares: 400, average_price: 0.50 },
      },
      2,
      initEvent.event_checksum
    );

    // Add a discrete funding fee deduction of $2.50
    const fundingEvent = buildEvent(
      {
        event_type: 'funding_fee',
        idempotency_key: 'funding_1',
        event_time: '2026-10-08T14:00:00Z',
        cash_delta: -2.50,
        fees: 2.50,
      },
      3,
      buyEvent.event_checksum
    );

    const projection = replayLedger([initEvent, buyEvent, fundingEvent]);
    // 1000 - 200 - 2.50 = 797.50
    assert.equal(projection.virtual_balance, 797.50);
    assert.equal(projection.funding_fees, 2.50);

    // Position remains completely intact
    assert.equal(projection.positions.length, 1);
    assert.equal(projection.positions[0].token_id, 'TOKEN_XYZ');
    assert.equal(projection.positions[0].shares, 400);
    assert.equal(projection.positions[0].average_price, 0.50);
  });

  test('appendLedgerEvents persists disk journal and updates projection snapshot', () => {
    const result = appendLedgerEvents(tempLedgerDir, [
      {
        event_type: 'ledger_initialized',
        idempotency_key: 'disk_init_1',
        cash_after: 250,
        event_time: '2026-10-08T00:00:00Z',
      },
      {
        event_type: 'paper_fill',
        idempotency_key: 'disk_buy_1',
        event_time: '2026-10-08T01:00:00Z',
        cash_delta: -50,
        token_id: 'T1',
        position: { token_id: 'T1', shares: 100, average_price: 0.50 },
      },
    ]);

    assert.equal(result.ok, true);
    assert.equal(result.accepted.length, 2);
    assert.equal(result.projection.virtual_balance, 200);
    assert.equal(result.projection.settled_cash, 200);

    // Verify snapshot file on disk
    const snapshotPath = path.join(tempLedgerDir, 'portfolio.v1.json');
    assert.equal(fs.existsSync(snapshotPath), true);
    const diskSnapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
    assert.equal(diskSnapshot.virtual_balance, 200);
    assert.equal(diskSnapshot.settled_cash, 200);
  });

  test('real-disk append -> reload -> rejected pre-due buy regression (PM-SETTLE-01)', async () => {
    const preDueDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sovereign_predue_test_'));
    try {
      const t0 = '2026-10-08T10:00:00Z';
      const tDue = '2026-10-09T10:00:00Z'; // Due 24h later

      // 1. Append initialization ($100 starting cash)
      appendLedgerEvents(preDueDir, [
        {
          event_type: 'ledger_initialized',
          idempotency_key: 'init_predue',
          cash_after: 100,
          event_time: t0,
        },
      ]);

      // 2. Append a sell fill that credits $50 cash_delta with future settlement_due_at
      appendLedgerEvents(preDueDir, [
        {
          event_type: 'paper_fill',
          idempotency_key: 'sell_fill_predue',
          event_time: t0,
          cash_delta: 50,
          settlement_due_at: tDue,
          paper_fill: { shares: 50, price: 1.0, side: 'sell' },
        },
      ], { now: t0, asOf: t0 });

      // 3. Reload projection from disk as-of 2h later (still before tDue)
      const tEval = '2026-10-08T12:00:00Z';
      const loaded = loadLedgerProjection(preDueDir, 100, { asOf: tEval });
      assert.equal(loaded.ok, true);
      assert.equal(loaded.projection.virtual_balance, 150);
      assert.equal(loaded.projection.pending_receivables, 50);
      assert.equal(loaded.projection.settled_cash, 100);
      assert.equal(loaded.projection.available_cash, 100);

      // 4. Attempt to execute a buy cycle requiring $125 notional (min_order_size = 250 shares @ $0.50)
      const mockMarket = {
        id: 'MKT_TEST_1',
        condition_id: 'COND_TEST_1',
        question: 'Will Fed cut rates in 2026?',
        liquidity: 50000,
        tokens: [
          { token_id: 'TOKEN_YES', outcome: 'Yes', price: 0.50 },
          { token_id: 'TOKEN_NO', outcome: 'No', price: 0.50 },
        ],
      };
      const mockOrderbooks = {
        TOKEN_YES: {
          bids: [{ price: 0.49, size: 1000 }],
          asks: [{ price: 0.51, size: 1000 }],
          min_order_size: 250, // requires at least 250 * 0.50 = $125
        },
      };

      const result = await runPolymarketPaperRun({
        storageDir: preDueDir,
        markets: [mockMarket],
        fetchOrderBook: async (tokenId) => mockOrderbooks[tokenId] || null,
        maxPositionUsd: 125,
        maxEntryPrice: 0.60,
        maxSpread: 0.10,
        now: tEval,
        virtualBalance: 100,
        sizingIntent: {
          mode: 'notional',
          value: 125,
          currency: 'USD',
        },
      });

      assert.equal(result.ok, true);
      // Buy must be rejected because available cash ($100) cannot satisfy the $125 minimum order requirement
      assert.equal(result.fills.length, 0);
      assert.equal(result.skipped.length, 1);
      assert.equal(result.skipped[0].sizing_code, 'below_minimum_quantity');
    } finally {
      try {
        fs.rmSync(preDueDir, { recursive: true, force: true });
      } catch {}
    }
  });
});
