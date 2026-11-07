#pragma once

#include <span>

namespace sovereign {

double spearmanCorrelation(std::span<const double> lhs, std::span<const double> rhs);

} // namespace sovereign
