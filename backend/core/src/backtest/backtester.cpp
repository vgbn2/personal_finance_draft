#include "backtester.hpp"

#include "../indicators/indicator_engine.hpp"
#include "../risk/cost_model.hpp"
#include "../stats/stats_engine.hpp"
#include "../utils/constants.hpp"

#include <algorithm>
#include <cmath>
#include <limits>

namespace sovereign {

namespace {
double percentDrawdown(const std::vector<EquityPoint>& points) {
    if (points.empty()) {
        return 0.0;
    }
    double peak = points.front().equity;
    double max_drawdown = 0.0;
    for (const auto& point : points) {
        peak = std::max(peak, point.equity);
        if (peak > 0.0) {
            max_drawdown = std::max(max_drawdown, (peak - point.equity) / peak);
        }
    }
    return max_drawdown;
}
double sum(const std::vector<double>& values) {
    double total = 0.0;
    for (double value : values) {
        total += value;
    }
    return total;
}
bool isFinitePositive(double value) {
    return std::isfinite(value) && value > 0.0;
}
bool hasValidOrdering(const OhlcvBar& bar) {
    return bar.low <= bar.open &&
           bar.low <= bar.close &&
           bar.open <= bar.high &&
           bar.close <= bar.high;
}

bool barsAreUsable(std::span<const OhlcvBar> bars) {
    if (bars.empty()) {
        return false;
    }

    const std::string& asset_id = bars.front().asset_id;
    const std::string& timeframe = bars.front().timeframe;
    std::string previous_timestamp;
    for (const auto& bar : bars) {
        if (bar.asset_id != asset_id || bar.timeframe != timeframe || bar.timestamp.empty()) {
            return false;
        }
        if (!previous_timestamp.empty() && bar.timestamp < previous_timestamp) {
            return false;
        }
        previous_timestamp = bar.timestamp;

        if (!isFinitePositive(bar.open) ||
            !isFinitePositive(bar.high) ||
            !isFinitePositive(bar.low) ||
            !isFinitePositive(bar.close) ||
            !std::isfinite(bar.volume) ||
            bar.volume < 0.0 ||
            !hasValidOrdering(bar)) {
            return false;
        }
    }
    return true;
}

} 

BacktestResult Backtester::run(std::span<const OhlcvBar> bars, const BacktestConfig& config) {
    BacktestResult result;
    result.config = config;
    result.equity_curve.initial_equity = config.starting_equity;
    result.equity_curve.points.push_back({"start", config.starting_equity});

    if (!isFinitePositive(config.starting_equity) ||
        !std::isfinite(config.entry_threshold) ||
        !std::isfinite(config.fee_bps) ||
        !std::isfinite(config.slippage_bps) ||
        config.fee_bps < 0.0 ||
        config.slippage_bps < 0.0 ||
        !barsAreUsable(bars)) {
        return result;
    }

    const std::size_t holding_period = std::max<std::size_t>(1U, config.holding_period);
    if (bars.size() <= config.lookback + holding_period) {
        return result;
    }

    const auto indicators = indicators::IndicatorEngine::buildFrame(bars);

    CostModelParams cmp;
    cmp.commission_bps = config.cost_commission_bps;
    cmp.slippage_vol_coeff = config.cost_slippage_vol_coeff;
    cmp.market_impact_coeff = config.cost_market_impact_coeff;
    CostModel cost_model(cmp);

    std::vector<double> trade_returns;
    double equity = config.starting_equity;

    for (std::size_t i = config.lookback; i + holding_period < bars.size(); ++i) {
        const auto& row = indicators.rows[i];
        const double close = row.bar.close;
        const double lookback_close = bars[i - config.lookback].close;
        if (lookback_close <= 0.0) {
            continue;
        }

        const double trend_score = close / lookback_close - 1.0;
        const double rsi_score = row.get("rsi:14").value_or(constants::RSI_NEUTRAL_LEVEL);
        const double macd_score = row.get("macd").value_or(0.0);
        const double momentum = trend_score > 0.0 ? 1.0 : 0.0;
        const double strength = rsi_score >= config.rsi_strong_threshold ? 1.0 : (rsi_score >= config.rsi_neutral_threshold ? constants::STRENGTH_NEUTRAL : 0.0);
        const double macd_bias = macd_score > 0.0 ? 1.0 : 0.0;
        const double signal = config.weight_momentum * momentum + config.weight_strength * strength + config.weight_bias * macd_bias;
        if (signal < config.entry_threshold) {
            continue;
        }

        const auto& exit_bar = bars[i + holding_period];
        
        double entry_drag_bps = config.fee_bps + config.slippage_bps;
        double exit_drag_bps = config.fee_bps + config.slippage_bps;

        if (config.use_dynamic_costs) {
            const double vol_annual = row.get("vol:20").value_or(0.01) * std::sqrt(constants::TRADING_DAYS_PER_YEAR);
            entry_drag_bps = cost_model.estimate_bps(vol_annual);
            exit_drag_bps = cost_model.estimate_bps(vol_annual);
        }

        const double entry_drag = entry_drag_bps / constants::BPS_DIVISOR;
        const double exit_drag = exit_drag_bps / constants::BPS_DIVISOR;
        const double adjusted_entry = close * (1.0 + entry_drag);
        const double adjusted_exit = exit_bar.close * (1.0 - exit_drag);
        const double gross_return = exit_bar.close / close - 1.0;
        const double net_return = adjusted_exit / adjusted_entry - 1.0;

        equity *= 1.0 + net_return;
        trade_returns.push_back(net_return);

        result.trades.push_back(Trade{
            row.bar.asset_id,
            row.bar.timeframe,
            row.bar.timestamp,
            exit_bar.timestamp,
            close,
            exit_bar.close,
            gross_return,
            net_return,
            signal,
            holding_period,
        });
        result.equity_curve.points.push_back({exit_bar.timestamp, equity});
        i += holding_period - 1U;
    }

    result.summary.ok = !result.trades.empty();
    result.summary.trades = result.trades.size();
    for (const double trade_return : trade_returns) {
        if (trade_return > 0.0) {
            ++result.summary.winners;
        } else if (trade_return < 0.0) {
            ++result.summary.losers;
        }
    }
    result.summary.net_return = equity / config.starting_equity - 1.0;
    result.summary.max_drawdown = percentDrawdown(result.equity_curve.points);
    result.summary.win_rate = result.trades.empty() ? 0.0 : static_cast<double>(result.summary.winners) / static_cast<double>(result.trades.size());
    result.summary.expectancy = result.trades.empty() ? 0.0 : sum(trade_returns) / static_cast<double>(trade_returns.size());

    std::vector<double> equity_values;
    equity_values.reserve(result.equity_curve.points.size());
    for (const auto& point : result.equity_curve.points) {
        equity_values.push_back(point.equity);
    }
    const auto stats = StatsEngine::summarize(equity_values, constants::DEFAULT_RISK_FREE_RATE, constants::TRADING_DAYS_PER_YEAR);
    result.summary.sharpe = stats.sharpe;
    result.summary.sortino = stats.sortino;
    result.summary.ok = stats.ok && result.summary.trades > 0U;
    return result;
}

} // namespace sovereign
