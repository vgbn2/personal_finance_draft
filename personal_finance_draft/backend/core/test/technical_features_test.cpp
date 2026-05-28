#include "../src/features/technical_features.hpp"
#include "../src/indicators/indicator_engine.hpp"

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
    bars.reserve(90);
    for (int i = 0; i < 90; ++i) {
        const double trend = 100.0 + static_cast<double>(i) * 0.8;
        const double wave = std::sin(static_cast<double>(i) / 6.0) * 2.5;
        const double close = trend + wave;
        bars.push_back({
            "equities:AAPL",
            "2026-05-23T00:00:00Z",
            "1d",
            close - 0.8,
            close + 1.2,
            close - 1.4,
            close,
            1000.0 + static_cast<double>(i * 10),
            "sample",
            "2026-05-23T00:05:00Z",
        });
    }

    const auto indicator_frame =
        sovereign::indicators::IndicatorEngine::buildFrame(std::span<const sovereign::OhlcvBar>(bars.data(), bars.size()));
    const auto feature_frame = sovereign::features::buildTechnicalFeatureFrame(indicator_frame);

    if (!expect(feature_frame.rows.size() == bars.size(), "Expected one feature row per bar")) {
        return 1;
    }
    if (!expect(feature_frame.ready_rows > 0U, "Expected ready technical feature rows")) {
        return 1;
    }

    const auto& row = feature_frame.rows.back();
    if (!expect(row.get("rsi_14").has_value(), "Expected RSI feature")) return 1;
    if (!expect(row.get("ema_gap_12_26").has_value(), "Expected EMA gap feature")) return 1;
    if (!expect(row.get("close_vs_sma20").has_value(), "Expected close vs SMA20 feature")) return 1;
    if (!expect(row.get("atr_pct_14").has_value(), "Expected ATR percent feature")) return 1;
    if (!expect(row.get("stoch_spread").has_value(), "Expected stochastic spread feature")) return 1;

    std::cout << "[DATA FLOW] Technical Feature Sample (Last Bar):\n";
    std::cout << "  close_vs_sma20: " << *row.get("close_vs_sma20") << "\n";
    std::cout << "  ema_gap_12_26: " << *row.get("ema_gap_12_26") << "\n";
    std::cout << "  atr_pct_14: " << *row.get("atr_pct_14") << "\n";
    std::cout << "  stoch_spread: " << *row.get("stoch_spread") << "\n";
    std::cout << "technical_features_test passed!\n";
    return 0;
}
