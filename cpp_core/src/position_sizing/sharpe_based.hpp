#pragma once

#include "position_sizer.hpp"

#include <cmath>

namespace sovereign::position_sizing {

inline double sharpeScaledFraction(double sharpe_ratio, double max_fraction = 1.0) {
    if (sharpe_ratio <= 0.0 || max_fraction <= 0.0) {
        return 0.0;
    }
    const double scaled = sharpe_ratio / (1.0 + std::abs(sharpe_ratio));
    return clampFraction(scaled * max_fraction);
}

} // namespace sovereign::position_sizing
