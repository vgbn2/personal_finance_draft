#include "features/technical_features.hpp"

#include <vector>
#include <string>

namespace sovereign::features {

namespace {

struct FeatureMapping {
    const char* source_key;
    const char* target_key;
};

const std::vector<FeatureMapping> SIMPLE_MAPPINGS = {
    {"ret:fast", "return_1"},
    {"ret:slow", "return_5"},
    {"vol:20", "volatility_20"},
    {"rsi:14", "rsi_14"},
    {"macd", "macd_raw"},
    {"atr:14", "atr_14"},
    {"atr_pct:14", "atr_pct_14"},
    {"stoch_k:14", "stoch_k_14"},
    {"stoch_d:3", "stoch_d_3"},
    {"bb_width:20", "bb_width_20"},
    {"bb_percent_b:20", "bb_percent_b_20"},
    {"ema:12", "ema_12"},
    {"ema:26", "ema_26"},
    {"sma:20", "sma_20"},
    {"sma:50", "sma_50"}
};

void copyMetricIfPresent(
    FeatureRow& row,
    const indicators::IndicatorRow& indicator_row,
    const char* source_key,
    const char* target_key
) {
    if (const auto value = indicator_row.get(source_key)) {
        row.set(target_key, *value);
    }
}

} // namespace

FeatureFrame buildTechnicalFeatureFrame(const indicators::IndicatorFrame& indicator_frame) {
    FeatureFrame feature_frame;
    feature_frame.rows.reserve(indicator_frame.rows.size());

    for (const auto& indicator_row : indicator_frame.rows) {
        FeatureRow row;
        row.asset_id = indicator_row.bar.asset_id;
        row.timestamp = indicator_row.bar.timestamp;
        row.timeframe = indicator_row.bar.timeframe;

        for (const auto& mapping : SIMPLE_MAPPINGS) {
            copyMetricIfPresent(row, indicator_row, mapping.source_key, mapping.target_key);
        }

        if (const auto rsi = indicator_row.get("rsi:14")) {
            row.set("rsi_centered_14", (*rsi - 50.0) / 50.0);
        }

        if (const auto macd = indicator_row.get("macd"); macd && indicator_row.bar.close != 0.0) {
            row.set("macd_norm", *macd / indicator_row.bar.close);
        }
        if (const auto sma20 = indicator_row.get("sma:20"); sma20 && *sma20 != 0.0) {
            row.set("close_vs_sma20", indicator_row.bar.close / *sma20 - 1.0);
        }
        if (const auto sma50 = indicator_row.get("sma:50"); sma50 && *sma50 != 0.0) {
            row.set("close_vs_sma50", indicator_row.bar.close / *sma50 - 1.0);
        }
        if (const auto ema12 = indicator_row.get("ema:12"), ema26 = indicator_row.get("ema:26");
            ema12 && ema26 && *ema26 != 0.0) {
            row.set("ema_gap_12_26", (*ema12 / *ema26) - 1.0);
        }
        if (const auto stoch_k = indicator_row.get("stoch_k:14"), stoch_d = indicator_row.get("stoch_d:3");
            stoch_k && stoch_d) {
            row.set("stoch_spread", *stoch_k - *stoch_d);
        }

        if (row.get("rsi_14") &&
            row.get("macd_norm") &&
            row.get("close_vs_sma20") &&
            row.get("atr_pct_14")) {
            ++feature_frame.ready_rows;
        }

        feature_frame.rows.push_back(std::move(row));
    }

    return feature_frame;
}

} // namespace sovereign::features
