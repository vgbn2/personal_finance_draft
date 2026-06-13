#pragma once

#include <vector>
#include <string>
#include <memory>

// Note: In a production environment with ONNX Runtime installed, 
// we would include <onnxruntime_cxx_api.h>. 
// To ensure the code is valid for this session's audit, we use an 
// abstraction that can be wired to the real library.

namespace sovereign {
namespace ml {

struct InferenceResult {
    std::vector<float> probabilities;
    int predicted_class;
    std::string backend;
};

// Result of a batched float-feature inference (one entry per input row).
struct BatchInferenceResult {
    std::vector<int> predicted_class;               // argmax / label per row
    std::vector<std::vector<float>> probabilities;   // per-row class probabilities (may be empty)
    std::string backend;
    std::size_t rows = 0;
};

class OnnxModel {
public:
    explicit OnnxModel(const std::string& model_path);
    ~OnnxModel();

    /**
     * @brief Executes inference on a flattened batch of tokens.
     * @param flat_tokens Flat vector of tokens [BatchSize * WindowSize].
     * @param batch_size Number of windows in the batch.
     * @param window_size Number of tokens per window (lookback).
     * @return InferenceResult containing the model output.
     */
    InferenceResult predict(const std::vector<int>& flat_tokens, size_t batch_size, size_t window_size);

    /**
     * @brief Runs batched inference on a flat float feature matrix [batch_size * n_features].
     *        Input tensor is float32 named "input"; outputs are read by type (int64 label
     *        tensor and/or float probability tensor) so it works for skl2onnx and xgboost
     *        converters alike. Used by the `ml predict` / `ml compare` command.
     */
    BatchInferenceResult predictBatch(const std::vector<float>& flat_features, size_t batch_size, size_t n_features);

    /**
     * @brief Controls the verbosity of the model's logging.
     * @param verbose If true, enables [DATA FLOW] and [ML] logs.
     */
    void setVerbose(bool verbose);

    /**
     * @brief Names the active inference backend for audit and CI gates.
     */
    std::string backend() const;

private:
    std::string m_model_path;
    // Implementation-defined pointer to hide ONNX Runtime headers from this header
    struct Impl;
    std::unique_ptr<Impl> pimpl;
};

} // namespace ml
} // namespace sovereign
