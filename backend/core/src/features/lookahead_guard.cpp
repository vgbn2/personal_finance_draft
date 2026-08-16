#include "lookahead_guard.hpp"
#include <span>

#include <cmath>
#include <string>

namespace sovereign::features {

namespace {

bool isUsableBar(const sovereign::OhlcvBar& bar) {
    return !bar.asset_id.empty() &&
           !bar.timestamp.empty() &&
           !bar.timeframe.empty() &&
           std::isfinite(bar.open) &&
           std::isfinite(bar.high) &&
           std::isfinite(bar.low) &&
           std::isfinite(bar.close) &&
           bar.open > 0.0 &&
           bar.high > 0.0 &&
           bar.low > 0.0 &&
           bar.close > 0.0 &&
           bar.low <= bar.open &&
           bar.low <= bar.close &&
           bar.open <= bar.high &&
           bar.close <= bar.high;
}

} // namespace

bool hasCompleteForwardWindow(std::span<const sovereign::OhlcvBar> bars, std::size_t index, std::size_t horizon_bars) {
    if (horizon_bars == 0U || index >= bars.size() || index + horizon_bars >= bars.size()) {
        return false;
    }
    return isUsableBar(bars[index]) && isUsableBar(bars[index + horizon_bars]);
}

LookaheadGuardReport validateForwardWindow(std::span<const sovereign::OhlcvBar> bars, std::size_t horizon_bars) {
    LookaheadGuardReport report;
    report.horizon_bars = horizon_bars;

    if (bars.empty() || horizon_bars == 0U || bars.size() <= horizon_bars) {
        report.ok = false;
        report.rejected_rows = bars.size();
        return report;
    }

    const auto& first_bar = bars.front();
    std::string previous_timestamp;
    std::size_t invalid_rows = 0U;
    for (std::size_t i = 0; i < bars.size(); ++i) {
        const auto& bar = bars[i];
        ++report.checked_rows;

        if (bar.asset_id != first_bar.asset_id || bar.timeframe != first_bar.timeframe || !isUsableBar(bar)) {
            ++invalid_rows;
            continue;
        }

        if (!previous_timestamp.empty() && bar.timestamp < previous_timestamp) {
            ++invalid_rows;
            continue;
        }
        previous_timestamp = bar.timestamp;
    }

    report.rejected_rows = invalid_rows;
    report.ok = invalid_rows == 0U;

    return report;
}

} // namespace sovereign::features
