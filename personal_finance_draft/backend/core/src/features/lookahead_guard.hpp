#pragma once

#include "../data/ohlcv_bar.hpp"

#include <cstddef>
#include <span>

namespace sovereign::features {

struct LookaheadGuardReport {
    bool ok = true;
    std::size_t checked_rows = 0;
    std::size_t rejected_rows = 0;
    std::size_t horizon_bars = 0;
};

bool hasCompleteForwardWindow(std::span<const sovereign::OhlcvBar> bars, std::size_t index, std::size_t horizon_bars);
LookaheadGuardReport validateForwardWindow(std::span<const sovereign::OhlcvBar> bars, std::size_t horizon_bars);

} // namespace sovereign::features
