#pragma once

#include "../position_sizing/position_sizer.hpp"

namespace sovereign::portfolio {

struct KellySizingDecision {
    double raw_fraction = 0.0;
    double capped_fraction = 0.0;
    position_sizing::PositionSizingDecision sizing{};
    bool ok = false;
};

double boundedKellyFraction(double win_rate, double payoff_ratio, double max_fraction = 0.25);
KellySizingDecision sizeWithKelly(const position_sizing::PositionSizingInput& input, double win_rate, double payoff_ratio, double max_fraction = 0.25);

} // namespace sovereign::portfolio
