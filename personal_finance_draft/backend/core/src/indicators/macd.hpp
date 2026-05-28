#pragma once

#include "moving_averages.hpp"

#include <cstddef>
#include <vector>
#include <limits>
#include <cmath>
#include <span>

namespace sovereign::indicators {

inline std::vector<double> macdSeries(const std::vector<double>& closes, std::size_t fast_period = 12U, std::size_t slow_period = 26U) {
    std::vector<double> res(closes.size(), std::numeric_limits<double>::quiet_NaN());
    if (closes.size() < slow_period || fast_period == 0U || slow_period == 0U || fast_period >= slow_period) {
        return res;
    }
    auto fast = exponentialMovingAverageSeries(closes, fast_period);
    auto slow = exponentialMovingAverageSeries(closes, slow_period);
    
    for (std::size_t i = 0; i < closes.size(); ++i) {
        if (!std::isnan(fast[i]) && !std::isnan(slow[i])) {
            res[i] = fast[i] - slow[i];
        }
    }
    return res;
}

} // namespace sovereign::indicators
