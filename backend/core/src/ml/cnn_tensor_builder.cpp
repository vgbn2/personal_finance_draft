#include "ml/cnn_tensor_builder.hpp"
#include <iostream>
#include <algorithm>

namespace sovereign::ml {

namespace {

template <typename FrameT, typename TimestampFn>
CnnTensor buildTensorImpl(const FrameT& frame,
                          const std::vector<std::string>& feature_keys,
                          size_t window_size,
                          TimestampFn timestamp_for_row,
                          const char* frame_label) {
    if (frame.rows.size() < window_size || feature_keys.empty()) {
        return {};
    }

    const size_t num_features = feature_keys.size();
    std::vector<bool> row_is_valid(frame.rows.size(), false);

    for (size_t i = 0; i < frame.rows.size(); ++i) {
        bool all_present = true;
        for (const auto& key : feature_keys) {
            if (!frame.rows[i].get(key).has_value()) {
                all_present = false;
                break;
            }
        }
        row_is_valid[i] = all_present;
    }

    std::vector<size_t> window_ends;
    for (size_t i = window_size - 1; i < frame.rows.size(); ++i) {
        bool window_valid = true;
        for (size_t j = i - window_size + 1; j <= i; ++j) {
            if (!row_is_valid[j]) {
                window_valid = false;
                break;
            }
        }
        if (window_valid) {
            window_ends.push_back(i);
        }
    }

    if (window_ends.empty()) {
        std::cout << "[VISIBILITY] CnnTensorBuilder(" << frame_label
                  << "): No valid windows found (insufficient data or missing features).\n";
        return {};
    }

    CnnTensor tensor;
    tensor.shape = {window_ends.size(), window_size, num_features};
    tensor.data.reserve(tensor.batch_size() * tensor.sequence_length() * tensor.num_features());

    for (size_t end_idx : window_ends) {
        for (size_t i = end_idx - window_size + 1; i <= end_idx; ++i) {
            for (const auto& key : feature_keys) {
                tensor.data.push_back(static_cast<float>(*frame.rows[i].get(key)));
            }
        }
    }

    if (!tensor.empty()) {
        std::cout << "[VISIBILITY] CnnTensorBuilder(" << frame_label << "): Built tensor of shape ["
                  << tensor.batch_size() << ", " << tensor.sequence_length() << ", "
                  << tensor.num_features() << "]\n";

        double sum = 0.0;
        for (float x : tensor.data) {
            sum += x;
        }
        const double mean = sum / static_cast<double>(tensor.data.size());

        double sq_sum = 0.0;
        for (float x : tensor.data) {
            const double diff = static_cast<double>(x) - mean;
            sq_sum += diff * diff;
        }
        const double var = sq_sum / static_cast<double>(tensor.data.size());

        std::cout << "[VISIBILITY] Tensor Fingerprint: Mean=" << mean << ", Var=" << var << "\n";
        std::cout << "[VISIBILITY] Boundary Samples: First=" << tensor.data.front()
                  << ", Last=" << tensor.data.back() << "\n";
        std::cout << "[VISIBILITY] Feature Keys: [";
        for (size_t i = 0; i < feature_keys.size(); ++i) {
            std::cout << feature_keys[i] << (i + 1U == feature_keys.size() ? "" : ", ");
        }
        std::cout << "]\n";
        std::cout << "[VISIBILITY] Temporal Range: [" << timestamp_for_row(frame.rows[window_ends.front()])
                  << " ... " << timestamp_for_row(frame.rows[window_ends.back()]) << "]\n\n";
    }

    return tensor;
}

} // namespace
//ide error-dev review
CnnTensorBuilder::CnnTensorBuilder(size_t window_size) : m_window_size(window_size) {}

CnnTensor CnnTensorBuilder::build(const indicators::IndicatorFrame& frame,
                                  const std::vector<std::string>& feature_keys) const {
    return buildTensorImpl(
        frame,
        feature_keys,
        m_window_size,
        [](const indicators::IndicatorRow& row) -> const std::string& { return row.bar.timestamp; },
        "IndicatorFrame");
}

CnnTensor CnnTensorBuilder::build(const features::FeatureFrame& frame,
                                  const std::vector<std::string>& feature_keys) const {
    return buildTensorImpl(
        frame,
        feature_keys,
        m_window_size,
        [](const features::FeatureRow& row) -> const std::string& { return row.timestamp; },
        "FeatureFrame");
}

} // namespace sovereign::ml
