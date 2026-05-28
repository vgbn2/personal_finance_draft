#pragma once

#include "hybrid_strategy.hpp"

namespace sovereign::strategies {

struct SpotFuturesArbSignal {
    StrategyDecision decision{};
    double basis_bps = 0.0;
    bool ok = false;
};

SpotFuturesArbSignal evaluateSpotFuturesArb(double spot_price, double futures_price, double entry_threshold_bps = 25.0);

} // namespace sovereign::strategies
