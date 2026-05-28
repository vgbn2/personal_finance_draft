#pragma once

#include <span>

namespace sovereign {

double pearsonCorrelation(std::span<const double> lhs, std::span<const double> rhs);

} // namespace sovereign
