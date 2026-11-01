#include "ml/onnx_model.hpp"

#include <cmath>
#include <iostream>
#include <stdexcept>
#include <string>
#include <vector>

using sovereign::ml::OnnxModel;

#ifndef SOVEREIGN_ONNX_RUNTIME_ENABLED
#define SOVEREIGN_ONNX_RUNTIME_ENABLED 0
#endif

int run();

int main() {
    try {
        return run();
    } catch (const std::exception& e) {
        std::cerr << "onnx_model_test FAILED: " << e.what() << std::endl;
        return 1;
    }
}

int run() {
    const std::vector<int> tokens{1, 2, 3, 4, 5, 6};

#if SOVEREIGN_ONNX_RUNTIME_ENABLED
    // Real ONNX Runtime path: load a checked-in smoke model (input int64 [batch,window]
    // -> output float [batch] = row mean) and prove inference actually runs in C++.
    const std::string model_path = std::string(SOVEREIGN_REPO_ROOT) + "/storage/models/smoke.onnx";
    OnnxModel model(model_path);

    if (model.backend() != "onnx_runtime") {
        throw std::runtime_error("ONNX enabled build must use onnx_runtime backend, got: " + model.backend());
    }

    const auto result = model.predict(tokens, 2, 3);
    if (result.backend != "onnx_runtime") {
        throw std::runtime_error("Prediction result backend must match model backend");
    }
    if (result.probabilities.size() != 2) {
        throw std::runtime_error("Expected 2 outputs (one per batch row)");
    }
    // mean(1,2,3)=2, mean(4,5,6)=5 -> argmax is row 1.
    if (std::fabs(result.probabilities[0] - 2.0f) > 1e-4f ||
        std::fabs(result.probabilities[1] - 5.0f) > 1e-4f) {
        throw std::runtime_error("Smoke model output mismatch (expected [2,5])");
    }
    if (result.predicted_class != 1) {
        throw std::runtime_error("Expected predicted_class 1 (argmax of [2,5])");
    }

    std::cout << "[DATA FLOW] ONNX backend: " << result.backend << "\n";
    std::cout << "[DATA FLOW] smoke model output: [" << result.probabilities[0]
              << ", " << result.probabilities[1] << "] argmax=" << result.predicted_class << "\n";
    std::cout << "onnx_model_test passed (real onnx_runtime inference)" << std::endl;
    return 0;
#else
    // Disabled build: deterministic baseline boundary (no runtime linked).
    OnnxModel model("models/kronos_base.onnx");
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
#endif
}
