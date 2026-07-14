const test = require('node:test');
const assert = require('node:assert/strict');

const { _test, renderCorrelationHeatmap } = require('../../../../backend/cli/tui/engine');
const { defaultCorrelationMethod, resolveCorrelationMethod } = require('../../../../backend/cli/commands/tools/backend.js');

const ESC = String.fromCharCode(27);
const ANSI_RE = new RegExp(`${ESC}\\[[0-9;]*m`, 'g');

const ASSET_OPTIONS = [
  { label: '  BTCUSDT', value: 'BTCUSDT', category: 'CRYPTO: GLOBAL' },
  { label: '  ETHUSDT', value: 'ETHUSDT', category: 'CRYPTO: GLOBAL' },
  { label: '  XAUUSD', value: 'XAUUSD', category: 'COMMODITIES: GLOBAL' },
  { label: '  SPY', value: 'SPY', category: 'EQUITIES: US' },
  { label: '  TCB', value: 'TCB', category: 'EQUITIES: VN' },
  {
    label: 'Layer1',
    value: '__SECTOR:CRYPTO:layer1',
    category: 'CRYPTO: GLOBAL',
    sectorGroup: 'CRYPTO::layer1',
    isSectorHeader: true
  }
];

test('TUI search parses ampersand-delimited custom asset terms', () => {
  assert.deepEqual(_test.searchTerms('btc&&eth&&xau&spy'), ['btc', 'eth', 'xau', 'spy']);
});

test('TUI search builds a custom selectable symbol array from typed matches', () => {
  const state = _test.buildCustomSelection(ASSET_OPTIONS, 'btc&&eth&&xau&spy');

  assert.deepEqual(state.custom, ['BTCUSDT', 'ETHUSDT', 'XAUUSD', 'SPY']);
  assert.deepEqual(state.missing, []);

  console.log(JSON.stringify({
    type: 'tui_search_contract',
    query: 'btc&&eth&&xau&spy',
    custom_count: state.custom.length,
    custom: state.custom,
    missing: state.missing
  }));
});

test('TUI custom selection reports missing search terms without dropping matches', () => {
  const state = _test.buildCustomSelection(ASSET_OPTIONS, 'btc&&nope');

  assert.deepEqual(state.custom, ['BTCUSDT']);
  assert.deepEqual(state.missing, ['nope']);
});

test('TUI search helpers keep menu search and raw key tokenization stable', () => {
  assert.equal(_test.matchesSearch({ label: 'Backend Correlation', value: 'correlation' }, 'backend'), true);
  assert.deepEqual(_test.keyTokens(`ab${ESC}[Bc`), ['a', 'b', `${ESC}[B`, 'c']);
});

test('post-command footer keeps Enter for menu and adds same-function return actions', () => {
  assert.equal(_test.postCommandActionForKey('\r'), 'menu');
  assert.equal(_test.postCommandActionForKey('r'), 'rerun');
  assert.equal(_test.postCommandActionForKey('R'), 'rerun');
  assert.equal(_test.postCommandActionForKey('b'), 'back');
  assert.equal(_test.postCommandActionForKey(ESC), 'back');
  assert.equal(_test.postCommandActionForKey('x'), null);
});

test('correlation heatmap centers cells and keeps full nine-char symbols', () => {
  const rendered = renderCorrelationHeatmap(
    ['BTCUSDT', 'ETHUSDT', 'MATICUSDT'],
    [
      [1, 0.99, -0.76],
      [0.99, 1, -0.81],
      [-0.76, -0.81, 1]
    ],
    { BTCUSDT: 73885.78, ETHUSDT: 2000, MATICUSDT: 0.379 }
  );
  const plain = rendered.replace(ANSI_RE, '');
  const lines = plain.split('\n');
  const btcRow = lines.find(line => line.startsWith('BTCUSDT'));

  assert.equal(_test.centerCell('BTCUSDT', 9), ' BTCUSDT ');
  assert.match(plain, /\| BTCUSDT \| ETHUSDT \|MATICUSDT\|/);
  assert.match(plain, /BTCUSDT\s*\|  1\.00   \|  0\.99   \|  -0\.76  \|/);
  assert.match(plain, /Legend: Strong Neg Neg Neutral Pos Strong Pos/);
  assert.doesNotMatch(btcRow, /\$73/);
  assert.match(plain, /----------\+---------\+---------\+---------\+/);
});

test('FX correlation defaults to return-based method and renders direction note', () => {
  const method = defaultCorrelationMethod(['EURUSD', 'USDJPY'], [
    { symbol: 'EURUSD', family: 'fx' },
    { symbol: 'USDJPY', family: 'fx' }
  ]);
  const rendered = renderCorrelationHeatmap(
    ['EURUSD', 'USDJPY'],
    [
      [1, -0.42],
      [-0.42, 1]
    ],
    { EURUSD: 1.16, USDJPY: 159.27 },
    {
      method,
      transform: 'log_returns',
      note: 'FX pairs are directional: BASE up / QUOTE down; matrix uses log returns.'
    }
  );
  const plain = rendered.replace(ANSI_RE, '');

  assert.equal(method, 'fx-returns');
  assert.equal(defaultCorrelationMethod(['SPY', 'QQQ'], [
    { symbol: 'SPY', family: 'equities' },
    { symbol: 'QQQ', family: 'equities' }
  ]), 'pearson-returns');
  assert.match(plain, /FX Correlation Heatmap \[fx-returns, log_returns\]/);
  assert.match(plain, /Note: FX pairs are directional: BASE up \/ QUOTE down; matrix uses log returns\./);
});

test('fx-returns is exclusive to FX symbols', () => {
  const cryptoUniverse = [
    { symbol: 'FETUSDT', family: 'crypto' },
    { symbol: 'RNDRUSDT', family: 'crypto' }
  ];

  assert.equal(resolveCorrelationMethod(['FETUSDT', 'RNDRUSDT'], cryptoUniverse, 'fx-returns'), 'pearson-returns');
  assert.equal(resolveCorrelationMethod(['EURUSD', 'USDJPY'], [
    { symbol: 'EURUSD', family: 'fx' },
    { symbol: 'USDJPY', family: 'fx' }
  ], 'fx-returns'), 'fx-returns');
});
