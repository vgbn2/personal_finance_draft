#pragma once

#include "binary_ts_reader.hpp"

#include <cstdint>
#include <filesystem>
#include <string>

namespace sovereign {

struct BinaryMergeOptions {
    bool existing_wins_on_tie = false;
};

struct BinaryMergeResult {
    bool ok = false;
    std::string error;
    std::uint32_t count = 0;
    std::uint32_t existing_count = 0;
    std::uint32_t incoming_count = 0;
};

class BinaryTsMerger {
public:
    static BinaryMergeResult mergeFiles(
        const std::filesystem::path& existing_bin,
        const std::filesystem::path& incoming_bin,
        const std::filesystem::path& output_tmp_bin,
        const BinaryMergeOptions& options = {});
};

} // namespace sovereign
