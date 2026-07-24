'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

require('ts-node').register({
  transpileOnly: true,
  skipProject: true,
  experimentalResolver: true,
  compilerOptions: {
    module: 'CommonJS',
    moduleResolution: 'node',
    target: 'ES2020',
    esModuleInterop: true,
    ignoreDeprecations: '6.0',
  },
});

const CYCLE_PATH = path.resolve(__dirname, '..', '..', '..', '..', 'backend', 'gateway', 'src', 'cycle.ts');
const {
  determinePositionExitReason,
  resolveObservablePositionPrice,
  runCycle,
  submitRiskApprovedFokOrder,
} = require(CYCLE_PATH);

function intent() {
  return {
    instrumentId: 'TOKEN_123',
    price: 0.42,
    quantity: 5,
    side: 'BUY',
  };
}

test('bot FOK submission fails closed without a pre-trade authorizer', async () => {
  let submitted = false;
  const client = {
    async createOrder() { throw new Error('createOrder must not run'); },
    async postOrder() { submitted = true; },
  };

  await assert.rejects(
    submitRiskApprovedFokOrder(client, intent(), 'FOK'),
    /risk authorizer is unavailable/,
  );
  assert.equal(submitted, false);
});

test('aged paper position cannot exit without an observable price', () => {
  const position = {
    side: 'YES',
    targetPrice: 0.3,
    stopPrice: 0.05,
    entryTimestamp: '2026-01-01T00:00:00.000Z',
    aiProbabilityAtEntry: 0.6,
  };
  const now = Date.parse('2026-07-24T00:00:00.000Z');

  assert.equal(determinePositionExitReason(position, 0, undefined, 24, now), null);
  assert.equal(determinePositionExitReason(position, Number.NaN, undefined, 24, now), null);
  assert.equal(determinePositionExitReason(position, 0.2, undefined, 24, now), 'time_decay');
});

test('paper position review uses credential-free observed market prices', async () => {
  const yes = { side: 'YES', tokenId: 'yes-token' };
  const no = { side: 'NO', tokenId: 'no-token' };
  const bet = { market_price: 0.61 };

  assert.equal(await resolveObservablePositionPrice(yes, bet), 0.61);
  assert.ok(Math.abs((await resolveObservablePositionPrice(no, bet)) - 0.39) < 1e-12);
  assert.equal(await resolveObservablePositionPrice(yes, undefined), null);
});

test('live bot cycle rejects missing L2 credentials before network or state work', async () => {
  const keys = [
    'LIVE_TRADING',
    'SOVEREIGN_EXECUTION_AUTHORIZED',
    'POLYMARKET_API_KEY',
    'POLYMARKET_API_SECRET',
    'POLYMARKET_API_PASSPHRASE',
  ];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  process.env.LIVE_TRADING = 'true';
  process.env.SOVEREIGN_EXECUTION_AUTHORIZED = 'true';
  process.env.POLYMARKET_API_KEY = '';
  process.env.POLYMARKET_API_SECRET = '';
  process.env.POLYMARKET_API_PASSPHRASE = '';

  try {
    const result = await runCycle(['cycle', '--live'], {
      authorizeOrder: async () => ({ approved: true }),
    });
    assert.equal(result.dryRun, false);
    assert.equal(result.sellsExecuted, 0);
    assert.equal(result.buysFilled, 0);
    assert.deepEqual(result.errors, ['Live Polymarket bot execution requires complete L2 credentials']);
  } finally {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});

test('bot FOK submission stops before signing when native risk rejects', async () => {
  const calls = [];
  const client = {
    async createOrder() { calls.push('create'); },
    async postOrder() { calls.push('post'); },
  };

  await assert.rejects(
    submitRiskApprovedFokOrder(client, intent(), 'FOK', async () => {
      calls.push('risk');
      return { approved: false, reason: 'native rejection' };
    }),
    /native rejection/,
  );
  assert.deepEqual(calls, ['risk']);
});

test('bot FOK submission signs and posts only after risk approval', async () => {
  const calls = [];
  const client = {
    async createOrder(order) {
      calls.push(['create', order]);
      return { signed: true };
    },
    async postOrder(order, orderType) {
      calls.push(['post', order, orderType]);
      return { status: 'matched' };
    },
  };

  const result = await submitRiskApprovedFokOrder(client, intent(), 'FOK', async (order) => {
    calls.push(['risk', order]);
    return { approved: true };
  });

  assert.equal(result.status, 'matched');
  assert.equal(calls[0][0], 'risk');
  assert.equal(calls[1][0], 'create');
  assert.equal(calls[2][0], 'post');
  assert.deepEqual(calls[1][1], {
    tokenID: 'TOKEN_123',
    price: 0.42,
    size: 5,
    side: 'BUY',
  });
});

test('cycle source has one CLOB post seam and it is risk-approved', () => {
  const source = fs.readFileSync(CYCLE_PATH, 'utf8');
  assert.equal((source.match(/\.postOrder\(/g) || []).length, 1);
  assert.match(source, /return client\.postOrder\(signed, orderType\)/);
  assert.match(source, /submitRiskApprovedFokOrder\(client/);
});
