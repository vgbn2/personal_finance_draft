import { isMarkedActivePolymarketPosition, partitionPolymarketPositions } from './positions';

function toNumber(value: any): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export interface AggregatedPortfolioSnapshot {
  total_usd: number;
  total_equity: number;
  total_unrealized_pl: number;
  cost_basis_unavailable_positions: number;
  valuation_unavailable_positions: number;
  brokers: any[];
  positions: any[];
  prediction_markets: {
    polymarket: any;
  };
}

export function buildAggregatedPortfolioSnapshot(results: any[], polymarket: any): AggregatedPortfolioSnapshot {
  const aggregated: AggregatedPortfolioSnapshot = {
    total_usd: 0,
    total_equity: 0,
    total_unrealized_pl: 0,
    cost_basis_unavailable_positions: 0,
    valuation_unavailable_positions: 0,
    brokers: [],
    positions: [],
    prediction_markets: { polymarket },
  };

  const addPositions = (positions: any[]) => {
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
        cost_basis_unavailable_count: positions.filter((position: any) => position && position.cost_basis_unavailable).length,
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
    const positions = Array.isArray(polymarket.positions) ? polymarket.positions : [];
    const partitioned = partitionPolymarketPositions(positions);
    const markedActive = partitioned.active.filter(isMarkedActivePolymarketPosition);
    const markedPositionValue = markedActive.reduce(
      (sum, position) => sum + toNumber(position && position.marketValue),
      0,
    );
    aggregated.valuation_unavailable_positions += partitioned.active.length - markedActive.length;
    aggregated.total_usd += pUsd;
    aggregated.total_equity += pUsd + markedPositionValue;
    aggregated.brokers.push({
      name: 'Polymarket',
      status: 'connected',
      balance: polymarket.balance || {},
      position_count: partitioned.active.length,
      ended_position_count: partitioned.ended.length,
      unknown_position_count: partitioned.unknown.length,
      cost_basis_unavailable_count: 0,
    });
    addPositions(markedActive);
  } else if (polymarket && polymarket.configured) {
    aggregated.brokers.push({
      name: 'Polymarket',
      status: 'error',
      error: polymarket.error || 'Polymarket portfolio unavailable',
    });
  }

  return aggregated;
}
