#include "spot_only.hpp"

#include <cmath>

namespace sovereign::strategies {

SpotOnlySignal evaluateSpotOnly(const std::vector<double>& prices, double buy_threshold, double sell_threshold) {
    SpotOnlySignal signal;
    if (prices.size() < 2U) {
        signal.decision.side = Side::none;
        signal.decision.reason = "insufficient_history";
        return signal;
    }

    const double first = prices.front();
    const double last = prices.back();
    if (first <= 0.0 || last <= 0.0) {
        signal.decision.side = Side::none;
        signal.decision.reason = "invalid_prices";
        return signal;
    }

    signal.trend_score = last / first - 1.0;
    signal.ok = true;
    if (signal.trend_score >= buy_threshold) {
        signal.decision.side = Side::buy;
        signal.decision.reason = "trend_breakout";
    } else if (signal.trend_score <= sell_threshold) {
        signal.decision.side = Side::sell;
        signal.decision.reason = "trend_breakdown";
    } else {
        signal.decision.side = Side::none;
        signal.decision.reason = "range_bound";
    }

    signal.decision.confidence = std::fabs(signal.trend_score);
    return signal;
}

} // namespace sovereign::strategies
