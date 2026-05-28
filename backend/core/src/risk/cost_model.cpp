#include "risk/cost_model.hpp"
#include <cmath>
#include <iostream>

namespace sovereign {

CostModel::CostModel(CostModelParams params) : params_(params) {}

double CostModel::estimate_bps(double annualized_vol, double notional_fraction) const {
    // 1. Fixed commission
    double cost = params_.commission_bps;

    // 2. Slippage: Fixed component + Volatility scaled by power law
    if (annualized_vol > 0.0) {
        cost += params_.slippage_fixed_bps + 
                (params_.slippage_vol_coeff * std::pow(annualized_vol, params_.slippage_vol_power) * 100.0);
    }

    // 3. Market impact: Square root model (impact = coeff * sqrt(notional_fraction))
    if (notional_fraction > 0.0) {
        cost += params_.market_impact_coeff * std::sqrt(notional_fraction) * 100.0;
    }

    return cost;
}

} // namespace sovereign
