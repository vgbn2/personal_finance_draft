#pragma once

#include <cstddef>
#include <string>

namespace sovereign {

struct WalkForwardWindow {
    std::string start;
    std::string end;

    bool valid() const {
        return !start.empty() && !end.empty() && start <= end;
    }
};

struct WalkForwardSplit {
    WalkForwardWindow train;
    WalkForwardWindow validation;
    WalkForwardWindow test;
    std::size_t train_bars = 0;
    std::size_t validation_bars = 0;
    std::size_t test_bars = 0;

    bool valid() const {
        return train.valid() && validation.valid() && test.valid()
            && train_bars > 0 && validation_bars > 0 && test_bars > 0;
    }

    std::size_t total_bars() const {
        return train_bars + validation_bars + test_bars;
    }
};

} // namespace sovereign
