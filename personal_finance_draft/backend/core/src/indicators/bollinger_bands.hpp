#pragma once

#include <cstddef>
#include <cmath>
#include <vector>
#include <limits>
#include <span>

namespace sovereign::indicators {

struct BollingerBandsSeries {
    std::vector<double> middle;
    std::vector<double> upper;
    std::vector<double> lower;
};

inline BollingerBandsSeries bollingerBandsSeries(const std::vector<double>& closes, std::size_t period = 20U, double multiplier = 2.0) {
    BollingerBandsSeries res;
    res.middle.assign(closes.size(), std::numeric_limits<double>::quiet_NaN());
    res.upper.assign(closes.size(), std::numeric_limits<double>::quiet_NaN());
    res.lower.assign(closes.size(), std::numeric_limits<double>::quiet_NaN());

    if (closes.size() < period || period == 0U) {
        return res;
    }

    for (std::size_t i = period - 1; i < closes.size(); ++i) {
        double sum = 0.0;
        for (std::size_t j = i + 1 - period; j <= i; ++j) {
            sum += closes[j];
        }
        const double mean = sum / static_cast<double>(period);

        double variance = 0.0;
        for (std::size_t j = i + 1 - period; j <= i; ++j) {
            const double delta = closes[j] - mean;
            variance += delta * delta;
        }
        const double stddev = std::sqrt(variance / static_cast<double>(period));

        res.middle[i] = mean;
        res.upper[i] = mean + multiplier * stddev;
        res.lower[i] = mean - multiplier * stddev;
    }

    return res;
}

} // namespace sovereign::indicators
