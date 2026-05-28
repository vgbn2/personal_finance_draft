#pragma once

#include <cmath>
#include <cstddef>

namespace sovereign {

struct ResearchCostModelParams {
    double commission_bps = 2.0;
    double spread_bps = 1.0;
    double slippage_bps = 0.5;
    double funding_bps = 0.0;
    double borrow_bps = 0.0;
    double fx_conversion_bps = 0.0;
    double impact_coeff = 0.1;
};

class ResearchCostModel {
public:
    explicit ResearchCostModel(ResearchCostModelParams params = {}) : params_(params) {}

    double estimate_bps(double annualized_vol, double notional_fraction = 0.0) const {
        double cost = params_.commission_bps + params_.spread_bps + params_.slippage_bps;
        if (annualized_vol > 0.0) {
            cost += 0.25 * annualized_vol;
        }
        if (notional_fraction > 0.0) {
            cost += params_.impact_coeff * std::sqrt(notional_fraction) * 100.0;
        }
        cost += params_.funding_bps + params_.borrow_bps + params_.fx_conversion_bps;
        return cost;
    }

private:
    ResearchCostModelParams params_;
};

} // namespace sovereign
