#include "execution_interface.hpp"
#include <atomic>
#include <memory>
#include <utility>

namespace sovereign::execution {

class KillSwitch : public ExecutionInterface {
public:
    explicit KillSwitch(std::unique_ptr<ExecutionInterface> underlying)
        : underlying_(std::move(underlying)) {}

    std::string name() const override {
        return "KillSwitch(" + underlying_->name() + ")";
    }

    bool isReady() const override {
        return !global_disable_.load(std::memory_order_acquire) && underlying_->isReady();
    }

    ExecutionResult submit(const ExecutionOrder& order) override {
        if (global_disable_.load(std::memory_order_acquire)) {
            return {
                OrderState::rejected,
                0.0,
                0.0,
                "BLOCKED: Global Kill Switch engaged."
            };
        }
        
        return underlying_->submit(order);
    }

    bool cancel(std::string_view instrument_id) override {
        // We always allow cancels, even if the kill switch is engaged,
        // because the kill switch is meant to stop new risk, not trap existing risk.
        return underlying_->cancel(instrument_id);
    }

    // --- Kill Switch Controls ---
    void engage() {
        global_disable_.store(true, std::memory_order_release);
    }

    void disengage() {
        global_disable_.store(false, std::memory_order_release);
    }

    bool is_engaged() const {
        return global_disable_.load(std::memory_order_acquire);
    }

private:
    std::unique_ptr<ExecutionInterface> underlying_;
    std::atomic<bool> global_disable_{false};
};

} // namespace sovereign::execution
