#include "../src/feeds/crypto_exchange_feed.hpp"
#include "../src/replay/strategy_runner.hpp"
#include "../src/strategies/crypto_strategy_interface.hpp"

#include <iostream>
#include <string>
#include <vector>

namespace {

bool expect(bool condition, const char* message) {
    if (!condition) {
        std::cerr << message << "\n";
    }
    return condition;
}

class MomentumStrategy final : public sovereign::CryptoStrategyInterface {
public:
    std::string name() const override {
        return "momentum_trend";
    }

    sovereign::StrategyDecision onBar(const sovereign::OhlcvBar& bar, const sovereign::StrategyBarContext& context) override {
        if (context.previous_bar == nullptr) {
            return {sovereign::StrategyAction::Hold, "seed"};
        }
        if (bar.close > context.previous_bar->close) {
            return {sovereign::StrategyAction::Buy, "up"};
        }
        if (bar.close < context.previous_bar->close) {
            return {sovereign::StrategyAction::Sell, "down"};
        }
        return {sovereign::StrategyAction::Hold, "flat"};
    }
};

} // namespace

int main() {
    const std::vector<sovereign::OhlcvBar> candles = {
        {"", "2026-05-18T00:00:00Z", "15m", 100.0, 101.0, 99.5, 100.0, 10.0, "", ""},
        {"", "2026-05-18T00:15:00Z", "15m", 100.0, 102.0, 99.8, 101.0, 11.0, "", ""},
        {"", "2026-05-18T00:30:00Z", "15m", 101.0, 101.5, 99.7, 100.0, 12.0, "", ""},
    };

    sovereign::CryptoFeedRequest request;
    request.exchange = "coinbase";
    request.symbol = "BTCUSDT";
    request.timeframe = "15m";

    const auto feed = sovereign::CryptoExchangeFeed::simulate(request, candles);
    sovereign::StrategyRunner runner;
    MomentumStrategy strategy;

    const auto summary = runner.run(strategy, feed);
    if (!expect(summary.strategy_name == "momentum_trend", "Unexpected strategy name")) {
        return 1;
    }
    if (!expect(summary.exchange == "coinbase", "Unexpected exchange")) {
        return 1;
    }
    if (!expect(summary.symbol == "BTCUSDT", "Unexpected symbol")) {
        return 1;
    }
    if (!expect(summary.timeframe == "15m", "Unexpected timeframe")) {
        return 1;
    }
    if (!expect(summary.candles_seen == 3, "Expected three candles seen")) {
        return 1;
    }
    if (!expect(summary.candles_accepted == 3, "Expected three accepted candles")) {
        return 1;
    }
    if (!expect(summary.hold_actions == 1, "Expected one hold")) {
        return 1;
    }
    if (!expect(summary.buy_actions == 1, "Expected one buy")) {
        return 1;
    }
    if (!expect(summary.sell_actions == 1, "Expected one sell")) {
        return 1;
    }
    if (!expect(summary.rejected_candles.empty(), "Expected no rejected candles")) {
        return 1;
    }

    return 0;
}
