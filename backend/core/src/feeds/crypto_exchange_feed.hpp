#pragma once

#include "../data/ohlcv_bar.hpp"

#include <cstddef>
#include <string>
#include <utility>
#include <vector>

namespace sovereign {

struct CryptoFeedRequest {
    std::string exchange = "offline";
    std::string symbol;
    std::string timeframe = "1h";
    bool live_enabled = false;
};

class CryptoExchangeFeed {
public:
    CryptoExchangeFeed() = default;

    CryptoExchangeFeed(CryptoFeedRequest request, std::vector<OhlcvBar> candles = {})
        : request_(std::move(request)), candles_(std::move(candles)) {
        normalize();
    }

    static CryptoExchangeFeed simulate(CryptoFeedRequest request, std::vector<OhlcvBar> candles = {}) {
        return CryptoExchangeFeed(std::move(request), std::move(candles));
    }

    static CryptoExchangeFeed safeDefault(CryptoFeedRequest request) {
        return CryptoExchangeFeed(std::move(request), makeFallbackCandles(request));
    }

    const CryptoFeedRequest& request() const {
        return request_;
    }

    bool liveEnabled() const {
        return request_.live_enabled;
    }

    const std::vector<OhlcvBar>& candles() const {
        return candles_;
    }

    std::vector<OhlcvBar> load() const {
        return candles_.empty() ? makeFallbackCandles(request_) : candles_;
    }

private:
    static std::vector<OhlcvBar> makeFallbackCandles(const CryptoFeedRequest& request) {
        const std::string asset_id = "crypto:" + (request.symbol.empty() ? std::string("UNKNOWN") : request.symbol);
        const std::string timeframe = request.timeframe.empty() ? std::string("1h") : request.timeframe;
        const std::string source = request.exchange.empty() ? std::string("offline") : request.exchange;

        return {
            OhlcvBar{
                asset_id,
                "2026-05-18T00:00:00Z",
                timeframe,
                100000.0,
                101000.0,
                99500.0,
                100500.0,
                12.0,
                source,
                "2026-05-18T00:00:00Z",
            },
            OhlcvBar{
                asset_id,
                "2026-05-18T01:00:00Z",
                timeframe,
                100500.0,
                102250.0,
                100100.0,
                101750.0,
                14.0,
                source,
                "2026-05-18T01:00:00Z",
            },
            OhlcvBar{
                asset_id,
                "2026-05-18T02:00:00Z",
                timeframe,
                101750.0,
                102000.0,
                100900.0,
                101100.0,
                11.0,
                source,
                "2026-05-18T02:00:00Z",
            },
        };
    }

    void normalize() {
        if (request_.exchange.empty()) {
            request_.exchange = "offline";
        }
        if (request_.timeframe.empty()) {
            request_.timeframe = "1h";
        }
        if (request_.symbol.empty()) {
            request_.symbol = "UNKNOWN";
        }

        for (auto& candle : candles_) {
            if (candle.asset_id.empty()) {
                candle.asset_id = "crypto:" + request_.symbol;
            }
            if (candle.timeframe.empty()) {
                candle.timeframe = request_.timeframe;
            }
            if (candle.source.empty()) {
                candle.source = request_.exchange;
            }
            if (candle.ingested_at.empty()) {
                candle.ingested_at = candle.timestamp;
            }
        }
    }

    CryptoFeedRequest request_{};
    std::vector<OhlcvBar> candles_{};
};

} // namespace sovereign
