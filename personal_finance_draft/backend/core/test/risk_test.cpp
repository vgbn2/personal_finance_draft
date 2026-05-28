#include "../src/risk/drawdown_guard.hpp"

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

    const auto invalid_allowed = sovereign::DrawdownGuard::evaluate(invalid, sovereign::RiskLimits{0.20, false});
    if (!expect(invalid_allowed.approved, "Expected invalid curve allowed when fail_closed is false")) {
        return 1;
    }

    return 0;
}
