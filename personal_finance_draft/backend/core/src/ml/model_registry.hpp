#pragma once

#include "features/feature_frame.hpp"

#include <optional>
#include <string>
#include <vector>

namespace sovereign::ml {

struct ModelCandidate {
    std::string name;
    std::string family;
    std::string status;
    std::string description;
};

struct ModelPrediction {
    std::string direction;
    double confidence = 0.0;
    double raw_score = 0.0;
};

struct AssetModelScore {
    std::string model_name;
    std::string family;
    std::string asset_id;
    std::size_t trades = 0;
    double total_return = 0.0;
    double hit_rate = 0.0;
    double expectancy = 0.0;
    double sharpe_like = 0.0;
};

struct ModelScore {
    std::string name;
    std::string family;
    std::string status;
    std::string description;
    std::size_t trades = 0;
    double total_return = 0.0;
    double hit_rate = 0.0;
    double expectancy = 0.0;
    double sharpe_like = 0.0;
    double robustness_score = 0.0;
    std::vector<AssetModelScore> by_asset;
};

struct AssetModelWinner {
    std::string asset_id;
    std::string winner;
    std::vector<AssetModelScore> candidates;
};

struct ModelComparisonReport {
    std::size_t feature_count = 0;
    std::size_t candidate_count = 0;
    std::size_t horizon = 5;
    double threshold = 0.55;
    std::string winner;
    std::vector<std::string> families;
    std::vector<ModelScore> models;
    std::vector<AssetModelWinner> per_asset_winners;
};

const std::vector<ModelCandidate>& defaultModelRegistry();
std::optional<ModelCandidate> findModelCandidate(const std::string& name);
ModelPrediction predictModel(const ModelCandidate& candidate, const features::FeatureRow& row);
ModelComparisonReport compareModelCandidates(
    const features::FeatureFrame& frame,
    std::size_t horizon = 5,
    double threshold = 0.55);

} // namespace sovereign::ml
