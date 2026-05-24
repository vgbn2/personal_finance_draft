#pragma once

#include "../features/feature_frame.hpp"
#include "../indicators/indicator_engine.hpp"
#include <vector>
#include <string>
#include <optional>

namespace sovereign::ml {

/**
 * @brief Represents a multi-dimensional tensor for CNN input.
 * Standard Layout: [Batch, Sequence, Features]
 */
struct CnnTensor {
    std::vector<float> data;
    std::vector<size_t> shape; // {batch, sequence, features}
    
    size_t batch_size() const { return shape.empty() ? 0 : shape[0]; }
    size_t sequence_length() const { return shape.size() < 2 ? 0 : shape[1]; }
    size_t num_features() const { return shape.size() < 3 ? 0 : shape[2]; }

    bool empty() const { return data.empty(); }
};

class CnnTensorBuilder {
public:
    explicit CnnTensorBuilder(size_t window_size = 60);

    /**
     * @brief Builds a rolling tensor from an IndicatorFrame and a set of feature keys.
     */
    CnnTensor build(const indicators::IndicatorFrame& frame,
                    const std::vector<std::string>& feature_keys) const;

    /**
     * @brief Builds a rolling tensor from a normalized FeatureFrame and feature keys.
     */
    CnnTensor build(const features::FeatureFrame& frame,
                    const std::vector<std::string>& feature_keys) const;

private:
    size_t m_window_size;
};

} // namespace sovereign::ml
