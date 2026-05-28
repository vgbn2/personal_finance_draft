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

    return 0;
}
