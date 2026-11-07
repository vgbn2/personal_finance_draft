#pragma once

#include "feature_frame.hpp"

#include <cstddef>
#include <span>
#include <string>

namespace sovereign::features {

struct SentimentObservation {
    std::string asset_id;
    std::string timestamp;
    std::string source;
    double polarity = 0.0;
    double confidence = 0.0;
    double volume = 1.0;
};

FeatureFrame buildSentimentFeatureFrame(std::span<const SentimentObservation> observations);

} // namespace sovereign::features
