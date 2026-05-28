#include "../src/correlation/correlation_engine.hpp"

#include <cmath>
#include <iostream>
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

int main() {//what is the purpose of these 4 vectors
    const std::vector<double> up{1.0, 2.0, 3.0, 4.0, 5.0};
    const std::vector<double> up2{2.0, 4.0, 6.0, 8.0, 10.0};
    const std::vector<double> down{5.0, 4.0, 3.0, 2.0, 1.0};
    const std::vector<double> flat{1.0, 1.0, 1.0, 1.0, 1.0};

    if (!expect(approxEqual(sovereign::pearsonCorrelation(up, up2), 1.0, 0.0000001), "Expected perfect positive pearson")) {
        return 1;
    }
    if (!expect(approxEqual(sovereign::pearsonCorrelation(up, down), -1.0, 0.0000001), "Expected perfect negative pearson")) {
        return 1;
    }
    if (!expect(approxEqual(sovereign::spearmanCorrelation(up, up2), 1.0, 0.0000001), "Expected perfect positive spearman")) {
        return 1;
    }
    if (!expect(approxEqual(sovereign::pearsonCorrelation(up, flat), 0.0, 0.0000001), "Expected zero correlation against flat series")) {
        return 1;
    }

    const std::vector<std::string> labels{"up", "up2", "down"};
    const std::vector<std::vector<double>> series{up, up2, down};
    const auto matrix = sovereign::CorrelationEngine::buildMatrix(labels, series);
    if (!expect(matrix.values.size() == 3U, "Expected 3x3 matrix")) {
        return 1;
    }
    if (!expect(approxEqual(matrix.values[0][1], 1.0, 0.0000001), "Expected matrix pair correlation")) {
        return 1;
    }
    if (!expect(approxEqual(matrix.values[0][2], -1.0, 0.0000001), "Expected matrix negative correlation")) {
        return 1;
    }

    return 0;
}
