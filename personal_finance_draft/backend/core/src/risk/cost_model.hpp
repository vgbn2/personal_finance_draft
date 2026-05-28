#pragma once

#include <string>

namespace sovereign {

/**
 * @brief Parameters for the Transaction Cost Model.
 */
struct CostModelParams {
    double commission_bps = 2.0;
    // Non-linear slippage coefficients (Square root model)
    double slippage_fixed_bps = 1.0; 
    double slippage_vol_power = 0.5; // Power term for vol scaling
    double slippage_vol_coeff = 0.05; 
    
    // Square root market impact model: impact = coeff * sqrt(notional_fraction)
    double market_impact_coeff = 0.1; 
};

/**
 * @brief Dynamic model for estimating transaction costs (fees + slippage).
 */
class CostModel {
public:
    explicit CostModel(CostModelParams params = {});

    /**
     * @brief Estimates total transaction cost in basis points (bps).
     * @param annualized_vol The annualized volatility of the asset.
     * @param notional_fraction The trade size as a fraction of daily volume (for impact).
     * @return Estimated cost in bps.
     */
    double estimate_bps(double annualized_vol, double notional_fraction = 0.0) const;

private:
    CostModelParams params_;
};

} // namespace sovereign
