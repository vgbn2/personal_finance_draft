#include "risk/cost_model.hpp"
#include <cmath>
#include <iostream>

namespace {

bool expect_near(double actual, double expected, double tolerance, const char* message) {
    if (std::abs(actual - expected) > tolerance) {
        std::cerr << "FAILED: " << message << " (Actual: " << actual << ", Expected: " << expected << ")\n";
        return false;
    }
    return true;
}

bool expect_true(bool condition, const char* message) {
    if (!condition) {
        std::cerr << "FAILED: " << message << '\n';
        return false;
    }
    return true;
}

} // namespace

int main() {
    using namespace sovereign;

    CostModelParams params;
    params.commission_bps = 2.0;
    params.slippage_fixed_bps = 1.0;
    params.slippage_vol_power = 0.5;
    params.slippage_vol_coeff = 0.1;
    params.market_impact_coeff = 0.01;

    CostModel model(params);
    constexpr double tolerance = 1e-12;

    // Non-positive volatility and notional omit their conditional terms.
    const double baseline_cost = model.estimate_bps(0.0, 0.0);
    if (!expect_near(baseline_cost, 2.0, tolerance, "Commission-only cost")) return 1;

    // 2 commission + 1 fixed slippage + 0.1 * sqrt(0.04) * 100 = 5 bps.
    const double low_vol_cost = model.estimate_bps(0.04, 0.0);
    if (!expect_near(low_vol_cost, 5.0, tolerance, "Low-volatility cost")) return 1;

    // 2 commission + 1 fixed slippage + 0.1 * sqrt(0.64) * 100 = 11 bps.
    const double high_vol_cost = model.estimate_bps(0.64, 0.0);
    if (!expect_near(high_vol_cost, 11.0, tolerance, "High-volatility cost")) return 1;

    // Market impact is 0.01 * sqrt(0.01) * 100 = 0.1 bps.
    const double high_vol_impact_cost = model.estimate_bps(0.64, 0.01);
    if (!expect_near(high_vol_impact_cost, 11.1, tolerance, "High-volatility cost with impact")) return 1;
    if (!expect_near(high_vol_impact_cost - high_vol_cost, 0.1, tolerance, "Square-root impact increment")) return 1;

    if (!expect_true(low_vol_cost > baseline_cost, "Positive volatility must add slippage")) return 1;
    if (!expect_true(high_vol_cost > low_vol_cost, "Higher volatility must increase cost")) return 1;
    if (!expect_true(high_vol_impact_cost > high_vol_cost, "Positive notional must add market impact")) return 1;

    std::cout << "cost_model_test passed: baseline=" << baseline_cost
              << " low_vol=" << low_vol_cost
              << " high_vol=" << high_vol_cost
              << " high_vol_with_impact=" << high_vol_impact_cost << '\n';
    return 0;
}
