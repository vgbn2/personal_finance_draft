#pragma once

#include "../data/ohlcv_bar.hpp"
#include "feature_frame.hpp"

#include <cstddef>
#include <span>

namespace sovereign::features {

struct LabelBuilderConfig {
    std::size_t horizon_bars = 5;
    double positive_threshold = 0.02;
    double negative_threshold = -0.02;
};

struct LabelBuildSummary {
    std::size_t rows_considered = 0;
    std::size_t rows_labeled = 0;
    std::size_t rows_skipped = 0;
};

FeatureFrame buildLabelFrame(std::span<const sovereign::OhlcvBar> bars, const LabelBuilderConfig& config = {});
LabelBuildSummary buildLabelSummary(std::span<const sovereign::OhlcvBar> bars, const LabelBuilderConfig& config = {});

} // namespace sovereign::features
