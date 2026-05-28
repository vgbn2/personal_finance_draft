#pragma once

#include <cstddef>
#include <vector>
#include <cmath>
#include <limits>
#include <span>

namespace sovereign::indicators {

inline std::vector<double> simpleMovingAverageSeries(const std::vector<double>& values, std::size_t period) {
    std::vector<double> res(values.size(), std::numeric_limits<double>::quiet_NaN());
    if (values.size() < period || period == 0U) {
        return res;
    }

    double sum = 0.0;
    std::size_t finite_count = 0U;
    for (std::size_t i = 0; i < values.size(); ++i) {
        if (std::isfinite(values[i])) {
            sum += values[i];
            ++finite_count;
        }
        if (i >= period && std::isfinite(values[i - period])) {
            sum -= values[i - period];
            --finite_count;
        }
        if (finite_count == period) {
            res[i] = sum / static_cast<double>(period);
        }
    }
    return res;
}

inline std::vector<double> exponentialMovingAverageSeries(const std::vector<double>& values, std::size_t period) {
    std::vector<double> res(values.size(), std::numeric_limits<double>::quiet_NaN());
    if (values.size() < period || period == 0U) {
        return res;
    }

    double current = 0.0;
    for (std::size_t i = 0; i < period; ++i) {
        current += values[i];
    }
    current /= static_cast<double>(period);
    res[period - 1] = current;

    const double multiplier = 2.0 / (static_cast<double>(period) + 1.0);
    for (std::size_t i = period; i < values.size(); ++i) {
        current = values[i] * multiplier + current * (1.0 - multiplier);
        res[i] = current;
    }
    return res;
}

} // namespace sovereign::indicators
