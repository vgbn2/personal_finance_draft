'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

describe('Market Data & Research Invariants (Ported from Research Handbook)', () => {
  // 1. Explicit Timestamp Units
  test('explicit timestamp units: millisecond vs microsecond conversion', () => {
    const ms = 1735689600000;
    const us = 1735689600000000n;
    const dateFromMs = new Date(ms);
    const dateFromUs = new Date(Number(us / 1000n));

    assert.equal(dateFromMs.getTime(), dateFromUs.getTime());
    assert.equal(dateFromMs.toISOString(), '2025-01-01T00:00:00.000Z');
  });

  // 2. Oversized Identifier Precision vs Float Drift
  test('oversized identifier precision: 64-bit int / string cannot be coerced to float', () => {
    const bigIdStr = '987654321098765432109876543210';
    const bigIntVal = BigInt(bigIdStr);
    assert.equal(bigIntVal.toString(), bigIdStr);

    // Casting to Number (IEEE 754 double) loses precision
    const floatCoerced = Number(bigIdStr);
    assert.notEqual(floatCoerced.toString(), bigIdStr);
  });

  // 3. Decimal Price Precision vs Float Rounding
  test('decimal price precision: floating point representation drift', () => {
    // Classic IEEE 754 drift
    assert.notEqual(0.1 + 0.2, 0.3);

    // Fixed decimal scaling (cents / micro-units) resolves exactly
    const scale = 1000000;
    const scaledSum = (Math.round(0.1 * scale) + Math.round(0.2 * scale)) / scale;
    assert.equal(scaledSum, 0.3);
  });

  // 4. Daylight Saving Time Disambiguation
  test('daylight saving time: UTC timestamps are invariant to local hour shifts', () => {
    // US Eastern DST transition on 2025-11-02: 01:30 EDT vs 01:30 EST
    const utcT1 = '2025-11-02T05:30:00.000Z'; // 01:30 EDT (UTC-4)
    const utcT2 = '2025-11-02T06:30:00.000Z'; // 01:30 EST (UTC-5)

    const diffHours = (Date.parse(utcT2) - Date.parse(utcT1)) / (1000 * 60 * 60);
    assert.equal(diffHours, 1.0); // Exactly 1 hour elapsed despite identical local wall-clock
  });

  // 5. Half-Open Bar Interval Boundaries
  test('half-open bar boundaries: [t_start, t_end) prevents double-counting boundary ticks', () => {
    const bar1 = { start: 1000, end: 2000 };
    const bar2 = { start: 2000, end: 3000 };

    const inBar1 = (t) => t >= bar1.start && t < bar1.end;
    const inBar2 = (t) => t >= bar2.start && t < bar2.end;

    const boundaryTick = 2000;
    // Tick at 2000 belongs strictly to bar2, NEVER bar1
    assert.equal(inBar1(boundaryTick), false);
    assert.equal(inBar2(boundaryTick), true);
  });

  // 6. Bitemporal As-Of Availability
  test('bitemporal as-of availability prevents future revisions from leaking', () => {
    const revisions = [
      { period: '2025-01', available_at: '2025-02-01T12:00:00Z', value: 100.0 },
      { period: '2025-01', available_at: '2025-03-01T12:00:00Z', value: 98.0 }, // Revision published later
    ];

    const decisionTime = Date.parse('2025-02-15T12:00:00Z');

    // Filter by point-in-time availability
    const available = revisions.filter((r) => Date.parse(r.available_at) <= decisionTime);
    assert.equal(available.length, 1);
    assert.equal(available[0].value, 100.0); // Must see 100, not 98!
  });

  // 7. Missing Mark Price is Unavailable, Not Zero
  test('missing mark is unavailable, not zero', () => {
    const quote = { symbol: 'XYZ', price: null };
    assert.equal(quote.price === null || quote.price === undefined, true);
    assert.notEqual(quote.price, 0);

    // Safeguard function
    function safeMark(price) {
      if (price === null || price === undefined || !Number.isFinite(price)) {
        return { status: 'unavailable', mark: null };
      }
      return { status: 'live', mark: Number(price) };
    }

    assert.equal(safeMark(null).status, 'unavailable');
    assert.equal(safeMark(null).mark, null);
    assert.equal(safeMark(0).status, 'live');
    assert.equal(safeMark(0).mark, 0);
  });

  // 8. Unfinished Bar is Not Available at Open
  test('unfinished bar is not available until bar close time and receipt time', () => {
    const bar = { start_time: 1000, end_time: 1060, receipt_time: 1061 };
    const decisionTime = 1030;

    // A bar is only complete if end_time <= decisionTime AND receipt_time <= decisionTime
    const isAvailable = bar.end_time <= decisionTime && bar.receipt_time <= decisionTime;
    assert.equal(isAvailable, false);
  });

  // 9. Orderbook Replacement and Zero Level Deletion
  test('orderbook level replacement: quantity 0 deletes price level', () => {
    const bids = new Map([
      ['0.50', 10],
      ['0.49', 20],
    ]);

    const updates = [
      { price: '0.50', size: 7 }, // Replacement
      { price: '0.49', size: 0 }, // Deletion
    ];

    for (const update of updates) {
      if (update.size === 0) {
        bids.delete(update.price);
      } else {
        bids.set(update.price, update.size);
      }
    }

    assert.equal(bids.has('0.49'), false);
    assert.equal(bids.get('0.50'), 7);
  });

  // 10. Gap in Sequence Invalidates In-Memory Orderbook
  test('gap in sequence counter invalidates orderbook state until fresh snapshot', () => {
    let bookState = 'SYNCHRONIZED';
    let expectedSeq = 42;
    const incomingSeq = 45; // Gap! Missing 42, 43, 44

    if (incomingSeq !== expectedSeq) {
      bookState = 'INVALID_AWAITING_SNAPSHOT';
    }

    assert.equal(bookState, 'INVALID_AWAITING_SNAPSHOT');
  });

  // 11. Two Differing Intraday Paths Produce Same OHLC Bar
  test('two distinct price trajectories produce identical OHLC bars', () => {
    const pathA = [100, 105, 95, 102]; // Open -> High -> Low -> Close
    const pathB = [100, 95, 105, 102]; // Open -> Low -> High -> Close

    const summarizeOhlc = (ticks) => ({
      open: ticks[0],
      high: Math.max(...ticks),
      low: Math.min(...ticks),
      close: ticks[ticks.length - 1],
    });

    assert.deepEqual(summarizeOhlc(pathA), summarizeOhlc(pathB));
    // Path order is different (high happened first in A, low first in B)
    assert.notEqual(pathA.indexOf(105) < pathA.indexOf(95), pathB.indexOf(105) < pathB.indexOf(95));
  });

  // 12. Linear vs Inverse Margin PnL
  test('linear contract PnL vs inverse coin-margined PnL', () => {
    // Linear Contract: PnL = quantity * multiplier * (exit - entry)
    const qty = 2;
    const multiplier = 0.1;
    const linearPnl = qty * multiplier * (55000 - 50000);
    assert.equal(linearPnl, 1000);

    // Inverse Contract: PnL = usd_notional * (1/entry - 1/exit)
    const usdNotional = 10000;
    const entry = 50000;
    const exitPrice = 55000;
    const btcPnl = usdNotional * (1 / entry - 1 / exitPrice);
    // 10000 * (0.00002 - 0.0000181818...) ≈ 0.0181818 BTC
    assert.equal(Math.abs(btcPnl - 0.01818181818181818) < 1e-12, true);
  });

  // 13. Funding Fee is a Separate Cashflow
  test('funding fee is a separate balance cashflow without price pollution', () => {
    const position = { symbol: 'BTC-PERP', shares: 1.0, entry_price: 60000 };
    let cashBalance = 10000;

    const fundingRate = 0.0001; // 0.01%
    const fundingPayment = position.shares * position.entry_price * fundingRate; // $6.00

    cashBalance -= fundingPayment;

    // Cash decreased
    assert.equal(cashBalance, 9994);
    // Entry price and shares remain strictly unaltered
    assert.equal(position.entry_price, 60000);
    assert.equal(position.shares, 1.0);
  });

  // 14. Asymmetric Return Recovery Arithmetic
  test('asymmetric return recovery: D / (1 - D)', () => {
    const requiredRecovery = (drawdown) => drawdown / (1 - drawdown);

    // 20% drawdown requires 25% gain
    assert.equal(requiredRecovery(0.20), 0.25);
    // 50% drawdown requires 100% gain
    assert.equal(requiredRecovery(0.50), 1.00);
    // 75% drawdown requires 300% gain
    assert.equal(requiredRecovery(0.75), 3.00);
  });

  // 15. Stock Split Economic Preservation
  test('stock split preserves total economic value while adjusting per-share basis', () => {
    const preSplitShares = 100;
    const preSplitPrice = 100;
    const totalPreValue = preSplitShares * preSplitPrice; // $10,000

    // 2-for-1 Split
    const postSplitShares = preSplitShares * 2;
    const postSplitPrice = preSplitPrice / 2;
    const totalPostValue = postSplitShares * postSplitPrice; // $10,000

    assert.equal(totalPreValue, totalPostValue);
    assert.equal(postSplitPrice / preSplitPrice - 1, -0.5); // 50% raw per-share drop
  });
});
