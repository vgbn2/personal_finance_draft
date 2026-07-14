#include <filesystem>
#include <iostream>
#include <vector>
#include <stdexcept>
#include "data/ohlcv_bar.hpp"
#include "data/data_snapshot.hpp"
#include "ml/kronos_tokenizer.hpp"
#include "ml/kronos_tensor_builder.hpp"
#include "ml/onnx_model.hpp"

using namespace sovereign;
using namespace sovereign::ml;

namespace {

std::filesystem::path locateRepoRoot() {
#ifdef SOVEREIGN_REPO_ROOT
    const std::filesystem::path macro_root(SOVEREIGN_REPO_ROOT);
    if (std::filesystem::exists(macro_root / "storage" / "data" / "cache" / "last_fetch.json")) {
        return macro_root;
    }
#endif
    const std::filesystem::path candidates[] = {
        std::filesystem::current_path(),
        std::filesystem::current_path().parent_path(),
        std::filesystem::current_path().parent_path().parent_path(),
        std::filesystem::current_path().parent_path().parent_path().parent_path(),
    };
    for (const auto& candidate : candidates) {
        if (std::filesystem::exists(candidate / "storage" / "data" / "cache" / "last_fetch.json")) {
            return candidate;
        }
    }
    return std::filesystem::current_path();
}

} // namespace

int main() {
    try {
        KronosTokenizer tokenizer;
        KronosTensorBuilder tensor_builder(3); // Small window for testing

        // Load empirical data from the crypto partition (BTCUSDT 1d bars)
        const auto repo_root = locateRepoRoot();
        const auto data_path = repo_root / "storage" / "data" / "cache" / "last_fetch.json";
        auto snapshot = loadMarketDataSnapshot(data_path, "BTCUSDT", "1d", 5);
        if (snapshot.bars.size() < 4) {
            throw std::runtime_error("Not enough empirical data points for Kronos test (need at least 4)");
        }
        
        auto tokens = tokenizer.tokenize(snapshot.bars);
        if (tokens.size() != snapshot.bars.size()) {
            throw std::runtime_error("Expected tokens size to match bars size");
        }

        std::cout << "[DATA FLOW] Tokens: [";
        for(size_t i=0; i<tokens.size(); ++i) std::cout << tokens[i] << (i==tokens.size()-1 ? "" : ", ");
        std::cout << "]" << std::endl;

        auto windows = tensor_builder.build_windows(tokens);
        if (windows.size() != snapshot.bars.size() - 2) {
            throw std::runtime_error("Expected windows size to be tokens.size() - 2");
        }

        // Use the committed smoke model (row-mean over int64 window tokens).
        // A dedicated kronos_base.onnx would be loaded here once trained and committed.
        const std::string model_path = (repo_root / "storage" / "models" / "smoke.onnx").string();
        OnnxModel model(model_path);
        auto flat_input = tensor_builder.flatten(windows);
        
        auto result = model.predict(flat_input, windows.size(), 3);
        if (result.probabilities.empty()) {
             throw std::runtime_error("Prediction failed");
        }
        if (result.backend != model.backend()) {
             throw std::runtime_error("Prediction backend metadata does not match model backend");
        }

        std::cout << "[DATA FLOW] Final Prediction Class: " << result.predicted_class << std::endl;
        std::cout << "[DATA FLOW] Inference Backend: " << result.backend << std::endl;
        std::cout << "kronos_integration_test passed using empirical data!" << std::endl;
    } catch (const std::exception& e) {
        std::cerr << "Test failed: " << e.what() << std::endl;
        return 1;
    }
    return 0;
}
