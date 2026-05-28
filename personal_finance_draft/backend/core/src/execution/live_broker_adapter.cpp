#include "live_broker_adapter.hpp"

#include <utility>

namespace sovereign::execution {

LiveBrokerAdapter::LiveBrokerAdapter(std::string broker_name)
    : broker_name_(std::move(broker_name)) {}

std::string LiveBrokerAdapter::name() const {
    return broker_name_;
}

bool LiveBrokerAdapter::isReady() const {
    return false;
}

ExecutionResult LiveBrokerAdapter::submit(const ExecutionOrder& /*order*/) {
    return {
        OrderState::rejected,
        0.0,
        0.0,
        "live_broker_unavailable"
    };
}

bool LiveBrokerAdapter::cancel(std::string_view /*instrument_id*/) {
    return false;
}

} // namespace sovereign::execution
