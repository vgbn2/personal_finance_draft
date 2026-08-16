#include "label_builder.hpp"
#include <span>
#include "lookahead_guard.hpp"

#include <cmath>
#include <utility>

namespace sovereign::features {

namespace {

bool isUsablePrice(double value) {
    return std::isfinite(value) && value > 0.0;
}

} // namespace

LabelBuildSummary buildLabelSummary(std::span<const sovereign::OhlcvBar> bars, const LabelBuilderConfig& config) {
    LabelBuildSummary summary;
    if (config.horizon_bars == 0U || bars.size() <= config.horizon_bars) {
        summary.rows_skipped = bars.size();
        return summary;
    }

    const auto guard = validateForwardWindow(bars, config.horizon_bars);
    if (!guard.ok) {
        summary.rows_skipped = bars.size();
        return summary;
    }

    summary.rows_considered = bars.size() - config.horizon_bars;
    summary.rows_labeled = summary.rows_considered;
    summary.rows_skipped = bars.size() - summary.rows_considered;
    return summary;
}

FeatureFrame buildLabelFrame(std::span<const sovereign::OhlcvBar> bars, const LabelBuilderConfig& config) {
    FeatureFrame frame;
    if (config.horizon_bars == 0U || bars.size() <= config.horizon_bars) {
        return frame;
    }

    const auto guard = validateForwardWindow(bars, config.horizon_bars);
    if (!guard.ok) {
        return frame;
    }

    frame.rows.reserve(bars.size() - config.horizon_bars);
    for (std::size_t i = 0; i + config.horizon_bars < bars.size(); ++i) {
        const auto& bar = bars[i];
        const auto& future_bar = bars[i + config.horizon_bars];
        if (!isUsablePrice(bar.close) || !isUsablePrice(future_bar.close)) {
            continue;
        }

        const double forward_return = future_bar.close / bar.close - 1.0;
        FeatureRow row;
        row.asset_id = bar.asset_id;
        row.timestamp = bar.timestamp;
        row.timeframe = bar.timeframe;
        row.set("label_horizon_bars", static_cast<double>(config.horizon_bars));
        row.set("forward_return", forward_return);
        row.set("forward_return_bps", forward_return * 10000.0);
        row.set("label_direction", forward_return > 0.0 ? 1.0 : (forward_return < 0.0 ? -1.0 : 0.0));
        row.set("label_regime", forward_return >= config.positive_threshold ? 1.0 : (forward_return <= config.negative_threshold ? -1.0 : 0.0));
        row.set("label_valid", 1.0);
        frame.rows.push_back(std::move(row));
        ++frame.ready_rows;
    }

    return frame;
}

} // namespace sovereign::features
