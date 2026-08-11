#pragma once

#include <algorithm>
#include <cmath>
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

struct WalkForwardBarSplit {
    std::size_t train_end = 0;
    std::size_t validation_start = 0;
    std::size_t validation_end = 0;
    std::size_t holdout_start = 0;
    std::size_t validation_scoring_start = 0;
    std::size_t holdout_scoring_start = 0;

    bool valid(std::size_t total_bars) const {
        return train_end > 0U
            && validation_start < train_end
            && validation_scoring_start == train_end - validation_start
            && validation_end > train_end
            && holdout_start < validation_end
            && holdout_scoring_start == validation_end - holdout_start
            && validation_end < total_bars;
    }
};

inline WalkForwardBarSplit buildWalkForwardBarSplit(
    std::size_t total_bars,
    std::size_t warmup_bars,
    double train_ratio = 0.60,
    double validation_ratio = 0.20) {
    WalkForwardBarSplit split;
    if (total_bars < 30U || warmup_bars == 0U) return split;
    const double train = std::clamp(train_ratio, 0.40, 0.75);
    const double validation = std::clamp(validation_ratio, 0.10, 0.30);
    split.train_end = static_cast<std::size_t>(std::floor(total_bars * train));
    split.validation_end = static_cast<std::size_t>(std::floor(total_bars * (train + validation)));
    if (split.validation_end >= total_bars || split.train_end <= warmup_bars) return {};
    split.validation_start = split.train_end - std::min(warmup_bars, split.train_end);
    split.holdout_start = split.validation_end - std::min(warmup_bars, split.validation_end);
    split.validation_scoring_start = split.train_end - split.validation_start;
    split.holdout_scoring_start = split.validation_end - split.holdout_start;
    return split.valid(total_bars) ? split : WalkForwardBarSplit{};
}

} // namespace sovereign
