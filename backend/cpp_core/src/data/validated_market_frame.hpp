#pragma once

#include "data_quality_report.hpp"
#include "macro_observation.hpp"
#include "ohlcv_bar.hpp"

#include <vector>

namespace sovereign {

struct ValidatedMarketFrame {
    std::vector<OhlcvBar> bars;
    std::vector<MacroObservation> macro_observations;
    DataQualityReport quality;
};

} // namespace sovereign
