#include "regime_detector.hpp"

#include <cmath>
#include <memory>
#include <numeric>

namespace sovereign {

class SimpleMovingRegimeDetector final : public IRegimeDetector {
public:
    void update(const std::vector<double>& prices, const std::vector<double>& volumes) override {
        (void)volumes;
        if (prices.size() < 20) {
            state_ = {MarketRegime::UNDEFINED, 0.0, "Insufficient data"};
            return;
        }

        double latest = prices.back();
        double ma = std::accumulate(prices.end() - 20, prices.end(), 0.0) / 20.0;
        
        // Calculate basic rolling volatility (std dev of last 20 periods)
        double sq_sum = 0.0;
        for (auto it = prices.end() - 20; it != prices.end(); ++it) {
            sq_sum += std::pow(*it - ma, 2);
        }
        double vol = std::sqrt(sq_sum / 20.0);

        if (vol > ma * 0.05) {
            state_ = {MarketRegime::VOLATILE_CRASH, 0.8, "High volatility detected"};
        } else if (latest > ma * 1.02) {
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

std::unique_ptr<IRegimeDetector> makeSimpleMovingRegimeDetector() {
    return std::make_unique<SimpleMovingRegimeDetector>();
}

} // namespace sovereign
