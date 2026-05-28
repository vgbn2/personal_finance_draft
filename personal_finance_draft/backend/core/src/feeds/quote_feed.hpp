#pragma once

#include <string>
#include <vector>

namespace sovereign {

struct QuoteTick {
    std::string instrument_id;
    std::string symbol;
    std::string venue;
    std::string timestamp;
    double bid = 0.0;
    double ask = 0.0;
    double last = 0.0;
    double bid_size = 0.0;
    double ask_size = 0.0;
    double last_size = 0.0;
    std::string source;
    std::string ingested_at;
};
//is quote bar and quote tick the same?
struct QuoteBar {
    std::string instrument_id;
    std::string symbol;
    std::string venue;
    std::string timeframe;
    std::string timestamp;
    double open = 0.0;
    double high = 0.0;
    double low = 0.0;
    double close = 0.0;
    double volume = 0.0;
    std::string source;
    std::string ingested_at;
};

class IQuoteFeed {
public:
    virtual ~IQuoteFeed() = default;

    virtual std::string name() const = 0;
    virtual bool isReady() const = 0;
    virtual std::vector<QuoteTick> fetchTicks(const std::string& instrument_id) const = 0;
    virtual std::vector<QuoteBar> fetchBars(const std::string& instrument_id, const std::string& timeframe) const = 0;
};

} // namespace sovereign
