#include "trading_system.hpp"

#include <cmath>
#include <iostream>

namespace {

bool approxEqual(double actual, double expected, double tolerance) {
    return std::fabs(actual - expected) <= tolerance;
}

} // namespace

int main() {
    const sovereign::SimulationParams params{
        1000.0,
        20,
        100.0,
        5.0,
        12.0,
        6.0,
    };

    const sovereign::FinanceEngine engine(params);
    const auto results = engine.runSimulation();

    if (results.size() != 240U) {
        std::cerr << "Expected 240 monthly results, got " << results.size() << "\n";
        return 1;
    }

    const double expectedFinal = 9646.293093274;
    if (!approxEqual(results.back().netWorth, expectedFinal, 0.000001)) {
        std::cerr << "Expected final net worth " << expectedFinal
                  << ", got " << results.back().netWorth << "\n";
        return 1;
    }

    return 0;
}
