#include "kelly_sizing.hpp"

#include <algorithm>

namespace sovereign::portfolio {

double boundedKellyFraction(double win_rate, double payoff_ratio, double max_fraction) {
    const double raw = position_sizing::kellyFraction(win_rate, payoff_ratio);
    return std::clamp(raw, 0.0, position_sizing::clampFraction(max_fraction));
}

KellySizingDecision sizeWithKelly(const position_sizing::PositionSizingInput& input, double win_rate, double payoff_ratio, double max_fraction) {
    KellySizingDecision decision;
    decision.raw_fraction = position_sizing::kellyFraction(win_rate, payoff_ratio);
    decision.capped_fraction = boundedKellyFraction(win_rate, payoff_ratio, max_fraction);

    auto adjusted_input = input;
    adjusted_input.risk_fraction = decision.capped_fraction;
    adjusted_input.max_notional_fraction = std::clamp(max_fraction, 0.0, 1.0);
    decision.sizing = position_sizing::sizePosition(adjusted_input);
    decision.ok = decision.sizing.ok;
    return decision;
}

} // namespace sovereign::portfolio
