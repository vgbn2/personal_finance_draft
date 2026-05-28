#pragma once

#include "hybrid_strategy.hpp"

namespace sovereign::strategies {

struct OptionsTradingSignal {
    StrategyDecision decision{};
    double volatility_edge = 0.0;
    bool ok = false;
};

OptionsTradingSignal evaluateOptionsTrading(double implied_vol, double realized_vol, double edge_threshold = 0.05);

} // namespace sovereign::strategies
