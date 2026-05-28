#include "../src/stats/stats_engine.hpp"

#include <cmath>
#include <iostream>
#include <limits>
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
    const auto drawdown = sovereign::calculateDrawdown(equity);
    if (!expect(drawdown.ok, "Expected drawdown calculation to be ok")) {
        return 1;
    }
    if (!expect(approxEqual(drawdown.max_drawdown, 0.25, 0.0000001), "Expected 25% max drawdown")) {
        return 1;
    }
    if (!expect(drawdown.peak_index == 3U, "Expected peak index 3")) {
        return 1;
    }
    if (!expect(drawdown.trough_index == 4U, "Expected trough index 4")) {
        return 1;
    }
    if (!expect(drawdown.recovered, "Expected drawdown recovery")) {
        return 1;
    }
    if (!expect(drawdown.recovery_index == 6U, "Expected recovery index 6")) {
        return 1;
    }

    const auto stats = sovereign::StatsEngine::summarize(equity, 0.0, 252.0);
    if (!expect(stats.ok, "Expected performance stats to be ok")) {
        return 1;
    }
    if (!expect(stats.observations == equity.size(), "Expected observation count to match equity curve")) {
        return 1;
    }
    if (!expect(approxEqual(stats.cumulative_return, 0.30, 0.0000001), "Expected 30% cumulative return")) {
        return 1;
    }
    if (!expect(stats.volatility > 0.0, "Expected positive annualized volatility")) {
        return 1;
    }
    if (!expect(stats.sharpe > 0.0, "Expected positive Sharpe ratio")) {
        return 1;
    }
    if (!expect(stats.sortino > 0.0, "Expected positive Sortino ratio")) {
        return 1;
    }
    if (!expect(approxEqual(stats.max_drawdown, 0.25, 0.0000001), "Expected stats max drawdown to match")) {
        return 1;
    }
    if (!expect(stats.calmar > 0.0, "Expected positive Calmar ratio")) {
        return 1;
    }

    const std::vector<double> invalid{100.0, std::numeric_limits<double>::quiet_NaN(), 120.0};
    if (!expect(!sovereign::StatsEngine::summarize(invalid).ok, "Expected invalid equity curve rejection")) {
        return 1;
    }

    const std::vector<double> flat{100.0, 100.0, 100.0};
    const auto flat_stats = sovereign::StatsEngine::summarize(flat);
    if (!expect(flat_stats.ok, "Expected flat equity curve to be valid")) {
        return 1;
    }
    if (!expect(approxEqual(flat_stats.sharpe, 0.0, 0.0000001), "Expected zero Sharpe for flat returns")) {
        return 1;
    }

    return 0;
}
