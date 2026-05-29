#include "path_signature.hpp"
#include <cmath>
#include <stdexcept>

namespace sovereign {
namespace features {

PathSignatureGenerator::PathSignatureGenerator(int max_level)
    : max_level_(max_level) {
    if (max_level < 0) {
        throw std::invalid_argument("max_level must be non-negative");
    }
}

std::vector<double> PathSignatureGenerator::generateAbsolutePricePath(const std::vector<double>& prices) const {
    if (prices.empty()) {
        return {};
    }
    
    std::vector<double> abs_path(prices.size(), 0.0);
    abs_path[0] = 0.0;
    
    for (size_t i = 1; i < prices.size(); ++i) {
        abs_path[i] = abs_path[i-1] + std::abs(prices[i] - prices[i-1]);
    }
    
    return abs_path;
}

int PathSignatureGenerator::intPow(int base, int exp) const {
    int res = 1;
    for (int i = 0; i < exp; ++i) {
        res *= base;
    }
    return res;
}

int PathSignatureGenerator::getLevelOffset(int d, int level) const {
    if (d == 1) return level;
    int offset = 0;
    int power = 1;
    for (int i = 0; i < level; ++i) {
        offset += power;
        power *= d;
    }
    return offset;
}

std::vector<double> PathSignatureGenerator::tensorProduct(const std::vector<double>& A, const std::vector<double>& B, int d) const {
    int total_size = static_cast<int>(A.size());
    std::vector<double> result(total_size, 0.0);
    
    for (int m = 0; m <= max_level_; ++m) {
        int res_offset = getLevelOffset(d, m);
        
        for (int j = 0; j <= m; ++j) {
            int a_level = j;
            int b_level = m - j;
            
            int a_offset = getLevelOffset(d, a_level);
            int a_len = intPow(d, a_level);
            
            int b_offset = getLevelOffset(d, b_level);
            int b_len = intPow(d, b_level);
            
            for (int u = 0; u < a_len; ++u) {
                for (int v = 0; v < b_len; ++v) {
                    result[res_offset + u * b_len + v] += A[a_offset + u] * B[b_offset + v];
                }
            }
        }
    }
    return result;
}

std::vector<double> PathSignatureGenerator::segmentSignature(const std::vector<double>& increment) const {
    int d = static_cast<int>(increment.size());
    int total_size = getLevelOffset(d, max_level_ + 1);
    std::vector<double> sig(total_size, 0.0);
    sig[0] = 1.0;
    
    if (max_level_ >= 1) {
        int offset = getLevelOffset(d, 1);
        for (int i = 0; i < d; ++i) {
            sig[offset + i] = increment[i];
        }
    }
    
    for (int m = 2; m <= max_level_; ++m) {
        int prev_offset = getLevelOffset(d, m - 1);
        int curr_offset = getLevelOffset(d, m);
        int prev_len = intPow(d, m - 1);
        
        for (int i = 0; i < prev_len; ++i) {
            for (int j = 0; j < d; ++j) {
                sig[curr_offset + i * d + j] = sig[prev_offset + i] * increment[j] / m;
            }
        }
    }
    
    return sig;
}

std::vector<double> PathSignatureGenerator::calculateSignature(const std::vector<std::vector<double>>& path) const {
    if (path.empty()) return {};
    
    int d = static_cast<int>(path[0].size());
    if (d == 0) {
        throw std::invalid_argument("Path dimension must be > 0");
    }
    
    int total_size = getLevelOffset(d, max_level_ + 1);
    
    std::vector<double> sig(total_size, 0.0);
    sig[0] = 1.0; 
    
    for (size_t i = 1; i < path.size(); ++i) {
        std::vector<double> increment(d);
        for (int j = 0; j < d; ++j) {
            increment[j] = path[i][j] - path[i-1][j];
        }
        
        std::vector<double> seg_sig = segmentSignature(increment);
        sig = tensorProduct(sig, seg_sig, d);
    }
    
    return sig;
}

} // namespace features
} // namespace sovereign
