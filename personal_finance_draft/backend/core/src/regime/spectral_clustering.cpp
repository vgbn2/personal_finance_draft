#include "spectral_clustering.hpp"

#include <limits>
#include <utility>

namespace sovereign {
namespace regime {

namespace {

double squared_distance(const std::vector<double>& lhs, const std::vector<double>& rhs) {
    if (lhs.size() != rhs.size()) {
        throw std::invalid_argument("Vectors must have the same dimension for spectral clustering.");
    }
    double total = 0.0;
    for (std::size_t index = 0; index < lhs.size(); ++index) {
        const double diff = lhs[index] - rhs[index];
        total += diff * diff;
    }
    return total;
}

std::vector<std::vector<double>> build_similarity_matrix(const std::vector<std::vector<double>>& data, double scale_param) {
    const std::size_t n = data.size();
    std::vector<std::vector<double>> similarity_matrix(n, std::vector<double>(n, 0.0));
    if (n == 0) {
        return similarity_matrix;
    }

    const double scale = scale_param > 0.0 ? scale_param : 1.0;
    const double gamma = 1.0 / (2.0 * scale * scale);

    for (std::size_t i = 0; i < n; ++i) {
        similarity_matrix[i][i] = 1.0;
        for (std::size_t j = i + 1; j < n; ++j) {
            const double value = rbf_kernel(data[i], data[j], gamma);
            similarity_matrix[i][j] = value;
            similarity_matrix[j][i] = value;
        }
    }
    return similarity_matrix;
}

double euclidean_distance(const std::vector<double>& lhs, const std::vector<double>& rhs) {
    return std::sqrt(squared_distance(lhs, rhs));
}

std::vector<std::vector<double>> select_initial_centroids(const std::vector<std::vector<double>>& points, int k_clusters) {
    std::vector<std::vector<double>> centroids;
    if (points.empty() || k_clusters <= 0) {
        return centroids;
    }

    const std::size_t n = points.size();
    centroids.reserve(static_cast<std::size_t>(k_clusters));
    for (int cluster = 0; cluster < k_clusters; ++cluster) {
        const std::size_t index = static_cast<std::size_t>((cluster * n) / static_cast<std::size_t>(k_clusters));
        centroids.push_back(points[index < n ? index : n - 1]);
    }
    return centroids;
}

std::vector<int> run_kmeans(const std::vector<std::vector<double>>& points, int k_clusters) {
    const std::size_t n = points.size();
    if (n == 0 || k_clusters <= 0) {
        return {};
    }
    k_clusters = std::min<int>(k_clusters, static_cast<int>(n));

    auto centroids = select_initial_centroids(points, k_clusters);
    std::vector<int> labels(n, 0);

    for (int iteration = 0; iteration < 25; ++iteration) {
        bool changed = false;
        for (std::size_t i = 0; i < n; ++i) {
            double best_distance = std::numeric_limits<double>::infinity();
            int best_cluster = 0;
            for (int cluster = 0; cluster < k_clusters; ++cluster) {
                const double distance = euclidean_distance(points[i], centroids[static_cast<std::size_t>(cluster)]);
                if (distance < best_distance) {
                    best_distance = distance;
                    best_cluster = cluster;
                }
            }
            if (labels[i] != best_cluster) {
                labels[i] = best_cluster;
                changed = true;
            }
        }

        std::vector<std::vector<double>> next_centroids(static_cast<std::size_t>(k_clusters), std::vector<double>(points[0].size(), 0.0));
        std::vector<std::size_t> counts(static_cast<std::size_t>(k_clusters), 0);
        for (std::size_t i = 0; i < n; ++i) {
            const int label = labels[i];
            counts[static_cast<std::size_t>(label)] += 1;
            for (std::size_t dimension = 0; dimension < points[i].size(); ++dimension) {
                next_centroids[static_cast<std::size_t>(label)][dimension] += points[i][dimension];
            }
        }

        for (int cluster = 0; cluster < k_clusters; ++cluster) {
            const std::size_t cluster_index = static_cast<std::size_t>(cluster);
            if (counts[cluster_index] == 0) {
                next_centroids[cluster_index] = centroids[cluster_index];
                continue;
            }
            for (double& value : next_centroids[cluster_index]) {
                value /= static_cast<double>(counts[cluster_index]);
            }
        }

        centroids = std::move(next_centroids);
        if (!changed) {
            break;
        }
    }

    return labels;
}

} // namespace

double rbf_kernel(const std::vector<double>& x, const std::vector<double>& y, double gamma) {
    if (x.size() != y.size()) {
        throw std::invalid_argument("Vectors must have the same dimension for RBF kernel.");
    }
    double sq_dist = 0.0;
    for (size_t i = 0; i < x.size(); ++i) {
        double diff = x[i] - y[i];
        sq_dist += diff * diff;
    }
    return std::exp(-gamma * sq_dist);
}

double calculate_mmd(const std::vector<std::vector<double>>& X, 
                     const std::vector<std::vector<double>>& Y, 
                     double gamma) {
    if (X.empty() || Y.empty()) {
        return 0.0;
    }

    size_t n = X.size();
    size_t m = Y.size();

    // Sum of kernels between samples in X
    double sum_xx = 0.0;
    for (size_t i = 0; i < n; ++i) {
        for (size_t j = 0; j < n; ++j) {
            sum_xx += rbf_kernel(X[i], X[j], gamma);
        }
    }

    // Sum of kernels between samples in Y
    double sum_yy = 0.0;
    for (size_t i = 0; i < m; ++i) {
        for (size_t j = 0; j < m; ++j) {
            sum_yy += rbf_kernel(Y[i], Y[j], gamma);
        }
    }

    // Sum of kernels between samples in X and Y
    double sum_xy = 0.0;
    for (size_t i = 0; i < n; ++i) {
        for (size_t j = 0; j < m; ++j) {
            sum_xy += rbf_kernel(X[i], Y[j], gamma);
        }
    }

    // MMD^2 empirical estimate
    return (sum_xx / (n * n)) + (sum_yy / (m * m)) - (2.0 * sum_xy / (n * m));
}

AzranGhahramaniClustering::AzranGhahramaniClustering(int k_clusters, double scale_param)
    : k_clusters_(k_clusters), scale_param_(scale_param) {}

std::vector<std::vector<double>> AzranGhahramaniClustering::create_transition_matrix(const std::vector<std::vector<double>>& similarity_matrix) const {
    if (similarity_matrix.empty()) return {};

    size_t n = similarity_matrix.size();
    std::vector<std::vector<double>> transition_matrix(n, std::vector<double>(n, 0.0));

    for (size_t i = 0; i < n; ++i) {
        double row_sum = 0.0;
        for (size_t j = 0; j < n; ++j) {
            row_sum += similarity_matrix[i][j];
        }

        // Normalize row to create Markov transition probabilities
        if (row_sum > 0.0) {
            for (size_t j = 0; j < n; ++j) {
                transition_matrix[i][j] = similarity_matrix[i][j] / row_sum;
            }
        }
    }

    return transition_matrix;
}

double AzranGhahramaniClustering::calculate_eigengap_separation(const std::vector<double>& sorted_eigenvalues) const {
    if (sorted_eigenvalues.size() < 2) return 0.0;
    
    // Assuming sorted_eigenvalues is sorted in descending order (largest first)
    // The k-th eigengap is |lambda_k - lambda_{k+1}|
    // We check the gap at k_clusters_ - 1 (0-based indexing)
    
    size_t k_idx = static_cast<size_t>(k_clusters_) - 1;
    if (k_idx + 1 < sorted_eigenvalues.size()) {
        return std::abs(sorted_eigenvalues[k_idx] - sorted_eigenvalues[k_idx + 1]);
    }
    
    return 0.0; 
}

std::vector<int> AzranGhahramaniClustering::fit_predict(const std::vector<std::vector<double>>& data) {
    if (data.empty()) {
        return {};
    }

    const int cluster_count = std::max(1, std::min(k_clusters_, static_cast<int>(data.size())));
    const auto similarity_matrix = build_similarity_matrix(data, scale_param_);
    const auto transition_matrix = create_transition_matrix(similarity_matrix);
    const auto labels = run_kmeans(transition_matrix, cluster_count);
    return labels.empty() ? std::vector<int>(data.size(), 0) : labels;
}

} // namespace regime
} // namespace sovereign
