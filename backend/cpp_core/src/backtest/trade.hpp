#pragma once

#include <cstddef>
#include <string>

namespace sovereign {

struct Trade {
    std::string symbol;
    std::string timeframe;
    std::string entry_time;
    std::string exit_time;
    double entry_price = 0.0;
    double exit_price = 0.0;
    double gross_return = 0.0;
    double net_return = 0.0;
    double confidence = 0.0;
    std::size_t holding_period_bars = 0;
};

} // namespace sovereign
