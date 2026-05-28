#include "drawdown_guard.hpp"

#include "../stats/drawdown.hpp"
#include <vector>
namespace sovereign {
RiskDecision DrawdownGuard::evaluate(std::span<const double> equity_curve, const RiskLimits& limits) {
    RiskDecision decision{};
    decision.limit = limits.max_drawdown;
    decision.halt_trading = limits.fail_closed;

    const auto drawdown = calculateDrawdown(equity_curve);
    if (!drawdown.ok) {
        decision.reason = limits.fail_closed ? "invalid_equity_curve_halt" : "invalid_equity_curve_allowed";
        decision.approved = !limits.fail_closed;
        return decision;
    }

    decision.observed_drawdown = drawdown.max_drawdown;
    if (limits.max_drawdown < 0.0) {
        decision.reason = "invalid_drawdown_limit_configuration";
        decision.approved = !limits.fail_closed;
        return decision;
    }

    if (drawdown.max_drawdown > limits.max_drawdown) {
        decision.reason = "max_drawdown_limit_breached";
        decision.approved = false;
        decision.halt_trading = true;
        return decision;
    }

    decision.reason = "risk_within_parameters";
    decision.approved = true;
    decision.halt_trading = false;
    return decision;
}

} // namespace sovereign
