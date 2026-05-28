#pragma once

#include <string>
#include <string_view>
#include <vector>
#include <optional>

namespace sovereign::execution {

enum class OrderState {
    proposed,
    rejected,
    submitted,
    partially_filled,
    filled,
    cancelled,
    failed,
};

enum class TimeInForce {
    GTC, // Good 'Til Canceled
    IOC, // Immediate or Cancel
    FOK, // Fill or Kill
    DAY  // Good for Day
};

struct ExecutionOrder {
    std::string instrument_id;
    std::string side; // "buy" or "sell"
    double quantity = 0.0;
    std::string order_type = "market"; // "market", "limit", "stop"
    std::optional<double> limit_price = std::nullopt;
    std::optional<double> stop_price = std::nullopt;
    TimeInForce tif = TimeInForce::GTC;
    std::string venue;
};

struct ExecutionResult {
    OrderState state = OrderState::rejected;
    double filled_quantity = 0.0;
    double average_price = 0.0;
    std::string reason;
};

class ExecutionInterface {
public:
    virtual ~ExecutionInterface() = default;
    virtual std::string name() const = 0;
    virtual bool isReady() const = 0;
    virtual ExecutionResult submit(const ExecutionOrder& order) = 0;
    virtual bool cancel(std::string_view instrument_id) = 0;
};

} // namespace sovereign::execution
