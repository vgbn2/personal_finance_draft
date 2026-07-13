#include "pre_trade_risk.hpp"

#include <cmath>

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

    if (!std::isfinite(order.notional) || order.notional <= 0.0) {
        decision.approved = false;
        decision.reason = "CRITICAL: Order notional must be positive and finite.";
        return decision;
    }
    if (!std::isfinite(order.portfolio_equity) || order.portfolio_equity <= 0.0) {
        decision.approved = false;
        decision.reason = "CRITICAL: Portfolio equity must be positive and finite.";
        return decision;
    }

    // 2. Concentration Check (Notional Limit)
    const double concentration_limit = 0.25;
    const double current_concentration = order.notional / order.portfolio_equity;
    if (current_concentration > concentration_limit) {
        decision.approved = false;
        decision.reason = "CRITICAL: Concentration limit exceeded (25% max).";
        return decision;
    }

    decision.approved = true;
    decision.reason = "Risk parameters cleared: Drawdown and Concentration within limits.";
    return decision;
}

} // namespace sovereign
