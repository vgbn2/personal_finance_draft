#include "strategy_sweep_evaluator.hpp"
#include "indicators/indicator_engine.hpp"
#include "stats/stats_engine.hpp"

#include <algorithm>
#include <cmath>

namespace sovereign::strategies {

std::string archetypeToString(StrategyArchetype archetype) {
    switch (archetype) {
    case StrategyArchetype::MomentumTrend: return "MomentumTrend";
    case StrategyArchetype::MeanReversion: return "MeanReversion";
    case StrategyArchetype::BreakoutVolatility: return "BreakoutVolatility";
    case StrategyArchetype::HybridRegime: return "HybridRegime";
    }
    return "MomentumTrend";
}

StrategyArchetype stringToArchetype(const std::string& str) {
    if (str == "MeanReversion") return StrategyArchetype::MeanReversion;
    if (str == "BreakoutVolatility") return StrategyArchetype::BreakoutVolatility;
    if (str == "HybridRegime") return StrategyArchetype::HybridRegime;
    return StrategyArchetype::MomentumTrend;
}

double StrategySweepEvaluator::periodsPerYear(const std::string& timeframe) {
    if (timeframe == "1m") return 365.0 * 24.0 * 60.0;
    if (timeframe == "5m") return 365.0 * 24.0 * 12.0;
    if (timeframe == "15m") return 365.0 * 24.0 * 4.0;
    if (timeframe == "30m") return 365.0 * 24.0 * 2.0;
    if (timeframe == "1h") return 365.0 * 24.0;
    if (timeframe == "4h") return 365.0 * 6.0;
    if (timeframe == "1w") return 52.0;
    if (timeframe == "1mo") return 12.0;
    return 365.0;
}

BacktestResult StrategySweepEvaluator::evaluateStrategy(
    std::span<const OhlcvBar> bars,
    const SweepStrategyParams& params,
    double cost_bps,
    std::size_t scoring_start_index) {

    BacktestResult result;
    result.equity_curve.initial_equity = 1.0;
    result.equity_curve.points.push_back({"start", 1.0});

    const std::size_t holding_period = std::max<std::size_t>(1U, params.holding_period);
    const std::size_t lookback = std::max({params.rsi_period, params.atr_period, params.bollinger_period, params.volatility_period});

    if (bars.size() <= lookback + holding_period) {
        return result;
    }

    indicators::ParameterMap ind_params;
    ind_params["rsi_period"] = static_cast<double>(params.rsi_period);
    ind_params["atr_period"] = static_cast<double>(params.atr_period);
    ind_params["bb_period"] = static_cast<double>(params.bollinger_period);
    ind_params["vol_period"] = static_cast<double>(params.volatility_period);

    const auto frame = indicators::IndicatorEngine::buildFrame(bars, ind_params);

    std::vector<double> trade_returns;
    double equity = 1.0;
    bool position_open = false;
    std::size_t entry_index = 0U;
    std::size_t exit_index = 0U;
    double entry_price = 0.0;
    double entry_equity = 1.0;
    double entry_signal_score = 0.0;
    const double drag = cost_bps / 10000.0;
    const std::size_t first_scoring_index = std::max(lookback, scoring_start_index);

    for (std::size_t i = first_scoring_index; i < bars.size(); ++i) {
        const auto& row = frame.rows[i];
        const double close = row.bar.close;
        if (position_open) {
            const double marked_return = (close * (1.0 - drag)) / (entry_price * (1.0 + drag)) - 1.0;
            const double marked_equity = entry_equity * (1.0 + marked_return);
            result.equity_curve.points.push_back({row.bar.timestamp, marked_equity});
            if (i != exit_index) continue;

            const double gross_return = close / entry_price - 1.0;
            equity = marked_equity;
            trade_returns.push_back(marked_return);
            result.trades.push_back(Trade{
                row.bar.asset_id,
                row.bar.timeframe,
                bars[entry_index].timestamp,
                row.bar.timestamp,
                entry_price,
                close,
                gross_return,
                marked_return,
                entry_signal_score,
                holding_period,
            });
            position_open = false;
            continue;
        }

        result.equity_curve.points.push_back({row.bar.timestamp, equity});
        if (i + holding_period >= bars.size()) continue;
        const double lookback_close = bars[i - lookback].close;
        if (lookback_close <= 0.0) continue;

        bool entry_signal = false;
        double signal_score = 0.0;
        const std::string bb_suffix = ":" + std::to_string(params.bollinger_period);
        const double rsi = row.get("rsi:" + std::to_string(params.rsi_period)).value_or(50.0);
        const double atr = row.get("atr:" + std::to_string(params.atr_period)).value_or(0.0);
        const double volatility = row.get("vol:" + std::to_string(params.volatility_period)).value_or(0.0);
        const double bb_upper = row.get("bb_upper" + bb_suffix).value_or(close * 1.02);
        const double bb_lower = row.get("bb_lower" + bb_suffix).value_or(close * 0.98);
        const double bb_mid = row.get("bb_middle" + bb_suffix).value_or(close);

        switch (params.archetype) {
        case StrategyArchetype::MomentumTrend: {
            const double trend = (close / lookback_close) - 1.0;
            const double momentum = trend > 0.0 ? 1.0 : 0.0;
            const double strength = rsi >= 55.0 ? 1.0 : (rsi >= 50.0 ? 0.5 : 0.0);
            signal_score = 0.60 * momentum + 0.30 * strength + 0.10 * (volatility > 0.0 ? 1.0 : 0.0);
            entry_signal = signal_score >= params.threshold;
            break;
        }
        case StrategyArchetype::MeanReversion: {
            const double dip = close <= bb_lower * 1.005 ? 1.0 : 0.0;
            const double oversold = rsi <= 40.0 ? 1.0 : 0.0;
            const double calm = volatility > 0.0 && volatility < 0.03 ? 1.0 : 0.0;
            signal_score = 0.45 * dip + 0.45 * oversold + 0.10 * calm;
            entry_signal = signal_score >= params.threshold;
            break;
        }
        case StrategyArchetype::BreakoutVolatility: {
            const double breakout = close >= bb_upper * 0.995 ? 1.0 : 0.0;
            const double vol_expansion = volatility > 0.01 ? 1.0 : 0.0;
            const double atr_expansion = atr > 0.0 && close > 0.0 && (atr / close) > 0.01 ? 1.0 : 0.0;
            signal_score = 0.50 * breakout + 0.30 * vol_expansion + 0.20 * atr_expansion;
            entry_signal = signal_score >= params.threshold;
            break;
        }
        case StrategyArchetype::HybridRegime: {
            const double regime_bull = close > bb_mid ? 1.0 : 0.0;
            const double rsi_momentum = rsi > 52.0 && rsi < 70.0 ? 1.0 : 0.0;
            const double volatility_ok = volatility > 0.0 && volatility < 0.04 ? 1.0 : 0.0;
            signal_score = 0.45 * regime_bull + 0.45 * rsi_momentum + 0.10 * volatility_ok;
            entry_signal = signal_score >= params.threshold;
            break;
        }
        }
        if (!entry_signal) continue;

        position_open = true;
        entry_index = i;
        exit_index = i + holding_period;
        entry_price = close;
        entry_equity = equity;
        entry_signal_score = signal_score;
    }

    result.summary.ok = !result.trades.empty();
    result.summary.trades = result.trades.size();
    for (const double ret : trade_returns) {
        if (ret > 0.0) ++result.summary.winners;
        else if (ret < 0.0) ++result.summary.losers;
    }
    result.summary.net_return = equity - 1.0;

    // Drawdown calculation
    double peak = 1.0;
    double max_dd = 0.0;
    for (const auto& pt : result.equity_curve.points) {
        if (pt.equity > peak) peak = pt.equity;
        if (peak > 0.0) max_dd = std::max(max_dd, (peak - pt.equity) / peak);
    }
    result.summary.max_drawdown = max_dd;
    result.summary.win_rate = result.trades.empty() ? 0.0 : static_cast<double>(result.summary.winners) / static_cast<double>(result.trades.size());

    double sum_ret = 0.0;
    for (double r : trade_returns) sum_ret += r;
    result.summary.expectancy = result.trades.empty() ? 0.0 : sum_ret / static_cast<double>(result.trades.size());

    std::vector<double> eq_vals;
    eq_vals.reserve(result.equity_curve.points.size());
    for (const auto& pt : result.equity_curve.points) eq_vals.push_back(pt.equity);

    const std::string timeframe = bars.empty() ? "1d" : bars.front().timeframe;
    const auto stats = StatsEngine::summarize(
        eq_vals,
        constants::DEFAULT_RISK_FREE_RATE,
        periodsPerYear(timeframe));
    result.summary.sharpe = stats.sharpe;
    result.summary.sortino = stats.sortino;
    result.summary.ok = stats.ok && !result.trades.empty();

    return result;
}

std::vector<ParameterPlateau> StrategySweepEvaluator::extractPlateaus(
    const std::vector<SensitivityPoint>& curve,
    double quantile_threshold,
    std::size_t min_window) {

    std::vector<ParameterPlateau> plateaus;
    if (curve.size() < min_window) return plateaus;

    std::vector<double> scores;
    scores.reserve(curve.size());
    for (const auto& pt : curve) scores.push_back(pt.fitness_score);

    std::vector<double> sorted_scores = scores;
    std::sort(sorted_scores.begin(), sorted_scores.end());

    const std::size_t cutoff_idx = static_cast<std::size_t>(sorted_scores.size() * std::clamp(quantile_threshold, 0.1, 0.95));
    const double min_score_cutoff = sorted_scores[cutoff_idx];

    std::size_t range_start = 0;
    bool in_range = false;
    std::vector<double> current_scores;

    for (std::size_t i = 0; i < curve.size(); ++i) {
        if (curve[i].fitness_score >= min_score_cutoff && curve[i].trade_count >= 5) {
            if (!in_range) {
                range_start = i;
                in_range = true;
                current_scores.clear();
            }
            current_scores.push_back(curve[i].fitness_score);
        } else {
            if (in_range) {
                if (current_scores.size() >= min_window) {
                    ParameterPlateau p;
                    p.min_value = curve[range_start].param_value;
                    p.max_value = curve[i - 1].param_value;

                    double sum = 0.0;
                    for (double s : current_scores) sum += s;
                    p.mean_fitness = sum / current_scores.size();

                    double sq_diff_sum = 0.0;
                    for (double s : current_scores) sq_diff_sum += (s - p.mean_fitness) * (s - p.mean_fitness);
                    const double stdev = std::sqrt(sq_diff_sum / current_scores.size());
                    p.stability_score = std::max(0.0, 1.0 - (p.mean_fitness != 0.0 ? stdev / std::abs(p.mean_fitness) : 1.0));

                    plateaus.push_back(p);
                }
                in_range = false;
            }
        }
    }

    if (in_range && current_scores.size() >= min_window) {
        ParameterPlateau p;
        p.min_value = curve[range_start].param_value;
        p.max_value = curve.back().param_value;

        double sum = 0.0;
        for (double s : current_scores) sum += s;
        p.mean_fitness = sum / current_scores.size();

        double sq_diff_sum = 0.0;
        for (double s : current_scores) sq_diff_sum += (s - p.mean_fitness) * (s - p.mean_fitness);
        const double stdev = std::sqrt(sq_diff_sum / current_scores.size());
        p.stability_score = std::max(0.0, 1.0 - (p.mean_fitness != 0.0 ? stdev / std::abs(p.mean_fitness) : 1.0));

        plateaus.push_back(p);
    }

    return plateaus;
}

SweepTrialResult StrategySweepEvaluator::evaluateTrial(
    std::span<const OhlcvBar> train_bars,
    std::span<const OhlcvBar> validation_bars,
    const std::string& symbol,
    const std::string& timeframe,
    const SweepStrategyParams& params,
    double cost_bps,
    std::size_t validation_scoring_start) {

    SweepTrialResult trial;
    trial.params = params;
    trial.symbol = symbol;
    trial.timeframe = timeframe;
    trial.train_result = evaluateStrategy(train_bars, params, cost_bps);
    trial.validation_result = validation_bars.empty()
        ? trial.train_result
        : evaluateStrategy(validation_bars, params, cost_bps, validation_scoring_start);

    const auto& selection = trial.validation_result.summary;
    trial.selection_eligible = selection.ok && selection.trades >= 5U;
    trial.fitness_score = trial.selection_eligible
        ? selection.net_return - selection.max_drawdown + (selection.expectancy * 10.0)
        : -999.0;
    trial.overfit_grade = "HOLDOUT_NOT_EVALUATED";
    return trial;
}

void StrategySweepEvaluator::evaluateHoldout(
    SweepTrialResult& selected_trial,
    std::span<const OhlcvBar> holdout_bars,
    std::size_t scoring_start_index,
    double cost_bps) {
    selected_trial.test_result = evaluateStrategy(
        holdout_bars,
        selected_trial.params,
        cost_bps,
        scoring_start_index);
    const double validation_sharpe = selected_trial.validation_result.summary.sharpe;
    const double holdout_sharpe = selected_trial.test_result.summary.sharpe;
    selected_trial.oos_retention_ratio = validation_sharpe > 0.0
        ? holdout_sharpe / validation_sharpe
        : 0.0;
    selected_trial.overfit_warning = !selected_trial.test_result.summary.ok
        || holdout_sharpe < 0.5 * validation_sharpe
        || selected_trial.test_result.summary.expectancy < 0.0
        || selected_trial.test_result.summary.trades < 5U;
    if (selected_trial.oos_retention_ratio >= 0.70 && !selected_trial.overfit_warning) {
        selected_trial.overfit_grade = "HOLDOUT_STABLE";
    } else if (selected_trial.oos_retention_ratio >= 0.40 && !selected_trial.overfit_warning) {
        selected_trial.overfit_grade = "HOLDOUT_MODERATE_DECAY";
    } else {
        selected_trial.overfit_grade = "HOLDOUT_FRAGILE";
    }
}

} // namespace sovereign::strategies
