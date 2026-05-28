#pragma once

#include "execution_interface.hpp"

#include <string>

namespace sovereign::execution {

struct SimpleMarketOutcome {
    ExecutionResult result{};
    std::string route_name = "simple_market";
};

SimpleMarketOutcome simulateSimpleMarketFill(const ExecutionOrder& order, double reference_price = 100.0);

} // namespace sovereign::execution
