#pragma once

#include <cstddef>
#include <span>
#include <vector>

namespace sovereign::execution {

std::vector<double> buildTwapSlices(double total_quantity, std::size_t slice_count);
std::vector<double> buildVwapSlices(double total_quantity, std::span<const double> volume_profile);
double sumSlices(std::span<const double> slices);

} // namespace sovereign::execution
