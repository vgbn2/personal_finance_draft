#include "stats_engine.hpp"
#include <span>

#include "calmar.hpp"
#include "sharpe.hpp"
#include "sortino.hpp"
#include "confidence.hpp"
#include <algorithm>
#include <cmath>
#include <limits>
#include <vector>

namespace sovereign {

namespace {

constexpr double kEpsilon = 1.0e-12;

bool isUsable(double value) {
    return std::isfinite(value);
}

bool allFinite(std::span<const double> values) {
    for (const double value : values) {
        if (!isUsable(value)) {
            return false;
        }
    }
    return true;
}

std::vector<double> equityReturns(std::span<const double> equity_curve) {
    std::vector<double> returns;
    if (equity_curve.size() < 2U) {
        return returns;
    }
    returns.reserve(equity_curve.size() - 1U);
    for (std::size_t i = 1; i < equity_curve.size(); ++i) {
        const double previous = equity_curve[i - 1U];
        if (std::fabs(previous) <= kEpsilon) {
            returns.push_back(0.0);
        } else {
            returns.push_back((equity_curve[i] / previous) - 1.0);
        }
    }
    return returns;
}

} // namespace

DrawdownMetrics calculateDrawdown(std::span<const double> equity_curve) {
    DrawdownMetrics metrics{};
    if (equity_curve.empty() || !allFinite(equity_curve)) {
        return metrics;
    }

    metrics.ok = true;
    double peak = equity_curve[0];
    std::size_t peak_index = 0;

    for (std::size_t i = 0; i < equity_curve.size(); ++i) {
        const double equity = equity_curve[i];
        if (equity > peak) {
            peak = equity;
            peak_index = i;
        }
        if (peak <= kEpsilon) {
            continue;
        }
        const double drawdown = (peak - equity) / peak;
        if (drawdown > metrics.max_drawdown) {
            metrics.max_drawdown = drawdown;
            metrics.peak_index = peak_index;
            metrics.trough_index = i;
            metrics.recovery_index = i;
            metrics.recovered = false;
        }
        if (!metrics.recovered && i > metrics.trough_index && equity >= equity_curve[metrics.peak_index]) {
            metrics.recovery_index = i;
            metrics.recovered = true;
        }
    }

    return metrics;
}

double meanReturn(std::span<const double> returns) {
    if (returns.empty() || !allFinite(returns)) {
        return 0.0;
    }
    double sum = 0.0;
    for (const double value : returns) {
        sum += value;
    }
    return sum / static_cast<double>(returns.size());
}

double sampleStdDev(std::span<const double> values) {
    if (values.size() < 2U || !allFinite(values)) {
        return 0.0;
    }
    const double mean = meanReturn(values);
    double sum_squared = 0.0;
    for (const double value : values) {
        const double delta = value - mean;
        sum_squared += delta * delta;
    }
    return std::sqrt(sum_squared / static_cast<double>(values.size() - 1U));
}

double annualizedSharpe(std::span<const double> returns, double risk_free_per_period, double periods_per_year) {
    if (returns.empty() || periods_per_year <= 0.0 || !allFinite(returns)) {
        return 0.0;
    }

    std::vector<double> excess;
    excess.reserve(returns.size());
    for (const double value : returns) {
        excess.push_back(value - risk_free_per_period);
    }

    const double deviation = sampleStdDev(excess);
    if (deviation <= kEpsilon) {
        return 0.0;
    }
    return (meanReturn(excess) / deviation) * std::sqrt(periods_per_year);
}

double downsideDeviation(std::span<const double> returns, double minimum_acceptable_return) {
    if (returns.empty() || !allFinite(returns)) {
        return 0.0;
    }

    double sum_squared = 0.0;
    for (const double value : returns) {
        const double downside = std::min(0.0, value - minimum_acceptable_return);
        sum_squared += downside * downside;
    }
    return std::sqrt(sum_squared / static_cast<double>(returns.size()));
}

double annualizedSortino(std::span<const double> returns, double minimum_acceptable_return, double periods_per_year) {
    if (returns.empty() || periods_per_year <= 0.0 || !allFinite(returns)) {
        return 0.0;
    }
    const double deviation = downsideDeviation(returns, minimum_acceptable_return);
    if (deviation <= kEpsilon) {
        return 0.0;
    }
    return ((meanReturn(returns) - minimum_acceptable_return) / deviation) * std::sqrt(periods_per_year);
}

double annualizedReturn(double start_equity, double end_equity, double periods, double periods_per_year) {
    if (start_equity <= 0.0 || end_equity <= 0.0 || periods <= 0.0 || periods_per_year <= 0.0) {
        return 0.0;
    }
    return std::pow(end_equity / start_equity, periods_per_year / periods) - 1.0;
}

double calmarRatio(double annualized_return, double max_drawdown) {
    if (max_drawdown <= kEpsilon) {
        return 0.0;
    }
    return annualized_return / max_drawdown;
}
// Confidence score based on weighted performance metrics
double confidenceScore(double annualized_sharpe, double annualized_sortino ,double annualized_returns, double calmar_ratio, double max_drawdown){
    return calculateConfidence(annualized_sharpe, annualized_sortino, annualized_returns, max_drawdown, calmar_ratio);
}

double calculateCovariance(std::span<const double> x, std::span<const double> y) {
    if (x.size() != y.size() || x.size() < 2U) {
        return 0.0;
    }
    const double mean_x = meanReturn(x);
    const double mean_y = meanReturn(y);
    double sum = 0.0;
    for (std::size_t i = 0; i < x.size(); ++i) {
        sum += (x[i] - mean_x) * (y[i] - mean_y);
    }
    return sum / static_cast<double>(x.size() - 1U);
}


PerformanceStats StatsEngine::summarize(
    std::span<const double> equity_curve,
    double risk_free_per_period,
    double periods_per_year,
    std::span<const double> benchmark_curve) {
    PerformanceStats stats{};
    stats.observations = equity_curve.size();
    if (equity_curve.size() < 2U || periods_per_year <= 0.0 || !allFinite(equity_curve) || equity_curve.front() <= 0.0) {
        return stats;
    }

    const std::vector<double> returns = equityReturns(equity_curve);
    stats.drawdown = calculateDrawdown(equity_curve);
    if (!stats.drawdown.ok) {
        return stats;
    }

    stats.ok = true;
    stats.cumulative_return = (equity_curve.back() / equity_curve.front()) - 1.0;
    stats.annualized_return = annualizedReturn(
        equity_curve.front(),
        equity_curve.back(),
        static_cast<double>(returns.size()),
        periods_per_year);
    stats.volatility = sampleStdDev(returns) * std::sqrt(periods_per_year);
    stats.sharpe = annualizedSharpe(returns, risk_free_per_period, periods_per_year);
    stats.sortino = annualizedSortino(returns, risk_free_per_period, periods_per_year);
    stats.max_drawdown = stats.drawdown.max_drawdown;
    stats.calmar = calmarRatio(stats.annualized_return, stats.max_drawdown);
    stats.confidence=confidenceScore(stats.sharpe,stats.sortino,stats.max_drawdown,stats.calmar,stats.annualized_return);

    // Skewness and Kurtosis
    const double mean_ret = meanReturn(returns);
    const double std_dev = sampleStdDev(returns);
    if (std_dev > kEpsilon && returns.size() > 2) {
        double sum_cube = 0.0;
        double sum_quad = 0.0;
        for (const double r : returns) {
            const double diff = r - mean_ret;
            sum_cube += diff * diff * diff;
            sum_quad += diff * diff * diff * diff;
        }
        double n = static_cast<double>(returns.size());
        // Sample skewness and kurtosis
        stats.skewness = (sum_cube / n) / std::pow(std_dev, 3.0);
        stats.kurtosis = (sum_quad / n) / std::pow(std_dev, 4.0);
    }

    // Probabilistic Sharpe
    if (returns.size() > 2) {
        double n = static_cast<double>(returns.size());
        double sr = stats.sharpe;
        double denom = 1.0 + 0.5 * sr * sr - stats.skewness * sr + ((stats.kurtosis - 3.0) / 4.0) * sr * sr;
        if (denom > 0.0) {
            stats.probabilistic_sharpe = (sr * std::sqrt(n - 1.0)) / std::sqrt(denom);
        }
    }

    // Kelly Criterion
    double win_sum = 0.0;
    double loss_sum = 0.0;
    int win_count = 0;
    int loss_count = 0;
    for (const double r : returns) {
        if (r > 0) {
            win_sum += r;
            win_count++;
        } else if (r < 0) {
            loss_sum += std::abs(r);
            loss_count++;
        }
    }
    double total_count = static_cast<double>(returns.size());
    if (win_count > 0 && loss_count > 0) {
        double win_prob = win_count / total_count;
        double loss_prob = loss_count / total_count;
        double avg_win = win_sum / win_count;
        double avg_loss = loss_sum / loss_count;
        if (avg_loss > kEpsilon) {
            double win_loss_ratio = avg_win / avg_loss;
            stats.kelly_criterion = ((win_loss_ratio * win_prob) - loss_prob) / win_loss_ratio;
        }
    } else if (loss_count == 0 && win_count > 0) {
        stats.kelly_criterion = 1.0; // All wins
    } else {
        stats.kelly_criterion = 0.0;
    }

    // Benchmark Relative Stats
    if (!benchmark_curve.empty() && benchmark_curve.size() == equity_curve.size()) {
        std::vector<double> bench_returns = equityReturns(benchmark_curve);
        
        // Beta and Alpha
        double bench_variance = std::pow(sampleStdDev(bench_returns), 2.0);
        if (bench_variance > kEpsilon) {
            double covariance = calculateCovariance(returns, bench_returns);
            stats.beta = covariance / bench_variance;
            
            double bench_ann_ret = annualizedReturn(
                benchmark_curve.front(),
                benchmark_curve.back(),
                static_cast<double>(bench_returns.size()),
                periods_per_year);
            stats.alpha = stats.annualized_return - stats.beta * bench_ann_ret;
        }

        // Information Ratio
        std::vector<double> active_returns;
        active_returns.reserve(returns.size());
        for (std::size_t i = 0; i < returns.size(); ++i) {
            active_returns.push_back(returns[i] - bench_returns[i]);
        }
        double active_std_dev = sampleStdDev(active_returns);
        if (active_std_dev > kEpsilon) {
            stats.information_ratio = meanReturn(active_returns) / active_std_dev;
        }
    }

    return stats;
}

} // namespace sovereign
