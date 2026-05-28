#include "ml/kronos_tensor_builder.hpp"
#include <stdexcept>
#include <iostream>
#include <algorithm>
//
namespace sovereign {
namespace ml {

KronosTensorBuilder::KronosTensorBuilder(size_t window_size) : m_window_size(window_size) {
    if (m_window_size == 0) {
        throw std::invalid_argument("Window size must be greater than zero.");
    }
}

std::vector<std::vector<int>> KronosTensorBuilder::build_windows(const std::vector<int>& tokens) const {
    if (tokens.size() < m_window_size) {
        return {};
    }

    size_t num_windows = tokens.size() - m_window_size + 1;
    std::vector<std::vector<int>> windows;
    windows.reserve(num_windows);

    for (size_t i = 0; i < num_windows; ++i) {
        std::vector<int> window(tokens.begin() + i, tokens.begin() + i + m_window_size);
        windows.push_back(std::move(window));
    }

    // [VISIBILITY] Empirical Data Flow Validation & Lookahead Guard
    if (!windows.empty()) {
        const auto& first = windows.front();
        const auto& last = windows.back();
        
        auto get_stats = [](const std::vector<int>& w) {
            if (w.empty()) return std::make_pair(0.0, 0.0);
            double sum = 0;
            for (int x : w) sum += x;
            double mean = sum / w.size();
            double sq_sum = 0;
            for (int x : w) sq_sum += (x - mean) * (x - mean);
            return std::make_pair(mean, sq_sum / w.size());
        };

        auto first_stats = get_stats(first);
        auto last_stats = get_stats(last);

        std::cout << "[VISIBILITY] KronosTensorBuilder: Built " << windows.size() << " windows (size " << m_window_size << ").\n";
        std::cout << "[VISIBILITY] Window 0 Fingerprint: Mean=" << first_stats.first << ", Var=" << first_stats.second << "\n";
        std::cout << "[VISIBILITY] Window " << windows.size()-1 << " Fingerprint: Mean=" << last_stats.first << ", Var=" << last_stats.second << "\n";
        
        std::cout << "[VISIBILITY] Boundary Tokens (First Window): [" << first.front() << " ... " << first.back() << "]\n";
        std::cout << "[VISIBILITY] Boundary Tokens (Last Window):  [" << last.front() << " ... " << last.back() << "]\n";
        std::cout << std::endl;
    }

    return windows;
}

std::vector<int> KronosTensorBuilder::flatten(const std::vector<std::vector<int>>& windows) const {
    if (windows.empty()) return {};

    std::vector<int> flat;
    flat.reserve(windows.size() * m_window_size);

    for (const auto& window : windows) {
        flat.insert(flat.end(), window.begin(), window.end());
    }

    return flat;
}

} // namespace ml
} // namespace sovereign
