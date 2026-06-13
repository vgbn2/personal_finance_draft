#pragma once

#include "pearson.hpp"
#include "spearman.hpp"

#include <cstddef>
#include <span>
#include <string>
#include <vector>

namespace sovereign {

struct CorrelationPair {
    std::string lhs;
    std::string rhs;
    double value = 0.0;
};

struct CorrelationMatrix {
    std::vector<std::string> labels;
    std::vector<std::vector<double>> values;
};

struct CorrelationDivergence {
    std::string lhs;
    std::string rhs;
    double short_corr;
    double long_corr;
    double diff;
};

class CorrelationEngine {
public:
    static CorrelationMatrix buildMatrix(std::span<const std::string> labels, std::span<const std::vector<double>> series);
    static std::vector<CorrelationPair> pairwisePearson(std::span<const std::string> labels, std::span<const std::vector<double>> series);

    static std::vector<CorrelationDivergence> computeDivergence(
        std::span<const std::string> labels,
        std::span<const std::vector<double>> series,
        std::size_t short_window,
        double threshold = 0.3
    );
};

std::vector<double> logReturnSeries(std::span<const double> prices);

} // namespace sovereign
