#pragma once

#include <cstddef>
#include <vector>
#include <limits>
#include <span>

namespace sovereign::indicators {

inline std::vector<double> relativeStrengthIndexSeries(const std::vector<double>& closes, std::size_t period = 14U) {
    std::vector<double> res(closes.size(), std::numeric_limits<double>::quiet_NaN());
    if (closes.size() <= period || period == 0U) {
        return res;
    }

    for (std::size_t i = period; i < closes.size(); ++i) {
        double gains = 0.0;
        double losses = 0.0;
        for (std::size_t j = i + 1 - period; j <= i; ++j) {
            const double change = closes[j] - closes[j - 1U];
            if (change >= 0.0) {
                gains += change;
            } else {
                losses -= change;
            }
        }

        if (losses == 0.0) {
            res[i] = 100.0;
        } else {
            const double rs = gains / losses;
            res[i] = 100.0 - 100.0 / (1.0 + rs);
        }
    }

    return res;
}

} // namespace sovereign::indicators
