#include "macro_features.hpp"
#include <algorithm>
#include <cmath>
#include <map>

namespace sovereign::features {

FeatureFrame MacroFeatureExtractor::extract(const std::vector<MacroObservation>& observations) {
    FeatureFrame frame;
    if (observations.empty()) {
        return frame;
    }

    // Group observations by timestamp to process them chronologically
    std::map<std::string, std::vector<const MacroObservation*>> grouped_obs;
    for (const auto& obs : observations) {
        grouped_obs[obs.timestamp].push_back(&obs);
    }

    // Process each timestamp
    for (const auto& [ts, obs_list] : grouped_obs) {
        // Update internal history for each series present at this timestamp
        for (const auto* obs : obs_list) {
            auto& state = series_history_[obs->series];
            state.values.push_back(obs->value);
            state.timestamps.push_back(obs->timestamp);
        }

        FeatureRow row;
        row.asset_id = "MACRO";
        row.timestamp = ts;
        row.timeframe = "D"; // Macro data is often treated as daily-aligned features

        // Calculate specific high-signal features
        calculateRateMomentum(row, series_history_, ts);
        calculateInflationVelocity(row, series_history_, ts);
        calculateLiquidityIndex(row, series_history_, ts);

        frame.rows.push_back(std::move(row));
        ++frame.ready_rows;
    }

    return frame;
}

void MacroFeatureExtractor::calculateRateMomentum(FeatureRow& row, const std::map<std::string, SeriesState>& series_map, const std::string& current_ts) {
    // Interest rate series (e.g., 2Y Yield, Fed Funds)
    const std::vector<std::string> rate_series = {"US02YIELD", "FEDFUNDS", "DFF", "GS10"};

    for (const auto& series : rate_series) {
        if (auto it = series_map.find(series); it != series_map.end()) {
            const auto& vals = it->second.values;
            if (vals.size() >= 2) {
                // Rolling change (momentum)
                double momentum = vals.back() - vals[vals.size() - 2];
                row.set("macro:rate_momentum:" + series, momentum);
            }
        }
    }
}

void MacroFeatureExtractor::calculateInflationVelocity(FeatureRow& row, const std::map<std::string, SeriesState>& series_map, const std::string& current_ts) {
    // Inflation and economic activity series
    const std::vector<std::string> inflation_series = {"CPI", "CPIAUCSL", "PPI", "US_MANUFACTURING", "US_SERVICES"};

    for (const auto& series : inflation_series) {
        if (auto it = series_map.find(series); it != series_map.end()) {
            const auto& vals = it->second.values;
            if (vals.size() >= 3) {
                // Velocity is the change in momentum (acceleration)
                double current_momentum = vals.back() - vals[vals.size() - 2];
                double previous_momentum = vals[vals.size() - 2] - vals[vals.size() - 3];
                double velocity = current_momentum - previous_momentum;
                row.set("macro:inflation_velocity:" + series, velocity);
            }
        }
    }
}

void MacroFeatureExtractor::calculateLiquidityIndex(FeatureRow& row, const std::map<std::string, SeriesState>& series_map, const std::string& current_ts) {
    // Composite score of liquidity-related series
    double composite_score = 0.0;
    int active_components = 0;

    auto add_to_composite = [&](const std::string& series, double weight = 1.0) {
        if (auto it = series_map.find(series); it != series_map.end() && !it->second.values.empty()) {
            composite_score += it->second.values.back() * weight;
            active_components++;
        }
    };

    // Components typically associated with system-wide liquidity
    add_to_composite("M2SL", 1.0);
    add_to_composite("WALCL", 1.0);    // Fed Assets
    add_to_composite("RESERVES", 1.0);
    add_to_composite("DFF", -0.5);      // Interest rates often act as an inverse liquidity proxy

    if (active_components > 0) {
        row.set("macro:liquidity_index", composite_score / active_components);
    }
}

} // namespace sovereign::features
