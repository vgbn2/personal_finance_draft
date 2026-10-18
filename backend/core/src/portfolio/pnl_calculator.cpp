#include "portfolio_state.hpp"

#include <cmath>

namespace sovereign {

PortfolioMetrics PnlCalculator::calculate(const PortfolioState& state) {
    PortfolioMetrics metrics;
    metrics.total_equity = state.cash;
    metrics.total_unrealized_pnl = 0.0;
    metrics.net_exposure = 0.0;
    metrics.gross_exposure = 0.0;

    for (const auto& pos : state.positions) {
        const double mult = (pos.multiplier > 0.0) ? pos.multiplier : 1.0;
        const double fx = (pos.fx_rate > 0.0) ? pos.fx_rate : 1.0;
        const double market_value = pos.quantity * pos.current_price * mult * fx;
        const double cost_basis = pos.quantity * pos.average_cost * mult * fx;
        const double unrealized_pnl = market_value - cost_basis;

        metrics.total_equity += market_value;
        metrics.total_unrealized_pnl += unrealized_pnl;
        metrics.net_exposure += market_value;
        metrics.gross_exposure += std::abs(market_value);
    }

    if (metrics.total_equity > 0.0) {
        metrics.total_exposure = metrics.gross_exposure / metrics.total_equity;
    } else {
        metrics.total_exposure = 0.0;
    }

    metrics.ok = true;
    return metrics;
}

} // namespace sovereign
