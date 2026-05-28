#pragma once

#include "../feeds/quote_feed.hpp"

#include <string>

namespace sovereign {

class StrategyInterface {
public:
    virtual ~StrategyInterface() = default;

    virtual std::string name() const = 0;
    virtual void onTick(const QuoteTick& tick) = 0;
    virtual void onBar(const QuoteBar& bar) = 0;
};

} // namespace sovereign
