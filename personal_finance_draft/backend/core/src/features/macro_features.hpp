#pragma once

#include "../data/macro_observation.hpp"
#include "feature_frame.hpp"
#include <vector>
#include <string>
#include <map>

namespace sovereign::features {

/**
 * @brief Extractor for high-signal macro features.
 * 
 * Processes a collection of MacroObservation objects to produce features such as:
 * - Rate Momentum: Rolling change in interest rates.
 * - Inflation Velocity: Acceleration/deceleration of CPI/PMI data.
 * - Liquidity Index: A composite score of multiple macro series.
 */
class MacroFeatureExtractor {
public:
    MacroFeatureExtractor() = default;

    /**
     * @brief Transforms macro observations into a FeatureFrame.
     * @param observations Vector of observations, potentially from multiple series and timestamps.
     * @return FeatureFrame containing the calculated macro features.
     */
    FeatureFrame extract(const std::vector<MacroObservation>& observations);

private:
    struct SeriesState {
        std::vector<double> values;
        std::vector<std::string> timestamps;
    };

    // Feature calculation helpers
    void calculateRateMomentum(FeatureRow& row, const std::map<std::string, SeriesState>& series_map, const std::string& current_ts);
    void calculateInflationVelocity(FeatureRow& row, const std::map<std::string, SeriesState>& series_map, const std::string& current_ts);
    void calculateLiquidityIndex(FeatureRow& row, const std::map<std::string, SeriesState>& series_map, const std::string& current_ts);

    // Internal mapping of series names to their historical values for momentum/velocity calculations
    std::map<std::string, SeriesState> series_history_;
};

} // namespace sovereign::features
