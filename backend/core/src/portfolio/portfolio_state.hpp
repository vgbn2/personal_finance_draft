#pragma once

#include <string>
#include <vector>

namespace sovereign {

struct Position {
    std::string symbol;
    double quantity = 0.0;
    double average_cost = 0.0;
    double current_price = 0.0;
};

struct PortfolioState {
    double cash = 0.0;
    std::vector<Position> positions;
};

struct PortfolioMetrics {
    double total_equity = 0.0;
    double total_unrealized_pnl = 0.0;
    double total_exposure = 0.0;
    double net_exposure = 0.0; // sum of (quantity * price)
    double gross_exposure = 0.0; // sum of abs(quantity * price)
    bool ok = true;
};

class PnlCalculator {
public:
    static PortfolioMetrics calculate(const PortfolioState& state);
};

} // namespace sovereign
