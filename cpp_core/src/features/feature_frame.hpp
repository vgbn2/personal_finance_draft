#pragma once

#include <optional>
#include <string>
#include <vector>
#include <utility>

namespace sovereign::features {

struct FeatureRow {
    std::string asset_id;
    std::string timestamp;
    std::string timeframe;
    std::vector<std::pair<std::string, double>> values;

    std::optional<double> get(const std::string& key) const {
        for (const auto& [k, v] : values) {
            if (k == key) return v;
        }
        return std::nullopt;
    }

    void set(const std::string& key, double value) {
        for (auto& [k, v] : values) {
            if (k == key) {
                v = value;
                return;
            }
        }
        values.emplace_back(key, value);
    }
};

struct FeatureFrame {
    std::vector<FeatureRow> rows;
    std::size_t ready_rows = 0;
};

} // namespace sovereign::features
