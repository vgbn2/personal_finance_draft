#pragma once

#include "../feeds/crypto_exchange_feed.hpp"
#include "../strategies/crypto_strategy_interface.hpp"

#include <cstddef>
#include <string>
#include <vector>

namespace sovereign {

struct StrategyRunSummary {
    std::string strategy_name;
    std::string exchange;
    std::string symbol;
    std::string timeframe;
    std::size_t candles_seen = 0;
    std::size_t candles_accepted = 0;
    std::size_t hold_actions = 0;
    std::size_t buy_actions = 0;
    std::size_t sell_actions = 0;
    std::vector<std::string> rejected_candles;
};

class StrategyRunner {
public:
    StrategyRunSummary run(CryptoStrategyInterface& strategy, const CryptoExchangeFeed& feed) const;

private:
    static bool validateCandle(const OhlcvBar& candle, std::string& reason);
};

} // namespace sovereign
