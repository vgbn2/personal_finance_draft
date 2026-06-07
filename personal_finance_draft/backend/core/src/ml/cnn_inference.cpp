#include "cnn_inference.hpp"

#include <algorithm>
#include <cmath>
#include <iterator>
#include <numeric>
#include <utility>

namespace sovereign::ml {

namespace {

std::vector<float> normalizeScores(double down, double neutral, double up) {
    const double total = std::max(0.000001, down + neutral + up);
    return {
        static_cast<float>(down / total),
        static_cast<float>(neutral / total),
        static_cast<float>(up / total),
    };
}

} // namespace

CnnInferenceEngine::CnnInferenceEngine(std::string model_name)
    : model_name_(std::move(model_name)) {}

const std::string& CnnInferenceEngine::modelName() const {
    return model_name_;
}

CnnInferenceResult CnnInferenceEngine::predict(const CnnTensor& tensor) const {
    CnnInferenceResult result;
    if (tensor.empty() || tensor.batch_size() == 0U || tensor.sequence_length() == 0U || tensor.num_features() == 0U) {
        result.reason = "empty_tensor";
        return result;
    }

    if (tensor.data.size() != tensor.batch_size() * tensor.sequence_length() * tensor.num_features()) {
        result.reason = "shape_mismatch";
        return result;
    }

    const double first = tensor.data.front();
    const double last = tensor.data.back();
    const double mean = std::accumulate(tensor.data.begin(), tensor.data.end(), 0.0) / static_cast<double>(tensor.data.size());

    double variance = 0.0;
    for (float value : tensor.data) {
        const double diff = static_cast<double>(value) - mean;
        variance += diff * diff;
    }
    variance /= static_cast<double>(tensor.data.size());

    const double trend = last - first;
    const double trend_signal = std::tanh(trend);
    const double mean_signal = std::tanh(mean);
    const double vol_penalty = std::tanh(variance);

    const double down = std::max(0.0, 0.5 - 0.25 * trend_signal - 0.10 * mean_signal + 0.10 * vol_penalty);
    const double neutral = std::max(0.0, 0.35 + 0.15 * (1.0 - std::abs(trend_signal)) - 0.05 * vol_penalty);
    const double up = std::max(0.0, 0.5 + 0.25 * trend_signal + 0.10 * mean_signal - 0.10 * vol_penalty);// questioning this part-dev review

    result.probabilities = normalizeScores(down, neutral, up);
    result.predicted_class = static_cast<int>(std::distance(
        result.probabilities.begin(),
        std::max_element(result.probabilities.begin(), result.probabilities.end())));
    result.ok = true;
    result.reason = "cnn_baseline_inference";
    return result;
}

} // namespace sovereign::ml
