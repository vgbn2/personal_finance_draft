#include "../src/ml/model_registry.hpp"

#include <cmath>
#include <iostream>
#include <set>
#include <string>

namespace {

bool expect(bool condition, const char* message) {
    if (!condition) {
        std::cerr << "FAILED: " << message << "\n";
    }
    return condition;
}

sovereign::features::FeatureRow makeRow(
    const std::string& asset,
    int index,
    double close,
    double ret1,
    double ret5,
    double rsi,
    double vol) {
    sovereign::features::FeatureRow row;
    row.asset_id = asset;
    row.timestamp = "2026-05-" + std::to_string(10 + index) + "T00:00:00Z";
    row.timeframe = "1d";
    row.set("close", close);
    row.set("close_return_1", ret1);
    row.set("close_return_5", ret5);
    row.set("realized_volatility_20", vol);
    row.set("rsi_14", rsi);
    row.set("macd", ret5 * close * 0.2);
    row.set("atr_14", close * (vol + 0.005));
    return row;
}

} // namespace

int main() {
    using namespace sovereign::features;
    using namespace sovereign::ml;

    const auto& registry = defaultModelRegistry();
    if (!expect(registry.size() >= 10U, "Expected at least ten model candidates")) return 1;
    if (!expect(findModelCandidate("xgboost_ranker_v0").has_value(), "Expected xgboost adapter")) return 1;
    if (!expect(findModelCandidate("decision_tree_stump_v0").has_value(), "Expected decision tree adapter")) return 1;

    std::set<std::string> families;
    for (const auto& candidate : registry) {
        families.insert(candidate.family);
    }
    if (!expect(families.count("boosting") == 1U, "Expected boosting family")) return 1;
    if (!expect(families.count("trees") == 1U, "Expected trees family")) return 1;
    if (!expect(families.count("neural") == 1U, "Expected neural family")) return 1;

    FeatureFrame frame;
    for (int i = 0; i < 10; ++i) {
        frame.rows.push_back(makeRow("SPY", i, 100.0 + i * 1.2, 0.004, 0.018, 52.0, 0.012));
        frame.rows.push_back(makeRow("BTCUSDT", i, 50000.0 + i * 250.0, i % 2 == 0 ? 0.008 : -0.003, 0.02, 44.0, 0.028));
    }
    frame.ready_rows = frame.rows.size();

    const auto report = compareModelCandidates(frame, 2, 0.55);
    if (!expect(report.candidate_count == registry.size(), "Expected all candidates in comparison")) return 1;
    if (!expect(report.models.size() == registry.size(), "Expected model score for every candidate")) return 1;
    if (!expect(!report.winner.empty(), "Expected overall winner")) return 1;
    if (!expect(report.per_asset_winners.size() == 2U, "Expected per-asset winners")) return 1;
    if (!expect(report.models.front().trades > 0U, "Expected winning model to produce trades")) return 1;

    const auto xgb = findModelCandidate("xgboost_ranker_v0").value();
    const auto prediction = predictModel(xgb, frame.rows.front());
    if (!expect(prediction.confidence >= 0.0 && prediction.confidence <= 1.0, "Expected bounded confidence")) return 1;
    if (!expect(prediction.direction == "long" || prediction.direction == "flat", "Expected known direction")) return 1;

    std::cout << "[MODEL_REGISTRY] candidates=" << report.candidate_count
              << " families=" << report.families.size()
              << " winner=" << report.winner
              << " per_asset_winners=" << report.per_asset_winners.size()
              << "\n";
    std::cout << "model_registry_test passed!\n";
    return 0;
}
