#pragma once

#include "../data/ohlcv_bar.hpp"

#include <algorithm>
#include <cstddef>
#include <vector>
#include <limits>
#include <span>

namespace sovereign::indicators {

inline std::vector<double> stochasticPercentKSeries(std::span<const sovereign::OhlcvBar> bars, std::size_t period = 14U) {
    std::vector<double> res(bars.size(), std::numeric_limits<double>::quiet_NaN());
    if (bars.size() < period || period == 0U) {
        return res;
    }

    for (std::size_t i = period - 1; i < bars.size(); ++i) {
        double highest_high = bars[i + 1 - period].high;
        double lowest_low = bars[i + 1 - period].low;
        for (std::size_t j = i + 1 - period; j <= i; ++j) {
            highest_high = std::max(highest_high, bars[j].high);
            lowest_low = std::min(lowest_low, bars[j].low);
        }

        const double range = highest_high - lowest_low;
        if (range > 0.0) {
            res[i] = (bars[i].close - lowest_low) / range * 100.0;
        }
    }

    return res;
}

} // namespace sovereign::indicators
