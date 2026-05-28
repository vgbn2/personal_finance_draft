#include "data_snapshot.hpp"
#include "data_validator.hpp"

#include <algorithm>
#include <cstddef>
#include <map>
#include <fstream>
#include <limits>
#include <regex>
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

std::string unescapeJsonString(std::string value) {
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

bool stringField(const std::string& object, const std::string& key, std::string& value) {
    const std::regex pattern("\"" + key + "\"\\s*:\\s*\"((?:\\\\.|[^\"])*)\"");
    std::smatch match;
    if (!std::regex_search(object, match, pattern)) {
        return false;
    }
    value = unescapeJsonString(match[1].str());
    return true;
}

bool numberField(const std::string& object, const std::string& key, double& value) {
    const std::regex pattern("\"" + key + "\"\\s*:\\s*(-?(?:\\d+\\.?\\d*|\\.\\d+)(?:[eE][+-]?\\d+)?)");
    std::smatch match;
    if (!std::regex_search(object, match, pattern)) {
        return false;
    }
    try {
        value = std::stod(match[1].str());
        return true;
    } catch (const std::exception&) {
        return false;
    }
}

std::string topLevelFetchedAt(const std::string& content) {
    std::string fetched_at;
    const auto sources_pos = content.find("\"sources\"");
    const std::string header = sources_pos == std::string::npos ? content : content.substr(0, sources_pos);
    stringField(header, "fetched_at", fetched_at);
    return fetched_at;
}

std::string assetId(const std::string& object, const std::string& symbol) {
    std::string family;
    if (stringField(object, "family", family) && !family.empty()) {
        return family + ":" + symbol;
    }
    return symbol;
}

std::vector<std::string> sourceObjects(const std::string& content) {
    std::vector<std::string> objects;
    const auto sources_pos = content.find("\"sources\"");
    if (sources_pos == std::string::npos) {
        return objects;
    }
    const auto array_start = content.find('[', sources_pos);
    if (array_start == std::string::npos) {
        return objects;
    }

    bool in_string = false;
    bool escaped = false;
    int depth = 0;
    std::size_t object_start = std::string::npos;
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
            if (depth == 0 && object_start != std::string::npos) {
                objects.push_back(content.substr(object_start, i - object_start + 1));
                object_start = std::string::npos;
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

    bool read_ok = false;
    const std::string content = readFile(input_path, read_ok);
    if (!read_ok) {
        reject(snapshot.quality, input_path.generic_string() + ":missing_input");
        return snapshot;
    }

    const std::string fetched_at = topLevelFetchedAt(content);
    const auto objects = sourceObjects(content);
    for (const auto& object : objects) {
        std::string row_symbol;
        std::string row_timeframe;
        std::string timestamp;
        if (!stringField(object, "symbol", row_symbol) || row_symbol != symbol) {
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

    bool read_ok = false;
    const std::string content = readFile(input_path, read_ok);
    if (!read_ok) {
        reject(universe.quality, input_path.generic_string() + ":missing_input");
        return universe;
    }

    const auto objects = sourceObjects(content);
    std::map<std::string, MarketUniverseEntry> entries;
    for (const auto& object : objects) {
        std::string symbol;
        if (!stringField(object, "symbol", symbol) || symbol.empty()) {
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
