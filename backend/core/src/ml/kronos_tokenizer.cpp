#include "ml/kronos_tokenizer.hpp"
#include <cmath>
#include <algorithm>
#include <iostream>

namespace sovereign {
namespace ml {

namespace {
constexpr double KRONOS_SCALE_FACTOR = 1000.0;
constexpr double KRONOS_OFFSET = 50.0;
constexpr int KRONOS_MAX_BIN = 99;
constexpr int KRONOS_MID_BIN = 50;
}

std::vector<int> KronosTokenizer::tokenize(const std::vector<OhlcvBar>& bars) {
    std::vector<int> tokens;
    tokens.reserve(bars.size());

    for (const auto& bar : bars) {
        if (bar.open <= 0.0) {
            tokens.push_back(KRONOS_MID_BIN); // Default middle bin for invalid data
            continue;
        }
        
        double log_return = std::log(bar.close / bar.open);
        
        // Map log return to bins. 
        int bin = static_cast<int>(std::round(log_return * KRONOS_SCALE_FACTOR + KRONOS_OFFSET));
        
        // Clamp to range
        bin = std::clamp(bin, 0, KRONOS_MAX_BIN);
        tokens.push_back(bin);
    }

    // [VISIBILITY] Empirical Data Flow Validation
    if (!tokens.empty()) {
        std::cout << "[VISIBILITY] KronosTokenizer: Tokenized " << tokens.size() << " bars.\n";
        std::cout << "[VISIBILITY] Sample Tokens (First 3): ";
        for (size_t i = 0; i < std::min(tokens.size(), size_t(3)); ++i) {
            std::cout << tokens[i] << (i == std::min(tokens.size(), size_t(3)) - 1 ? "" : ", ");
        }
        std::cout << "\n[VISIBILITY] Sample Tokens (Last 3): ";
        for (size_t i = std::max(size_t(0), tokens.size() - 3); i < tokens.size(); ++i) {
            std::cout << tokens[i] << (i == tokens.size() - 1 ? "" : ", ");
        }
        std::cout << std::endl;
    }

    return tokens;
}

} // namespace ml
} // namespace sovereign
