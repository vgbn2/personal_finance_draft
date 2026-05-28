#include "multi_asset.hpp"

#include <algorithm>
#include <cmath>
#include <map>

namespace sovereign::portfolio {

ExposureReport analyzeExposure(const PortfolioState& state, const ExposureLimits& limits) {
    ExposureReport report;
    report.metrics = PnlCalculator::calculate(state);
    report.ok = report.metrics.ok;

    std::map<std::string, ExposureBucket> buckets;
    for (const auto& position : state.positions) {
        const double market_value = position.quantity * position.current_price;
        auto& bucket = buckets[position.symbol];
        bucket.symbol = position.symbol;
        bucket.net_exposure += market_value;
        bucket.gross_exposure += std::abs(market_value);
    }

    const double equity = std::max(report.metrics.total_equity, 0.0);
    report.buckets.reserve(buckets.size());
    for (auto& entry : buckets) {
        auto& bucket = entry.second;
        bucket.weight = equity > 0.0 ? bucket.gross_exposure / equity : 0.0;
        report.largest_single_name_weight = std::max(report.largest_single_name_weight, bucket.weight);
        report.buckets.push_back(bucket);
    }

    const double net_exposure_ratio = equity > 0.0 ? std::abs(report.metrics.net_exposure) / equity : 0.0;
    report.within_limits = report.ok &&
        report.metrics.total_exposure <= limits.max_gross_exposure &&
        report.largest_single_name_weight <= limits.max_single_name_weight &&
        net_exposure_ratio <= limits.max_net_exposure;
    return report;
}

} // namespace sovereign::portfolio
