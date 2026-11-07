#pragma once

#include "execution_interface.hpp"

namespace sovereign::execution {

class PaperBroker final : public ExecutionInterface {
public:
    std::string name() const override;
    bool isReady() const override;
    ExecutionResult submit(const ExecutionOrder& order) override;
    bool cancel(std::string_view instrument_id) override;
};

} // namespace sovereign::execution
