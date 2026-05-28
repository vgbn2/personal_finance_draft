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

int main() {
    try {
        KronosTokenizer tokenizer;
        KronosTensorBuilder tensor_builder(3); // Small window for testing
        
        // Load empirical data instead of dummy values
        auto snapshot = loadMarketDataSnapshot("data/cache/backtest_history.json", "BTCUSDT", "1d", 5);
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

        OnnxModel model("models/kronos_base.onnx");
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
