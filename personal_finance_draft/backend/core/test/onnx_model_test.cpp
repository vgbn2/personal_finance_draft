#include "ml/onnx_model.hpp"

#include <cmath>
#include <iostream>
#include <stdexcept>
#include <vector>

using sovereign::ml::OnnxModel;

int main() {
    OnnxModel model("models/kronos_base.onnx");
    const std::vector<int> tokens{1, 2, 3, 4, 5, 6};
    const auto result = model.predict(tokens, 2, 3);

    if (model.backend() != "deterministic_baseline") {
        throw std::runtime_error("Default ONNX boundary must use deterministic_baseline backend");
    }
    if (result.backend != model.backend()) {
        throw std::runtime_error("Prediction result backend must match model backend");
    }
    if (result.predicted_class != 2) {
        throw std::runtime_error("Deterministic baseline class changed unexpectedly");
    }
    if (result.probabilities.size() != 3 || std::fabs(result.probabilities[2] - 0.7f) > 0.0001f) {
        throw std::runtime_error("Deterministic baseline probabilities changed unexpectedly");
    }

    std::cout << "[DATA FLOW] ONNX boundary backend: " << result.backend << "\n";
    std::cout << "[DATA FLOW] Token rows: 2 window: 3 output_class: " << result.predicted_class << "\n";
    std::cout << "onnx_model_test passed" << std::endl;
    return 0;
}
