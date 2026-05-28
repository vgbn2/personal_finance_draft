#pragma once
#include "../utils/constants.hpp"

#include <span>

namespace sovereign {

double meanReturn(std::span<const double> returns);
double sampleStdDev(std::span<const double> values);
double annualizedSharpe(std::span<const double> returns, double risk_free_per_period = constants::DEFAULT_RISK_FREE_RATE, double periods_per_year = constants::TRADING_DAYS_PER_YEAR);

} // namespace sovereign
