#pragma once

#include "drawdown.hpp"
#include "../utils/constants.hpp"

#include <cstddef>
#include <span>

namespace sovereign {

struct PerformanceStats {
    bool ok{false};
    std::size_t observations{0};
    double cumulative_return{0.0};
    double annualized_return{0.0};
    double volatility{0.0};
    double sharpe{0.0};
    double sortino{0.0};
    double max_drawdown{0.0};
    double calmar{0.0};
    double confidence{0.0}; // Normalized confidence score (0.0 to 1.0)
    double skewness{0.0};
    double kurtosis{0.0};
    double probabilistic_sharpe{0.0};
    double information_ratio{0.0};
    double alpha{0.0};
    double beta{0.0};
    double kelly_criterion{0.0};
    DrawdownMetrics drawdown{};
};

class StatsEngine {
public:
    static PerformanceStats summarize(
        std::span<const double> equity_curve,
        double risk_free_per_period = constants::DEFAULT_RISK_FREE_RATE,
        double periods_per_year = constants::TRADING_DAYS_PER_YEAR,
        std::span<const double> benchmark_curve = {});
};

} // namespace sovereign
