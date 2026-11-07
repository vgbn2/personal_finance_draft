#pragma once

#include <string>
#include <vector>

namespace sovereign {

struct EquityPoint {
    std::string timestamp;
    double equity = 0.0;
};

struct EquityCurve {
    std::vector<EquityPoint> points;
    double initial_equity = 1.0;
};

} // namespace sovereign
