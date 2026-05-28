use super::state::PortfolioState;

#[derive(Debug, Clone, Default)]
pub struct PortfolioMetrics {
    pub total_equity: f64,
    pub unrealized_pnl: f64,
    pub net_exposure: f64,
    pub gross_exposure: f64,
}

pub fn calculate(state: &PortfolioState) -> PortfolioMetrics {
    let mut metrics = PortfolioMetrics {
        total_equity: state.cash,
        ..PortfolioMetrics::default()
    };

    for position in &state.positions {
        let market_value = position.quantity * position.current_price;
        let cost_basis = position.quantity * position.average_cost;
        metrics.total_equity += market_value;
        metrics.unrealized_pnl += market_value - cost_basis;
        metrics.net_exposure += market_value;
        metrics.gross_exposure += market_value.abs();
    }

    metrics
}
