#pragma once

#include "quote_feed.hpp"

#include <algorithm>
#include <iterator>
#include <string>
#include <utility>
#include <vector>

namespace sovereign {
class WebullQuoteFeedAdapter final : public IQuoteFeed {
public:
    explicit WebullQuoteFeedAdapter(bool webull_available = false, std::string source_name = "webull")
        : webull_available_(webull_available), source_name_(std::move(source_name)) {}

    WebullQuoteFeedAdapter(std::vector<QuoteTick> ticks, std::vector<QuoteBar> bars, std::string source_name = "webull")
        : webull_available_(!ticks.empty() || !bars.empty()),
          source_name_(std::move(source_name)),
          ticks_(std::move(ticks)),
          bars_(std::move(bars)) {}

    std::string name() const override {
        return source_name_;
    }

    bool isReady() const override {
        return webull_available_;
    }

    std::vector<QuoteTick> fetchTicks(const std::string& instrument_id) const override {
        std::vector<QuoteTick> output;
        std::copy_if(ticks_.begin(), ticks_.end(), std::back_inserter(output), [&](const QuoteTick& tick) {
            return tick.instrument_id == instrument_id || tick.symbol == instrument_id;
        });
        return output;
    }

    std::vector<QuoteBar> fetchBars(const std::string& instrument_id, const std::string& timeframe) const override {
        std::vector<QuoteBar> output;
        std::copy_if(bars_.begin(), bars_.end(), std::back_inserter(output), [&](const QuoteBar& bar) {
            return (bar.instrument_id == instrument_id || bar.symbol == instrument_id) && bar.timeframe == timeframe;
        });
        return output;
    }

    std::string status() const {
        return webull_available_ ? "webull_connected" : "webull_offline";
    }

private:
    bool webull_available_ = false;
    std::string source_name_;
    std::vector<QuoteTick> ticks_;
    std::vector<QuoteBar> bars_;
};

} // namespace sovereign
