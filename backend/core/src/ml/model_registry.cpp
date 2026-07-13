#include "ml/model_registry.hpp"

#include <algorithm>
#include <cmath>
#include <map>
#include <numeric>
#include <set>

namespace sovereign::ml {
namespace {

double clamp(double value, double min_value, double max_value) {
    return std::max(min_value, std::min(max_value, value));
}

double valueOrZero(const features::FeatureRow& row, const std::string& key) {
    const auto value = row.get(key);
    return value ? *value : 0.0;
}

double logistic(double value) {
    return 1.0 / (1.0 + std::exp(-value));
}

double mean(const std::vector<double>& values) {
    if (values.empty()) return 0.0;
    return std::accumulate(values.begin(), values.end(), 0.0) / static_cast<double>(values.size());
}

double sampleStdDev(const std::vector<double>& values) {
    if (values.size() < 2) return 0.0;
    const double avg = mean(values);
    double sum = 0.0;
    for (const double value : values) {
        sum += (value - avg) * (value - avg);
    }
    return std::sqrt(sum / static_cast<double>(values.size() - 1));
}

struct SignalParts {
    double atr_pct = 0.0;
    double breakout = 0.0;
    double macd_norm = 0.0;
    double mean_reversion = 0.0;
    double return_1 = 0.0;
    double return_5 = 0.0;
    double risk_penalty = 0.0;
    double rsi = 0.0;
    double trend = 0.0;
    double volatility = 0.0;
};
SignalParts signalParts(const features::FeatureRow& row) {
    const double close = std::max(valueOrZero(row, "close"), 1.0);
    SignalParts parts;
    parts.return_1 = valueOrZero(row, "close_return_1");
    parts.return_5 = valueOrZero(row, "close_return_5");
    parts.volatility = valueOrZero(row, "realized_volatility_20");
    parts.rsi = valueOrZero(row, "rsi_14");
    parts.macd_norm = valueOrZero(row, "macd") / close;
    parts.atr_pct = valueOrZero(row, "atr_14") / close;
    parts.trend = parts.return_5 * 8.0 + parts.macd_norm * 20.0;
    parts.mean_reversion = (50.0 - parts.rsi) / 100.0;
    parts.breakout = parts.return_1 * 6.0 - parts.volatility;
    parts.risk_penalty = parts.volatility * 2.0 + parts.atr_pct;
    return parts;
}

ModelPrediction predictionFromScore(double score, double confidence_scale = 1.0) {
    return {
        score > 0.0 ? "long" : "flat",
        clamp(0.5 + std::abs(score) * confidence_scale, 0.0, 1.0),
        score,
    };
}

AssetModelScore summarizeAsset(
    const std::string& model_name,
    const std::string& family,
    const std::string& asset_id,
    const std::vector<double>& returns) {
    const double avg = mean(returns);
    const double deviation = sampleStdDev(returns);
    const std::size_t wins = static_cast<std::size_t>(std::count_if(
        returns.begin(),
        returns.end(),
        [](double value) { return value > 0.0; }));
    double total_return = 1.0;
    for (const double value : returns) {
        total_return *= (1.0 + value);
    }
    return {
        model_name,
        family,
        asset_id,
        returns.size(),
        total_return - 1.0,
        returns.empty() ? 0.0 : static_cast<double>(wins) / static_cast<double>(returns.size()),
        avg,
        deviation > 0.0 ? avg / deviation : 0.0,
    };
}

ModelScore summarizeModel(
    const ModelCandidate& candidate,
    const std::map<std::string, std::vector<double>>& returns_by_asset) {
    std::vector<double> all_returns;
    ModelScore score;
    score.name = candidate.name;
    score.family = candidate.family;
    score.status = candidate.status;
    score.description = candidate.description;

    for (const auto& [asset_id, returns] : returns_by_asset) {
        score.by_asset.push_back(summarizeAsset(candidate.name, candidate.family, asset_id, returns));
        all_returns.insert(all_returns.end(), returns.begin(), returns.end());
    }
    std::sort(score.by_asset.begin(), score.by_asset.end(), [](const auto& lhs, const auto& rhs) {
        if (lhs.sharpe_like != rhs.sharpe_like) return lhs.sharpe_like > rhs.sharpe_like;
        return lhs.total_return > rhs.total_return;
    });

    const auto overall = summarizeAsset(candidate.name, candidate.family, "ALL", all_returns);
    score.trades = overall.trades;
    score.total_return = overall.total_return;
    score.hit_rate = overall.hit_rate;
    score.expectancy = overall.expectancy;
    score.sharpe_like = overall.sharpe_like;
    score.robustness_score = score.sharpe_like + score.expectancy * 10.0 +
        std::min<std::size_t>(score.trades, 25U) / 100.0;
    return score;
}

} // namespace

const std::vector<ModelCandidate>& defaultModelRegistry() {
    static const std::vector<ModelCandidate> registry = {
        {"cnn_window_v0", "neural", "handcrafted_heuristic", "convolution-style scorer over latest technical features"},
        {"xgboost_ranker_v0", "boosting", "handcrafted_heuristic", "XGBoost-style boosted-tree ranker adapter"},
        {"gradient_boosted_trees_v0", "boosting", "handcrafted_heuristic", "gradient-boosted tree ensemble adapter"},
        {"random_forest_v0", "trees", "handcrafted_heuristic", "random-forest style majority vote adapter"},
        {"decision_tree_stump_v0", "trees", "handcrafted_heuristic", "single decision tree stump sanity-check adapter"},
        {"logistic_regression_v0", "linear", "handcrafted_heuristic", "logistic linear margin adapter"},
        {"svm_margin_v0", "linear", "handcrafted_heuristic", "support-vector style margin adapter"},
        {"knn_pattern_v0", "instance_based", "handcrafted_heuristic", "nearest-neighbor style pattern adapter"},
        {"naive_bayes_regime_v0", "probabilistic", "handcrafted_heuristic", "naive-Bayes style regime adapter"},
        {"lstm_sequence_v0", "neural", "handcrafted_heuristic", "sequence-model momentum adapter"},
        {"transformer_attention_v0", "neural", "handcrafted_heuristic", "attention-style context adapter"},
        {"momentum_baseline_v0", "baseline", "handcrafted_heuristic", "positive five-period return baseline"},
        {"mean_reversion_baseline_v0", "baseline", "handcrafted_heuristic", "RSI washout mean-reversion baseline"},
        {"volatility_breakout_v0", "baseline", "handcrafted_heuristic", "trend and volatility breakout baseline"},
    };
    return registry;
}

std::optional<ModelCandidate> findModelCandidate(const std::string& name) {
    const auto& registry = defaultModelRegistry();
    const auto it = std::find_if(registry.begin(), registry.end(), [&](const auto& candidate) {
        return candidate.name == name;
    });
    if (it == registry.end()) return std::nullopt;
    return *it;
}

ModelPrediction predictModel(const ModelCandidate& candidate, const features::FeatureRow& row) {
    const auto parts = signalParts(row);

    if (candidate.name == "xgboost_ranker_v0") {
        const double score = (parts.return_5 > 0.0 ? 0.08 : -0.03) +
            (parts.rsi < 45.0 ? 0.05 : 0.0) +
            (parts.macd_norm > 0.0 ? 0.04 : -0.02) -
            parts.volatility * 1.2 +
            parts.return_1 * parts.return_5 * 20.0;
        return predictionFromScore(score, 2.0);
    }
    if (candidate.name == "gradient_boosted_trees_v0") {
        const double score = (parts.trend > 0.0 ? 0.07 : -0.04) +
            (parts.rsi >= 45.0 && parts.rsi <= 65.0 ? 0.04 : -0.02) +
            (parts.volatility < 0.025 ? 0.03 : -0.04) -
            parts.atr_pct;
        return predictionFromScore(score, 2.0);
    }
    if (candidate.name == "random_forest_v0") {
        const std::vector<bool> votes{
            parts.return_5 > 0.0,
            parts.return_1 > 0.0,
            parts.macd_norm > 0.0,
            parts.rsi < 70.0,
            parts.volatility < 0.035,
        };
        const auto long_votes = std::count(votes.begin(), votes.end(), true);
        const double score = (static_cast<double>(long_votes) - static_cast<double>(votes.size()) / 2.0) /
            static_cast<double>(votes.size());
        return predictionFromScore(score, 1.5);
    }
    if (candidate.name == "decision_tree_stump_v0") {
        return predictionFromScore(parts.return_5 > 0.0 && parts.rsi < 68.0 ? 0.12 : -0.08, 1.5);
    }
    if (candidate.name == "logistic_regression_v0") {
        const double margin = parts.return_5 * 18.0 + parts.return_1 * 4.0 +
            parts.macd_norm * 30.0 - parts.volatility * 5.0 +
            (50.0 - std::abs(parts.rsi - 55.0)) / 150.0;
        const double probability = logistic(margin);
        return {probability >= 0.55 ? "long" : "flat", probability, margin};
    }
    if (candidate.name == "svm_margin_v0") {
        return predictionFromScore(parts.trend * 1.4 - parts.volatility * 3.0 +
            (parts.rsi < 72.0 ? 0.04 : -0.08), 1.4);
    }
    if (candidate.name == "knn_pattern_v0") {
        const bool calm_trend = parts.return_5 > 0.0 && parts.volatility < 0.03;
        const bool oversold_bounce = parts.rsi < 42.0 && parts.return_1 > -0.015;
        return predictionFromScore((calm_trend ? 0.09 : -0.02) + (oversold_bounce ? 0.07 : 0.0) - parts.atr_pct, 1.7);
    }
    if (candidate.name == "naive_bayes_regime_v0") {
        const double trend_likelihood = parts.return_5 > 0.0 ? 0.62 : 0.42;
        const double rsi_likelihood = parts.rsi < 65.0 ? 0.58 : 0.35;
        const double vol_likelihood = parts.volatility < 0.035 ? 0.60 : 0.40;
        const double long_prob = trend_likelihood * rsi_likelihood * vol_likelihood;
        const double flat_prob = (1.0 - trend_likelihood) * (1.0 - rsi_likelihood) * (1.0 - vol_likelihood);
        const double probability = long_prob / std::max(long_prob + flat_prob, 0.000001);
        return {probability >= 0.55 ? "long" : "flat", clamp(probability, 0.0, 1.0), probability - 0.5};
    }
    if (candidate.name == "lstm_sequence_v0") {
        const double persistence = std::signbit(parts.return_1) == std::signbit(parts.return_5)
            ? std::abs(parts.return_5)
            : -std::abs(parts.return_1);
        return predictionFromScore(persistence * 10.0 + parts.macd_norm * 20.0 - parts.volatility, 1.2);
    }
    if (candidate.name == "transformer_attention_v0") {
        const double trend_weight = parts.volatility < 0.025 ? 0.65 : 0.35;
        const double reversion_weight = 1.0 - trend_weight;
        return predictionFromScore(parts.trend * trend_weight + parts.mean_reversion * reversion_weight -
            parts.risk_penalty * 0.5, 1.2);
    }
    if (candidate.name == "momentum_baseline_v0") {
        return predictionFromScore(parts.return_5, 10.0);
    }
    if (candidate.name == "mean_reversion_baseline_v0") {
        const double score = (50.0 - parts.rsi) / 100.0;
        return {parts.rsi < 45.0 ? "long" : "flat", clamp(0.5 + std::abs(score), 0.0, 1.0), score};
    }
    if (candidate.name == "volatility_breakout_v0") {
        return predictionFromScore(parts.breakout, 1.0);
    }

    return predictionFromScore(parts.trend + parts.mean_reversion * 0.25 - parts.risk_penalty, 1.0);
}

ModelComparisonReport compareModelCandidates(
    const features::FeatureFrame& frame,
    std::size_t horizon,
    double threshold) {
    ModelComparisonReport report;
    report.feature_count = frame.rows.size();
    report.horizon = horizon;
    report.threshold = threshold;
    const auto& registry = defaultModelRegistry();
    report.candidate_count = registry.size();

    std::map<std::string, std::vector<features::FeatureRow>> rows_by_asset;
    for (const auto& row : frame.rows) {
        rows_by_asset[row.asset_id].push_back(row);
    }
    for (auto& [_, rows] : rows_by_asset) {
        std::sort(rows.begin(), rows.end(), [](const auto& lhs, const auto& rhs) {
            return lhs.timestamp < rhs.timestamp;
        });
    }

    std::set<std::string> families;
    for (const auto& candidate : registry) {
        families.insert(candidate.family);
        std::map<std::string, std::vector<double>> returns_by_asset;
        for (const auto& [asset_id, rows] : rows_by_asset) {
            if (rows.size() <= horizon) continue;
            for (std::size_t i = 0; i + horizon < rows.size(); ++i) {
                const auto prediction = predictModel(candidate, rows[i]);
                if (prediction.direction != "long" || prediction.confidence < threshold) continue;
                const auto entry = rows[i].get("close");
                const auto exit = rows[i + horizon].get("close");
                if (!entry || !exit || *entry <= 0.0 || *exit <= 0.0) continue;
                returns_by_asset[asset_id].push_back((*exit / *entry) - 1.0);
            }
        }
        report.models.push_back(summarizeModel(candidate, returns_by_asset));
    }

    std::sort(report.models.begin(), report.models.end(), [](const auto& lhs, const auto& rhs) {
        if (lhs.robustness_score != rhs.robustness_score) return lhs.robustness_score > rhs.robustness_score;
        if (lhs.sharpe_like != rhs.sharpe_like) return lhs.sharpe_like > rhs.sharpe_like;
        return lhs.total_return > rhs.total_return;
    });
    report.winner = report.models.empty() ? "" : report.models.front().name;
    report.families.assign(families.begin(), families.end());

    std::set<std::string> assets;
    for (const auto& model : report.models) {
        for (const auto& asset_score : model.by_asset) {
            assets.insert(asset_score.asset_id);
        }
    }
    for (const auto& asset_id : assets) {
        AssetModelWinner winner;
        winner.asset_id = asset_id;
        for (const auto& model : report.models) {
            const auto it = std::find_if(model.by_asset.begin(), model.by_asset.end(), [&](const auto& score) {
                return score.asset_id == asset_id;
            });
            if (it != model.by_asset.end()) {
                winner.candidates.push_back(*it);
            }
        }
        std::sort(winner.candidates.begin(), winner.candidates.end(), [](const auto& lhs, const auto& rhs) {
            if (lhs.sharpe_like != rhs.sharpe_like) return lhs.sharpe_like > rhs.sharpe_like;
            return lhs.total_return > rhs.total_return;
        });
        winner.winner = winner.candidates.empty() ? "" : winner.candidates.front().model_name;
        report.per_asset_winners.push_back(winner);
    }

    return report;
}

} // namespace sovereign::ml
