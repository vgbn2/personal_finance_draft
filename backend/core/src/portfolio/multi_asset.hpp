#pragma once

#include "portfolio_state.hpp"

#include <cstddef>
#include <string>
#include <vector>

namespace sovereign::portfolio {

struct ExposureBucket {
    std::string symbol;
    double net_exposure = 0.0;
    double gross_exposure = 0.0;
    double weight = 0.0;
};

struct ExposureLimits {
    double max_gross_exposure = 1.5;
    double max_single_name_weight = 0.25;
    double max_net_exposure = 1.0;
};

struct ExposureReport {
    PortfolioMetrics metrics{};
    std::vector<ExposureBucket> buckets;
    double largest_single_name_weight = 0.0;
    bool ok = true;
    bool within_limits = true;
};

ExposureReport analyzeExposure(const PortfolioState& state, const ExposureLimits& limits = {});

} // namespace sovereign::portfolio
