#pragma once

#include <vector>
#include "data/ohlcv_bar.hpp"

namespace sovereign {
namespace ml {

class KronosTokenizer {
public:
    std::vector<int> tokenize(const std::vector<OhlcvBar>& bars);
};

} // namespace ml
} // namespace sovereign
