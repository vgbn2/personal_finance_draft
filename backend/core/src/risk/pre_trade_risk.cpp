#include "pre_trade_risk.hpp"

#include <cmath>

namespace sovereign {

PreTradeRisk::PreTradeRisk(RiskLimits limits) : limits_(limits) {}

RiskDecision PreTradeRisk::validate(const TradeOrder& order) const {
    RiskDecision decision{};
    decision.halt_trading = false;
    decision.limit = limits_.max_drawdown;
    decision.observed_drawdown = order.current_drawdown;

    // [Security: TV-01] Non-finite float injection mitigation (Carlini et al., arXiv:2605.11086v1).
    // IEEE 754 NaN comparisons evaluate to false (NaN >= max_drawdown is false), which would
    // bypass the kill-switch if not checked explicitly. Fail-closed on non-finite drawdown.
    if (!std::isfinite(order.current_drawdown)) {
        decision.approved = false;
        decision.halt_trading = limits_.fail_closed;
        decision.reason = "CRITICAL: Non-finite drawdown value detected (fail-closed).";
        return decision;
    }

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
    const double concentration_limit = limits_.max_concentration > 0.0 ? limits_.max_concentration : 0.25;
    const double current_concentration = order.notional / order.portfolio_equity;
    if (current_concentration > concentration_limit) {
        decision.approved = false;
        decision.reason = "CRITICAL: Concentration limit exceeded.";
        return decision;
    }

    decision.approved = true;
    decision.reason = "Risk parameters cleared: Drawdown and Concentration within limits.";
    return decision;
}

RiskDecision PreTradeRisk::validateOptionsGreeks(const OptionsGreeks& greeks, const OptionsRiskLimits& limits) {
    RiskDecision decision{};
    decision.halt_trading = false;

    // 1. Sanity check for non-finite values (fail-closed)
    const bool non_finite = !std::isfinite(greeks.delta) ||
                            !std::isfinite(greeks.gamma) ||
                            !std::isfinite(greeks.vega) ||
                            !std::isfinite(greeks.theta);
    if (non_finite) {
        decision.approved = !limits.fail_closed;
        decision.halt_trading = limits.fail_closed;
        decision.reason = "CRITICAL: Non-finite Greek values detected (fail-closed).";
        return decision;
    }

    const double abs_gamma = std::fabs(greeks.gamma);
    const double abs_vega = std::fabs(greeks.vega);
    const double abs_delta = std::fabs(greeks.delta);

    // 2. Net Gamma exposure boundary
    if (limits.max_gamma > 0.0 && abs_gamma > limits.max_gamma) {
        decision.approved = false;
        decision.halt_trading = limits.fail_closed;
        decision.limit = limits.max_gamma;
        decision.observed_drawdown = abs_gamma;
        decision.reason = "CRITICAL: Net Gamma limit exceeded.";
        return decision;
    }

    // 3. Net Vega exposure boundary
    if (limits.max_vega > 0.0 && abs_vega > limits.max_vega) {
        decision.approved = false;
        decision.halt_trading = limits.fail_closed;
        decision.limit = limits.max_vega;
        decision.observed_drawdown = abs_vega;
        decision.reason = "CRITICAL: Net Vega limit exceeded.";
        return decision;
    }

    // 4. Net Delta exposure boundary
    if (limits.max_delta > 0.0 && abs_delta > limits.max_delta) {
        decision.approved = false;
        decision.halt_trading = limits.fail_closed;
        decision.limit = limits.max_delta;
        decision.observed_drawdown = abs_delta;
        decision.reason = "CRITICAL: Net Delta limit exceeded.";
        return decision;
    }

    decision.approved = true;
    decision.limit = limits.max_gamma;
    decision.observed_drawdown = abs_gamma;
    decision.reason = "Risk parameters cleared: Options Greeks within authorized bounds.";
    return decision;
}

} // namespace sovereign
