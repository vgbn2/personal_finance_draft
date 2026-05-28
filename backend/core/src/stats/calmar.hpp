#pragma once
#include "../utils/constants.hpp"

namespace sovereign {

double annualizedReturn(double start_equity, double end_equity, double periods, double periods_per_year = constants::TRADING_DAYS_PER_YEAR);
double calmarRatio(double annualized_return, double max_drawdown);

} // namespace sovereign
