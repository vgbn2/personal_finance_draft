#pragma once

#include "risk_limits.hpp"

namespace sovereign {

struct TradeOrder {
    double notional;
    double portfolio_equity;
    double current_drawdown;
};

class PreTradeRisk {
public:
    explicit PreTradeRisk(RiskLimits limits);

    RiskDecision validate(const TradeOrder& order) const;
    static RiskDecision validateOptionsGreeks(const OptionsGreeks& greeks, const OptionsRiskLimits& limits = {});

private:
    RiskLimits limits_;
};

} // namespace sovereign
