#pragma once

#include "risk_limits.hpp"

#include <span>

namespace sovereign {

class DrawdownGuard {
public:
    static RiskDecision evaluate(std::span<const double> equity_curve, const RiskLimits& limits = {});
};

} // namespace sovereign
