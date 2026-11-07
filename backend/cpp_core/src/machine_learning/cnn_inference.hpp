#pragma once

#include "cnn_tensor_builder.hpp"

#include <string>
#include <vector>

namespace sovereign::ml {

struct CnnInferenceResult {
    std::vector<float> probabilities;
    int predicted_class = -1;
    bool ok = false;
    std::string reason = "uninitialized";
};

class CnnInferenceEngine {
public:
    explicit CnnInferenceEngine(std::string model_name = "cnn_baseline_v0");

    const std::string& modelName() const;
    CnnInferenceResult predict(const CnnTensor& tensor) const;

private:
    std::string model_name_;
};

} // namespace sovereign::ml
