module.exports = {
  path: '/api/strategies',
  status: () => 200,
  handle: () => ({
    ok: true,
    type: 'strategy_catalog',
    strategies: [
      { name: 'hybrid', status: 'active' },
      { name: 'spot_only', status: 'available' },
      { name: 'spot_futures_arb', status: 'available' },
      { name: 'options_trading', status: 'available' },
    ],
  }),
};
