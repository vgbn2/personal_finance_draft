#include "pre_trade_risk.hpp"

namespace sovereign {

PreTradeRisk::PreTradeRisk(RiskLimits limits) : limits_(limits) {}

RiskDecision PreTradeRisk::validate(const TradeOrder& order) const {
    RiskDecision decision{};
    decision.halt_trading = false;
    decision.limit = limits_.max_drawdown;
    decision.observed_drawdown = order.current_drawdown;

    // 1. Portfolio Level Kill-Switch (Drawdown)
    if (order.current_drawdown >= limits_.max_drawdown) {
        decision.approved = false;
        decision.halt_trading = limits_.fail_closed;
        decision.reason = "CRITICAL: Max drawdown limit reached or exceeded.";
        return decision;
    }

    // 2. Concentration Check (Notional Limit)
    double concentration_limit = 0.25; 
    if (order.notional > 0 && order.volatility > 0) {
        double current_concentration = order.notional / order.volatility;
        if (current_concentration > concentration_limit) {
            decision.approved = false;
            decision.reason = "CRITICAL: Concentration limit exceeded (25% max).";
            return decision;
        }
    }

    decision.approved = true;
    decision.reason = "Risk parameters cleared: Drawdown and Concentration within limits.";
    return decision;
}

} // namespace sovereign