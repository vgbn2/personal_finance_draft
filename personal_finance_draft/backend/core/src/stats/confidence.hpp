#pragma once

namespace sovereign {

/**
 * Calculates a confidence score based on strategy performance metrics.
 * The score is normalized between 0.0 and 1.0 based on institutional benchmarks.
 */
double calculateConfidence(
    double sharpe,
    double sortino,
    double annualized_return,
    double max_drawdown,
    double calmar);

} // namespace sovereign
