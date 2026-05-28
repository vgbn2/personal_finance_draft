#pragma once

#include <cmath>
#include <optional>
#include <span>
#include <vector>

namespace sovereign::ml {

struct NormalizationStats {
    double mean = 0.0;
    double stddev = 0.0;
    bool ok = false;
};

inline NormalizationStats summarizeNormalization(std::span<const float> values) {
    NormalizationStats stats;
    if (values.empty()) {
        return stats;
    }
    double sum = 0.0;
    for (const float value : values) {
        sum += value;
    }
    stats.mean = sum / static_cast<double>(values.size());

    double variance = 0.0;
    for (const float value : values) {
        const double diff = static_cast<double>(value) - stats.mean;
        variance += diff * diff;
    }
    stats.stddev = std::sqrt(variance / static_cast<double>(values.size()));
    stats.ok = stats.stddev > 0.0;
    return stats;
}

inline std::vector<float> zScoreNormalize(std::span<const float> values, const NormalizationStats& stats) {
    std::vector<float> normalized;
    normalized.reserve(values.size());
    if (!stats.ok) {
        normalized.assign(values.begin(), values.end());
        return normalized;
    }
    for (const float value : values) {
        normalized.push_back(static_cast<float>((static_cast<double>(value) - stats.mean) / stats.stddev));
    }
    return normalized;
}

} // namespace sovereign::ml
