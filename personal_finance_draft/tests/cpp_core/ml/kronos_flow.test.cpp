#include "../../cpp_core/src/ml/kronos_tokenizer.hpp"
#include "../../cpp_core/src/ml/kronos_tensor_builder.hpp"
#include "../../cpp_core/src/data/data_snapshot.hpp"
#include <cassert>
#include <iostream>
#include <vector>
#include <filesystem>

/**
 * TEST: KRONOS ML DATA FLOW (REAL FIXTURE)
 * 
 * Validates the token-to-tensor pipeline using a real market fixture
 * (100 bars of BTCUSDT from Binance). This ensures quantization handles
 * real-world volatility and price ranges.
 */
int main() {
    using namespace sovereign::ml;
    using namespace sovereign;

    const std::string fixture_path = "test/fixtures/real_bars_btc.json";
    if (!std::filesystem::exists(fixture_path)) {
        std::cerr << "[ERROR] Fixture not found: " << fixture_path << std::endl;
        return 1;
    }

    // 1. Load real bars using the platform's production parser
    std::cout << "[TEST] Loading real bars from: " << fixture_path << std::endl;
    auto snapshot = loadMarketDataSnapshot(fixture_path, "BTCUSDT", "1h");
    
    if (snapshot.bars.empty()) {
        std::cerr << "[ERROR] Failed to parse bars from fixture. Quality issues: " << snapshot.quality.rejected_records.size() << std::endl;
        return 1;
    }

    std::cout << "[TEST] Loaded " << snapshot.bars.size() << " real bars." << std::endl;

    // 2. Tokenize
    KronosTokenizer tokenizer;
    auto tokens = tokenizer.tokenize(snapshot.bars);
    
    std::cout << "[TEST] Token count: " << tokens.size() << std::endl;
    assert(tokens.size() == snapshot.bars.size());
    
    // Verify distribution (ensure quantization capture real noise)
    bool has_variance = false;
    for (size_t i = 1; i < tokens.size(); ++i) {
        if (tokens[i] != tokens[0]) has_variance = true;
    }
    assert(has_variance && "Tokens must reflect real Binance price variance");

    // 3. Build Tensors (Window size 20)
    KronosTensorBuilder builder(20);
    auto windows = builder.build_windows(tokens);

    std::cout << "[TEST] Tensor window count: " << windows.size() << std::endl;
    assert(windows.size() == (tokens.size() - 20 + 1));
    assert(windows[0].size() == 20);

    std::cout << "[TEST] Kronos Data Flow (Real Fixture): SUCCESS" << std::endl;
    return 0;
}
