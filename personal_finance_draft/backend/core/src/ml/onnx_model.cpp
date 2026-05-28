#include "ml/onnx_model.hpp"
#include <iostream>
#include <algorithm>
#include <stdexcept>
#include <numeric>
#include <chrono>

#ifndef SOVEREIGN_ONNX_RUNTIME_ENABLED
#define SOVEREIGN_ONNX_RUNTIME_ENABLED 0
#endif

#if SOVEREIGN_ONNX_RUNTIME_ENABLED
#include <onnxruntime_cxx_api.h>
#endif

namespace sovereign {
namespace ml {
// IDE error -dev review
struct OnnxModel::Impl {
    std::string model_name = "Kronos-Base";
    bool initialized = false;
    bool verbose = false;

#if SOVEREIGN_ONNX_RUNTIME_ENABLED
    Ort::Env env{ORT_LOGGING_LEVEL_WARNING, "SovereignML"};
    Ort::SessionOptions session_options;
    std::unique_ptr<Ort::Session> session;
    Ort::MemoryInfo memory_info = Ort::MemoryInfo::CreateCpu(OrtArenaAllocator, OrtMemTypeDefault);
#endif
};

OnnxModel::OnnxModel(const std::string& model_path) 
    : m_model_path(model_path), pimpl(std::make_unique<Impl>()) {
    
    try {
#if SOVEREIGN_ONNX_RUNTIME_ENABLED
        if (!model_path.empty()) {
            pimpl->session = std::make_unique<Ort::Session>(pimpl->env, model_path.c_str(), pimpl->session_options);
            pimpl->initialized = true;
        }
#else
        pimpl->initialized = true;
#endif
    } catch (const std::exception& e) {
        if (pimpl->verbose) {
            std::cerr << "[ONNX] Initialization failed: " << e.what() << std::endl;
        }
    }
}

OnnxModel::~OnnxModel() = default;

void OnnxModel::setVerbose(bool verbose) {
    pimpl->verbose = verbose;
}

std::string OnnxModel::backend() const {
#if SOVEREIGN_ONNX_RUNTIME_ENABLED
    return pimpl->session ? "onnx_runtime" : "onnx_runtime_unlinked";
#else
    return "deterministic_baseline";
#endif
}

InferenceResult OnnxModel::predict(const std::vector<int>& flat_tokens, size_t batch_size, size_t window_size) {
    if (!pimpl->initialized) {
        throw std::runtime_error("OnnxModel not initialized.");
    }

    if (flat_tokens.size() != batch_size * window_size) {
        throw std::invalid_argument("Input size does not match batch_size * window_size.");
    }

    auto start_time = std::chrono::high_resolution_clock::now();

#if SOVEREIGN_ONNX_RUNTIME_ENABLED
    if (pimpl->session) {
        const char* input_names[] = {"input"};
        const char* output_names[] = {"output"};
        std::vector<int64_t> input_shape = { static_cast<int64_t>(batch_size), static_cast<int64_t>(window_size) };
        
        std::vector<int64_t> input_tensor_values(flat_tokens.begin(), flat_tokens.end());

        Ort::Value input_tensor = Ort::Value::CreateTensor<int64_t>(
            pimpl->memory_info, input_tensor_values.data(), input_tensor_values.size(), input_shape.data(), input_shape.size());

        auto convert_time = std::chrono::high_resolution_clock::now();
        auto output_tensors = pimpl->session->Run(Ort::RunOptions{nullptr}, input_names, &input_tensor, 1, output_names, 1);
        auto inference_time = std::chrono::high_resolution_clock::now();
        
        float* float_ptr = output_tensors.front().GetTensorMutableData<float>();

        InferenceResult result;
        result.probabilities.assign(float_ptr, float_ptr + batch_size);
        result.predicted_class = static_cast<int>(std::distance(result.probabilities.begin(), std::max_element(result.probabilities.begin(), result.probabilities.end())));
        result.backend = backend();

        if (pimpl->verbose) {
            auto total_time = std::chrono::duration_cast<std::chrono::microseconds>(inference_time - start_time).count();
            auto c_time = std::chrono::duration_cast<std::chrono::microseconds>(convert_time - start_time).count();
            auto i_time = std::chrono::duration_cast<std::chrono::microseconds>(inference_time - convert_time).count();
            std::cout << "[LATENCY] Total: " << total_time << "us | Convert: " << c_time << "us | Inference: " << i_time << "us" << std::endl;
        }

        return result;
    }
#endif

    InferenceResult result;
    result.probabilities = {0.1f, 0.2f, 0.7f};
    result.predicted_class = 2;
    result.backend = backend();

    return result;
}

} // namespace ml
} // namespace sovereign
