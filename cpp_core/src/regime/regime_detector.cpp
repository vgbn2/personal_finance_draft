#include "regime_detector.hpp"
#include <cmath>
#include <numeric>

namespace sovereign {

class SimpleMovingRegimeDetector : public IRegimeDetector {
public:
    void update(const std::vector<double>& prices, const std::vector<double>& /*volumes*/) override {
        if (prices.size() < 20) {
            state_ = {MarketRegime::UNDEFINED, 0.0, "Insufficient data"};
            return;
        }

        double latest = prices.back();
        double ma = std::accumulate(prices.end() - 20, prices.end(), 0.0) / 20.0;

        if (latest > ma * 1.02) {
            state_ = {MarketRegime::BULLISH_TREND, 0.7, "Price above 20MA"};
        } else if (latest < ma * 0.98) {
            state_ = {MarketRegime::BEARISH_TREND, 0.7, "Price below 20MA"};
        } else {
            state_ = {MarketRegime::MEAN_REVERSION, 0.5, "Trading within range"};
        }
    }

    RegimeState get_current_state() const override {
        return state_;
    }

private:
    RegimeState state_{MarketRegime::UNDEFINED, 0.0, "Initialized"};
};

} // namespace sovereign
