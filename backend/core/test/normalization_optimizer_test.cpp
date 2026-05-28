#include "../src/ml/normalization.hpp"
#include "../src/portfolio/optimizer.hpp"

#include <cmath>
#include <iostream>
#include <vector>

namespace {

bool approxEqual(double lhs, double rhs, double tolerance = 0.000001) {
    return std::abs(lhs - rhs) <= tolerance;
}

bool expect(bool condition, const char* message) {
    if (!condition) {
        std::cerr << message << "\n";
    }
    return condition;
}

} // namespace

int main() {
    const std::vector<float> values{1.0f, 2.0f, 3.0f, 4.0f};
    const auto stats = sovereign::ml::summarizeNormalization(values);
    if (!expect(stats.ok, "Expected normalization stats to be valid")) return 1;
    const auto normalized = sovereign::ml::zScoreNormalize(values, stats);
    if (!expect(normalized.size() == values.size(), "Expected normalized size to match")) return 1;

    const auto weights = sovereign::portfolio::normalizeWeights({2.0, 1.0, 1.0});
    if (!expect(weights.size() == 3U, "Expected three normalized weights")) return 1;
    if (!expect(approxEqual(weights[0], 0.5), "Expected first normalized weight")) return 1;
    if (!expect(approxEqual(weights[1], 0.25), "Expected second normalized weight")) return 1;

    const double turnover = sovereign::portfolio::portfolioTurnover({0.50, 0.50}, {0.20, 0.80});
    if (!expect(approxEqual(turnover, 0.30), "Expected portfolio turnover")) return 1;

    std::cout << "normalization_optimizer_test passed!\n";
    return 0;
}
