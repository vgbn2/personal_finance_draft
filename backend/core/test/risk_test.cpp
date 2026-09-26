#include "../src/risk/drawdown_guard.hpp"
#include "../src/risk/pre_trade_risk.hpp"

#include <cmath>
#include <iostream>
#include <limits>
#include <string>
#include <vector>

namespace {

bool approxEqual(double actual, double expected, double tolerance) {
    return std::fabs(actual - expected) <= tolerance;
}

bool expect(bool condition, const char* message) {
    if (!condition) {
        std::cerr << message << "\n";
    }
    return condition;
}

} // namespace

int main() {
    const std::vector<double> equity{100.0, 110.0, 105.0, 120.0, 90.0, 95.0, 130.0};

    const auto approved = sovereign::DrawdownGuard::evaluate(equity, sovereign::RiskLimits{0.30, true});
    if (!expect(approved.approved, "Expected approval inside drawdown limit")) {
        return 1;
    }
    if (!expect(!approved.halt_trading, "Expected no halt inside drawdown limit")) {
        return 1;
    }
    if (!expect(approxEqual(approved.observed_drawdown, 0.25, 0.0000001), "Expected observed drawdown")) {
        return 1;
    }

    const auto halted = sovereign::DrawdownGuard::evaluate(equity, sovereign::RiskLimits{0.20, true});
    if (!expect(!halted.approved, "Expected rejection above drawdown limit")) {
        return 1;
    }
    if (!expect(halted.halt_trading, "Expected halt above drawdown limit")) {
        return 1;
    }
    if (!expect(std::string(halted.reason) == "max_drawdown_exceeded", "Expected max drawdown reason")) {
        return 1;
    }

    const std::vector<double> invalid{100.0, std::numeric_limits<double>::quiet_NaN(), 120.0};
    const auto invalid_fail_closed = sovereign::DrawdownGuard::evaluate(invalid, sovereign::RiskLimits{0.20, true});
    if (!expect(!invalid_fail_closed.approved, "Expected invalid equity curve to fail closed")) {
        return 1;
    }
    if (!expect(invalid_fail_closed.halt_trading, "Expected invalid equity curve halt")) {
        return 1;
    }

    const std::vector<double> inf_curve{100.0, std::numeric_limits<double>::infinity(), 120.0};
    const auto inf_fail_closed = sovereign::DrawdownGuard::evaluate(inf_curve, sovereign::RiskLimits{0.20, true});
    if (!expect(!inf_fail_closed.approved, "Expected infinity equity curve to fail closed")) {
        return 1;
    }
    if (!expect(inf_fail_closed.halt_trading, "Expected infinity equity curve halt")) {
        return 1;
    }

    const auto invalid_allowed = sovereign::DrawdownGuard::evaluate(invalid, sovereign::RiskLimits{0.20, false});
    if (!expect(invalid_allowed.approved, "Expected invalid curve allowed when fail_closed is false")) {
        return 1;
    }

    // --- Options Greeks Risk Checks ---
    sovereign::OptionsRiskLimits opt_limits;
    opt_limits.max_gamma = 50.0;
    opt_limits.max_vega = 10000.0;
    opt_limits.max_delta = 5.0;
    opt_limits.fail_closed = true;

    // Normal safe Greeks
    sovereign::OptionsGreeks safe_greeks{0.5, 12.5, 2500.0, -150.0};
    const auto safe_decision = sovereign::PreTradeRisk::validateOptionsGreeks(safe_greeks, opt_limits);
    if (!expect(safe_decision.approved, "Expected approval for safe Greeks")) {
        return 1;
    }
    if (!expect(!safe_decision.halt_trading, "Expected no halt for safe Greeks")) {
        return 1;
    }

    // Gamma breach
    sovereign::OptionsGreeks high_gamma{0.5, 55.0, 2500.0, -150.0};
    const auto gamma_breach = sovereign::PreTradeRisk::validateOptionsGreeks(high_gamma, opt_limits);
    if (!expect(!gamma_breach.approved, "Expected rejection for Gamma breach")) {
        return 1;
    }
    if (!expect(gamma_breach.halt_trading, "Expected halt for Gamma breach")) {
        return 1;
    }
    if (!expect(std::string(gamma_breach.reason) == "CRITICAL: Net Gamma limit exceeded.", "Expected gamma breach reason")) {
        return 1;
    }

    // Vega breach
    sovereign::OptionsGreeks high_vega{0.5, 10.0, 12000.0, -150.0};
    const auto vega_breach = sovereign::PreTradeRisk::validateOptionsGreeks(high_vega, opt_limits);
    if (!expect(!vega_breach.approved, "Expected rejection for Vega breach")) {
        return 1;
    }
    if (!expect(vega_breach.halt_trading, "Expected halt for Vega breach")) {
        return 1;
    }
    if (!expect(std::string(vega_breach.reason) == "CRITICAL: Net Vega limit exceeded.", "Expected vega breach reason")) {
        return 1;
    }

    // Delta breach
    sovereign::OptionsGreeks high_delta{6.0, 10.0, 2000.0, -150.0};
    const auto delta_breach = sovereign::PreTradeRisk::validateOptionsGreeks(high_delta, opt_limits);
    if (!expect(!delta_breach.approved, "Expected rejection for Delta breach")) {
        return 1;
    }
    if (!expect(delta_breach.halt_trading, "Expected halt for Delta breach")) {
        return 1;
    }

    // NaN / non-finite fail-closed
    sovereign::OptionsGreeks nan_greeks{std::numeric_limits<double>::quiet_NaN(), 10.0, 2000.0, -150.0};
    const auto nan_decision = sovereign::PreTradeRisk::validateOptionsGreeks(nan_greeks, opt_limits);
    if (!expect(!nan_decision.approved, "Expected rejection for NaN Greeks")) {
        return 1;
    }
    if (!expect(nan_decision.halt_trading, "Expected halt for NaN Greeks")) {
        return 1;
    }

    return 0;
}
