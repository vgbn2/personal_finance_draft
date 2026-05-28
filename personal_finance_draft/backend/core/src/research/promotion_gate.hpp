#pragma once

#include <cstddef>
#include <string>

namespace sovereign {

struct PromotionMetrics {
    double sharpe = 0.0;
    double sortino = 0.0;
    double win_rate = 0.0;
    double max_drawdown = 1.0;
    double net_return = 0.0;
    double cost_bps = 0.0;
    std::size_t trades = 0;
};

struct PromotionGateThresholds {
    double min_sharpe = 1.0;
    double min_sortino = 1.0;
    double min_win_rate = 0.5;
    double max_drawdown = 0.2;
    double max_cost_bps = 50.0;
    std::size_t min_trades = 30;
};

struct PromotionGateDecision {
    bool approved = false;
    std::string reason;
};

class PromotionGate {
public:
    explicit PromotionGate(PromotionGateThresholds thresholds = {}) : thresholds_(thresholds) {}

    PromotionGateDecision evaluate(const PromotionMetrics& metrics) const {
        if (metrics.trades < thresholds_.min_trades) {
            return {false, "insufficient trades"};
        }
        if (metrics.sharpe < thresholds_.min_sharpe) {
            return {false, "sharpe below threshold"};
        }
        if (metrics.sortino < thresholds_.min_sortino) {
            return {false, "sortino below threshold"};
        }
        if (metrics.win_rate < thresholds_.min_win_rate) {
            return {false, "win rate below threshold"};
        }
        if (metrics.max_drawdown > thresholds_.max_drawdown) {
            return {false, "drawdown above threshold"};
        }
        if (metrics.cost_bps > thresholds_.max_cost_bps) {
            return {false, "costs above threshold"};
        }
        return {true, "approved"};
    }

    bool approve(const PromotionMetrics& metrics) const {
        return evaluate(metrics).approved;
    }

private:
    PromotionGateThresholds thresholds_;
};

} // namespace sovereign
