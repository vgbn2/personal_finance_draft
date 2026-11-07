#pragma once

#include <string>

namespace sovereign {

enum class MarketEventType {
    Tick,
    Bar,
    Quote,
    Macro,
    News,
    Sentiment,
    CorporateAction,
    Unknown,
};

struct MarketEvent {
    MarketEventType type = MarketEventType::Unknown;
    std::string symbol;
    std::string asset_id;
    std::string timeframe;
    std::string timestamp;
    std::string source;
    double price = 0.0;
    double bid = 0.0;
    double ask = 0.0;
    double volume = 0.0;

    bool is_price_event() const {
        return type == MarketEventType::Tick
            || type == MarketEventType::Bar
            || type == MarketEventType::Quote;
    }
};

} // namespace sovereign
