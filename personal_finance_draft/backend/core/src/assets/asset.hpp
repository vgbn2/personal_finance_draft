#pragma once

#include "instrument_type.hpp"

#include <string>

namespace sovereign {

struct Asset {
    std::string asset_id;
    std::string symbol;
    std::string name;
    InstrumentType instrument_type = InstrumentType::Unknown;
    std::string exchange;
    std::string currency;
    std::string timezone;
    double tick_size = 0.0;
    double lot_size = 0.0;
    std::string active_from;
    std::string active_to;
};

} 
