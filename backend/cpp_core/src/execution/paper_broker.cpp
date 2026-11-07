#include "paper_broker.hpp"

namespace sovereign::execution {

std::string PaperBroker::name() const {
    return "PaperBroker";
}

bool PaperBroker::isReady() const {
    return true;
}

ExecutionResult PaperBroker::submit(const ExecutionOrder& order) {
    if (order.instrument_id.empty() || order.quantity <= 0.0 || (order.side != "buy" && order.side != "sell")) {
        return {
            OrderState::rejected,
            0.0,
            0.0,
            "invalid_paper_order"
        };
    }

    const double fill_price = order.limit_price.value_or(order.stop_price.value_or(100.0));
    return {
        OrderState::filled,
        order.quantity,
        fill_price,
        "paper_fill"
    };
}

bool PaperBroker::cancel(std::string_view /*instrument_id*/) {
    return true;
}

} // namespace sovereign::execution
