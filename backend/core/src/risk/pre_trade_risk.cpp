#include "pre_trade_risk.hpp"

namespace sovereign {

PreTradeRisk::PreTradeRisk(RiskLimits limits) : limits_(limits) {}

RiskDecision PreTradeRisk::validate(const TradeOrder& order) const {
    RiskDecision decision{};
    decision.halt_trading = limits_.fail_closed;
    decision.limit = limits_.max_drawdown;
    decision.observed_drawdown = order.current_drawdown;

    if (order.current_drawdown >= limits_.max_drawdown) {
        decision.approved = false;
        decision.reason = "Max drawdown limit exceeded";
        return decision;
    }

    decision.approved = true;
    decision.halt_trading = false;
    decision.reason = "Order within risk parameters";
    return decision;
}

} // namespace sovereign