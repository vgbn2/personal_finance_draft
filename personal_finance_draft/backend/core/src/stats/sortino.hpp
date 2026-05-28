#pragma once
#include "../utils/constants.hpp"

#include <span>

namespace sovereign {

double downsideDeviation(std::span<const double> returns, double minimum_acceptable_return = constants::DEFAULT_RISK_FREE_RATE);
double annualizedSortino(std::span<const double> returns, double minimum_acceptable_return = constants::DEFAULT_RISK_FREE_RATE, double periods_per_year = constants::TRADING_DAYS_PER_YEAR);

} // namespace sovereign
