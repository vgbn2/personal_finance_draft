#include "../src/feeds/mt5_quote_feed_adapter.hpp"
#include "../src/feeds/webull_quote_feed_adapter.hpp"
#include "../src/strategies/strategy_interface.hpp"
#include "../src/data/data_snapshot.hpp"

#include <iostream>
#include <string>
#include <vector>
#include <filesystem>

namespace {

bool expect(bool condition, const char* message) {
    if (!condition) {
        std::cerr << message << "\n";
    }
    return condition;
}

class RecordingStrategy final : public sovereign::StrategyInterface {
public:
    std::string name() const override {
        return "recording";
    }

    void onTick(const sovereign::QuoteTick& tick) override {
        last_tick_symbol = tick.symbol;
    }

    void onBar(const sovereign::QuoteBar& bar) override {
        last_bar_timeframe = bar.timeframe;
    }

    std::string last_tick_symbol;
    std::string last_bar_timeframe;
};

} // namespace

int main() {
    const auto fixture_path = std::filesystem::path(SOVEREIGN_REPO_ROOT)
        / "tests" / "fixtures" / "backend_history_sample.json";
    auto snapshot = sovereign::loadMarketDataSnapshot(fixture_path, "AAPL", "1d", 5);
    if (!expect(snapshot.bars.size() > 0, "Expected to load empirical bars for test")) {
        return 1;
    }

    std::vector<sovereign::QuoteBar> bars;
    std::vector<sovereign::QuoteTick> ticks;
    
    for (const auto& ohlcv : snapshot.bars) {
        bars.push_back({
            "equities:AAPL", "AAPL", "yahoo", "1d", ohlcv.timestamp,
            ohlcv.open, ohlcv.high, ohlcv.low, ohlcv.close, ohlcv.volume, "empirical", ohlcv.timestamp
        });
        ticks.push_back({
            "equities:AAPL", "AAPL", "yahoo", ohlcv.timestamp,
            ohlcv.close, ohlcv.close, ohlcv.close, 1.0, 1.0, ohlcv.volume, "empirical", ohlcv.timestamp
        });
    }

    sovereign::Mt5QuoteFeedAdapter mt5_offline;
    if (!expect(!mt5_offline.isReady(), "Expected MT5 adapter to start offline")) {
        return 1;
    }
    if (!expect(mt5_offline.fetchTicks("equities:AAPL").empty(), "Expected MT5 adapter to return no ticks")) {
        return 1;
    }
    if (!expect(mt5_offline.fetchBars("equities:AAPL", "1d").empty(), "Expected MT5 adapter to return no bars")) {
        return 1;
    }
    if (!expect(mt5_offline.status() == "mt5_offline", "Unexpected MT5 adapter status")) {
        return 1;
    }

    sovereign::Mt5QuoteFeedAdapter mt5_feed(ticks, bars);
    if (!expect(mt5_feed.isReady(), "Expected injected MT5 feed to be ready")) {
        return 1;
    }
    if (!expect(mt5_feed.fetchTicks("equities:AAPL").size() == ticks.size(), "Expected injected MT5 ticks")) {
        return 1;
    }
    if (!expect(mt5_feed.fetchBars("equities:AAPL", "1d").size() == bars.size(), "Expected injected MT5 bars")) {
        return 1;
    }

    sovereign::WebullQuoteFeedAdapter webull_feed(ticks, bars);
    if (!expect(webull_feed.isReady(), "Expected injected Webull feed to be ready")) {
        return 1;
    }
    if (!expect(webull_feed.fetchTicks("AAPL").size() == ticks.size(), "Expected Webull symbol lookup to work")) {
        return 1;
    }
    if (!expect(webull_feed.status() == "webull_connected", "Unexpected Webull feed status")) {
        return 1;
    }

    RecordingStrategy strategy;
    strategy.onTick(ticks.front());
    strategy.onBar(bars.front());
    if (!expect(strategy.last_tick_symbol == "AAPL", "Strategy did not receive tick")) {
        return 1;
    }
    if (!expect(strategy.last_bar_timeframe == "1d", "Strategy did not receive bar")) {
        return 1;
    }

    std::cout << "[VISIBILITY] Quote Feed Integration tests passed using empirical data." << std::endl;
    return 0;
}
