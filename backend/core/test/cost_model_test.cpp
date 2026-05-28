#include "risk/cost_model.hpp"
#include <iostream>
#include <cmath>

namespace {

bool expect_near(double actual, double expected, double tolerance, const char* message) {
    if (std::abs(actual - expected) > tolerance) {
        std::cerr << "FAILED: " << message << " (Actual: " << actual << ", Expected: " << expected << ")\n";
        return false;
    }
    return true;
}

} // namespace

int main() {
    using namespace sovereign;

    CostModelParams params;
    params.commission_bps = 2.0;
    params.slippage_vol_coeff = 0.1; // 10% of annual vol in bps
    params.market_impact_coeff = 0.01;

    CostModel model(params);

    // 1. Low volatility, no impact
    double cost1 = model.estimate_bps(0.10, 0.0); // 10% annual vol
    // Expected: 2.0 + (0.10 * 0.1 * 100) = 2.0 + 1.0 = 3.0 bps
    if (!expect_near(cost1, 3.0, 0.01, "Low vol cost")) return 1;

    // 2. High volatility, no impact
    double cost2 = model.estimate_bps(0.50, 0.0); // 50% annual vol
    // Expected: 2.0 + (0.50 * 0.1 * 100) = 2.0 + 5.0 = 7.0 bps
    if (!expect_near(cost2, 7.0, 0.01, "High vol cost")) return 1;

    // 3. High volatility + Market impact
    double cost3 = model.estimate_bps(0.50, 0.001); // 50% annual vol, 10bps of ADV
    // Expected: 7.0 + (0.001 * 0.01 * 10000) = 7.0 + 0.1 = 7.1 bps
    if (!expect_near(cost3, 7.1, 0.01, "High vol + impact cost")) return 1;

    std::cout << "cost_model_test passed!\n";
    return 0;
}
