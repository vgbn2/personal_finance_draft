#ifndef SOVEREIGN_FEATURES_PATH_SIGNATURE_HPP
#define SOVEREIGN_FEATURES_PATH_SIGNATURE_HPP

#include <vector>

namespace sovereign {
namespace features {

class PathSignatureGenerator {
public:
    explicit PathSignatureGenerator(int max_level = 2);

    // Transform price series into Absolute Price Path: X_i = X_{i-1} + |P_i - P_{i-1}|
    // Isolates volatility signals
    std::vector<double> generateAbsolutePricePath(const std::vector<double>& prices) const;

    // Calculate level-k signature of a d-dimensional path
    // path is a vector of states, where each state is a vector of size d
    std::vector<double> calculateSignature(const std::vector<std::vector<double>>& path) const;

private:
    int max_level_;

    // Helper functions
    int intPow(int base, int exp) const;
    int getLevelOffset(int d, int level) const;
    std::vector<double> tensorProduct(const std::vector<double>& A, const std::vector<double>& B, int d) const;
    std::vector<double> segmentSignature(const std::vector<double>& increment) const;
};

} // namespace features
} // namespace sovereign

#endif // SOVEREIGN_FEATURES_PATH_SIGNATURE_HPP
