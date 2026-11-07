#include "options_trading.hpp"

#include <cmath>

namespace sovereign::strategies {

OptionsTradingSignal evaluateOptionsTrading(double implied_vol, double realized_vol, double edge_threshold) {
    OptionsTradingSignal signal;
    if (implied_vol <= 0.0 || realized_vol <= 0.0) {
        signal.decision.side = Side::none;
        signal.decision.reason = "invalid_vol_inputs";
        return signal;
    }

    signal.volatility_edge = implied_vol - realized_vol;
    signal.ok = true;

    if (signal.volatility_edge >= edge_threshold) {
        signal.decision.side = Side::sell;
        signal.decision.reason = "sell_volatility_premium";
    } else if (signal.volatility_edge <= -edge_threshold) {
        signal.decision.side = Side::buy;
        signal.decision.reason = "buy_volatility_dislocation";
    } else {
        signal.decision.side = Side::none;
        signal.decision.reason = "volatility_fair_value";
    }

    signal.decision.confidence = std::fabs(signal.volatility_edge);
    return signal;
}

} // namespace sovereign::strategies
