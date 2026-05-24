#pragma once

#include "../indicators/indicator_engine.hpp"
#include "feature_frame.hpp"

namespace sovereign::features {

FeatureFrame buildTechnicalFeatureFrame(const indicators::IndicatorFrame& indicator_frame);

} // namespace sovereign::features
