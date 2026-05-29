#include "confidence.hpp"
#include <algorithm>
#include <cmath>

namespace sovereign {

double calculateConfidence(
    double sharpe,
    double sortino,
    double annualized_return,
    double max_drawdown,
    double calmar) {
    
    (void)annualized_return;
    (void)max_drawdown;
    
    // Benchmarks for normalization
    const double target_sharpe = 2.0;
    const double target_sortino = 3.0;
    const double target_calmar = 2.0;
    
    // Normalize metrics
    double sharpe_score = std::min(1.0, std::max(0.0, sharpe / target_sharpe));
    double sortino_score = std::min(1.0, std::max(0.0, sortino / target_sortino));
    double calmar_score = std::min(1.0, std::max(0.0, calmar / target_calmar));
    
    // Weighted scoring
    // Sharpe: 40%, Sortino: 30%, Calmar: 30%
    double score = (sharpe_score * 0.4) + (sortino_score * 0.3) + (calmar_score * 0.3);
    
    // Final sanity check
    return std::min(1.0, std::max(0.0, score));
}

} // namespace sovereign
