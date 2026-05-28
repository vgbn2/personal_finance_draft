#pragma once

#include <vector>
#include <cmath>
#include <stdexcept>
#include <numeric>
#include <algorithm>

namespace sovereign {
namespace regime {

/**
 * @brief Computes the RBF (Gaussian) Kernel between two vectors.
 * 
 * @param x First vector
 * @param y Second vector
 * @param gamma Kernel coefficient
 * @return double The RBF kernel value
 */
double rbf_kernel(const std::vector<double>& x, const std::vector<double>& y, double gamma = 1.0);

/**
 * @brief Maximum Mean Discrepancy (MMD) empirical estimate using a Gaussian (RBF) kernel.
 * Used to compare two distributions of path signatures.
 * 
 * @param X First distribution (dataset of vectors)
 * @param Y Second distribution (dataset of vectors)
 * @param gamma Kernel coefficient for the RBF kernel
 * @return double The empirical MMD distance
 */
double calculate_mmd(const std::vector<std::vector<double>>& X, 
                     const std::vector<std::vector<double>>& Y, 
                     double gamma = 1.0);

/**
 * @brief Foundational class for the Azran-Ghahramani Multiscale Spectral Clustering framework.
 */
class AzranGhahramaniClustering {
public:
    /**
     * @brief Construct a new Azran Ghahramani Clustering object
     * 
     * @param k_clusters Number of clusters to find
     * @param scale_param The scale parameter for local scaling
     */
    AzranGhahramaniClustering(int k_clusters, double scale_param = 1.0);

    /**
     * @brief Creates a Transition Matrix (Markov random walk matrix) from a similarity matrix.
     * 
     * @param similarity_matrix The input pairwise similarity matrix
     * @return std::vector<std::vector<double>> The row-normalized transition matrix
     */
    std::vector<std::vector<double>> create_transition_matrix(const std::vector<std::vector<double>>& similarity_matrix) const;

    /**
     * @brief Calculates the Eigengap separation given a list of sorted eigenvalues (descending order).
     * 
     * @param sorted_eigenvalues The eigenvalues sorted in descending order
     * @return double The eigengap value at k_clusters_
     */
    double calculate_eigengap_separation(const std::vector<double>& sorted_eigenvalues) const;

    /**
     * @brief Main clustering entrypoint.
     * 
     * @param data The input dataset
     * @return std::vector<int> The cluster labels
     */
    std::vector<int> fit_predict(const std::vector<std::vector<double>>& data);

private:
    int k_clusters_;
    double scale_param_;
};

} // namespace regime
} // namespace sovereign
