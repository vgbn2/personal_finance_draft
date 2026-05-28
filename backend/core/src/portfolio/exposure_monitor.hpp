#pragma once

#include "multi_asset.hpp"

#include <string>

namespace sovereign::portfolio {

struct ExposureDecision {
    ExposureReport report{};
    std::string reason = "uninitialized";
    bool approved = false;
    bool halt_trading = false;
};

class ExposureMonitor {
public:
    static ExposureDecision evaluate(const PortfolioState& state, const ExposureLimits& limits = {});
};

} // namespace sovereign::portfolio
