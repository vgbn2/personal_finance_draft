#pragma once

#include <algorithm>
#include <cmath>
#include <optional>

namespace sovereign::position_sizing {

struct PositionSizingInput {
    double equity = 0.0;
    double entry_price = 0.0;
    double stop_price = 0.0;
    double risk_fraction = 0.0;
    double max_notional_fraction = 1.0;
};

struct PositionSizingDecision {
    double quantity = 0.0;
    double notional = 0.0;
    double risk_budget = 0.0;
    double stop_distance = 0.0;
    bool ok = false;
};

inline double clampFraction(double value) {
    return std::clamp(value, 0.0, 1.0);
}

inline PositionSizingDecision sizePosition(const PositionSizingInput& input) {
    PositionSizingDecision decision;
    if (input.equity <= 0.0 || input.entry_price <= 0.0) {
        return decision;
    }

    decision.stop_distance = std::abs(input.entry_price - input.stop_price);
    decision.risk_budget = input.equity * clampFraction(input.risk_fraction);
    const double max_notional = input.equity * clampFraction(input.max_notional_fraction);

    if (decision.stop_distance <= 0.0 || decision.risk_budget <= 0.0 || max_notional <= 0.0) {
        return decision;
    }

    const double risk_quantity = decision.risk_budget / decision.stop_distance;
    const double notional_quantity = max_notional / input.entry_price;
    decision.quantity = std::max(0.0, std::min(risk_quantity, notional_quantity));
    decision.notional = decision.quantity * input.entry_price;
    decision.ok = decision.quantity > 0.0;
    return decision;
}

} // namespace sovereign::position_sizing
