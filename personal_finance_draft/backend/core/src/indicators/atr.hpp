#pragma once

#include "../data/ohlcv_bar.hpp"

#include <algorithm>
#include <cstddef>
#include <cmath>
#include <vector>
#include <limits>
#include <span>

namespace sovereign::indicators {

inline std::vector<double> averageTrueRangeSeries(std::span<const sovereign::OhlcvBar> bars, std::size_t period = 14U) {
    std::vector<double> res(bars.size(), std::numeric_limits<double>::quiet_NaN());
    if (bars.size() <= period || period == 0U) {
        return res;
    }

    std::vector<double> tr(bars.size(), 0.0);
    for (std::size_t i = 1; i < bars.size(); ++i) {
        tr[i] = std::max({
            bars[i].high - bars[i].low,
            std::abs(bars[i].high - bars[i - 1U].close),
            std::abs(bars[i].low - bars[i - 1U].close)
        });
    }

    double sum = 0.0;
    for (std::size_t i = 1; i <= period; ++i) {
        sum += tr[i];
    }
    res[period] = sum / static_cast<double>(period);

    for (std::size_t i = period + 1; i < bars.size(); ++i) {
        sum += tr[i] - tr[i - period];
        res[i] = sum / static_cast<double>(period);
    }

    return res;
}

} // namespace sovereign::indicators
