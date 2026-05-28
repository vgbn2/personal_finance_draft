#pragma once

#include <string>

namespace sovereign {

struct MacroObservation {
    std::string series;
    std::string timestamp;
    std::string release_timestamp;
    double value = 0.0;
    std::string source;
    std::string ingested_at;
};

} // namespace sovereign
