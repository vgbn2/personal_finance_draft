#include "twap_vwap.hpp"
#include <span>

#include <algorithm>
#include <numeric>

namespace sovereign::execution {

std::vector<double> buildTwapSlices(double total_quantity, std::size_t slice_count) {
    std::vector<double> slices;
    if (slice_count == 0U) {
        return slices;
    }

    slices.assign(slice_count, total_quantity / static_cast<double>(slice_count));
    slices.back() = total_quantity - sumSlices(std::span<const double>(slices.data(), slices.size() - 1U));
    return slices;
}

std::vector<double> buildVwapSlices(double total_quantity, std::span<const double> volume_profile) {
    std::vector<double> slices;
    if (volume_profile.empty()) {
        return slices;
    }

    const double total_volume = std::accumulate(volume_profile.begin(), volume_profile.end(), 0.0);
    if (total_volume <= 0.0) {
        return buildTwapSlices(total_quantity, volume_profile.size());
    }

    slices.reserve(volume_profile.size());
    double allocated = 0.0;
    for (std::size_t i = 0; i < volume_profile.size(); ++i) {
        double slice = total_quantity * (volume_profile[i] / total_volume);
        if (i + 1U == volume_profile.size()) {
            slice = total_quantity - allocated;
        }
        allocated += slice;
        slices.push_back(slice);
    }
    return slices;
}

double sumSlices(std::span<const double> slices) {
    return std::accumulate(slices.begin(), slices.end(), 0.0);
}

} // namespace sovereign::execution
