function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function buildAggregatedPortfolioSnapshot(results, polymarket) {
  const aggregated = {
    total_usd: 0,
    total_equity: 0,
    total_unrealized_pl: 0,
    cost_basis_unavailable_positions: 0,
    brokers: [],
    positions: [],
    prediction_markets: { polymarket },
  };

  const addPositions = (positions) => {
    for (const position of positions || []) {
      aggregated.positions.push(position);
      if (position && position.cost_basis_unavailable) {
        aggregated.cost_basis_unavailable_positions += 1;
      } else {
        aggregated.total_unrealized_pl += toNumber(position && position.unrealizedPl);
      }
    }
  };

  for (const res of results || []) {
    if (res && res.ok && res.balance) {
      const positions = Array.isArray(res.positions) ? res.positions : [];
      aggregated.total_usd += (toNumber(res.balance.USD) || toNumber(res.balance.USDT) || 0);
      aggregated.total_equity += (toNumber(res.balance.EQUITY) || toNumber(res.balance.USD) || toNumber(res.balance.USDT) || 0);
      aggregated.brokers.push({
        name: res.name,
        status: 'connected',
        balance: res.balance,
        position_count: positions.length,
        cost_basis_unavailable_count: positions.filter((position) => position && position.cost_basis_unavailable).length,
      });
      addPositions(positions);
    } else if (res) {
      aggregated.brokers.push({
        name: res.name,
        status: 'error',
        error: res.error,
      });
    }
  }

  if (polymarket && polymarket.ok) {
    const pUsd = toNumber(polymarket.balance && polymarket.balance.pUSD);
    aggregated.total_usd += pUsd;
    aggregated.total_equity += pUsd;
    aggregated.brokers.push({
      name: 'Polymarket',
      status: 'connected',
      balance: polymarket.balance || {},
      position_count: Array.isArray(polymarket.positions) ? polymarket.positions.length : 0,
      cost_basis_unavailable_count: 0,
    });
    if (Array.isArray(polymarket.positions)) {
      addPositions(polymarket.positions);
    }
  } else if (polymarket && polymarket.configured) {
    aggregated.brokers.push({
      name: 'Polymarket',
      status: 'error',
      error: polymarket.error || 'Polymarket portfolio unavailable',
    });
  }

  return aggregated;
}

module.exports = { buildAggregatedPortfolioSnapshot };
