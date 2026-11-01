#include "portfolio/portfolio_state.hpp"

#include <cmath>
#include <iostream>

namespace {

bool closeEnough(double lhs, double rhs) {
    return std::abs(lhs - rhs) < 0.000001;
}

} // namespace

int main() {
    sovereign::PortfolioState state;
    state.cash = 1000.0;
    state.positions = {
        {"AAPL", 10.0, 150.0, 180.0},
        {"MSFT", -2.0, 300.0, 250.0},
    };

    const auto metrics = sovereign::PnlCalculator::calculate(state);
    if (!metrics.ok ||
        !closeEnough(metrics.total_equity, 2300.0) ||
        !closeEnough(metrics.total_unrealized_pnl, 400.0) ||
        !closeEnough(metrics.net_exposure, 1300.0) ||
        !closeEnough(metrics.gross_exposure, 2300.0) ||
        !closeEnough(metrics.total_exposure, 1.0)) {
        std::cerr << "portfolio metrics mismatch\n";
        return 1;
    }

    // Test regional multi-currency position with contract multiplier and FX rate
    sovereign::PortfolioState multi_state;
    multi_state.cash = 500.0; // USD cash
    // 100 shares HOSE:FPT @ 110.0 (1,000 multiplier = 110,000 VND), average cost 100.0, fx_rate = 0.00004 (1 VND = 0.00004 USD)
    // market_value = 100 * 110.0 * 1000 * 0.00004 = 440.0 USD
    // cost_basis   = 100 * 100.0 * 1000 * 0.00004 = 400.0 USD
    // unrealized   = 40.0 USD
    multi_state.positions = {
        {"FPT", 100.0, 100.0, 110.0, 1000.0, 0.00004},
    };
    const auto multi_metrics = sovereign::PnlCalculator::calculate(multi_state);
    if (!multi_metrics.ok ||
        !closeEnough(multi_metrics.total_equity, 940.0) ||
        !closeEnough(multi_metrics.total_unrealized_pnl, 40.0) ||
        !closeEnough(multi_metrics.net_exposure, 440.0) ||
        !closeEnough(multi_metrics.gross_exposure, 440.0)) {
        std::cerr << "multi-currency portfolio metrics mismatch\n";
        return 1;
    }

    return 0;
}
