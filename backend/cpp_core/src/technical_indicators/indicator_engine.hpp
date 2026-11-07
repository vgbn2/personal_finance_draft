#pragma once

#include "../data/ohlcv_bar.hpp"
#include "atr.hpp"
#include "bollinger_bands.hpp"

#include "../utils/constants.hpp"

#include <cstddef>
#include <map>
#include <optional>
#include <span>
#include <string>
#include <vector>
#include <utility>

namespace sovereign::indicators {

using ParameterMap = std::map<std::string, double>;

struct KalmanResult {
    double estimate;
    double variance;
};

struct IndicatorRow {
    OhlcvBar bar;
    // Dynamic metrics storage. Keys follow the pattern: "type:period" (e.g., "rsi:14", "vol:20")
    std::vector<std::pair<std::string, double>> metrics;

    // Helper to get an optional metric
    std::optional<double> get(const std::string& key) const {
        for (const auto& [k, v] : metrics) {
            if (k == key) return v;
        }
        return std::nullopt;
    }

    void set(const std::string& key, double value) {
        for (auto& [k, v] : metrics) {
            if (k == key) {
                v = value;
                return;
            }
        }
        metrics.emplace_back(key, value);
    }
};

struct IndicatorFrame {
    std::vector<IndicatorRow> rows;
    std::size_t ready_rows = 0;
};

class IndicatorEngine {
public:
    static std::vector<double> rateOfChangeSeries(const std::vector<double>& closes, std::size_t lookback);
    static std::vector<double> rollingVolatilitySeries(const std::vector<double>& closes, std::size_t period);
    static std::vector<KalmanResult> kalmanSeriesWithVariance(const std::vector<double>& closes, double process_noise, double measurement_noise);
    static IndicatorFrame buildFrame(std::span<const OhlcvBar> bars, const ParameterMap& params = {});
};

} // namespace sovereign::indicators
