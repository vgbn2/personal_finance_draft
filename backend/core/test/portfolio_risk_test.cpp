#include "../src/portfolio/exposure_monitor.hpp"
#include "../src/portfolio/kelly_sizing.hpp"
#include "../src/portfolio/multi_asset.hpp"
#include "../src/portfolio/portfolio_state.hpp"

#include <cmath>
#include <iostream>

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
    sovereign::PortfolioState state;
    state.cash = 1000.0;
    state.positions = {
        {"AAPL", 10.0, 150.0, 180.0},
        {"MSFT", -2.0, 300.0, 250.0},
        {"NVDA", 5.0, 400.0, 500.0},
    };

    const auto metrics = sovereign::PnlCalculator::calculate(state);
    if (!expect(metrics.ok, "Expected portfolio metrics to be valid")) {
        return 1;
    }
    if (!expect(approxEqual(metrics.total_equity, 4800.0, 0.000001), "Expected total equity")) {
        return 1;
    }
    if (!expect(approxEqual(metrics.gross_exposure, 4800.0, 0.000001), "Expected gross exposure")) {
        return 1;
    }

    sovereign::position_sizing::PositionSizingInput sizing_input;
    sizing_input.equity = metrics.total_equity;
    sizing_input.entry_price = 200.0;
    sizing_input.stop_price = 180.0;
    sizing_input.risk_fraction = 0.02;
    sizing_input.max_notional_fraction = 0.30;

    const auto kelly = sovereign::portfolio::sizeWithKelly(sizing_input, 0.60, 1.50, 0.25);
    if (!expect(kelly.ok, "Expected Kelly sizing decision to be valid")) {
        return 1;
    }
    if (!expect(approxEqual(kelly.raw_fraction, 0.3333333333, 0.000001), "Expected raw Kelly fraction")) {
        return 1;
    }
    if (!expect(approxEqual(kelly.capped_fraction, 0.25, 0.000001), "Expected capped Kelly fraction")) {
        return 1;
    }
    if (!expect(kelly.sizing.ok, "Expected downstream sizing to remain valid")) {
        return 1;
    }

    const auto exposure_report = sovereign::portfolio::analyzeExposure(state, sovereign::portfolio::ExposureLimits{1.25, 0.80, 1.10});
    if (!expect(exposure_report.ok, "Expected exposure analysis to succeed")) {
        return 1;
    }
    if (!expect(exposure_report.buckets.size() == 3U, "Expected one bucket per symbol")) {
        return 1;
    }
    if (!expect(exposure_report.largest_single_name_weight > 0.0, "Expected largest single name weight")) {
        return 1;
    }
    if (!expect(exposure_report.within_limits, "Expected lenient exposure limits")) {
        return 1;
    }

    const auto decision = sovereign::portfolio::ExposureMonitor::evaluate(state, sovereign::portfolio::ExposureLimits{1.25, 0.50, 1.10});
    if (!expect(!decision.approved, "Expected strict single-name limit to reject")) {
        return 1;
    }
    if (!expect(decision.halt_trading, "Expected strict exposure breach to halt trading")) {
        return 1;
    }

    std::cout << "[DATA FLOW] Portfolio equity: " << metrics.total_equity << "\n";
    std::cout << "[DATA FLOW] Largest single-name weight: " << exposure_report.largest_single_name_weight << "\n";
    std::cout << "[DATA FLOW] Kelly capped fraction: " << kelly.capped_fraction << "\n";
    std::cout << "portfolio_risk_test passed!\n";
    return 0;
}
