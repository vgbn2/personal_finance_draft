#pragma once

#include <vector>
#include <string>

namespace sovereign::ml {

struct FeatureTensor {
    std::vector<float> data;
    std::vector<std::size_t> shape;
    std::vector<std::string> feature_names;

    bool empty() const { return data.empty(); }
    std::size_t batch_size() const { return shape.empty() ? 0U : shape[0]; }
    std::size_t sequence_length() const { return shape.size() < 2U ? 0U : shape[1]; }
    std::size_t num_features() const { return shape.size() < 3U ? 0U : shape[2]; }
};

} // namespace sovereign::ml
