#include "strategy_runner.hpp"

#include <sstream>

namespace sovereign {

namespace {

std::string describeCandle(const OhlcvBar& candle) {
    std::ostringstream out;
    out << candle.asset_id << "@" << candle.timestamp;
    return out.str();
}

} // namespace

bool StrategyRunner::validateCandle(const OhlcvBar& candle, std::string& reason) {
    if (candle.timestamp.empty()) {
        reason = "missing_timestamp";
        return false;
    }
    if (candle.open < 0.0 || candle.high < 0.0 || candle.low < 0.0 || candle.close < 0.0) {
        reason = "negative_price";
        return false;
    }
    if (candle.high < candle.low || candle.high < candle.open || candle.high < candle.close ||
        candle.low > candle.open || candle.low > candle.close) {
        reason = "bad_ohlc_ordering";
        return false;
    }
    return true;
}

StrategyRunSummary StrategyRunner::run(CryptoStrategyInterface& strategy, const CryptoExchangeFeed& feed) const {
    StrategyRunSummary summary;
    summary.strategy_name = std::string(strategy.name());
    summary.exchange = feed.request().exchange;
    summary.symbol = feed.request().symbol;
    summary.timeframe = feed.request().timeframe;

    const auto candles = feed.load();
    const OhlcvBar* previous_bar = nullptr;

    for (std::size_t index = 0; index < candles.size(); ++index) {
        ++summary.candles_seen;

        const auto& candle = candles[index];
        std::string reason;
        if (!validateCandle(candle, reason)) {
            summary.rejected_candles.push_back(describeCandle(candle) + ":" + reason);
            continue;
        }

        ++summary.candles_accepted;

        StrategyBarContext context;
        context.exchange = summary.exchange;
        context.symbol = summary.symbol;
        context.timeframe = summary.timeframe;
        context.bar_index = index;
        context.previous_bar = previous_bar;

        const StrategyDecision decision = strategy.onBar(candle, context);
        switch (decision.action) {
        case StrategyAction::Buy:
            ++summary.buy_actions;
            break;
        case StrategyAction::Sell:
            ++summary.sell_actions;
            break;
        case StrategyAction::Hold:
        default:
            ++summary.hold_actions;
            break;
        }

        previous_bar = &candle;
    }

    return summary;
}

} // namespace sovereign
