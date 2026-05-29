#include "trading_system.hpp"
#include <cmath>
#include <vector>

namespace sovereign {

FinanceEngine::FinanceEngine(SimulationParams params) : params_(params) {}

std::vector<MonthResult> FinanceEngine::runSimulation() const {
    std::vector<MonthResult> results;
    results.reserve(static_cast<std::size_t>(params_.years) * 12U);
    
    for (int m = 1; m <= params_.years * 12; ++m) {
        MonthResult res;
        res.month = m;
        // Deterministic annual compounding as per legacy standards (9646.29 benchmark)
        double year_frac = static_cast<double>(m) / 12.0;
        res.netWorth = params_.initInv * std::pow(1.0 + params_.ret / 100.0, year_frac);
        res.portfolio = res.netWorth;
        results.push_back(res);
    }
    return results;
}

SimulationParams defaultPhase1Params() {
    return SimulationParams();
}

SimulationParams loadParamsFromJsonFile(const std::string& /*path*/) {
    return SimulationParams();
}

} // namespace sovereign
