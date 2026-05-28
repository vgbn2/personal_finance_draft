#include "../src/indicators/indicator_engine.hpp"
#include "../src/indicators/macd.hpp"
#include "../src/indicators/rsi.hpp"

#include <cmath>
#include <iostream>
#include <span>

namespace {

bool expect(bool condition, const char* message) {
    if (!condition) {
        std::cerr << message << "\n";
    }
    return condition;
}

} // namespace

int main() {
    std::vector<sovereign::OhlcvBar> bars;
    bars.reserve(60);
    for (int i = 0; i < 60; ++i) {
        const double close = 100.0 + static_cast<double>(i) * 1.5;
        bars.push_back({
            "equities:AAPL",
            "2026-05-18T00:00:00Z",
            "1d",
            close - 0.5,
            close + 1.0,
            close - 1.0,
            close,
            1000.0 + i,
            "sample",
            "2026-05-18T00:05:00Z",
        });
    }

    const std::vector<double> closes{
        100.0, 101.0, 102.0, 103.0, 104.0, 105.0, 106.0, 107.0, 108.0, 109.0,
        110.0, 111.0, 112.0, 113.0, 114.0, 115.0, 116.0, 117.0, 118.0, 119.0,
        120.0, 121.0, 122.0, 123.0, 124.0, 125.0, 126.0, 127.0, 128.0, 129.0,
    };
    const auto roc = sovereign::indicators::IndicatorEngine::rateOfChangeSeries(closes, 1U);
    if (!expect(roc.size() == closes.size() && roc.back() > 0.0, "Expected positive rate of change")) {
        return 1;
    }
    const auto vol = sovereign::indicators::IndicatorEngine::rollingVolatilitySeries(closes, 10U);
    if (!expect(vol.size() == closes.size() && vol.back() > 0.0, "Expected rolling volatility")) {
        return 1;
    }
    const auto rsi = sovereign::indicators::relativeStrengthIndexSeries(closes, 14U);
    if (!expect(rsi.size() == closes.size() && rsi.back() > 50.0, "Expected rising RSI")) {
        return 1;
    }
    const auto macd = sovereign::indicators::macdSeries(closes);
    if (!expect(macd.size() == closes.size() && !std::isnan(macd.back()), "Expected MACD value")) {
        return 1;
    }
    const auto bands = sovereign::indicators::bollingerBandsSeries(closes, 20U);
    if (!expect(bands.middle.size() == closes.size() && bands.upper.back() > bands.middle.back() && bands.middle.back() > bands.lower.back(), "Expected Bollinger bands")) {
        return 1;
    }
    const auto atr = sovereign::indicators::averageTrueRangeSeries(bars, 14U);
    if (!expect(atr.size() == bars.size() && atr.back() > 0.0, "Expected ATR")) {
        return 1;
    }

    const auto frame = sovereign::indicators::IndicatorEngine::buildFrame(std::span<const sovereign::OhlcvBar>(bars.data(), bars.size()));
    if (!expect(frame.rows.size() == bars.size(), "Expected one indicator row per bar")) {
        return 1;
    }
    if (!expect(frame.ready_rows > 0U, "Expected ready indicator rows")) {
        return 1;
    }
    if (!expect(frame.rows.back().get("rsi:14").has_value(), "Expected populated RSI on final row")) {
        return 1;
    }
    if (!expect(frame.rows.back().get("ema:12").has_value(), "Expected populated EMA(12) on final row")) {
        return 1;
    }
    if (!expect(frame.rows.back().get("sma:20").has_value(), "Expected populated SMA(20) on final row")) {
        return 1;
    }
    if (!expect(frame.rows.back().get("stoch_k:14").has_value(), "Expected populated stochastic K on final row")) {
        return 1;
    }
    if (!expect(frame.rows.back().get("bb_width:20").has_value(), "Expected populated Bollinger width on final row")) {
        return 1;
    }
    if (!expect(frame.rows.back().get("atr_pct:14").has_value(), "Expected populated ATR percent on final row")) {
        return 1;
    }

    std::cout << "[DATA FLOW] Indicator Sample (Last Bar):\n";
    std::cout << "  Close: " << bars.back().close << "\n";
    auto rsi_val = frame.rows.back().get("rsi:14");
    if (rsi_val) std::cout << "  RSI(14): " << *rsi_val << "\n";
    auto macd_val = frame.rows.back().get("macd");
    if (macd_val) std::cout << "  MACD: " << *macd_val << "\n";
    auto ema_val = frame.rows.back().get("ema:12");
    if (ema_val) std::cout << "  EMA(12): " << *ema_val << "\n";
    auto stoch_val = frame.rows.back().get("stoch_k:14");
    if (stoch_val) std::cout << "  Stoch %K(14): " << *stoch_val << "\n";

    std::cout << "indicator_test passed!\n";
    return 0;
}
