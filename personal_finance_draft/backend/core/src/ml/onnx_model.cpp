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
            // ONNX Runtime takes ORTCHAR_T paths: wchar_t on Windows, char elsewhere.
#ifdef _WIN32
            const std::wstring ort_path(model_path.begin(), model_path.end());
#else
            const std::string ort_path = model_path;
#endif
            pimpl->session = std::make_unique<Ort::Session>(pimpl->env, ort_path.c_str(), pimpl->session_options);
            pimpl->initialized = true;
        }
#else
        pimpl->initialized = true;
#endif
    } catch (const std::exception& e) {
        std::cerr << "[ONNX] Initialization failed: " << e.what() << std::endl;
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

#if SOVEREIGN_ONNX_RUNTIME_ENABLED
    auto start_time = std::chrono::high_resolution_clock::now();
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

BatchInferenceResult OnnxModel::predictBatch(const std::vector<float>& flat_features,
                                             size_t batch_size, size_t n_features) {
    if (!pimpl->initialized) {
        throw std::runtime_error("OnnxModel not initialized.");
    }
    if (flat_features.size() != batch_size * n_features) {
        throw std::invalid_argument("Input size does not match batch_size * n_features.");
    }

    BatchInferenceResult result;
    result.rows = batch_size;
    result.backend = backend();

#if SOVEREIGN_ONNX_RUNTIME_ENABLED
    if (pimpl->session) {
        Ort::AllocatorWithDefaultOptions allocator;

        // Resolve actual input name (our exporters use "input", but query to be safe).
        auto in_name = pimpl->session->GetInputNameAllocated(0, allocator);
        const char* input_names[] = {in_name.get()};

        std::vector<int64_t> input_shape = {
            static_cast<int64_t>(batch_size), static_cast<int64_t>(n_features)};
        std::vector<float> values(flat_features.begin(), flat_features.end());
        Ort::Value input_tensor = Ort::Value::CreateTensor<float>(
            pimpl->memory_info, values.data(), values.size(),
            input_shape.data(), input_shape.size());

        // Run every output so we can pick the label tensor and/or the probability tensor.
        const size_t out_count = pimpl->session->GetOutputCount();
        std::vector<Ort::AllocatedStringPtr> out_holders;
        std::vector<const char*> output_names;
        out_holders.reserve(out_count);
        output_names.reserve(out_count);
        for (size_t i = 0; i < out_count; ++i) {
            out_holders.push_back(pimpl->session->GetOutputNameAllocated(i, allocator));
            output_names.push_back(out_holders.back().get());
        }

        auto outputs = pimpl->session->Run(
            Ort::RunOptions{nullptr}, input_names, &input_tensor, 1,
            output_names.data(), output_names.size());

        std::vector<int> labels;            // from an int64 1-D output, if present
        std::vector<std::vector<float>> probs;  // from a float 2-D [batch, C] output, if present

        for (size_t i = 0; i < outputs.size(); ++i) {
            if (!outputs[i].IsTensor()) continue;  // skipping ZipMap sequences, etc.
            auto info = outputs[i].GetTensorTypeAndShapeInfo();
            const auto type = info.GetElementType();
            const auto shape = info.GetShape();

            if (type == ONNX_TENSOR_ELEMENT_DATA_TYPE_INT64 && labels.empty()) {
                const int64_t* p = outputs[i].GetTensorMutableData<int64_t>();
                size_t n = info.GetElementCount();
                labels.reserve(n);
                for (size_t k = 0; k < n; ++k) labels.push_back(static_cast<int>(p[k]));
            } else if (type == ONNX_TENSOR_ELEMENT_DATA_TYPE_FLOAT && shape.size() == 2 && probs.empty()) {
                const size_t cols = static_cast<size_t>(shape[1]);
                const float* p = outputs[i].GetTensorMutableData<float>();
                probs.resize(batch_size, std::vector<float>(cols, 0.0f));
                for (size_t r = 0; r < batch_size; ++r)
                    for (size_t c = 0; c < cols; ++c) probs[r][c] = p[r * cols + c];
            }
        }

        result.probabilities = probs;
        if (!labels.empty()) {
            result.predicted_class = labels;
        } else if (!probs.empty()) {
            result.predicted_class.reserve(batch_size);
            for (const auto& row : probs) {
                result.predicted_class.push_back(static_cast<int>(
                    std::distance(row.begin(), std::max_element(row.begin(), row.end()))));
            }
        }
        return result;
    }
#endif

    // No ONNX runtime: return an empty prediction set (callers gate on backend()).
    result.predicted_class.assign(batch_size, 0);
    return result;
}

} // namespace ml
} // namespace sovereign
