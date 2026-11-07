#pragma once

#include <algorithm>
#include <numeric>
#include <vector>

namespace sovereign::portfolio {

inline std::vector<double> normalizeWeights(const std::vector<double>& raw_weights) {
    std::vector<double> clamped;
    clamped.reserve(raw_weights.size());
    double total = 0.0;
    for (const double weight : raw_weights) {
        const double value = std::max(0.0, weight);
        clamped.push_back(value);
        total += value;
    }
    if (total <= 0.0) {
        return std::vector<double>(raw_weights.size(), 0.0);
    }
    for (double& weight : clamped) {
        weight /= total;
    }
    return clamped;
}

inline double portfolioTurnover(const std::vector<double>& previous, const std::vector<double>& next) {
    const std::size_t count = std::min(previous.size(), next.size());
    double total = 0.0;
    for (std::size_t i = 0; i < count; ++i) {
        total += std::abs(next[i] - previous[i]);
    }
    return total * 0.5;
}

} // namespace sovereign::portfolio
