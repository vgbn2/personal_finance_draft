#pragma once

#include <cstddef>
#include <string>
#include <vector>

namespace sovereign {

struct OrderBookLevel {
    double price = 0.0;
    double quantity = 0.0;
};

struct OrderBookSnapshot {
    std::string symbol;
    std::string timestamp;
    std::string venue;
    std::vector<OrderBookLevel> bids;
    std::vector<OrderBookLevel> asks;
    std::string source;

    const OrderBookLevel* best_bid() const {
        return bids.empty() ? nullptr : &bids.front();
    }

    const OrderBookLevel* best_ask() const {
        return asks.empty() ? nullptr : &asks.front();
    }

    double mid_price() const {
        const auto* bid = best_bid();
        const auto* ask = best_ask();
        if (!bid || !ask) {
            return 0.0;
        }
        return (bid->price + ask->price) * 0.5;
    }

    double spread() const {
        const auto* bid = best_bid();
        const auto* ask = best_ask();
        if (!bid || !ask) {
            return 0.0;
        }
        return ask->price - bid->price;
    }
};

} // namespace sovereign
