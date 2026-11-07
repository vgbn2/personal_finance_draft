#pragma once

#include <string>
#include <vector>

namespace sovereign::strategies {

enum class Side {
    none,
    buy,
    sell
};

struct StrategyDecision {
    Side side{Side::none};
    double confidence{0.0};
    std::string reason{"uninitialized"};
};

/**
 * @brief C++ implementation of the Hybrid Systematic Quant Trading Bot.
 * Ported from Python (HybridBot) after a 26-year successful backtest.
 */
class HybridStrategy {
public:
    HybridStrategy(double buy_threshold = 0.51, double sell_threshold = 0.49);

    std::string name() const { return "HybridIntraday"; }

    /**
     * @brief Generates a signal using the 200-day SPY SMA regime and AI conviction.
     * @param spy_prices Unlevereaged S&P 500 history for regime detection.
     * @param asset_prices Target leveraged asset (SSO/QLD) or Bonds (TLT).
     * @param ai_confidence Probabilistic output from XGBoost (passed from Node.js/Python).
     */
    StrategyDecision evaluate(
        const std::vector<double>& spy_prices,
        const std::vector<double>& asset_prices,
        double ai_confidence) const;

private:
    double buy_threshold_;
    double sell_threshold_;
};

} // namespace sovereign::strategies
