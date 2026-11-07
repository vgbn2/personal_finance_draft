#pragma once

#include "position_sizer.hpp"

namespace sovereign::position_sizing {

inline double kellyFraction(double win_rate, double payoff_ratio) {
    if (win_rate <= 0.0 || win_rate >= 1.0 || payoff_ratio <= 0.0) {
        return 0.0;
    }
    const double loss_rate = 1.0 - win_rate;
    return clampFraction(win_rate - loss_rate / payoff_ratio);
}

} // namespace sovereign::position_sizing
