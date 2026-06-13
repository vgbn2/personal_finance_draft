#include "correlation_engine.hpp"

#include <algorithm>
#include <cmath>
#include <numeric>
#include <stdexcept>

namespace sovereign {

namespace {
//really questioning the logic of this
std::vector<double> rankValues(std::span<const double> values) {
    std::vector<std::pair<double, std::size_t>> ranked;
    ranked.reserve(values.size());
    for (std::size_t i = 0; i < values.size(); ++i) {
        ranked.emplace_back(values[i], i);
    }
    std::sort(ranked.begin(), ranked.end(), [](const auto& a, const auto& b) {
        if (a.first == b.first) return a.second < b.second;
        return a.first < b.first;
    });

    std::vector<double> ranks(values.size(), 0.0);
    std::size_t i = 0;
    while (i < ranked.size()) {
        std::size_t j = i + 1;
        while (j < ranked.size() && ranked[j].first == ranked[i].first) {
            ++j;
        }
        const double avg_rank = (static_cast<double>(i + 1) + static_cast<double>(j)) / 2.0;
        for (std::size_t k = i; k < j; ++k) {
            ranks[ranked[k].second] = avg_rank;
        }
        i = j;
    }
    return ranks;
}

} // namespace

CorrelationMatrix CorrelationEngine::buildMatrix(std::span<const std::string> labels, std::span<const std::vector<double>> series) {
    if (labels.size() != series.size()) {
        throw std::invalid_argument("labels and series must have the same length");
    }

    CorrelationMatrix matrix;
    matrix.labels.assign(labels.begin(), labels.end());
    matrix.values.resize(series.size(), std::vector<double>(series.size(), 0.0));
    for (std::size_t i = 0; i < series.size(); ++i) {
        matrix.values[i][i] = 1.0;
        for (std::size_t j = i + 1; j < series.size(); ++j) {
            const double corr = pearsonCorrelation(series[i], series[j]);
            matrix.values[i][j] = corr;
            matrix.values[j][i] = corr;
        }
    }
    return matrix;
}

std::vector<CorrelationPair> CorrelationEngine::pairwisePearson(std::span<const std::string> labels, std::span<const std::vector<double>> series) {
    if (labels.size() != series.size()) {
        throw std::invalid_argument("labels and series must have the same length");
    }

    std::vector<CorrelationPair> pairs;
    for (std::size_t i = 0; i < series.size(); ++i) {
        for (std::size_t j = i + 1; j < series.size(); ++j) {
            pairs.push_back(CorrelationPair{labels[i], labels[j], pearsonCorrelation(series[i], series[j])});
        }
    }
    return pairs;
}

std::vector<CorrelationDivergence> CorrelationEngine::computeDivergence(
    std::span<const std::string> labels,
    std::span<const std::vector<double>> series,
    std::size_t short_window,
    double threshold
) {
    if (labels.size() != series.size()) {
        throw std::invalid_argument("labels and series must have the same length");
    }

    std::vector<CorrelationDivergence> results;
    if (series.empty()) return results;

    const std::size_t n = labels.size();
    for (std::size_t i = 0; i < n; ++i) {
        for (std::size_t j = i + 1; j < n; ++j) {
            const auto& s1 = series[i];
            const auto& s2 = series[j];

            if (s1.size() < short_window || s2.size() < short_window) {
                continue;
            }

            // Calculate long correlation (full series)
            const double long_corr = pearsonCorrelation(s1, s2);

            // Calculate short correlation (last short_window elements)
            std::span<const double> s1_short(s1.data() + (s1.size() - short_window), short_window);
            std::span<const double> s2_short(s2.data() + (s2.size() - short_window), short_window);
            const double short_corr = pearsonCorrelation(s1_short, s2_short);

            const double diff = std::abs(short_corr - long_corr);
            if (diff > threshold) {
                results.push_back({labels[i], labels[j], short_corr, long_corr, diff});
            }
        }
    }

    return results;
}

double pearsonCorrelation(std::span<const double> lhs, std::span<const double> rhs) {
    if (lhs.size() != rhs.size() || lhs.size() < 2U) {
        return 0.0;
    }

    const double lhs_mean = std::accumulate(lhs.begin(), lhs.end(), 0.0) / static_cast<double>(lhs.size());
    const double rhs_mean = std::accumulate(rhs.begin(), rhs.end(), 0.0) / static_cast<double>(rhs.size());

    double cov = 0.0;
    double lhs_var = 0.0;
    double rhs_var = 0.0;
    for (std::size_t i = 0; i < lhs.size(); ++i) {
        const double dx = lhs[i] - lhs_mean;
        const double dy = rhs[i] - rhs_mean;
        cov += dx * dy;
        lhs_var += dx * dx;
        rhs_var += dy * dy;
    }

    if (lhs_var <= 0.0 || rhs_var <= 0.0) {
        return 0.0;
    }

    return cov / std::sqrt(lhs_var * rhs_var);
}

double spearmanCorrelation(std::span<const double> lhs, std::span<const double> rhs) {
    if (lhs.size() != rhs.size() || lhs.size() < 2U) {
        return 0.0;
    }
    const auto lhs_rank = rankValues(lhs);
    const auto rhs_rank = rankValues(rhs);
    return pearsonCorrelation(lhs_rank, rhs_rank);
}

std::vector<double> logReturnSeries(std::span<const double> prices) {
    std::vector<double> returns;
    if (prices.size() < 2U) {
        return returns;
    }

    returns.reserve(prices.size() - 1U);
    for (std::size_t i = 1; i < prices.size(); ++i) {
        const double previous = prices[i - 1U];
        const double current = prices[i];
        if (previous <= 0.0 || current <= 0.0) {
            continue;
        }
        returns.push_back(std::log(current / previous));
    }
    return returns;
}

} // namespace sovereign
