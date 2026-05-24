#include "parser/ohlcv_parser.hpp"

#include "data/data_validator.hpp"
#include "parser/csv_ohlcv_parser.hpp"
#include "parser/csv_parser.hpp"

#include <algorithm>
#include <cctype>
#include <charconv>
#include <fstream>
#include <optional>
#include <regex>
#include <sstream>
#include <string>
#include <string_view>

namespace sovereign::parser {

namespace {

std::string trimmed(std::string_view value) {
    std::size_t start = 0;
    std::size_t end = value.size();
    while (start < value.size() && std::isspace(static_cast<unsigned char>(value[start])) != 0) {
        ++start;
    }
    while (end > start && std::isspace(static_cast<unsigned char>(value[end - 1U])) != 0) {
        --end;
    }
    return std::string(value.substr(start, end - start));
}

std::optional<double> parseNumber(std::string_view value) {
    const std::string cleaned = trimmed(value);
    if (cleaned.empty()) {
        return std::nullopt;
    }
    double out = 0.0;
    const auto* begin = cleaned.data();
    const auto* end = cleaned.data() + cleaned.size();
    const auto result = std::from_chars(begin, end, out);
    if (result.ec != std::errc() || result.ptr != end) {
        return std::nullopt;
    }
    return out;
}

std::string currentIngestedAt(const std::string& fallback, const std::string& timestamp) {
    return fallback.empty() ? timestamp : fallback;
}

} // namespace

std::vector<std::string> splitCsvRow(std::string_view line) {
    std::vector<std::string> values;
    std::string current;
    bool in_quotes = false;

    for (std::size_t i = 0; i < line.size(); ++i) {
        const char ch = line[i];
        if (ch == '"') {
            if (in_quotes && i + 1U < line.size() && line[i + 1U] == '"') {
                current.push_back('"');
                ++i;
            } else {
                in_quotes = !in_quotes;
            }
            continue;
        }
        if (ch == ',' && !in_quotes) {
            values.push_back(current);
            current.clear();
            continue;
        }
        current.push_back(ch);
    }
    values.push_back(current);
    return values;
}

std::string trim(std::string_view value) {
    return trimmed(value);
}

std::optional<std::string> jsonStringField(std::string_view object, std::string_view key) {
    const std::regex pattern("\\\"" + std::string(key) + "\\\"\\s*:\\s*\\\"((?:\\\\.|[^\\\"])*)\\\"");
    std::smatch match;
    const std::string source(object);
    if (!std::regex_search(source, match, pattern)) {
        return std::nullopt;
    }
    return match[1].str();
}

std::optional<double> jsonNumberField(std::string_view object, std::string_view key) {
    const std::regex pattern("\\\"" + std::string(key) + "\\\"\\s*:\\s*(-?(?:\\d+\\.?\\d*|\\.\\d+)(?:[eE][+-]?\\d+)?)");
    std::smatch match;
    const std::string source(object);
    if (!std::regex_search(source, match, pattern)) {
        return std::nullopt;
    }
    return parseNumber(match[1].str());
}

std::optional<sovereign::OhlcvBar> parseOhlcvCsvRow(
    std::string_view line,
    std::string_view asset_id,
    std::string_view timeframe,
    std::string_view source,
    std::string_view ingested_at
) {
    const auto values = splitCsvRow(line);
    if (values.size() < 6U) {
        return std::nullopt;
    }

    const auto open = parseNumber(values[1]);
    const auto high = parseNumber(values[2]);
    const auto low = parseNumber(values[3]);
    const auto close = parseNumber(values[4]);
    if (!open || !high || !low || !close) {
        return std::nullopt;
    }

    sovereign::OhlcvBar bar;
    bar.asset_id = std::string(asset_id);
    bar.timestamp = trim(values[0]);
    bar.timeframe = std::string(timeframe);
    bar.open = *open;
    bar.high = *high;
    bar.low = *low;
    bar.close = *close;
    bar.volume = parseNumber(values[5]).value_or(0.0);
    bar.source = std::string(source);
    bar.ingested_at = currentIngestedAt(std::string(ingested_at), bar.timestamp);
    if (bar.timestamp.empty()) {
        return std::nullopt;
    }
    return bar;
}

ParsedOhlcvFile parseOhlcvCsvFile(
    const std::filesystem::path& path,
    const std::string& asset_id,
    const std::string& timeframe,
    const std::string& source,
    const std::string& ingested_at
) {
    ParsedOhlcvFile parsed;
    std::ifstream input(path);
    if (!input) {
        parsed.quality.ok = false;
        parsed.quality.rejected_records.push_back(path.generic_string() + ":missing_input");
        return parsed;
    }

    std::string line;
    bool first_line = true;
    while (std::getline(input, line)) {
        if (line.empty()) {
            continue;
        }
        if (first_line) {
            first_line = false;
            const std::string lowercase = trimmed(line);
            if (lowercase.find("timestamp") != std::string::npos || lowercase.find("date") != std::string::npos) {
                continue;
            }
        }
        const auto parsed_row = parseOhlcvCsvRow(line, asset_id, timeframe, source, ingested_at);
        if (!parsed_row) {
            parsed.quality.ok = false;
            parsed.quality.rejected_records.push_back("csv_row_parse_failed:" + line);
            continue;
        }
        auto bar = *parsed_row;
        if (!sovereign::DataValidator::validateBar(bar, parsed.quality)) {
            continue;
        }
        parsed.bars.push_back(std::move(bar));
    }

    std::sort(parsed.bars.begin(), parsed.bars.end(), [](const auto& lhs, const auto& rhs) {
        return lhs.timestamp < rhs.timestamp;
    });
    if (parsed.bars.empty() && parsed.quality.rejected_records.empty()) {
        parsed.quality.ok = false;
        parsed.quality.rejected_records.push_back(path.generic_string() + ":no_bars_parsed");
    }
    return parsed;
}

} // namespace sovereign::parser
