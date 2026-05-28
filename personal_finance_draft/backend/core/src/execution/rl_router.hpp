#pragma once

#include "execution_interface.hpp"

#include <string>

namespace sovereign::execution {

enum class RoutingMode {
    simple_market,
    twap,
    vwap,
};

struct RoutingDecision {
    RoutingMode mode = RoutingMode::simple_market;
    std::string reason = "uninitialized";
};

RoutingDecision chooseRoutingMode(const ExecutionOrder& order, double expected_liquidity, double urgency_score);
const char* toString(RoutingMode mode);

} // namespace sovereign::execution
