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

class CorrelationEngine {
public:
    static CorrelationMatrix buildMatrix(std::span<const std::string> labels, std::span<const std::vector<double>> series);
    static std::vector<CorrelationPair> pairwisePearson(std::span<const std::string> labels, std::span<const std::vector<double>> series);
};

} // namespace sovereign
