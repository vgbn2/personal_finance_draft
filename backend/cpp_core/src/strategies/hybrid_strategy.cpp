#include "hybrid_strategy.hpp"
#include <numeric>
#include <cmath>
#include <algorithm>

namespace sovereign::strategies {

HybridStrategy::HybridStrategy(double buy_threshold, double sell_threshold)
    : buy_threshold_(buy_threshold), sell_threshold_(sell_threshold) {}

StrategyDecision HybridStrategy::evaluate(
    const std::vector<double>& spy_prices,
    const std::vector<double>& asset_prices,
    double ai_confidence) const {

    (void)asset_prices;
    StrategyDecision decision;
    decision.side = Side::none;
    decision.confidence = ai_confidence;

    // 1. Regime Detection (200-day SMA logic)
    // 200 days * 1 bar/day = 200 bars
    if (spy_prices.size() < 200) {
        decision.reason = "insufficient_spy_history";
        return decision;
    }

    double current_spy = spy_prices.back();
    double sma_200 = std::accumulate(spy_prices.end() - 200, spy_prices.end(), 0.0) / 200.0;
    
    bool is_bull_regime = current_spy >= sma_200;

    // 2. Conviction Filtering
    if (ai_confidence > buy_threshold_ && is_bull_regime) {
        decision.side = Side::buy;
        decision.reason = "ai_conviction_bull_regime";
    } else if (ai_confidence < sell_threshold_ || !is_bull_regime) {
        decision.side = Side::sell;
        decision.reason = !is_bull_regime ? "bear_regime_exit" : "ai_sell_signal";
    } else {
        decision.side = Side::none;
        decision.reason = "no_clear_signal";
    }

    return decision;
}

} // namespace sovereign::strategies
