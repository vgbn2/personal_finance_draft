'use strict';

const assert = require('node:assert/strict');
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

const { buildRiskContext } = require('../../../../backend/gateway/src/index.ts');

function marketOrder() {
  return {
    instrumentId: 'AAPL',
    side: 'buy',
    quantity: 2,
    type: 'market',
    status: 'proposed',
    timestamp: new Date(),
  };
}

test('market-order risk context uses a broker quote and account equity', async () => {
  const previousDrawdown = process.env.CURRENT_PORTFOLIO_DRAWDOWN;
  process.env.CURRENT_PORTFOLIO_DRAWDOWN = '0.08';
  try {
    const adapter = {
      async getQuote() { return 125.50; },
      async getPortfolioBalance() { return { EQUITY: 1000 }; },
    };
    const context = await buildRiskContext(marketOrder(), adapter, false);

    assert.deepEqual(context, {
      referencePrice: 125.50,
      portfolioEquity: 1000,
      currentDrawdown: 0.08,
      maxDrawdown: 0.20,
    });
    assert.equal(context.referencePrice * marketOrder().quantity, 251);
  } finally {
    if (previousDrawdown === undefined) delete process.env.CURRENT_PORTFOLIO_DRAWDOWN;
    else process.env.CURRENT_PORTFOLIO_DRAWDOWN = previousDrawdown;
  }
});

test('live risk context rejects an omitted drawdown instead of assuming zero', async () => {
  const previousDrawdown = process.env.CURRENT_PORTFOLIO_DRAWDOWN;
  delete process.env.CURRENT_PORTFOLIO_DRAWDOWN;
  try {
    const adapter = {
      async getQuote() { return 100; },
      async getPortfolioBalance() { return { EQUITY: 1000 }; },
    };
    await assert.rejects(
      buildRiskContext(marketOrder(), adapter, false),
      /CURRENT_PORTFOLIO_DRAWDOWN must be explicitly set/,
    );
  } finally {
    if (previousDrawdown !== undefined) process.env.CURRENT_PORTFOLIO_DRAWDOWN = previousDrawdown;
  }
});
