#include "ml/cnn_tensor_builder.hpp"
#include "features/technical_features.hpp"
#include "indicators/indicator_engine.hpp"
#include "data/data_snapshot.hpp"
#include <iostream>
#include <filesystem>

namespace {

bool expect(bool condition, const char* message) {
    if (!condition) {
        std::cerr << "FAILED: " << message << "\n";
    }
    return condition;
}

} // namespace

int main() {
    using namespace sovereign;
    using namespace sovereign::ml;
    using namespace sovereign::indicators;
    using namespace sovereign::features;

    const auto cache_path = std::filesystem::path(SOVEREIGN_REPO_ROOT)
        / "tests" / "fixtures" / "real_bars_btc.json";

    std::cout << "[ANTI-BULLSHIT] Loading real market data for tensor validation: " << cache_path << "\n";
    auto snapshot = loadMarketDataSnapshot(cache_path, "BTCUSDT", "1h");

    if (snapshot.bars.empty()) {
        std::cerr << "[TEST FAIL] Loaded 0 bars for BTCUSDT:1h from " << cache_path << "\n";
        return 1;
    }
    std::cout << "[ANTI-BULLSHIT] Successfully loaded " << snapshot.bars.size() << " real bars.\n";

    IndicatorFrame indicator_frame = IndicatorEngine::buildFrame(snapshot.bars);
    FeatureFrame feature_frame = buildTechnicalFeatureFrame(indicator_frame);

    size_t window_size = 60;
    CnnTensorBuilder builder(window_size);

    std::vector<std::string> feature_keys = {
        "rsi_14",
        "macd_norm",
        "close_vs_sma20",
        "atr_pct_14",
        "stoch_spread",
        "ema_gap_12_26"
    };

    CnnTensor tensor = builder.build(feature_frame, feature_keys);

    if (!expect(!tensor.empty(), "Tensor should not be empty")) return 1;

    std::cout << "Batch Size: " << tensor.batch_size() << "\n";
    std::cout << "Sequence Length: " << tensor.sequence_length() << "\n";
    std::cout << "Num Features: " << tensor.num_features() << "\n";
    std::cout << "Feature Ready Rows: " << feature_frame.ready_rows << "\n";

    if (!expect(tensor.batch_size() > 0, "Batch size should be positive")) return 1;
    if (!expect(tensor.sequence_length() == window_size, "Sequence length mismatch")) return 1;
    if (!expect(tensor.num_features() == feature_keys.size(), "Num features mismatch")) return 1;
    if (!expect(feature_frame.ready_rows >= window_size, "Expected enough ready feature rows for at least one window")) return 1;

    const size_t expected_data_size = tensor.batch_size() * window_size * feature_keys.size();
    if (!expect(tensor.data.size() == expected_data_size, "Data size mismatch")) return 1;

    std::cout << "cnn_tensor_builder_test passed with normalized technical features!\n";
    return 0;
}
