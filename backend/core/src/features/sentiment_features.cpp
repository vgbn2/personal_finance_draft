#include "sentiment_features.hpp"
#include <span>

#include <algorithm>
#include <cmath>
#include <map>
#include <utility>

namespace sovereign::features {

namespace {

std::string makeBucketKey(const SentimentObservation& observation) {
    return observation.asset_id + "|" + observation.timestamp;
}

bool isUsable(const SentimentObservation& observation) {
    return !observation.asset_id.empty() &&
           !observation.timestamp.empty() &&
           std::isfinite(observation.polarity) &&
           std::isfinite(observation.confidence) &&
           std::isfinite(observation.volume);
}

} // namespace

FeatureFrame buildSentimentFeatureFrame(std::span<const SentimentObservation> observations) {
    FeatureFrame frame;
    if (observations.empty()) {
        return frame;
    }

    std::map<std::string, std::vector<const SentimentObservation*>> grouped;
    for (const auto& observation : observations) {
        if (!isUsable(observation)) {
            continue;
        }
        grouped[makeBucketKey(observation)].push_back(&observation);
    }

    frame.rows.reserve(grouped.size());
    for (const auto& [bucket_key, bucket] : grouped) {
        const auto separator = bucket_key.find('|');
        const std::string asset_id = bucket_key.substr(0, separator);
        const std::string timestamp = bucket_key.substr(separator + 1U);

        double weighted_score = 0.0;
        double total_weight = 0.0;
        double total_confidence = 0.0;
        double total_volume = 0.0;
        std::size_t bullish = 0U;
        std::size_t bearish = 0U;

        for (const auto* observation : bucket) {
            const double weight = std::max(0.0, observation->confidence) * std::max(1.0, observation->volume);
            weighted_score += observation->polarity * weight;
            total_weight += weight;
            total_confidence += observation->confidence;
            total_volume += observation->volume;
            if (observation->polarity > 0.0) {
                ++bullish;
            } else if (observation->polarity < 0.0) {
                ++bearish;
            }
        }

        FeatureRow row;
        row.asset_id = asset_id;
        row.timestamp = timestamp;
        row.timeframe = "sentiment";
        row.set("sentiment_score", total_weight > 0.0 ? weighted_score / total_weight : 0.0);
        row.set("sentiment_confidence", total_confidence / static_cast<double>(bucket.size()));
        row.set("sentiment_weight", total_weight);
        row.set("sentiment_volume", total_volume);
        row.set("sentiment_sources", static_cast<double>(bucket.size()));
        row.set("sentiment_bullish", static_cast<double>(bullish));
        row.set("sentiment_bearish", static_cast<double>(bearish));
        row.set("sentiment_bias", static_cast<double>(bullish) - static_cast<double>(bearish));
        frame.rows.push_back(std::move(row));
        ++frame.ready_rows;
    }

    return frame;
}

} // namespace sovereign::features
