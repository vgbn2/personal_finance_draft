#pragma once

#include <cstddef>
#include <span>

namespace sovereign {

struct DrawdownMetrics {
    bool ok{false};
    double max_drawdown{0.0};
    std::size_t peak_index{0};
    std::size_t trough_index{0};
    std::size_t recovery_index{0};
    bool recovered{true};
};

DrawdownMetrics calculateDrawdown(std::span<const double> equity_curve);

} // namespace sovereign
