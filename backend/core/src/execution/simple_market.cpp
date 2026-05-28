#include "simple_market.hpp"

namespace sovereign::execution {

SimpleMarketOutcome simulateSimpleMarketFill(const ExecutionOrder& order, double reference_price) {
    SimpleMarketOutcome outcome;
    if (order.instrument_id.empty() || order.quantity <= 0.0 || (order.side != "buy" && order.side != "sell")) {
        outcome.result.state = OrderState::rejected;
        outcome.result.reason = "invalid_simple_market_order";
        return outcome;
    }

    outcome.result.state = OrderState::filled;
    outcome.result.filled_quantity = order.quantity;
    outcome.result.average_price = reference_price;
    outcome.result.reason = "simple_market_fill";
    return outcome;
}

} // namespace sovereign::execution
