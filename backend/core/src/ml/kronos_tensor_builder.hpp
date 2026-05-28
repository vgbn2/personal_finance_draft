#pragma once

#include <vector>

namespace sovereign {
namespace ml {

class KronosTensorBuilder {
public:
    explicit KronosTensorBuilder(size_t window_size = 60);

    /**
     * @brief Transforms a sequence of tokens into a batch of sliding windows.
     * @param tokens The full sequence of token IDs.
     * @return A vector of windows, where each window is a vector of tokens of size window_size.
     */
    std::vector<std::vector<int>> build_windows(const std::vector<int>& tokens) const;

    /**
     * @brief Flattens windows into a single contiguous vector for ONNX input.
     * @param windows The output from build_windows.
     * @return A flat vector [BatchSize * WindowSize].
     */
    std::vector<int> flatten(const std::vector<std::vector<int>>& windows) const;

private:
    size_t m_window_size;
};

} // namespace ml
} // namespace sovereign
