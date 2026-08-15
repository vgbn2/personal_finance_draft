#include "data_snapshot.hpp"
#include "binary_ts_reader.hpp"
#include "data_validator.hpp"

#include <algorithm>
#include <cstddef>
#include <charconv>
#include <map>
#include <fstream>
#include <limits>
#include <string_view>
#include <sstream>
#include <utility>

namespace sovereign {

namespace {

std::string readFile(const std::filesystem::path& path, bool& ok) {
    std::ifstream input(path, std::ios::binary);
    if (!input) {
        ok = false;
        return {};
    }
    std::ostringstream buffer;
    buffer << input.rdbuf();
    ok = true;
    return buffer.str();
}

std::string unescapeJsonString(std::string_view value) {
    std::string out;
    out.reserve(value.size());
    bool escaped = false;
    for (const char ch : value) {
        if (escaped) {
            switch (ch) {
            case 'n': out.push_back('\n'); break;
            case 'r': out.push_back('\r'); break;
            case 't': out.push_back('\t'); break;
            default: out.push_back(ch); break;
            }
            escaped = false;
            continue;
        }
        if (ch == '\\') {
            escaped = true;
            continue;
        }
        out.push_back(ch);
    }
    return out;
}

bool stringField(std::string_view object, std::string_view key, std::string& value) {
    std::string search_key = "\"";
    search_key += key;
    search_key += "\"";
    
    auto pos = object.find(search_key);
    if (pos == std::string_view::npos) return false;

    pos += search_key.size();
    while (pos < object.size() && (object[pos] == ':' || std::isspace(static_cast<unsigned char>(object[pos])))) {
        ++pos;
    }

    if (pos >= object.size() || object[pos] != '"') return false;
    ++pos;

    auto start = pos;
    bool escaped = false;
    while (pos < object.size()) {
        if (escaped) {
            escaped = false;
        } else if (object[pos] == '\\') {
            escaped = true;
        } else if (object[pos] == '"') {
            break;
        }
        ++pos;
    }

    if (pos >= object.size()) return false;
    value = unescapeJsonString(object.substr(start, pos - start));
    return true;
}

bool numberField(std::string_view object, std::string_view key, double& value) {
    std::string search_key = "\"";
    search_key += key;
    search_key += "\"";
    
    auto pos = object.find(search_key);
    if (pos == std::string_view::npos) return false;

    pos += search_key.size();
    while (pos < object.size() && (object[pos] == ':' || std::isspace(static_cast<unsigned char>(object[pos])))) {
        ++pos;
    }

    if (pos >= object.size()) return false;

    auto start = pos;
    while (pos < object.size() && (std::isdigit(static_cast<unsigned char>(object[pos])) || 
                                   object[pos] == '-' || object[pos] == '+' || 
                                   object[pos] == '.' || object[pos] == 'e' || object[pos] == 'E')) {
        ++pos;
    }

    if (pos == start) return false;

    auto sub = object.substr(start, pos - start);
    auto [ptr, ec] = std::from_chars(sub.data(), sub.data() + sub.size(), value);
    if (ec == std::errc()) {
        return true;
    }

    // Fallback for some compilers or edge cases if from_chars fails (e.g. hex or localized)
    try {
        std::string num_str(sub);
        std::size_t processed = 0;
        value = std::stod(num_str, &processed);
        return processed > 0;
    } catch (...) {
        return false;
    }
}

std::string topLevelFetchedAt(std::string_view content) {
    std::string fetched_at;
    const auto sources_pos = content.find("\"sources\"");
    const std::string_view header = sources_pos == std::string_view::npos ? content : content.substr(0, sources_pos);
    stringField(header, "fetched_at", fetched_at);
    return fetched_at;
}

std::string assetSymbol(std::string_view object) {
    std::string symbol;
    if (stringField(object, "symbol", symbol) && !symbol.empty()) return symbol;
    if (stringField(object, "series", symbol) && !symbol.empty()) return symbol;
    if (stringField(object, "metric", symbol) && !symbol.empty()) return symbol;
    if (stringField(object, "underlying", symbol) && !symbol.empty()) return symbol;
    if (stringField(object, "event", symbol) && !symbol.empty()) return symbol;
    return {};
}

std::string assetId(std::string_view object, std::string_view symbol) {
    std::string coord;
    if (stringField(object, "coordinate_id", coord) && !coord.empty()) return coord;

    std::string family;
    if (stringField(object, "family", family) && !family.empty()) {
        return family + ":" + std::string(symbol);
    }
    return std::string(symbol);
}

std::vector<std::string_view> sourceObjects(std::string_view content) {
    std::vector<std::string_view> objects;
    const auto sources_pos = content.find("\"sources\"");
    if (sources_pos == std::string_view::npos) {
        return objects;
    }
    const auto array_start = content.find('[', sources_pos);
    if (array_start == std::string_view::npos) {
        return objects;
    }

    bool in_string = false;
    bool escaped = false;
    int depth = 0;
    std::size_t object_start = std::string_view::npos;
    for (std::size_t i = array_start + 1; i < content.size(); ++i) {
        const char ch = content[i];
        if (escaped) {
            escaped = false;
            continue;
        }
        if (ch == '\\' && in_string) {
            escaped = true;
            continue;
        }
        if (ch == '"') {
            in_string = !in_string;
            continue;
        }
        if (in_string) {
            continue;
        }
        if (ch == '{') {
            if (depth == 0) {
                object_start = i;
            }
            ++depth;
        } else if (ch == '}') {
            --depth;
            if (depth == 0 && object_start != std::string_view::npos) {
                objects.push_back(content.substr(object_start, i - object_start + 1));
                object_start = std::string_view::npos;
            }
        } else if (ch == ']' && depth == 0) {
            break;
        }
    }
    return objects;
}

void reject(DataQualityReport& report, const std::string& reason) {
    report.ok = false;
    report.rejected_records.push_back(reason);
}

std::vector<std::filesystem::path> resolveInputFiles(const std::filesystem::path& input_path) {
    std::vector<std::filesystem::path> files;
    if (std::filesystem::is_directory(input_path)) {
        for (const auto& entry : std::filesystem::recursive_directory_iterator(input_path)) {
            if (entry.is_regular_file() && entry.path().filename() == "backtest_history.json") {
                files.push_back(entry.path());
            }
        }
    } else if (std::filesystem::exists(input_path)) {
        files.push_back(input_path);
    }
    return files;
}

} // namespace

MarketDataSummary summarizeBars(std::string symbol, std::string timeframe, const std::vector<OhlcvBar>& bars) {
    MarketDataSummary summary;
    summary.symbol = std::move(symbol);
    summary.timeframe = std::move(timeframe);
    summary.bars = bars.size();
    if (bars.empty()) {
        return summary;
    }

    summary.first_close = bars.front().close;
    summary.last_close = bars.back().close;
    summary.min_close = bars.front().close;
    summary.max_close = bars.front().close;
    for (const auto& bar : bars) {
        summary.min_close = std::min(summary.min_close, bar.close);
        summary.max_close = std::max(summary.max_close, bar.close);
        summary.total_volume += bar.volume;
    }
    return summary;
}

MarketDataSnapshot loadMarketDataSnapshot(
    const std::filesystem::path& input_path,
    std::string symbol,
    std::string timeframe,
    std::size_t max_bars
) {
    MarketDataSnapshot snapshot;
    snapshot.summary.symbol = symbol;
    snapshot.summary.timeframe = timeframe;

    // Try binary TS index first (input_path or storage/data/ts fallback)
    auto ts_res = BinaryTsReader::loadSymbolBinary(input_path, symbol, timeframe, max_bars);
    if (!ts_res.ok || ts_res.bars.empty()) {
        ts_res = BinaryTsReader::loadSymbolBinary("storage/data/ts", symbol, timeframe, max_bars);
    }
    if (ts_res.ok && !ts_res.bars.empty()) {
        snapshot.bars = std::move(ts_res.bars);
        snapshot.quality.ok = true;
        return snapshot;
    }

    const auto files = resolveInputFiles(input_path);
    if (files.empty()) {
        reject(snapshot.quality, input_path.generic_string() + ":missing_input");
        return snapshot;
    }

    for (const auto& file : files) {
        bool read_ok = false;
        const std::string content = readFile(file, read_ok);
        if (!read_ok) continue;

        const std::string fetched_at = topLevelFetchedAt(content);
        const auto objects = sourceObjects(content);
        for (const auto& object : objects) {
            std::string row_symbol = assetSymbol(object);
            std::string row_coord;
            std::string row_timeframe;
            std::string timestamp;

            bool symbolMatch = !row_symbol.empty() && row_symbol == symbol;
            bool coordMatch = stringField(object, "coordinate_id", row_coord) && row_coord == symbol;

            if (!symbolMatch && !coordMatch) {
                continue;
            }

            if (!timeframe.empty() && stringField(object, "timeframe", row_timeframe) && row_timeframe != timeframe) {
                continue;
            }
            if (row_timeframe.empty()) {
                row_timeframe = timeframe;
            }
            if (!stringField(object, "timestamp", timestamp)) {
                reject(snapshot.quality, row_symbol + ":missing_timestamp");
                snapshot.quality.missing_timestamps.push_back(row_symbol + ":missing_timestamp");
                continue;
            }

            OhlcvBar bar;
            bar.asset_id = assetId(object, row_symbol);
            bar.timestamp = std::move(timestamp);
            bar.timeframe = std::move(row_timeframe);
            stringField(object, "source", bar.source);
            if (bar.source.empty()) {
                stringField(object, "provider", bar.source);
            }
            if (!stringField(object, "ingested_at", bar.ingested_at)) {
                bar.ingested_at = fetched_at.empty() ? bar.timestamp : fetched_at;
            }

            if (!numberField(object, "open", bar.open) ||
                !numberField(object, "high", bar.high) ||
                !numberField(object, "low", bar.low) ||
                !numberField(object, "close", bar.close)) {
                reject(snapshot.quality, row_symbol + "@" + bar.timestamp + ":missing_ohlc");
                continue;
            }
            if (!numberField(object, "volume", bar.volume)) {
                bar.volume = 0.0;
            }
            if (!DataValidator::validateBar(bar, snapshot.quality)) {
                continue;
            }
            snapshot.bars.push_back(std::move(bar));
        }
    }

    std::sort(snapshot.bars.begin(), snapshot.bars.end(), [](const auto& lhs, const auto& rhs) {
        return lhs.timestamp < rhs.timestamp;
    });
    if (max_bars > 0U && snapshot.bars.size() > max_bars) {
        snapshot.bars.erase(snapshot.bars.begin(), snapshot.bars.end() - static_cast<std::ptrdiff_t>(max_bars));
    }
    if (snapshot.bars.empty()) {
        reject(snapshot.quality, symbol + ":" + timeframe + ":no_matching_bars");
    }
    snapshot.summary = summarizeBars(std::move(symbol), std::move(timeframe), snapshot.bars);
    return snapshot;
}

MarketUniverse loadMarketUniverse(const std::filesystem::path& input_path, std::size_t max_entries) {
    MarketUniverse universe;

    const auto files = resolveInputFiles(input_path);
    if (files.empty()) {
        reject(universe.quality, input_path.generic_string() + ":missing_input");
        return universe;
    }

    std::map<std::string, MarketUniverseEntry> entries;
    for (const auto& file : files) {
        bool read_ok = false;
        const std::string content = readFile(file, read_ok);
        if (!read_ok) continue;

        const auto objects = sourceObjects(content);
        for (const auto& object : objects) {
            std::string symbol = assetSymbol(object);
            if (symbol.empty()) {
                universe.quality.missing_timestamps.push_back("universe:missing_symbol");
                reject(universe.quality, "universe:missing_symbol");
                continue;
            }
            auto& entry = entries[symbol];
            entry.symbol = symbol;
            ++entry.records;
            std::string timeframe;
            if (stringField(object, "timeframe", timeframe) && !timeframe.empty() &&
                std::find(entry.timeframes.begin(), entry.timeframes.end(), timeframe) == entry.timeframes.end()) {
                entry.timeframes.push_back(timeframe);
            }
        }
    }

    for (auto& [_, entry] : entries) {
        std::sort(entry.timeframes.begin(), entry.timeframes.end());
        universe.entries.push_back(std::move(entry));
    }

    std::sort(universe.entries.begin(), universe.entries.end(), [](const auto& lhs, const auto& rhs) {
        if (lhs.records != rhs.records) {
            return lhs.records > rhs.records;
        }
        return lhs.symbol < rhs.symbol;
    });

    if (max_entries > 0U && universe.entries.size() > max_entries) {
        universe.entries.resize(max_entries);
    }
    if (universe.entries.empty()) {
        reject(universe.quality, "universe:no_symbols");
    }
    return universe;
}

} // namespace sovereign
