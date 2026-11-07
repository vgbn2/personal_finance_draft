#pragma once

#include "hybrid_strategy.hpp"

#include <vector>

namespace sovereign::strategies {

struct SpotOnlySignal {
    StrategyDecision decision{};
    double trend_score = 0.0;
    bool ok = false;
};

SpotOnlySignal evaluateSpotOnly(const std::vector<double>& prices, double buy_threshold = 0.02, double sell_threshold = -0.02);

} // namespace sovereign::strategies
