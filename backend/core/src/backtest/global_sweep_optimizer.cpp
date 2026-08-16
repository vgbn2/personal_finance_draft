#include "global_sweep_optimizer.hpp"
#include <span>
#include "data/binary_ts_reader.hpp"
#include "research/walk_forward_split.hpp"

#include <algorithm>
#include <array>
#include <cmath>
#include <iostream>
#include <tuple>
#include <unordered_map>
#include <unordered_set>

#if defined(_OPENMP)
#include <omp.h>
#endif

namespace sovereign::backtest {

namespace {

std::size_t productCardinality(const std::array<std::size_t, 7>& sizes) {
    std::size_t total = 1U;
    for (const std::size_t size : sizes) {
        if (size == 0U) return 0U;
        total *= size;
    }
    return total;
}

std::array<std::size_t, 7> cartesianIndices(
    std::size_t ordinal,
    const std::array<std::size_t, 7>& sizes) {
    std::array<std::size_t, 7> indices{};
    for (std::size_t dimension = sizes.size(); dimension-- > 0U;) {
        indices[dimension] = ordinal % sizes[dimension];
        ordinal /= sizes[dimension];
    }
    return indices;
}

} // namespace

std::vector<strategies::SweepStrategyParams> GlobalSweepOptimizer::buildSweepGrid(const GlobalSweepOptions& options) {
    const std::array<std::size_t, 7> sizes = {
        options.archetypes.size(),
        options.rsi_periods.size(),
        options.atr_periods.size(),
        options.bollinger_periods.size(),
        options.volatility_periods.size(),
        options.thresholds.size(),
        options.holding_periods.size(),
    };
    const std::size_t cardinality = productCardinality(sizes);
    std::vector<strategies::SweepStrategyParams> grid;
    grid.reserve(cardinality);
    for (std::size_t ordinal = 0U; ordinal < cardinality; ++ordinal) {
        const auto index = cartesianIndices(ordinal, sizes);
        grid.push_back({
            options.archetypes[index[0]],
            options.rsi_periods[index[1]],
            options.atr_periods[index[2]],
            options.bollinger_periods[index[3]],
            options.volatility_periods[index[4]],
            options.thresholds[index[5]],
            options.holding_periods[index[6]],
        });
    }
    return grid;
}

struct TargetFileSpec {
    std::filesystem::path path;
    std::string family;
    std::string symbol;
    std::string timeframe;
    std::string fingerprint;
};

std::string datasetKey(const std::string& symbol, const std::string& timeframe) {
    return symbol + "\n" + timeframe;
}

bool verifyDatasetSnapshot(
    const std::filesystem::path& ts_dir,
    const TargetFileSpec& file_spec,
    std::string& error) {
    if (file_spec.fingerprint.empty()) return true;

    std::string family;
    if (!BinaryTsReader::readSidecarFamily(
            ts_dir,
            file_spec.symbol,
            file_spec.timeframe,
            family,
            error)) {
        return false;
    }
    if (family != file_spec.family) {
        error = "dataset_family_mismatch:" + file_spec.symbol + "@" + file_spec.timeframe;
        return false;
    }

    std::string digest;
    if (!BinaryTsReader::sha256File(file_spec.path, digest, error)) return false;
    if (digest != file_spec.fingerprint) {
        error = "dataset_fingerprint_mismatch:" + file_spec.symbol + "@" + file_spec.timeframe;
        return false;
    }
    return true;
}

BinaryTsReaderResult loadTargetBars(
    const std::filesystem::path& ts_dir,
    const TargetFileSpec& file_spec,
    const GlobalSweepOptions& options,
    std::string& error) {
    if (!verifyDatasetSnapshot(ts_dir, file_spec, error)) return {};
    auto read_result = BinaryTsReader::loadSymbolBinary(
        ts_dir,
        file_spec.symbol,
        file_spec.timeframe,
        options.max_bars,
        true);
    if (!read_result.ok) {
        error = "dataset_read_failed:" + file_spec.symbol + "@" + file_spec.timeframe
            + ":" + read_result.error;
        return {};
    }
    if (!verifyDatasetSnapshot(ts_dir, file_spec, error)) return {};
    return read_result;
}

struct LoadedDataset {
    TargetFileSpec file_spec;
    std::vector<OhlcvBar> bars;
};

struct SelectionSlices {
    std::span<const OhlcvBar> train;
    std::span<const OhlcvBar> validation;
    std::span<const OhlcvBar> holdout;
    std::size_t validation_scoring_start = 0U;
    std::size_t holdout_scoring_start = 0U;
    bool ok = false;
};

std::size_t maxValue(const std::vector<std::size_t>& values, std::size_t fallback) {
    return values.empty() ? fallback : *std::max_element(values.begin(), values.end());
}

SelectionSlices prepareSelectionSlices(
    std::span<const OhlcvBar> bars,
    const GlobalSweepOptions& options) {
    const std::size_t warmup = std::max({
        std::max<std::size_t>(30U, maxValue(options.rsi_periods, 30U)),
        std::max<std::size_t>(30U, maxValue(options.atr_periods, 30U)),
        std::max<std::size_t>(40U, maxValue(options.bollinger_periods, 40U)),
        std::max<std::size_t>(60U, maxValue(options.volatility_periods, 60U)),
    });
    const double validation_ratio = (1.0 - std::clamp(options.train_ratio, 0.40, 0.75)) / 2.0;
    const auto split = buildWalkForwardBarSplit(bars.size(), warmup, options.train_ratio, validation_ratio);
    if (!split.valid(bars.size())) return {};

    SelectionSlices slices;
    slices.train = bars.subspan(0U, split.train_end);
    slices.validation = bars.subspan(split.validation_start, split.validation_end - split.validation_start);
    slices.holdout = bars.subspan(split.holdout_start);
    slices.validation_scoring_start = split.validation_scoring_start;
    slices.holdout_scoring_start = split.holdout_scoring_start;
    slices.ok = true;
    return slices;
}

struct SensitivityEvaluation {
    SymbolPlateaus plateaus;
    std::size_t evaluations = 0U;
};

SensitivityEvaluation evaluateSensitivityCurves(
    const SelectionSlices& slices,
    const TargetFileSpec& file_spec,
    strategies::StrategyArchetype archetype,
    double cost_bps) {
    strategies::SweepStrategyParams base_params;
    base_params.archetype = archetype;
    SensitivityEvaluation result;
    result.plateaus.symbol = file_spec.symbol;
    result.plateaus.timeframe = file_spec.timeframe;
    result.plateaus.archetype = archetype;

    const auto buildCurve = [&](std::size_t first, std::size_t last, std::size_t step, auto set_value) {
        std::vector<strategies::SensitivityPoint> curve;
        for (std::size_t value = first; value <= last; value += step) {
            auto params = base_params;
            set_value(params, value);
            const auto trial = strategies::StrategySweepEvaluator::evaluateTrial(
                slices.train,
                slices.validation,
                file_spec.symbol,
                file_spec.timeframe,
                params,
                cost_bps,
                slices.validation_scoring_start);
            curve.push_back({
                value,
                trial.validation_result.summary.net_return,
                trial.validation_result.summary.max_drawdown,
                trial.validation_result.summary.sharpe,
                trial.validation_result.summary.trades,
                trial.fitness_score,
            });
            ++result.evaluations;
        }
        return curve;
    };

    result.plateaus.rsi_plateaus = strategies::StrategySweepEvaluator::extractPlateaus(
        buildCurve(5U, 30U, 1U, [](auto& params, std::size_t value) { params.rsi_period = value; }));
    result.plateaus.atr_plateaus = strategies::StrategySweepEvaluator::extractPlateaus(
        buildCurve(5U, 30U, 1U, [](auto& params, std::size_t value) { params.atr_period = value; }));
    result.plateaus.bollinger_plateaus = strategies::StrategySweepEvaluator::extractPlateaus(
        buildCurve(10U, 40U, 2U, [](auto& params, std::size_t value) { params.bollinger_period = value; }));
    result.plateaus.volatility_plateaus = strategies::StrategySweepEvaluator::extractPlateaus(
        buildCurve(10U, 60U, 5U, [](auto& params, std::size_t value) { params.volatility_period = value; }));
    result.plateaus.holding_plateaus = strategies::StrategySweepEvaluator::extractPlateaus(
        buildCurve(1U, 15U, 1U, [](auto& params, std::size_t value) { params.holding_period = value; }));
    return result;
}

struct JointCandidates {
    std::vector<std::size_t> rsi;
    std::vector<std::size_t> atr;
    std::vector<std::size_t> bollinger;
    std::vector<std::size_t> volatility;
    std::vector<std::size_t> holding;
};

void normalizeCandidates(
    std::vector<std::size_t>& candidates,
    std::vector<std::size_t> fallback) {
    if (candidates.empty()) candidates = std::move(fallback);
    std::sort(candidates.begin(), candidates.end());
    candidates.erase(std::unique(candidates.begin(), candidates.end()), candidates.end());
}

JointCandidates buildJointCandidates(const SymbolPlateaus& plateaus) {
    JointCandidates candidates;
    for (const auto& plateau : plateaus.rsi_plateaus) {
        candidates.rsi.push_back(plateau.min_value);
        candidates.rsi.push_back((plateau.min_value + plateau.max_value) / 2U);
        candidates.rsi.push_back(plateau.max_value);
    }
    for (const auto& plateau : plateaus.atr_plateaus) {
        candidates.atr.push_back(plateau.min_value);
        candidates.atr.push_back((plateau.min_value + plateau.max_value) / 2U);
        candidates.atr.push_back(plateau.max_value);
    }
    for (const auto& plateau : plateaus.bollinger_plateaus) {
        candidates.bollinger.push_back(plateau.min_value);
        candidates.bollinger.push_back(plateau.max_value);
    }
    for (const auto& plateau : plateaus.volatility_plateaus) {
        candidates.volatility.push_back(plateau.min_value);
        candidates.volatility.push_back(plateau.max_value);
    }
    for (const auto& plateau : plateaus.holding_plateaus) {
        candidates.holding.push_back(plateau.min_value);
        candidates.holding.push_back(plateau.max_value);
    }

    normalizeCandidates(candidates.rsi, {7U, 14U, 21U});
    normalizeCandidates(candidates.atr, {7U, 14U, 21U});
    normalizeCandidates(candidates.bollinger, {10U, 20U, 30U});
    normalizeCandidates(candidates.volatility, {10U, 20U, 60U});
    normalizeCandidates(candidates.holding, {3U, 5U, 10U});
    return candidates;
}

strategies::SweepTrialResult selectBestTrial(
    const SelectionSlices& slices,
    const TargetFileSpec& file_spec,
    strategies::StrategyArchetype archetype,
    const JointCandidates& candidates,
    const GlobalSweepOptions& options,
    std::size_t& evaluation_count) {
    strategies::SweepTrialResult best_trial;
    best_trial.fitness_score = -9999.0;

    const std::array<std::size_t, 7> sizes = {
        1U,
        candidates.rsi.size(),
        candidates.atr.size(),
        candidates.bollinger.size(),
        candidates.volatility.size(),
        options.thresholds.size(),
        candidates.holding.size(),
    };
    const std::size_t cardinality = productCardinality(sizes);
    for (std::size_t ordinal = 0U; ordinal < cardinality; ++ordinal) {
        const auto index = cartesianIndices(ordinal, sizes);
        strategies::SweepStrategyParams params;
        params.archetype = archetype;
        params.rsi_period = candidates.rsi[index[1]];
        params.atr_period = candidates.atr[index[2]];
        params.bollinger_period = candidates.bollinger[index[3]];
        params.volatility_period = candidates.volatility[index[4]];
        params.threshold = options.thresholds[index[5]];
        params.holding_period = candidates.holding[index[6]];

        const auto trial = strategies::StrategySweepEvaluator::evaluateTrial(
            slices.train,
            slices.validation,
            file_spec.symbol,
            file_spec.timeframe,
            params,
            options.cost_bps,
            slices.validation_scoring_start);
        ++evaluation_count;
        if (trial.selection_eligible
            && (!best_trial.selection_eligible
                || trial.fitness_score > best_trial.fitness_score)) {
            best_trial = trial;
        }
    }
    return best_trial;
}

GlobalSweepResult GlobalSweepOptimizer::runSweep(
    const std::filesystem::path& ts_dir,
    const std::vector<std::string>& symbols,
    const std::vector<std::string>& timeframes,
    const GlobalSweepOptions& options) {

    GlobalSweepResult result;

    if (!std::isfinite(options.train_ratio)
        || options.train_ratio < 0.40
        || options.train_ratio > 0.75) {
        result.error = "train_ratio_must_be_between_0.40_and_0.75";
        return result;
    }
    if (!std::filesystem::exists(ts_dir) || !std::filesystem::is_directory(ts_dir)) {
        result.ok = false;
        result.error = "invalid_ts_directory:" + ts_dir.string();
        return result;
    }

    std::unordered_set<std::string> target_symbols(symbols.begin(), symbols.end());
    std::unordered_set<std::string> target_tfs(timeframes.begin(), timeframes.end());
    std::unordered_map<std::string, SweepDatasetRequest> validated_pairs;
    for (const auto& dataset : options.validated_datasets) {
        const std::string key = datasetKey(dataset.symbol, dataset.timeframe);
        if (!validated_pairs.emplace(key, dataset).second) {
            result.error = "duplicate_validated_dataset:" + dataset.symbol + "@" + dataset.timeframe;
            return result;
        }
    }
    const bool exact_selection = !validated_pairs.empty();
    const bool all_symbols = symbols.empty() || (symbols.size() == 1 && symbols[0] == "all");
    const bool all_tfs = timeframes.empty() || (timeframes.size() == 1 && timeframes[0] == "all");

    std::vector<TargetFileSpec> target_files;
    if (exact_selection) {
        target_files.reserve(validated_pairs.size());
        for (const auto& [key, dataset] : validated_pairs) {
            static_cast<void>(key);
            const auto path = BinaryTsReader::buildBinaryPath(
                ts_dir,
                dataset.symbol,
                dataset.timeframe);
            if (!std::filesystem::is_regular_file(path)) continue;
            target_files.push_back({
                path,
                dataset.family,
                dataset.symbol,
                dataset.timeframe,
                dataset.fingerprint,
            });
        }
    } else {
        for (const auto& entry : std::filesystem::directory_iterator(ts_dir)) {
            if (!entry.is_regular_file()) continue;
            const auto path = entry.path();
            if (path.extension() != ".bin") continue;

            const std::string stem = path.stem().string();
            const std::size_t sep = stem.rfind('_');
            if (sep == std::string::npos || sep == 0 || sep + 1 >= stem.size()) continue;

            const std::string sym = stem.substr(0, sep);
            const std::string tf = stem.substr(sep + 1);
            if (!all_symbols && !target_symbols.count(sym)) continue;
            if (!all_tfs && !target_tfs.count(tf)) continue;
            target_files.push_back({path, {}, sym, tf, {}});
        }
    }
    std::sort(target_files.begin(), target_files.end(), [](const auto& left, const auto& right) {
        return std::tie(left.family, left.symbol, left.timeframe)
            < std::tie(right.family, right.symbol, right.timeframe);
    });

    if (target_files.empty()) {
        result.ok = false;
        result.error = "no_matching_binary_ts_files_found";
        return result;
    }
    if (exact_selection && target_files.size() != validated_pairs.size()) {
        result.error = "not_all_validated_datasets_resolved";
        return result;
    }

    std::vector<LoadedDataset> loaded_datasets;
    loaded_datasets.reserve(target_files.size());
    for (const auto& file_spec : target_files) {
        std::string dataset_error;
        auto read_res = loadTargetBars(ts_dir, file_spec, options, dataset_error);
        if (!dataset_error.empty()) {
            result.error = dataset_error;
            return result;
        }
        if (read_res.bars.size() < 30U) {
            result.error = "dataset_insufficient_bars:" + file_spec.symbol + "@" + file_spec.timeframe;
            return result;
        }
        loaded_datasets.push_back({file_spec, std::move(read_res.bars)});
    }

    const auto shortest = std::min_element(
        loaded_datasets.begin(),
        loaded_datasets.end(),
        [](const auto& left, const auto& right) { return left.bars.size() < right.bars.size(); });
    result.effective_bars = shortest->bars.size();
    for (auto& dataset : loaded_datasets) {
        if (dataset.bars.size() > result.effective_bars) {
            dataset.bars.erase(
                dataset.bars.begin(),
                dataset.bars.end() - static_cast<std::ptrdiff_t>(result.effective_bars));
        }
        if (!prepareSelectionSlices(dataset.bars, options).ok) {
            result.error = "dataset_split_invalid:" + dataset.file_spec.symbol + "@" + dataset.file_spec.timeframe;
            return result;
        }
    }
    result.total_datasets = loaded_datasets.size();

    std::vector<strategies::SweepTrialResult> thread_trials;
    std::vector<SymbolPlateaus> thread_discovered_plateaus;
    std::vector<std::string> dataset_errors;
    std::size_t pass1_evals_total = 0;
    std::size_t pass2_evals_total = 0;

#if defined(_OPENMP)
    #pragma omp parallel
    {
        std::vector<strategies::SweepTrialResult> local_trials;
        std::vector<SymbolPlateaus> local_plateaus;
        std::size_t local_p1 = 0;
        std::size_t local_p2 = 0;

        #pragma omp for schedule(dynamic)
        for (std::size_t i = 0; i < loaded_datasets.size(); ++i) {
            const auto& dataset = loaded_datasets[i];
            const auto& file_spec = dataset.file_spec;
            const auto slices = prepareSelectionSlices(dataset.bars, options);
            if (!slices.ok) {
                #pragma omp critical
                dataset_errors.push_back(
                    "dataset_split_invalid:" + file_spec.symbol + "@" + file_spec.timeframe);
                continue;
            }

            for (const auto arch : options.archetypes) {
                auto sensitivity = evaluateSensitivityCurves(
                    slices,
                    file_spec,
                    arch,
                    options.cost_bps);
                local_p1 += sensitivity.evaluations;
                local_plateaus.push_back(sensitivity.plateaus);

                const auto candidates = buildJointCandidates(sensitivity.plateaus);
                auto best_trial = selectBestTrial(
                    slices,
                    file_spec,
                    arch,
                    candidates,
                    options,
                    local_p2);

                if (best_trial.selection_eligible) {
                    strategies::StrategySweepEvaluator::evaluateHoldout(
                        best_trial,
                        slices.holdout,
                        slices.holdout_scoring_start,
                        options.cost_bps);
                    local_trials.push_back(best_trial);
                }
            }
        }

        #pragma omp critical
        {
            thread_trials.insert(thread_trials.end(), local_trials.begin(), local_trials.end());
            thread_discovered_plateaus.insert(thread_discovered_plateaus.end(), local_plateaus.begin(), local_plateaus.end());
            pass1_evals_total += local_p1;
            pass2_evals_total += local_p2;
        }
    }
#else
    for (const auto& dataset : loaded_datasets) {
        const auto& file_spec = dataset.file_spec;
        const auto slices = prepareSelectionSlices(dataset.bars, options);
        if (!slices.ok) {
            result.error = "dataset_split_invalid:" + file_spec.symbol + "@" + file_spec.timeframe;
            return result;
        }

        for (const auto arch : options.archetypes) {
            auto sensitivity = evaluateSensitivityCurves(
                slices,
                file_spec,
                arch,
                options.cost_bps);
            pass1_evals_total += sensitivity.evaluations;
            thread_discovered_plateaus.push_back(sensitivity.plateaus);

            const auto candidates = buildJointCandidates(sensitivity.plateaus);
            auto best_trial = selectBestTrial(
                slices,
                file_spec,
                arch,
                candidates,
                options,
                pass2_evals_total);

            if (best_trial.selection_eligible) {
                strategies::StrategySweepEvaluator::evaluateHoldout(
                    best_trial,
                    slices.holdout,
                    slices.holdout_scoring_start,
                    options.cost_bps);
                thread_trials.push_back(best_trial);
            }
        }
    }
#endif

    if (!dataset_errors.empty()) {
        std::sort(dataset_errors.begin(), dataset_errors.end());
        result.error = dataset_errors.front();
        return result;
    }
    result.total_pass1_evaluations = pass1_evals_total;
    result.total_pass2_evaluations = pass2_evals_total;
    result.discovered_plateaus = std::move(thread_discovered_plateaus);
    if (thread_trials.empty()) {
        result.error = "no_selection_eligible_trials";
        return result;
    }

    std::sort(thread_trials.begin(), thread_trials.end(), [](const auto& left, const auto& right) {
        if (left.fitness_score != right.fitness_score) {
            return left.fitness_score > right.fitness_score;
        }
        return std::tie(left.symbol, left.timeframe, left.params.archetype)
            < std::tie(right.symbol, right.timeframe, right.params.archetype);
    });

    const std::size_t top_count = std::min(options.top_k, thread_trials.size());
    result.leader_board.assign(thread_trials.begin(), thread_trials.begin() + top_count);

    // Filter per-strategy champions
    std::unordered_set<std::string> seen_archetypes;
    for (const auto& trial : thread_trials) {
        const std::string arch_str = strategies::archetypeToString(trial.params.archetype);
        if (!seen_archetypes.count(arch_str)) {
            seen_archetypes.insert(arch_str);
            result.strategy_champions.push_back(trial);
        }
    }

    result.ok = true;
    return result;
}

GlobalSweepResult GlobalSweepOptimizer::runValidatedSweep(
    const std::filesystem::path& ts_dir,
    const std::vector<SweepDatasetRequest>& datasets,
    const GlobalSweepOptions& options) {
    if (datasets.empty()) {
        GlobalSweepResult result;
        result.error = "validated_datasets_required";
        return result;
    }
    GlobalSweepOptions validated_options = options;
    validated_options.validated_datasets = datasets;
    return runSweep(ts_dir, {}, {}, validated_options);
}

} // namespace sovereign::backtest
