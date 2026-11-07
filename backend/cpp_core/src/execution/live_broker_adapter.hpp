#pragma once

#include "execution_interface.hpp"

#include <string>

namespace sovereign::execution {

class LiveBrokerAdapter : public ExecutionInterface {
public:
    explicit LiveBrokerAdapter(std::string broker_name = "live_broker");

    std::string name() const override;
    bool isReady() const override;
    ExecutionResult submit(const ExecutionOrder& order) override;
    bool cancel(std::string_view instrument_id) override;

private:
    std::string broker_name_;
};

} // namespace sovereign::execution
