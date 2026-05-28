#include "../src/features/label_builder.hpp"
#include "../src/features/lookahead_guard.hpp"
#include "../src/features/sentiment_features.hpp"

#include <cmath>
#include <iostream>
#include <span>
#include <vector>

namespace {

bool approxEqual(double actual, double expected, double tolerance) {
    return std::fabs(actual - expected) <= tolerance;
}

bool expect(bool condition, const char* message) {
    if (!condition) {
        std::cerr << message << "\n";
    }
    return condition;
}

} // namespace

int main() {
    std::vector<sovereign::OhlcvBar> bars;
    for (int i = 0; i < 12; ++i) {
        const double close = 100.0 + static_cast<double>(i) * 2.0;
        bars.push_back({
            "equities:AAPL",
            "2026-05-23T00:00:00Z",
            "1d",
            close - 1.0,
            close + 1.5,
            close - 2.0,
            close,
            1000.0 + static_cast<double>(i * 20),
            "fixture",
            "2026-05-23T00:05:00Z",
        });
    }

    const auto guard_report = sovereign::features::validateForwardWindow(std::span<const sovereign::OhlcvBar>(bars.data(), bars.size()), 3U);
    if (!expect(guard_report.ok, "Expected forward window validation to pass")) {
        return 1;
    }
    if (!expect(guard_report.checked_rows == bars.size(), "Expected all rows to be checked")) {
        return 1;
    }

    sovereign::features::LabelBuilderConfig label_config;
    label_config.horizon_bars = 3U;
    label_config.positive_threshold = 0.04;
    label_config.negative_threshold = -0.04;

    const auto label_summary = sovereign::features::buildLabelSummary(std::span<const sovereign::OhlcvBar>(bars.data(), bars.size()), label_config);
    const auto label_frame = sovereign::features::buildLabelFrame(std::span<const sovereign::OhlcvBar>(bars.data(), bars.size()), label_config);

    if (!expect(label_summary.rows_considered == 9U, "Expected horizon-aware rows considered")) {
        return 1;
    }
    if (!expect(label_summary.rows_labeled == label_frame.rows.size(), "Expected summary and frame to agree")) {
        return 1;
    }
    if (!expect(label_frame.ready_rows == label_frame.rows.size(), "Expected every label row to be ready")) {
        return 1;
    }

    const auto& row = label_frame.rows.back();
    const auto forward_return = row.get("forward_return");
    const auto direction = row.get("label_direction");
    const auto regime = row.get("label_regime");
    if (!expect(forward_return.has_value(), "Expected forward return label")) {
        return 1;
    }
    if (!expect(direction.has_value() && *direction > 0.0, "Expected positive label direction")) {
        return 1;
    }
    if (!expect(regime.has_value() && *regime > 0.0, "Expected bullish regime label")) {
        return 1;
    }
    if (!expect(approxEqual(*forward_return, 6.0 / 116.0, 0.0000001), "Expected forward return calculation")) {
        return 1;
    }

    const std::vector<sovereign::features::SentimentObservation> observations{
        {"equities:AAPL", "2026-05-23T09:30:00Z", "news", 0.70, 0.90, 5.0},
        {"equities:AAPL", "2026-05-23T09:30:00Z", "social", 0.20, 0.50, 2.0},
        {"equities:AAPL", "2026-05-23T09:30:00Z", "survey", -0.10, 0.80, 1.0},
    };
    const auto sentiment_frame = sovereign::features::buildSentimentFeatureFrame(std::span<const sovereign::features::SentimentObservation>(observations.data(), observations.size()));
    if (!expect(sentiment_frame.rows.size() == 1U, "Expected one aggregated sentiment row")) {
        return 1;
    }
    if (!expect(sentiment_frame.ready_rows == 1U, "Expected sentiment row to be ready")) {
        return 1;
    }

    const auto& sentiment_row = sentiment_frame.rows.front();
    const auto sentiment_score = sentiment_row.get("sentiment_score");
    const auto sentiment_weight = sentiment_row.get("sentiment_weight");
    const auto sentiment_sources = sentiment_row.get("sentiment_sources");
    if (!expect(sentiment_score.has_value(), "Expected sentiment score")) {
        return 1;
    }
    if (!expect(sentiment_weight.has_value(), "Expected sentiment weight")) {
        return 1;
    }
    if (!expect(sentiment_sources.has_value() && *sentiment_sources == 3.0, "Expected source count")) {
        return 1;
    }
    if (!expect(*sentiment_score > 0.0 && *sentiment_score < 1.0, "Expected normalized sentiment score")) {
        return 1;
    }

    std::cout << "[DATA FLOW] Label rows considered: " << label_summary.rows_considered << "\n";
    std::cout << "[DATA FLOW] Label rows emitted: " << label_frame.rows.size() << "\n";
    std::cout << "[DATA FLOW] Sentiment score: " << *sentiment_score << "\n";
    std::cout << "feature_pipeline_test passed!\n";
    return 0;
}
