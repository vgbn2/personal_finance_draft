#include "rl_router.hpp"

namespace sovereign::execution {

RoutingDecision chooseRoutingMode(const ExecutionOrder& order, double expected_liquidity, double urgency_score) {
    RoutingDecision decision;
    if (urgency_score >= 0.75 || order.order_type == "stop" || expected_liquidity <= 0.0) {
        decision.mode = RoutingMode::simple_market;
        decision.reason = "high_urgency_or_low_liquidity";
        return decision;
    }

    if (expected_liquidity < order.quantity * 10.0) {
        decision.mode = RoutingMode::twap;
        decision.reason = "liquidity_supports_sliced_execution";
        return decision;
    }

    decision.mode = RoutingMode::vwap;
    decision.reason = "liquidity_supports_volume_profile_execution";
    return decision;
}

const char* toString(RoutingMode mode) {
    switch (mode) {
    case RoutingMode::simple_market:
        return "simple_market";
    case RoutingMode::twap:
        return "twap";
    case RoutingMode::vwap:
        return "vwap";
    }
    return "simple_market";
}

} // namespace sovereign::execution
