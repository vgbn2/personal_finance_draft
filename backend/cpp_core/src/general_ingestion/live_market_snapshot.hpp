#pragma once

#include <cstddef>
#include <fstream>
#include <map>
#include <sstream>
#include <stdexcept>
#include <string>

namespace sovereign {
namespace ingestion {

struct LiveMarketSnapshotSummary {
    std::string mode;
    std::map<std::string, std::size_t> family_counts;
    std::size_t provider_checks = 0;
    bool has_errors = false;
};

inline std::string read_text_file(const std::string& path) {
    std::ifstream input(path);
    if (!input) {
        throw std::runtime_error("Unable to open live market snapshot: " + path);
    }

    std::ostringstream buffer;
    buffer << input.rdbuf();
    return buffer.str();
}

inline std::size_t count_occurrences(const std::string& text, const std::string& needle) {
    std::size_t count = 0;
    std::size_t offset = 0;

    while ((offset = text.find(needle, offset)) != std::string::npos) {
        ++count;
        offset += needle.size();
    }

    return count;
}

inline bool contains_clean_error_array(const std::string& text) {
    return text.find("\"errors\": []") != std::string::npos;
}

inline LiveMarketSnapshotSummary summarize_live_market_snapshot(const std::string& path) {
    const std::string text = read_text_file(path);
    LiveMarketSnapshotSummary summary;

    if (text.find("\"mode\": \"live\"") != std::string::npos ||
        text.find("\"mode\": \"recovered_live\"") != std::string::npos) {
        summary.mode = "live";
    }

    const std::string family_prefix = "\"family\": \"";
    std::size_t offset = 0;
    while ((offset = text.find(family_prefix, offset)) != std::string::npos) {
        offset += family_prefix.size();
        const std::size_t end = text.find('"', offset);
        if (end == std::string::npos) {
            break;
        }

        ++summary.family_counts[text.substr(offset, end - offset)];
        offset = end + 1;
    }

    summary.provider_checks = count_occurrences(text, "\"status\": \"ok\"");
    summary.has_errors = !contains_clean_error_array(text);
    return summary;
}

inline bool has_family(const LiveMarketSnapshotSummary& summary, const std::string& family) {
    return summary.family_counts.find(family) != summary.family_counts.end();
}

} // namespace ingestion
} // namespace sovereign
