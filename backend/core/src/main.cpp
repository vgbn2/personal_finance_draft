#include "stats/stats_engine.hpp"
#include "correlation/correlation_engine.hpp"
#include "data/data_snapshot.hpp"
#include "indicators/indicator_engine.hpp"
#include "portfolio/portfolio_state.hpp"
#include "risk/pre_trade_risk.hpp"
#include "backtest/frame_backtester.hpp"
#include "backtest/grid_optimizer.hpp"
#include "backtest/global_sweep_optimizer.hpp"
#include "strategies/strategy_sweep_evaluator.hpp"
#include "data/binary_ts_reader.hpp"
#include "data/binary_ts_merger.hpp"
#include "ml/onnx_model.hpp"

#include <algorithm>
#include <cmath>
#include <cstddef>
#include <cstdint>
#include <cstdio>
#include <exception>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <limits>
#include <map>
#include <numeric>
#include <sstream>
#include <string>
#include <unordered_map>
#include <vector>

namespace {

std::string jsonEscape(const std::string& value) {
    std::string out;
    out.reserve(value.size() + 8);
    for (const unsigned char ch : value) {
        switch (ch) {
        case '\\': out += "\\\\"; break;
        case '"':  out += "\\\""; break;
        case '\n': out += "\\n";  break;
        case '\r': out += "\\r";  break;
        case '\t': out += "\\t";  break;
        default:
            // RFC 8259 §7: control characters 0x00-0x1F must be escaped.
            // Use \uXXXX for the remaining non-printable range.
            if (ch < 0x20) {
                char buf[8];
                std::snprintf(buf, sizeof(buf), "\\u%04X", static_cast<unsigned>(ch));
                out += buf;
            } else {
                out += static_cast<char>(ch);
            }
            break;
        }
    }
    return out;
}

std::string optionValue(const std::vector<std::string>& args, const std::string& name, const std::string& fallback = "") {
    for (std::size_t i = 0; i + 1 < args.size(); ++i) {
        if (args[i] == name) {
            return args[i + 1];
        }
    }
    return fallback;
}

bool hasFlag(const std::vector<std::string>& args, const std::string& name) {
    for (const auto& arg : args) {
        if (arg == name) return true;
    }
    return false;
}

std::uintmax_t fileSizeOrZero(const std::filesystem::path& path) {
    std::error_code ec;
    const auto size = std::filesystem::file_size(path, ec);
    return ec ? 0 : size;
}

std::vector<double> parseEquityCsv(const std::string& csv, bool& ok) {
    std::vector<double> values;
    ok = true;
    std::stringstream stream(csv);
    std::string token;
    while (std::getline(stream, token, ',')) {
        if (token.empty()) {
            ok = false;
            return {};
        }
        try {
            std::size_t parsed = 0;
            const double value = std::stod(token, &parsed);
            if (parsed != token.size()) {
                ok = false;
                return {};
            }
            values.push_back(value);
        } catch (const std::exception&) {
            ok = false;
            return {};
        }
    }
    ok = !values.empty();
    return values;
}

bool parseDoubleStrict(const std::string& token, double& value) {
    try {
        std::size_t parsed = 0;
        value = std::stod(token, &parsed);
        return parsed == token.size();
    } catch (const std::exception&) {
        return false;
    }
}

std::vector<sovereign::Position> parsePositionsCsv(const std::string& csv, bool& ok, std::string& error) {
    std::vector<sovereign::Position> positions;
    ok = true;
    error.clear();
    if (csv.empty()) {
        return positions;
    }

    std::stringstream stream(csv);
    std::string row;
    while (std::getline(stream, row, ';')) {
        if (row.empty()) {
            continue;
        }

        std::vector<std::string> fields;
        std::stringstream row_stream(row);
        std::string field;
        while (std::getline(row_stream, field, ',')) {
            fields.push_back(field);
        }
        if (fields.size() != 4U || fields[0].empty()) {
            ok = false;
            error = "positions must use SYMBOL,QUANTITY,AVERAGE_COST,CURRENT_PRICE rows";
            return {};
        }

        sovereign::Position position;
        position.symbol = fields[0];
        if (!parseDoubleStrict(fields[1], position.quantity) ||
            !parseDoubleStrict(fields[2], position.average_cost) ||
            !parseDoubleStrict(fields[3], position.current_price)) {
            ok = false;
            error = "position quantity, average cost, and current price must be numeric";
            return {};
        }
        positions.push_back(position);
    }

    return positions;
}

std::size_t parseSizeOption(const std::vector<std::string>& args, const std::string& name, std::size_t fallback) {
    const std::string raw = optionValue(args, name);
    if (raw.empty()) {
        return fallback;
    }
    try {
        std::size_t parsed = 0;
        const auto value = static_cast<std::size_t>(std::stoull(raw, &parsed));
        return parsed == raw.size() ? value : fallback;
    } catch (const std::exception&) {
        return fallback;
    }
}

bool parsePositiveSizeStrict(const std::string& raw, std::size_t& value) {
    if (raw.empty()) return false;
    try {
        std::size_t parsed = 0;
        const auto candidate = static_cast<std::size_t>(std::stoull(raw, &parsed));
        if (parsed != raw.size() || candidate == 0U) return false;
        value = candidate;
        return true;
    } catch (const std::exception&) {
        return false;
    }
}

std::vector<std::string> parseSymbols(const std::vector<std::string>& args) {
    const std::string csv = optionValue(args, "--symbols");
    if (csv.empty()) {
        return {
            optionValue(args, "--lhs", "AAPL"),
            optionValue(args, "--mid", "MSFT"),
            optionValue(args, "--rhs", "SPY"),
        };
    }
    std::vector<std::string> symbols;
    std::stringstream stream(csv);
    std::string token;
    while (std::getline(stream, token, ',')) {
        if (!token.empty()) {
            symbols.push_back(token);
        }
    }
    return symbols;
}

void printRejectedReasons(const std::vector<std::string>& reasons) {
    std::cout << "    \"reasons\": [";
    constexpr std::size_t MAX_SHOWN = 8U;
    const std::size_t count = std::min<std::size_t>(reasons.size(), MAX_SHOWN);
    for (std::size_t i = 0; i < count; ++i) {
        if (i > 0) std::cout << ", ";
        std::cout << "\"" << jsonEscape(reasons[i]) << "\"";
    }
    if (reasons.size() > MAX_SHOWN) {
        std::cout << ", \"... " << (reasons.size() - MAX_SHOWN) << " more\"";
    }
    std::cout << "],\n";
    std::cout << "    \"rejected_total\": " << reasons.size() << "\n";
}

int printStatus(const std::vector<std::string>& args) {
    const auto snapshot = std::filesystem::path(optionValue(args, "--snapshot", "storage/data/cache/last_fetch.json"));
    const auto quality = std::filesystem::path(optionValue(args, "--quality", "storage/data/cache/data_quality_report.json"));
    const bool snapshotExists = std::filesystem::exists(snapshot);
    const bool qualityExists = std::filesystem::exists(quality);

    std::cout
        << "{\n"
        << "  \"type\": \"backend_status\",\n"
        << "  \"engine\": \"sovereign_cpp_core\",\n"
        << "  \"schema_version\": 1,\n"
            << "  \"ok\": " << (snapshotExists ? "true" : "false") << ",\n"
            << "  \"status_scope\": \"filesystem_presence\",\n"
        << "  \"snapshot\": {\n"
        << "    \"path\": \"" << jsonEscape(snapshot.generic_string()) << "\",\n"
        << "    \"exists\": " << (snapshotExists ? "true" : "false") << ",\n"
        << "    \"bytes\": " << fileSizeOrZero(snapshot) << "\n"
        << "  },\n"
        << "  \"quality_report\": {\n"
        << "    \"path\": \"" << jsonEscape(quality.generic_string()) << "\",\n"
        << "    \"exists\": " << (qualityExists ? "true" : "false") << ",\n"
        << "    \"bytes\": " << fileSizeOrZero(quality) << "\n"
        << "  }\n"
        << "}\n";
    return snapshotExists ? 0 : 1;
}

int printStats(const std::vector<std::string>& args) {
    bool parsed = true;
    const std::string equity_arg = optionValue(args, "--equity", "100,110,105,120,90,95,130");
    const std::vector<double> equity = parseEquityCsv(equity_arg, parsed);
    if (!parsed) {
        std::cout
            << "{\n"
            << "  \"type\": \"backend_stats\",\n"
            << "  \"engine\": \"sovereign_cpp_core\",\n"
            << "  \"schema_version\": 1,\n"
            << "  \"ok\": false,\n"
            << "  \"error\": \"invalid --equity CSV\"\n"
            << "}\n";
        return 1;
    }

    const auto stats = sovereign::StatsEngine::summarize(equity);
    std::cout
        << "{\n"
        << "  \"type\": \"backend_stats\",\n"
        << "  \"engine\": \"sovereign_cpp_core\",\n"
        << "  \"schema_version\": 1,\n"
        << "  \"ok\": " << (stats.ok ? "true" : "false") << ",\n"
        << "  \"observations\": " << stats.observations << ",\n"
        << "  \"cumulative_return\": " << stats.cumulative_return << ",\n"
        << "  \"annualized_return\": " << stats.annualized_return << ",\n"
        << "  \"volatility\": " << stats.volatility << ",\n"
        << "  \"sharpe\": " << stats.sharpe << ",\n"
        << "  \"sortino\": " << stats.sortino << ",\n"
        << "  \"max_drawdown\": " << stats.max_drawdown << ",\n"
        << "  \"calmar\": " << stats.calmar << ",\n"
        << "  \"drawdown\": {\n"
        << "    \"peak_index\": " << stats.drawdown.peak_index << ",\n"
        << "    \"trough_index\": " << stats.drawdown.trough_index << ",\n"
        << "    \"recovery_index\": " << stats.drawdown.recovery_index << ",\n"
        << "    \"recovered\": " << (stats.drawdown.recovered ? "true" : "false") << "\n"
        << "  }\n"
        << "}\n";
    return stats.ok ? 0 : 1;
}

int printDataSummary(const std::vector<std::string>& args) {
    const std::string symbol = optionValue(args, "--symbol", "SPY");
    const std::string timeframe = optionValue(args, "--timeframe", "1d");
    const auto input = std::filesystem::path(optionValue(args, "--input", "storage/data/cache/backtest_history.json"));
    const std::size_t max_bars = parseSizeOption(args, "--max-bars", 0U);
    const auto snapshot = sovereign::loadMarketDataSnapshot(input, symbol, timeframe, max_bars);
    const auto& summary = snapshot.summary;
    std::cout
        << "{\n"
        << "  \"type\": \"market_data_summary\",\n"
        << "  \"engine\": \"sovereign_cpp_core\",\n"
        << "  \"schema_version\": 1,\n"
        << "  \"ok\": " << (snapshot.quality.ok ? "true" : "false") << ",\n"
        << "  \"input\": \"" << jsonEscape(input.generic_string()) << "\",\n"
        << "  \"summary\": {\n"
        << "    \"symbol\": \"" << jsonEscape(summary.symbol) << "\",\n"
        << "    \"timeframe\": \"" << jsonEscape(summary.timeframe) << "\",\n"
        << "    \"bars\": " << summary.bars << ",\n"
        << "    \"first_close\": " << summary.first_close << ",\n"
        << "    \"last_close\": " << summary.last_close << ",\n"
        << "    \"min_close\": " << summary.min_close << ",\n"
        << "    \"max_close\": " << summary.max_close << ",\n"
        << "    \"total_volume\": " << summary.total_volume << "\n"
        << "  },\n"
        << "  \"quality\": {\n"
        << "    \"ok\": " << (snapshot.quality.ok ? "true" : "false") << ",\n"
        << "    \"accepted_records\": " << snapshot.bars.size() << ",\n"
        << "    \"rejected_records\": " << snapshot.quality.rejected_records.size() << ",\n";
    printRejectedReasons(snapshot.quality.rejected_records);
    std::cout
        << "  }\n"
        << "}\n";
    return snapshot.quality.ok ? 0 : 1;
}

int printCorrelation(const std::vector<std::string>& args) {
    const std::vector<std::string> labels = parseSymbols(args);
    const std::string timeframe = optionValue(args, "--timeframe", "1d");
    const std::string method = optionValue(args, "--method", "pearson-levels");
    const bool use_returns = method == "pearson-returns" || method == "fx-returns";
    const auto input = std::filesystem::path(optionValue(args, "--input", "storage/data/cache/backtest_history.json"));
    const std::size_t max_bars = parseSizeOption(args, "--max-bars", 252U);
    std::vector<std::vector<double>> series;
    std::vector<std::string> rejected;
    std::size_t min_size = std::numeric_limits<std::size_t>::max();
    if (method != "pearson-levels" && method != "pearson-returns" && method != "fx-returns") {
        std::cout
            << "{\n"
            << "  \"type\": \"correlation_matrix\",\n"
            << "  \"engine\": \"sovereign_cpp_core\",\n"
            << "  \"schema_version\": 1,\n"
            << "  \"ok\": false,\n"
            << "  \"input\": \"" << jsonEscape(input.generic_string()) << "\",\n"
            << "  \"method\": \"" << jsonEscape(method) << "\",\n"
            << "  \"error\": \"unsupported correlation method\"\n"
            << "}\n";
        return 1;
    }
    for (const auto& label : labels) {
        const auto snapshot = sovereign::loadMarketDataSnapshot(input, label, timeframe, max_bars);
        if (!snapshot.quality.ok || snapshot.bars.size() < 2U) {
            rejected.insert(rejected.end(), snapshot.quality.rejected_records.begin(), snapshot.quality.rejected_records.end());
            if (snapshot.bars.size() < 2U) {
                rejected.push_back(label + ":" + timeframe + ":insufficient_bars");
            }
        }
        std::vector<double> closes;
        closes.reserve(snapshot.bars.size());
        for (const auto& bar : snapshot.bars) {
            closes.push_back(bar.close);
        }
        auto values = use_returns ? sovereign::logReturnSeries(closes) : std::move(closes);
        if (values.size() < 2U) {
            rejected.push_back(label + ":" + timeframe + ":insufficient_" + (use_returns ? "returns" : "bars"));
        }
        min_size = std::min(min_size, values.size());
        series.push_back(std::move(values));
    }
    if (labels.size() < 2U || min_size < 2U || !rejected.empty()) {
        std::cout
            << "{\n"
            << "  \"type\": \"correlation_matrix\",\n"
            << "  \"engine\": \"sovereign_cpp_core\",\n"
            << "  \"schema_version\": 1,\n"
            << "  \"ok\": false,\n"
            << "  \"input\": \"" << jsonEscape(input.generic_string()) << "\",\n"
            << "  \"error\": \"unable to build correlation matrix from requested symbols\",\n"
            << "  \"quality\": {\n"
            << "    \"ok\": false,\n"
            << "    \"accepted_series\": " << series.size() << ",\n"
            << "    \"rejected_records\": " << rejected.size() << ",\n";
        printRejectedReasons(rejected);
        std::cout << "  }\n}\n";
        return 1;
    }
    for (auto& values : series) {
        if (values.size() > min_size) {
            values.erase(values.begin(), values.end() - static_cast<std::ptrdiff_t>(min_size));
        }
    }
    const auto matrix = sovereign::CorrelationEngine::buildMatrix(labels, series);

    std::cout
        << "{\n"
        << "  \"type\": \"correlation_matrix\",\n"
        << "  \"engine\": \"sovereign_cpp_core\",\n"
        << "  \"schema_version\": 1,\n"
        << "  \"ok\": true,\n"
        << "  \"input\": \"" << jsonEscape(input.generic_string()) << "\",\n"
        << "  \"timeframe\": \"" << jsonEscape(timeframe) << "\",\n"
        << "  \"method\": \"" << jsonEscape(method) << "\",\n"
        << "  \"transform\": \"" << (use_returns ? "log_returns" : "close_levels") << "\",\n"
        << "  \"observations\": " << min_size << ",\n"
        << "  \"labels\": [";
    for (std::size_t i = 0; i < matrix.labels.size(); ++i) {
        if (i > 0) std::cout << ", ";
        std::cout << "\"" << jsonEscape(matrix.labels[i]) << "\"";
    }
    std::cout << "],\n  \"values\": [\n";
    for (std::size_t i = 0; i < matrix.values.size(); ++i) {
        std::cout << "    [";
        for (std::size_t j = 0; j < matrix.values[i].size(); ++j) {
            if (j > 0) std::cout << ", ";
            std::cout << matrix.values[i][j];
        }
        std::cout << "]";
        if (i + 1 < matrix.values.size()) std::cout << ",";
        std::cout << "\n";
    }
    std::cout << "  ]";

    if (hasFlag(args, "--divergence")) {
        const std::size_t short_window = parseSizeOption(args, "--short-window", 10U);
        double threshold = 0.3;
        const std::string threshold_str = optionValue(args, "--threshold");
        if (!threshold_str.empty()) {
            parseDoubleStrict(threshold_str, threshold);
        }

        const auto divergences = sovereign::CorrelationEngine::computeDivergence(labels, series, short_window, threshold);
        std::cout << ",\n  \"divergences\": [\n";
        for (std::size_t i = 0; i < divergences.size(); ++i) {
            const auto& div = divergences[i];
            std::cout << "    {\n"
                      << "      \"lhs\": \"" << jsonEscape(div.lhs) << "\",\n"
                      << "      \"rhs\": \"" << jsonEscape(div.rhs) << "\",\n"
                      << "      \"short_corr\": " << div.short_corr << ",\n"
                      << "      \"long_corr\": " << div.long_corr << ",\n"
                      << "      \"diff\": " << div.diff << "\n"
                      << "    }";
            if (i + 1 < divergences.size()) std::cout << ",";
            std::cout << "\n";
        }
        std::cout << "  ]";
    }

    std::cout << "\n}\n";
    return 0;
}

int printUniverse(const std::vector<std::string>& args) {
    const auto input = std::filesystem::path(optionValue(args, "--input", "storage/data/cache/backtest_history.json"));
    const std::size_t max_entries = parseSizeOption(args, "--max-entries", 0U);
    const auto universe = sovereign::loadMarketUniverse(input, max_entries);
    std::cout
        << "{\n"
        << "  \"type\": \"market_universe\",\n"
        << "  \"engine\": \"sovereign_cpp_core\",\n"
        << "  \"schema_version\": 1,\n"
        << "  \"ok\": " << (universe.quality.ok ? "true" : "false") << ",\n"
        << "  \"input\": \"" << jsonEscape(input.generic_string()) << "\",\n"
        << "  \"entries\": [";
    for (std::size_t i = 0; i < universe.entries.size(); ++i) {
        if (i > 0) std::cout << ", ";
        std::cout << "{"
                  << "\"symbol\":\"" << jsonEscape(universe.entries[i].symbol) << "\","
                  << "\"records\":" << universe.entries[i].records << ","
                  << "\"timeframes\":[";
        for (std::size_t j = 0; j < universe.entries[i].timeframes.size(); ++j) {
            if (j > 0) std::cout << ", ";
            std::cout << "\"" << jsonEscape(universe.entries[i].timeframes[j]) << "\"";
        }
        std::cout << "]}";
    }
    std::cout
        << "],\n"
        << "  \"quality\": {\n"
        << "    \"ok\": " << (universe.quality.ok ? "true" : "false") << ",\n"
        << "    \"rejected_records\": " << universe.quality.rejected_records.size() << ",\n";
    printRejectedReasons(universe.quality.rejected_records);
    std::cout
        << "  }\n"
        << "}\n";
    return universe.quality.ok ? 0 : 1;
}

int printPortfolio(const std::vector<std::string>& args) {
    double cash = 0.0;
    const std::string cash_arg = optionValue(args, "--cash", "10000.0");
    if (!parseDoubleStrict(cash_arg, cash)) {
        std::cout
            << "{\n"
            << "  \"type\": \"portfolio_metrics\",\n"
            << "  \"engine\": \"sovereign_cpp_core\",\n"
            << "  \"schema_version\": 1,\n"
            << "  \"ok\": false,\n"
            << "  \"error\": \"invalid --cash value\"\n"
            << "}\n";
        return 1;
    }

    bool parsed = true;
    std::string error;
    sovereign::PortfolioState state;
    state.cash = cash;
    state.positions = parsePositionsCsv(optionValue(args, "--positions", ""), parsed, error);
    if (!parsed) {
        std::cout
            << "{\n"
            << "  \"type\": \"portfolio_metrics\",\n"
            << "  \"engine\": \"sovereign_cpp_core\",\n"
            << "  \"schema_version\": 1,\n"
            << "  \"ok\": false,\n"
            << "  \"error\": \"" << jsonEscape(error) << "\"\n"
            << "}\n";
        return 1;
    }

    const auto metrics = sovereign::PnlCalculator::calculate(state);
    std::cout
        << "{\n"
        << "  \"type\": \"portfolio_metrics\",\n"
        << "  \"engine\": \"sovereign_cpp_core\",\n"
        << "  \"schema_version\": 1,\n"
        << "  \"ok\": " << (metrics.ok ? "true" : "false") << ",\n"
        << "  \"cash\": " << state.cash << ",\n"
        << "  \"positions\": " << state.positions.size() << ",\n"
        << "  \"total_equity\": " << metrics.total_equity << ",\n"
        << "  \"total_unrealized_pnl\": " << metrics.total_unrealized_pnl << ",\n"
        << "  \"net_exposure\": " << metrics.net_exposure << ",\n"
        << "  \"gross_exposure\": " << metrics.gross_exposure << ",\n"
        << "  \"total_exposure\": " << metrics.total_exposure << "\n"
        << "}\n";
    return metrics.ok ? 0 : 1;
}

int printIndicators(const std::vector<std::string>& args) {
    const std::string symbol = optionValue(args, "--symbol", "AAPL");
    const std::string timeframe = optionValue(args, "--timeframe", "1d");
    const std::string input_arg = optionValue(args, "--input");
    std::filesystem::path input;
    if (!input_arg.empty()) {
        input = std::filesystem::path(input_arg);
    } else {
        const std::filesystem::path equities_partition("storage/data/cache/equities/backtest_history.json");
        if (std::filesystem::exists(equities_partition)) {
            input = equities_partition;
        } else {
            std::cout << "{\"ok\":false,\"error\":\"no --input provided and default equities partition not found; pass --input <path>\"}";
            return 1;
        }
    }
    const std::size_t max_bars = parseSizeOption(args, "--max-bars", 0U);
    const std::size_t show_last = parseSizeOption(args, "--show-last", 5U);

    const auto snapshot = sovereign::loadMarketDataSnapshot(input, symbol, timeframe, max_bars);
    if (!snapshot.quality.ok || snapshot.bars.empty()) {
        std::cout << "{\"ok\":false,\"error\":\"failed to load market data for " << symbol << "\"}";
        return 1;
    }

    sovereign::indicators::ParameterMap params;
    const std::vector<std::string> param_keys = {
        "ret_fast", "ret_slow", "vol_period", "rsi_period", "kalman_q", "kalman_r",
        "macd_fast", "macd_slow", "sma_slow", "atr_period", "bb_period", "stoch_period", "stoch_signal"
    };

    for (const auto& key : param_keys) {
        std::string flag = "--" + key;
        std::replace(flag.begin(), flag.end(), '_', '-');
        const std::string val = optionValue(args, flag);
        if (!val.empty()) {
            double dval = 0.0;
            if (parseDoubleStrict(val, dval)) {
                params[key] = dval;
            }
        }
    }

    const auto frame = sovereign::indicators::IndicatorEngine::buildFrame(snapshot.bars, params);
    
    std::cout
        << "{\n"
        << "  \"type\": \"indicator_frame\",\n"
        << "  \"symbol\": \"" << jsonEscape(symbol) << "\",\n"
        << "  \"timeframe\": \"" << jsonEscape(timeframe) << "\",\n"
        << "  \"total_bars\": " << frame.rows.size() << ",\n"
        << "  \"ready_bars\": " << frame.ready_rows << ",\n"
        << "  \"rows\": [\n";

    const std::size_t start = (frame.rows.size() > show_last) ? (frame.rows.size() - show_last) : 0;
    for (std::size_t i = start; i < frame.rows.size(); ++i) {
        const auto& row = frame.rows[i];
        std::cout << "    {\n";
        std::cout << "      \"timestamp\": \"" << jsonEscape(row.bar.timestamp) << "\",\n";
        std::cout << "      \"open\": " << row.bar.open << ",\n";
        std::cout << "      \"high\": " << row.bar.high << ",\n";
        std::cout << "      \"low\": " << row.bar.low << ",\n";
        std::cout << "      \"close\": " << row.bar.close << ",\n";
        std::cout << "      \"volume\": " << row.bar.volume << ",\n";
        std::cout << "      \"metrics\": {\n";
        for (std::size_t j = 0; j < row.metrics.size(); ++j) {
            std::cout << "        \"" << jsonEscape(row.metrics[j].first) << "\": " << row.metrics[j].second;
            if (j + 1 < row.metrics.size()) std::cout << ",";
            std::cout << "\n";
        }
        std::cout << "      }\n";
        std::cout << "    }";
        if (i + 1 < frame.rows.size()) std::cout << ",";
        std::cout << "\n";
    }
    std::cout << "  ]\n}\n";
    
    return 0;
}

int printRiskCheck(const std::vector<std::string>& args) {
    sovereign::RiskLimits limits;
    limits.max_drawdown = 0.20;
    const std::string max_dd_str = optionValue(args, "--max-drawdown");
    if (!max_dd_str.empty()) {
        parseDoubleStrict(max_dd_str, limits.max_drawdown);
    }
    limits.fail_closed = !hasFlag(args, "--fail-open");

    sovereign::TradeOrder order{};
    const std::string notional_str = optionValue(args, "--notional", "0.0");
    const std::string equity_str = optionValue(args, "--equity", optionValue(args, "--volatility", "0.0"));
    const std::string dd_str = optionValue(args, "--drawdown", "0.0");
    
    parseDoubleStrict(notional_str, order.notional);
    parseDoubleStrict(equity_str, order.portfolio_equity);
    parseDoubleStrict(dd_str, order.current_drawdown);

    sovereign::PreTradeRisk engine(limits);
    const auto decision = engine.validate(order);

    std::cout
        << "{\n"
        << "  \"type\": \"risk_decision\",\n"
        << "  \"approved\": " << (decision.approved ? "true" : "false") << ",\n"
        << "  \"halt_trading\": " << (decision.halt_trading ? "true" : "false") << ",\n"
        << "  \"observed_drawdown\": " << decision.observed_drawdown << ",\n"
        << "  \"limit\": " << decision.limit << ",\n"
        << "  \"reason\": \"" << jsonEscape(decision.reason) << "\"\n"
        << "}\n";
    
    return decision.approved ? 0 : 2;
}

void printBacktestResult(const sovereign::FrameBacktestResult& fr) {
    const auto& s = fr.base.summary;
    const auto& mc = fr.monte_carlo;
    std::cout << "{\n"
        << "  \"type\": \"backtest_result\",\n"
        << "  \"engine\": \"sovereign_cpp_core\",\n"
        << "  \"mode\": \"" << jsonEscape(fr.mode) << "\",\n"
        << "  \"ok\": " << (s.ok ? "true" : "false") << ",\n"
        << "  \"metrics\": {\n"
        << "    \"trades\": " << s.trades << ",\n"
        << "    \"winners\": " << s.winners << ",\n"
        << "    \"losers\": " << s.losers << ",\n"
        << "    \"net_return\": " << s.net_return << ",\n"
        << "    \"max_drawdown\": " << s.max_drawdown << ",\n"
        << "    \"win_rate\": " << s.win_rate << ",\n"
        << "    \"expectancy\": " << s.expectancy << ",\n"
        << "    \"expected_value\": " << s.expectancy << ",\n"
        << "    \"sharpe_ratio\": " << s.sharpe << ",\n"
        << "    \"sortino_ratio\": " << s.sortino << ",\n"
        << "    \"monte_carlo\": {\n"
        << "      \"runs\": " << mc.runs << ",\n"
        << "      \"sample_size\": " << mc.sample_size << ",\n"
        << "      \"mean_final_return\": " << mc.mean_final_return << ",\n"
        << "      \"median_final_return\": " << mc.median_final_return << ",\n"
        << "      \"p05_final_return\": " << mc.p05_final_return << ",\n"
        << "      \"p95_final_return\": " << mc.p95_final_return << ",\n"
        << "      \"probability_of_loss\": " << mc.probability_of_loss << ",\n"
        << "      \"mean_max_drawdown\": " << mc.mean_max_drawdown << ",\n"
        << "      \"p95_max_drawdown\": " << mc.p95_max_drawdown << "\n"
        << "    }\n"
        << "  },\n";

    // Equity curve (compact — first + last 50 points to cap output size)
    std::cout << "  \"equity_curve\": [\n";
    const auto& pts = fr.base.equity_curve.points;
    const std::size_t max_pts = 100;
    const std::size_t step = pts.size() > max_pts ? (pts.size() / max_pts) : 1;
    bool first_pt = true;
    for (std::size_t i = 0; i < pts.size(); i += step) {
        if (!first_pt) std::cout << ",\n";
        std::cout << "    {\"timestamp\":\"" << jsonEscape(pts[i].timestamp) << "\",\"equity\":" << pts[i].equity << "}";
        first_pt = false;
    }
    if (!pts.empty()) {
        const auto& last = pts.back();
        std::cout << ",\n    {\"timestamp\":\"" << jsonEscape(last.timestamp) << "\",\"equity\":" << last.equity << "}";
    }
    std::cout << "\n  ],\n";

    // Trades (cap at 500 to avoid huge payloads)
    std::cout << "  \"trades\": [\n";
    const std::size_t max_trades = 500;
    const auto& trades = fr.base.trades;
    for (std::size_t i = 0; i < trades.size() && i < max_trades; ++i) {
        const auto& t = trades[i];
        if (i > 0) std::cout << ",\n";
        std::cout << "    {\"symbol\":\"" << jsonEscape(t.symbol)
            << "\",\"entry_time\":\"" << jsonEscape(t.entry_time)
            << "\",\"exit_time\":\"" << jsonEscape(t.exit_time)
            << "\",\"entry_price\":" << t.entry_price
            << ",\"exit_price\":" << t.exit_price
            << ",\"net_return\":" << t.net_return
            << ",\"confidence\":" << t.confidence << "}";
    }
    std::cout << "\n  ]";

    if (fr.walk_forward.ok) {
        const auto& wf = fr.walk_forward;
        std::cout << ",\n  \"walk_forward\": {\n"
            << "    \"ok\": true,\n"
            << "    \"folds_run\": " << wf.folds_run << ",\n"
            << "    \"folds_requested\": " << wf.folds_requested << ",\n"
            << "    \"aggregate\": {\n"
            << "      \"mean_oos_return\": " << wf.aggregate.mean_oos_return << ",\n"
            << "      \"mean_oos_trades\": " << wf.aggregate.mean_oos_trades << ",\n"
            << "      \"mean_oos_sharpe\": " << wf.aggregate.mean_oos_sharpe << ",\n"
            << "      \"mean_oos_drawdown\": " << wf.aggregate.mean_oos_drawdown << ",\n"
            << "      \"positive_oos_folds\": " << wf.aggregate.positive_oos_folds << ",\n"
            << "      \"positive_oos_rate\": " << wf.aggregate.positive_oos_rate << "\n"
            << "    },\n"
            << "    \"folds\": [\n";
        for (std::size_t i = 0; i < wf.folds.size(); ++i) {
            const auto& f = wf.folds[i];
            if (i > 0) std::cout << ",\n";
            std::cout << "      {\n"
                << "        \"fold\": " << f.fold << ",\n"
                << "        \"train_bars\": " << f.train_bars << ",\n"
                << "        \"test_bars\": " << f.test_bars << ",\n"
                << "        \"train_start\": \"" << jsonEscape(f.train_start) << "\",\n"
                << "        \"train_end\": \"" << jsonEscape(f.train_end) << "\",\n"
                << "        \"test_start\": \"" << jsonEscape(f.test_start) << "\",\n"
                << "        \"test_end\": \"" << jsonEscape(f.test_end) << "\",\n"
                << "        \"in_sample\": {\"trades\":" << f.in_sample.trades
                << ",\"net_return\":" << f.in_sample.net_return
                << ",\"sharpe_ratio\":" << f.in_sample.sharpe_ratio
                << ",\"max_drawdown\":" << f.in_sample.max_drawdown
                << ",\"win_rate\":" << f.in_sample.win_rate << "},\n"
                << "        \"out_of_sample\": {\"trades\":" << f.out_of_sample.trades
                << ",\"net_return\":" << f.out_of_sample.net_return
                << ",\"sharpe_ratio\":" << f.out_of_sample.sharpe_ratio
                << ",\"max_drawdown\":" << f.out_of_sample.max_drawdown
                << ",\"win_rate\":" << f.out_of_sample.win_rate << "}\n"
                << "      }";
        }
        std::cout << "\n    ]\n  }";
    }
    std::cout << "\n}\n";
}

int printBacktest(const std::vector<std::string>& args) {
    const std::string mode = optionValue(args, "--mode", "native");

    // ── Mode B: JS-annotated frame ────────────────────────────────────────────
    if (mode == "frame") {
        const std::string frame_path = optionValue(args, "--frame");
        if (frame_path.empty()) {
            std::cout << "{\"ok\":false,\"error\":\"--frame path required for frame mode\"}\n";
            return 1;
        }
        sovereign::FrameBacktestConfig cfg;
        // Parse frame file (populates cfg from embedded fields)
        auto rows = sovereign::FrameBacktester::parseFrameFile(frame_path, cfg);
        // Allow CLI flags to override frame-embedded config
        { double d = 0.0; std::string v;
          v = optionValue(args, "--threshold");        if (!v.empty() && parseDoubleStrict(v, d)) cfg.threshold = d;
          v = optionValue(args, "--horizon");          if (!v.empty() && parseDoubleStrict(v, d)) cfg.horizon = static_cast<int>(d);
          v = optionValue(args, "--cost-bps");         if (!v.empty() && parseDoubleStrict(v, d)) cfg.cost_bps = d;
          v = optionValue(args, "--monte-carlo-runs");    if (!v.empty() && parseDoubleStrict(v, d)) cfg.monte_carlo_runs = static_cast<int>(d);
          v = optionValue(args, "--walk-forward-folds");  if (!v.empty() && parseDoubleStrict(v, d)) cfg.walk_forward_folds = static_cast<int>(d);
          v = optionValue(args, "--position-size-pct");   if (!v.empty() && parseDoubleStrict(v, d)) cfg.position_size_pct = d;
          v = optionValue(args, "--timeframe");        if (!v.empty()) cfg.timeframe = v;
          v = optionValue(args, "--from");             if (!v.empty()) cfg.from_date = v;
          v = optionValue(args, "--to");               if (!v.empty()) cfg.to_date = v;
        }
        if (rows.empty()) {
            std::cout << "{\"ok\":false,\"error\":\"frame file contained no valid rows\"}\n";
            return 1;
        }
        const auto result = sovereign::FrameBacktester::runFromAnnotated(rows, cfg);
        printBacktestResult(result);
        return result.base.summary.ok ? 0 : 1;
    }

    // ── Mode A: native C++ signal from OHLCV bars ─────────────────────────────
    const auto input = std::filesystem::path(optionValue(args, "--input", "storage/data/cache"));
    const std::string symbols_str = optionValue(args, "--symbol");
    const std::string timeframe   = optionValue(args, "--timeframe", "1d");
    const std::size_t max_bars    = parseSizeOption(args, "--max-bars", 0U);

    if (symbols_str.empty()) {
        std::cout << "{\"ok\":false,\"error\":\"--symbol required for native mode\"}\n";
        return 1;
    }

    // Build BacktestConfig from CLI flags
    sovereign::BacktestConfig bt_cfg;
    sovereign::FrameBacktestConfig fr_cfg;
    fr_cfg.timeframe = timeframe;
    { double d = 0.0; std::string v;
      v = optionValue(args, "--threshold");        if (!v.empty() && parseDoubleStrict(v, d)) bt_cfg.entry_threshold = d;
      v = optionValue(args, "--horizon");          if (!v.empty() && parseDoubleStrict(v, d)) bt_cfg.holding_period = static_cast<std::size_t>(d);
      v = optionValue(args, "--cost-bps");         if (!v.empty() && parseDoubleStrict(v, d)) { bt_cfg.fee_bps = d * 0.5; bt_cfg.slippage_bps = d * 0.5; }
      v = optionValue(args, "--position-size-pct"); if (!v.empty() && parseDoubleStrict(v, d)) { bt_cfg.position_size_pct = d; fr_cfg.position_size_pct = d; }
      v = optionValue(args, "--monte-carlo-runs"); if (!v.empty() && parseDoubleStrict(v, d)) fr_cfg.monte_carlo_runs = static_cast<int>(d);
    }

    // Split comma-separated symbols
    std::vector<std::string> symbols;
    { std::istringstream ss(symbols_str); std::string s;
      while (std::getline(ss, s, ',')) if (!s.empty()) symbols.push_back(s);
    }

    // Run per-symbol, aggregate trades
    sovereign::FrameBacktestResult aggregate;
    aggregate.mode = "native";
    aggregate.base.equity_curve.initial_equity = 1.0;
    aggregate.base.equity_curve.points.push_back({"start", 1.0});
    double equity = 1.0;
    std::vector<double> all_returns;

    for (const auto& sym : symbols) {
        const auto snap = sovereign::loadMarketDataSnapshot(input, sym, timeframe, max_bars);
        if (snap.bars.empty()) continue; // quality.ok may be false for minor issues; trust Backtester::run's own validation
        const auto res = sovereign::Backtester::run(snap.bars, bt_cfg);
        const double pos_size = std::clamp(bt_cfg.position_size_pct, 0.01, 1.0);
        for (const auto& t : res.trades) {
            const double trade_pnl = pos_size * t.net_return;
            equity *= (1.0 + trade_pnl);
            all_returns.push_back(trade_pnl);
            aggregate.base.trades.push_back(t);
            aggregate.base.equity_curve.points.push_back({t.exit_time, equity});
            if (t.net_return > 0.0) ++aggregate.base.summary.winners;
            else if (t.net_return < 0.0) ++aggregate.base.summary.losers;
        }
    }

    // Aggregate summary
    auto& s = aggregate.base.summary;
    s.trades       = aggregate.base.trades.size();
    s.net_return   = equity - 1.0;
    { double peak = 1.0, dd = 0.0;
      for (const auto& pt : aggregate.base.equity_curve.points) {
          if (pt.equity > peak) peak = pt.equity;
          if (peak > 0.0) dd = std::max(dd, (peak - pt.equity) / peak);
      }
      s.max_drawdown = dd;
    }
    s.win_rate   = s.trades > 0 ? static_cast<double>(s.winners) / static_cast<double>(s.trades) : 0.0;
    s.expectancy = !all_returns.empty()
        ? std::accumulate(all_returns.begin(), all_returns.end(), 0.0) / static_cast<double>(all_returns.size()) : 0.0;

    if (!aggregate.base.equity_curve.points.empty()) {
        std::vector<double> eq;
        for (const auto& pt : aggregate.base.equity_curve.points) eq.push_back(pt.equity);
        const auto stats = sovereign::StatsEngine::summarize(eq,
            sovereign::constants::DEFAULT_RISK_FREE_RATE,
            sovereign::constants::TRADING_DAYS_PER_YEAR);
        s.sharpe  = stats.sharpe;
        s.sortino = stats.sortino;
    }
    s.ok = !aggregate.base.trades.empty();

    const uint64_t seed = static_cast<uint64_t>(all_returns.size()) * 6364136223846793005ULL;
    aggregate.monte_carlo = sovereign::FrameBacktester::runMonteCarlo(
        all_returns, fr_cfg.monte_carlo_runs, fr_cfg.tail_alpha, seed);

    printBacktestResult(aggregate);
    return s.ok ? 0 : 1;
}

// ─── ml predict / ml compare ──────────────────────────────────────────────────
// Real ONNX inference over a JS-built feature frame, using the shared serving manifest
// (column order + train medians + model list) so the C++ feature vector matches training
// exactly (no train/serve skew). Outputs per-model accuracy + class counts as JSON.

struct ServingModel { std::string name, path, input_set; std::size_t n_features = 0; };
struct ServingManifest {
    std::vector<std::string> columns;                 // feature columns, in training order
    std::unordered_map<std::string, double> medians;  // column -> train-split median
    std::vector<ServingModel> models;
};

bool loadServingManifest(const std::string& path, ServingManifest& out) {
    std::ifstream in(path);
    if (!in) return false;
    std::string line;
    while (std::getline(in, line)) {
        if (line.empty() || line[0] == '#') continue;
        std::istringstream ss(line);
        std::string tag; ss >> tag;
        if (tag == "COL") {
            std::string name; double med = 0.0;
            ss >> name >> med;
            out.columns.push_back(name);
            out.medians[name] = med;
        } else if (tag == "MODEL") {
            ServingModel m; double nf = 0.0;
            ss >> m.name >> m.path >> m.input_set >> nf;
            m.n_features = static_cast<std::size_t>(nf);
            out.models.push_back(m);
        }
    }
    return !out.columns.empty() && !out.models.empty();
}

bool isCrossFamily(const std::string& c) {
    return c.rfind("regime_", 0) == 0 || c.rfind("xf_corr_", 0) == 0;
}

// Parse a feature CSV into a header index + raw string cells (NaN for blanks handled later).
struct FeatureCsv {
    std::unordered_map<std::string, std::size_t> col_index;
    std::vector<std::vector<std::string>> rows;
    bool has_label = false;
    std::size_t label_col = 0;
};

bool loadFeatureCsv(const std::string& path, FeatureCsv& out, std::size_t limit) {
    std::ifstream in(path);
    if (!in) return false;
    std::string line;
    if (!std::getline(in, line)) return false;
    { std::istringstream ss(line); std::string h; std::size_t i = 0;
      while (std::getline(ss, h, ',')) {
          out.col_index[h] = i;
          if (h == "label_class") { out.has_label = true; out.label_col = i; }
          ++i;
      }
    }
    while (std::getline(in, line)) {
        if (line.empty()) continue;
        std::vector<std::string> cells; std::istringstream ss(line); std::string c;
        while (std::getline(ss, c, ',')) cells.push_back(c);
        out.rows.push_back(std::move(cells));
        if (limit > 0 && out.rows.size() >= limit) break;
    }
    return true;
}

int runMlModel(const ServingManifest& man, const FeatureCsv& csv,
               const ServingModel& m, const std::string& models_dir, bool first) {
    // Resolve this model's input columns (cross-family subset preserves training order).
    std::vector<std::string> cols;
    for (const auto& c : man.columns) {
        if (m.input_set == "cross_family") { if (isCrossFamily(c)) cols.push_back(c); }
        else cols.push_back(c);
    }
    const std::size_t n = cols.size();
    const std::size_t rows = csv.rows.size();

    // Build the flat float matrix: CSV value when finite, else the train median.
    std::vector<float> flat; flat.reserve(rows * n);
    for (const auto& row : csv.rows) {
        for (const auto& col : cols) {
            double v = 0.0; bool have = false;
            auto it = csv.col_index.find(col);
            if (it != csv.col_index.end() && it->second < row.size()) {
                const std::string& cell = row[it->second];
                if (!cell.empty() && parseDoubleStrict(cell, v) && std::isfinite(v)) have = true;
            }
            if (!have) { auto mit = man.medians.find(col); v = (mit != man.medians.end()) ? mit->second : 0.0; }
            flat.push_back(static_cast<float>(v));
        }
    }

    const std::string model_file = models_dir + "/" + m.name + ".onnx";
    sovereign::ml::OnnxModel model(model_file);
    auto res = model.predictBatch(flat, rows, n);

    // Accuracy vs label_class + predicted-class histogram.
    std::map<int, std::size_t> class_counts;
    std::size_t correct = 0, scored = 0;
    for (std::size_t i = 0; i < res.predicted_class.size(); ++i) {
        const int pc = res.predicted_class[i];
        ++class_counts[pc];
        if (csv.has_label && csv.label_col < csv.rows[i].size()) {
            double lbl = 0.0;
            if (parseDoubleStrict(csv.rows[i][csv.label_col], lbl)) {
                ++scored;
                if (static_cast<int>(lbl) == pc) ++correct;
            }
        }
    }
    const double acc = scored > 0 ? static_cast<double>(correct) / static_cast<double>(scored) : 0.0;

    if (!first) std::cout << ",\n";
    std::cout << "    {\"model\":\"" << jsonEscape(m.name) << "\""
              << ",\"backend\":\"" << jsonEscape(res.backend) << "\""
              << ",\"input_set\":\"" << jsonEscape(m.input_set) << "\""
              << ",\"n_features\":" << n
              << ",\"rows\":" << rows
              << ",\"scored\":" << scored
              << ",\"accuracy\":" << acc
              << ",\"class_counts\":{";
    bool fc = true;
    for (const auto& [cls, cnt] : class_counts) {
        if (!fc) std::cout << ",";
        std::cout << "\"" << cls << "\":" << cnt;
        fc = false;
    }
    std::cout << "}}";
    return res.backend == "onnx_runtime" ? 0 : 2;
}

int printMl(const std::vector<std::string>& args) {
    const std::string sub = args.size() > 1 ? args[1] : "";
    if (sub != "predict" && sub != "compare") {
        std::cout << "{\"ok\":false,\"error\":\"usage: ml <predict|compare> --frame CSV [--manifest TXT] [--models-dir DIR] [--model NAME] [--limit N]\"}\n";
        return 1;
    }
    const std::string frame = optionValue(args, "--frame", "storage/data/ml/feature_frame.csv");
    const std::string models_dir = optionValue(args, "--models-dir", "storage/models");
    const std::string manifest_path = optionValue(args, "--manifest", models_dir + "/serving_manifest.txt");
    const std::string only_model = optionValue(args, "--model");
    const std::size_t limit = parseSizeOption(args, "--limit", 0U);

    ServingManifest man;
    if (!loadServingManifest(manifest_path, man)) {
        std::cout << "{\"ok\":false,\"error\":\"could not read serving manifest\",\"path\":\"" << jsonEscape(manifest_path) << "\"}\n";
        return 1;
    }
    FeatureCsv csv;
    if (!loadFeatureCsv(frame, csv, limit) || csv.rows.empty()) {
        std::cout << "{\"ok\":false,\"error\":\"could not read feature frame or no rows\",\"path\":\"" << jsonEscape(frame) << "\"}\n";
        return 1;
    }

    std::vector<ServingModel> targets;
    for (const auto& m : man.models) {
        if (sub == "predict" && !only_model.empty() && m.name != only_model) continue;
        targets.push_back(m);
    }
    if (targets.empty()) {
        std::cout << "{\"ok\":false,\"error\":\"no matching model\"}\n";
        return 1;
    }

    std::cout << "{\"ok\":true,\"command\":\"ml " << sub << "\""
              << ",\"frame\":\"" << jsonEscape(frame) << "\""
              << ",\"rows\":" << csv.rows.size()
              << ",\"results\":[\n";
    int rc = 0; bool first = true;
    for (const auto& m : targets) {
        const int mrc = runMlModel(man, csv, m, models_dir, first);
        if (mrc != 0) rc = mrc;
        first = false;
    }
    std::cout << "\n  ]}\n";
    return rc;
}

int printOptimize(const std::vector<std::string>& args) {
    const std::string symbols_arg = optionValue(args, "--symbols", "AAPL");
    const std::string timeframe = optionValue(args, "--timeframe", "1d");
    const std::string ts_dir_arg = optionValue(args, "--ts-dir", "storage/data/ts");
    const std::filesystem::path ts_dir(ts_dir_arg);

    std::vector<std::string> symbols;
    std::stringstream ss(symbols_arg);
    std::string token;
    while (std::getline(ss, token, ',')) {
        if (!token.empty()) {
            symbols.push_back(token);
        }
    }

    sovereign::GridOptimizationOptions opts;
    {
        double d = 0.0; std::string v;
        v = optionValue(args, "--train-ratio"); if (!v.empty() && parseDoubleStrict(v, d)) opts.train_ratio = d;
        v = optionValue(args, "--cost-bps"); if (!v.empty() && parseDoubleStrict(v, d)) opts.cost_bps = d;
        opts.top_k = parseSizeOption(args, "--top-k", 10U);
        opts.max_bars = parseSizeOption(args, "--max-bars", 0U);
    }

    std::cout << "{\n"
              << "  \"type\": \"grid_optimization_result\",\n"
              << "  \"engine\": \"sovereign_cpp_core\",\n"
              << "  \"schema_version\": 1,\n";

    if (symbols.empty()) {
        std::cout << "  \"ok\": false,\n  \"error\": \"no_symbols_specified\"\n}\n";
        return 1;
    }

    const std::string target_symbol = symbols[0];
    const auto res = sovereign::GridOptimizer::optimizeFromBinary(ts_dir, target_symbol, timeframe, opts);

    if (!res.ok) {
        std::cout << "  \"ok\": false,\n"
                  << "  \"error\": \"" << jsonEscape(res.error) << "\",\n"
                  << "  \"symbol\": \"" << jsonEscape(target_symbol) << "\"\n}\n";
        return 1;
    }

    std::cout << "  \"ok\": true,\n"
              << "  \"symbol\": \"" << jsonEscape(res.symbol) << "\",\n"
              << "  \"timeframe\": \"" << jsonEscape(res.timeframe) << "\",\n"
              << "  \"total_bars\": " << res.total_bars << ",\n"
              << "  \"train_bars\": " << res.train_bars << ",\n"
              << "  \"test_bars\": " << res.test_bars << ",\n"
              << "  \"tested\": " << res.grid_combinations_tested << ",\n"
              << "  \"winner\": {\n"
              << "    \"params\": {\n"
              << "      \"rsi\": " << res.winner.params.rsi_period << ",\n"
              << "      \"atr\": " << res.winner.params.atr_period << ",\n"
              << "      \"bollinger\": " << res.winner.params.bollinger_period << ",\n"
              << "      \"volatility\": " << res.winner.params.volatility_period << ",\n"
              << "      \"threshold\": " << res.winner.params.threshold << ",\n"
              << "      \"holding_period\": " << res.winner.params.holding_period << "\n"
              << "    },\n"
              << "    \"score\": " << res.winner.fitness_score << ",\n"
              << "    \"train\": {\n"
              << "      \"net_return\": " << res.winner.train_result.summary.net_return << ",\n"
              << "      \"max_drawdown\": " << res.winner.train_result.summary.max_drawdown << ",\n"
              << "      \"sharpe\": " << res.winner.train_result.summary.sharpe << ",\n"
              << "      \"win_rate\": " << res.winner.train_result.summary.win_rate << ",\n"
              << "      \"expectancy\": " << res.winner.train_result.summary.expectancy << "\n"
              << "    },\n"
              << "    \"test\": {\n"
              << "      \"net_return\": " << res.winner.test_result.summary.net_return << ",\n"
              << "      \"max_drawdown\": " << res.winner.test_result.summary.max_drawdown << ",\n"
              << "      \"sharpe\": " << res.winner.test_result.summary.sharpe << ",\n"
              << "      \"expectancy\": " << res.winner.test_result.summary.expectancy << ",\n"
              << "      \"overfit_warning\": " << (res.winner.overfit_warning ? "true" : "false") << "\n"
              << "    }\n"
              << "  }\n"
              << "}\n";

    return 0;
}

bool parseSweepDatasets(
    const std::string& raw,
    std::vector<sovereign::backtest::SweepDatasetRequest>& datasets,
    std::string& error) {
    if (raw.empty()) {
        error = "validated --datasets is required";
        return false;
    }
    std::istringstream stream(raw);
    std::string item;
    while (std::getline(stream, item, ',')) {
        const auto colon = item.find(':');
        const auto at = item.rfind('@');
        const auto hash = item.rfind('#');
        if (colon == std::string::npos
            || at == std::string::npos
            || hash == std::string::npos
            || colon == 0U
            || at <= colon + 1U
            || hash <= at + 1U
            || hash + 65U != item.size()) {
            error = "datasets must use FAMILY:SYMBOL@TIMEFRAME#SHA256";
            return false;
        }
        std::string fingerprint = item.substr(hash + 1U);
        if (!std::all_of(fingerprint.begin(), fingerprint.end(), [](unsigned char value) {
                return std::isxdigit(value) != 0;
            })) {
            error = "dataset fingerprint must be 64 hexadecimal characters";
            return false;
        }
        std::transform(fingerprint.begin(), fingerprint.end(), fingerprint.begin(), [](unsigned char value) {
            return static_cast<char>(std::tolower(value));
        });
        datasets.push_back({
            item.substr(0U, colon),
            item.substr(colon + 1U, at - colon - 1U),
            item.substr(at + 1U, hash - at - 1U),
            fingerprint,
        });
    }
    if (datasets.empty()) {
        error = "at least one validated dataset is required";
        return false;
    }
    return true;
}

bool parseSweepEvaluators(
    const std::string& raw,
    std::vector<sovereign::strategies::StrategyArchetype>& archetypes,
    std::string& error) {
    if (raw.empty()) {
        error = "validated --evaluators is required";
        return false;
    }
    const std::unordered_map<std::string, sovereign::strategies::StrategyArchetype> supported = {
        {"MomentumTrend", sovereign::strategies::StrategyArchetype::MomentumTrend},
        {"MeanReversion", sovereign::strategies::StrategyArchetype::MeanReversion},
        {"BreakoutVolatility", sovereign::strategies::StrategyArchetype::BreakoutVolatility},
        {"HybridRegime", sovereign::strategies::StrategyArchetype::HybridRegime},
    };
    std::istringstream stream(raw);
    std::string item;
    while (std::getline(stream, item, ',')) {
        const auto found = supported.find(item);
        if (found == supported.end()) {
            error = "unknown or unsupported evaluator: " + item;
            return false;
        }
        archetypes.push_back(found->second);
    }
    return !archetypes.empty();
}

int printSweep(const std::vector<std::string>& args) {
    const std::filesystem::path ts_dir(optionValue(args, "--ts-dir", "storage/data/ts"));
    const std::string top_k_raw = optionValue(args, "--top-k");
    const std::string max_bars_raw = optionValue(args, "--max-bars");
    std::size_t top_k = 20U;
    std::size_t max_bars = 50000U;

    sovereign::backtest::GlobalSweepOptions opts;
    opts.top_k = top_k;
    opts.max_bars = max_bars;
    opts.archetypes.clear();
    std::vector<sovereign::backtest::SweepDatasetRequest> datasets;
    std::string contract_error;
    if ((!top_k_raw.empty() && !parsePositiveSizeStrict(top_k_raw, top_k))
        || (!max_bars_raw.empty() && !parsePositiveSizeStrict(max_bars_raw, max_bars))) {
        contract_error = "--top-k and --max-bars must be positive integers";
    }

    double cost = 5.0;
    const std::string cost_raw = optionValue(args, "--cost-bps");
    if (contract_error.empty()
        && !cost_raw.empty()
        && (!parseDoubleStrict(cost_raw, cost) || !std::isfinite(cost) || cost < 0.0)) {
        contract_error = "--cost-bps must be a finite non-negative number";
    }

    double ratio = 0.70;
    const std::string ratio_raw = optionValue(args, "--train-ratio");
    if (contract_error.empty()
        && !ratio_raw.empty()
        && (!parseDoubleStrict(ratio_raw, ratio) || !std::isfinite(ratio) || ratio < 0.40 || ratio > 0.75)) {
        contract_error = "--train-ratio must be a finite number between 0.40 and 0.75";
    }

    if (contract_error.empty()
        && (!parseSweepDatasets(optionValue(args, "--datasets"), datasets, contract_error)
            || !parseSweepEvaluators(optionValue(args, "--evaluators"), opts.archetypes, contract_error))) {
        // The parser sets contract_error.
    }
    if (!contract_error.empty()) {
        std::cout << "{\"type\":\"global_sweep_result\",\"schema_version\":2,\"research_only\":true,"
                  << "\"promotion_eligible\":false,\"ok\":false,\"error\":\""
                  << jsonEscape(contract_error) << "\"}\n";
        return 1;
    }

    opts.top_k = top_k;
    opts.max_bars = max_bars;
    opts.cost_bps = cost;
    opts.train_ratio = ratio;

    const auto res = sovereign::backtest::GlobalSweepOptimizer::runValidatedSweep(ts_dir, datasets, opts);

    if (!res.ok) {
        std::cout << "{\n"
                  << "  \"type\": \"global_sweep_result\",\n"
                  << "  \"engine\": \"sovereign_cpp_core\",\n"
                  << "  \"schema_version\": 2,\n"
                  << "  \"research_only\": true,\n"
                  << "  \"promotion_eligible\": false,\n"
                  << "  \"ok\": false,\n"
                  << "  \"error\": \"" << jsonEscape(res.error) << "\"\n"
                  << "}\n";
        return 1;
    }

    std::cout << "{\n"
              << "  \"type\": \"global_sweep_result\",\n"
              << "  \"engine\": \"sovereign_cpp_core\",\n"
              << "  \"schema_version\": 2,\n"
              << "  \"research_only\": true,\n"
              << "  \"promotion_eligible\": false,\n"
              << "  \"ok\": true,\n"
              << "  \"selection_protocol\": \"train_validation_then_single_untouched_holdout\",\n"
              << "  \"fitness_source\": \"validation_metrics\",\n"
              << "  \"holdout_influences_selection\": false,\n"
              << "  \"total_datasets\": " << res.total_datasets << ",\n"
              << "  \"effective_bars\": " << res.effective_bars << ",\n"
              << "  \"total_pass1_evaluations\": " << res.total_pass1_evaluations << ",\n"
              << "  \"total_pass2_evaluations\": " << res.total_pass2_evaluations << ",\n"
              << "  \"total_combinations_evaluated\": " << (res.total_pass1_evaluations + res.total_pass2_evaluations) << ",\n"
              << "  \"leader_board\": [\n";

    for (std::size_t i = 0; i < res.leader_board.size(); ++i) {
        const auto& t = res.leader_board[i];
        if (i > 0) std::cout << ",\n";
        std::cout << "    {\n"
                  << "      \"rank\": " << (i + 1) << ",\n"
                  << "      \"symbol\": \"" << jsonEscape(t.symbol) << "\",\n"
                  << "      \"timeframe\": \"" << jsonEscape(t.timeframe) << "\",\n"
                  << "      \"strategy\": \"" << jsonEscape(sovereign::strategies::archetypeToString(t.params.archetype)) << "\",\n"
                  << "      \"fitness_score\": " << t.fitness_score << ",\n"
                  << "      \"overfit_grade\": \"" << jsonEscape(t.overfit_grade) << "\",\n"
                  << "      \"oos_retention_ratio\": " << t.oos_retention_ratio << ",\n"
                  << "      \"overfit_warning\": " << (t.overfit_warning ? "true" : "false") << ",\n"
                  << "      \"params\": {\n"
                  << "        \"rsi_period\": " << t.params.rsi_period << ",\n"
                  << "        \"atr_period\": " << t.params.atr_period << ",\n"
                  << "        \"bollinger_period\": " << t.params.bollinger_period << ",\n"
                  << "        \"volatility_period\": " << t.params.volatility_period << ",\n"
                  << "        \"threshold\": " << t.params.threshold << ",\n"
                  << "        \"holding_period\": " << t.params.holding_period << "\n"
                  << "      },\n"
                  << "      \"train_metrics\": {\n"
                  << "        \"trades\": " << t.train_result.summary.trades << ",\n"
                  << "        \"net_return\": " << t.train_result.summary.net_return << ",\n"
                  << "        \"max_drawdown\": " << t.train_result.summary.max_drawdown << ",\n"
                  << "        \"sharpe\": " << t.train_result.summary.sharpe << ",\n"
                  << "        \"expectancy\": " << t.train_result.summary.expectancy << ",\n"
                  << "        \"win_rate\": " << t.train_result.summary.win_rate << "\n"
                  << "      },\n"
                  << "      \"validation_metrics\": {\n"
                  << "        \"trades\": " << t.validation_result.summary.trades << ",\n"
                  << "        \"net_return\": " << t.validation_result.summary.net_return << ",\n"
                  << "        \"max_drawdown\": " << t.validation_result.summary.max_drawdown << ",\n"
                  << "        \"sharpe\": " << t.validation_result.summary.sharpe << ",\n"
                  << "        \"expectancy\": " << t.validation_result.summary.expectancy << ",\n"
                  << "        \"win_rate\": " << t.validation_result.summary.win_rate << "\n"
                  << "      },\n"
                  << "      \"holdout_metrics\": {\n"
                  << "        \"trades\": " << t.test_result.summary.trades << ",\n"
                  << "        \"net_return\": " << t.test_result.summary.net_return << ",\n"
                  << "        \"max_drawdown\": " << t.test_result.summary.max_drawdown << ",\n"
                  << "        \"sharpe\": " << t.test_result.summary.sharpe << ",\n"
                  << "        \"expectancy\": " << t.test_result.summary.expectancy << ",\n"
                  << "        \"win_rate\": " << t.test_result.summary.win_rate << "\n"
                  << "      },\n"
                  << "      \"test_metrics\": {\n"
                  << "        \"compatibility_alias_for\": \"holdout_metrics\",\n"
                  << "        \"net_return\": " << t.test_result.summary.net_return << ",\n"
                  << "        \"max_drawdown\": " << t.test_result.summary.max_drawdown << ",\n"
                  << "        \"sharpe\": " << t.test_result.summary.sharpe << ",\n"
                  << "        \"expectancy\": " << t.test_result.summary.expectancy << ",\n"
                  << "        \"win_rate\": " << t.test_result.summary.win_rate << "\n"
                  << "      }\n"
                  << "    }";
    }
    std::cout << "\n  ],\n"
              << "  \"strategy_champions\": [\n";

    for (std::size_t i = 0; i < res.strategy_champions.size(); ++i) {
        const auto& t = res.strategy_champions[i];
        if (i > 0) std::cout << ",\n";
        std::cout << "    {\n"
                  << "      \"strategy\": \"" << jsonEscape(sovereign::strategies::archetypeToString(t.params.archetype)) << "\",\n"
                  << "      \"best_symbol\": \"" << jsonEscape(t.symbol) << "\",\n"
                  << "      \"best_timeframe\": \"" << jsonEscape(t.timeframe) << "\",\n"
                  << "      \"fitness_score\": " << t.fitness_score << ",\n"
                  << "      \"overfit_grade\": \"" << jsonEscape(t.overfit_grade) << "\",\n"
                  << "      \"oos_retention_ratio\": " << t.oos_retention_ratio << ",\n"
                  << "      \"params\": {\n"
                  << "        \"rsi_period\": " << t.params.rsi_period << ",\n"
                  << "        \"atr_period\": " << t.params.atr_period << ",\n"
                  << "        \"bollinger_period\": " << t.params.bollinger_period << ",\n"
                  << "        \"volatility_period\": " << t.params.volatility_period << ",\n"
                  << "        \"threshold\": " << t.params.threshold << ",\n"
                  << "        \"holding_period\": " << t.params.holding_period << "\n"
                  << "      }\n"
                  << "    }";
    }
    std::cout << "\n  ]\n"
              << "}\n";

    return 0;
}

int printMassBt(const std::vector<std::string>& args) {
    const std::filesystem::path input(optionValue(args, "--input", "storage/data/ts"));
    double pos_size_pct = 0.1;
    const std::string pos_str = optionValue(args, "--position-size-pct");
    if (!pos_str.empty()) {
        parseDoubleStrict(pos_str, pos_size_pct);
    }

    std::vector<std::string> timeframes = {"5m", "15m", "30m", "1h", "4h", "1d"};
    const std::string tf_str = optionValue(args, "--timeframes");
    if (!tf_str.empty()) {
        timeframes.clear();
        std::istringstream ss(tf_str);
        std::string t;
        while (std::getline(ss, t, ',')) {
            if (!t.empty()) timeframes.push_back(t);
        }
    }

    struct TempSpec {
        std::string name;
        std::vector<std::string> symbols;
        double threshold;
        std::size_t horizon;
    };

    std::vector<TempSpec> strategy_specs;
    const std::string specs_json = optionValue(args, "--specs-json");

    if (!specs_json.empty()) {
        std::string_view sv(specs_json);
        std::size_t pos = 0;
        while ((pos = sv.find('{', pos)) != std::string_view::npos) {
            std::size_t end_pos = sv.find('}', pos);
            if (end_pos == std::string_view::npos) break;
            std::string_view obj = sv.substr(pos, end_pos - pos + 1);

            TempSpec spec;
            spec.threshold = 0.55;
            spec.horizon = 5;

            // Extract name
            auto n_pos = obj.find("\"name\"");
            if (n_pos != std::string_view::npos) {
                auto colon = obj.find(':', n_pos);
                auto q1 = obj.find('"', colon);
                auto q2 = obj.find('"', q1 + 1);
                if (q1 != std::string_view::npos && q2 != std::string_view::npos) {
                    spec.name = std::string(obj.substr(q1 + 1, q2 - q1 - 1));
                }
            }

            // Extract threshold
            auto t_pos = obj.find("\"threshold\"");
            if (t_pos != std::string_view::npos) {
                auto colon = obj.find(':', t_pos);
                if (colon != std::string_view::npos) {
                    double val = 0.55;
                    std::size_t end_num = obj.find_first_of(",}", colon);
                    std::string num_str(obj.substr(colon + 1, end_num - colon - 1));
                    if (parseDoubleStrict(num_str, val)) spec.threshold = val;
                }
            }

            // Extract horizon
            auto h_pos = obj.find("\"horizon\"");
            if (h_pos != std::string_view::npos) {
                auto colon = obj.find(':', h_pos);
                if (colon != std::string_view::npos) {
                    double val = 5.0;
                    std::size_t end_num = obj.find_first_of(",}", colon);
                    std::string num_str(obj.substr(colon + 1, end_num - colon - 1));
                    if (parseDoubleStrict(num_str, val)) spec.horizon = static_cast<std::size_t>(val);
                }
            }

            // Extract symbols array
            auto s_pos = obj.find("\"symbols\"");
            if (s_pos != std::string_view::npos) {
                auto arr_q1 = obj.find('[', s_pos);
                auto arr_q2 = obj.find(']', arr_q1);
                if (arr_q1 != std::string_view::npos && arr_q2 != std::string_view::npos) {
                    std::string_view arr_str = obj.substr(arr_q1 + 1, arr_q2 - arr_q1 - 1);
                    std::size_t sym_pos = 0;
                    while ((sym_pos = arr_str.find('"', sym_pos)) != std::string_view::npos) {
                        auto sym_end = arr_str.find('"', sym_pos + 1);
                        if (sym_end == std::string_view::npos) break;
                        spec.symbols.push_back(std::string(arr_str.substr(sym_pos + 1, sym_end - sym_pos - 1)));
                        sym_pos = sym_end + 1;
                    }
                }
            }

            if (!spec.name.empty()) {
                strategy_specs.push_back(spec);
            }
            pos = end_pos + 1;
        }
    }

    if (strategy_specs.empty()) {
        std::cout << "{\n"
                  << "  \"type\": \"mass_bt_matrix\",\n"
                  << "  \"engine\": \"sovereign_cpp_core\",\n"
                  << "  \"schema_version\": 1,\n"
                  << "  \"ok\": false,\n"
                  << "  \"error\": \"no_strategy_specs_provided\",\n"
                  << "  \"results\": []\n"
                  << "}\n";
        return 1;
    }

    std::vector<sovereign::MassBtJobSpec> jobs;
    jobs.reserve(strategy_specs.size() * timeframes.size());

    for (const auto& strat : strategy_specs) {
        for (const auto& tf : timeframes) {
            sovereign::MassBtJobSpec job;
            job.strategy_name = strat.name;
            job.timeframe = tf;
            job.symbols = strat.symbols;
            job.threshold = strat.threshold;
            job.horizon = strat.horizon;
            job.cost_bps = 5.0;
            job.position_size_pct = pos_size_pct;
            jobs.push_back(job);
        }
    }

    sovereign::FrameBacktestConfig cfg;
    cfg.position_size_pct = pos_size_pct;
    cfg.max_bars = parseSizeOption(args, "--max-bars", 0U);

    const auto results = sovereign::FrameBacktester::runMassBt(jobs, cfg, input.string());

    std::cout << "{\n"
              << "  \"type\": \"mass_bt_matrix\",\n"
              << "  \"engine\": \"sovereign_cpp_core\",\n"
              << "  \"schema_version\": 1,\n"
              << "  \"ok\": true,\n"
              << "  \"position_size_pct\": " << pos_size_pct << ",\n"
              << "  \"total_jobs\": " << results.size() << ",\n"
              << "  \"results\": [\n";

    for (std::size_t i = 0; i < results.size(); ++i) {
        const auto& r = results[i];
        if (i > 0) std::cout << ",\n";
        std::cout << "    {\n"
                  << "      \"strategy\": \"" << jsonEscape(r.strategy_name) << "\",\n"
                  << "      \"timeframe\": \"" << jsonEscape(r.timeframe) << "\",\n"
                  << "      \"trades\": " << r.trades << ",\n"
                  << "      \"net_return\": " << r.net_return << ",\n"
                  << "      \"win_rate\": " << r.win_rate << ",\n"
                  << "      \"max_drawdown\": " << r.max_drawdown << ",\n"
                  << "      \"sharpe_ratio\": " << r.sharpe_ratio << ",\n"
                  << "      \"ok\": " << (r.ok ? "true" : "false") << "\n"
                  << "    }";
    }
    std::cout << "\n  ]\n}\n";

    return 0;
}

int printTsMerge(const std::vector<std::string>& args) {
    const std::string existing_bin = optionValue(args, "--existing");
    const std::string incoming_bin = optionValue(args, "--incoming");
    const std::string output_bin = optionValue(args, "--out");
    const bool existing_wins = hasFlag(args, "--existing-wins");

    if (incoming_bin.empty() || output_bin.empty()) {
        std::cout << "{\"ok\":false,\"error\":\"usage: ts-merge --incoming PATH --out PATH [--existing PATH] [--existing-wins]\"}\n";
        return 1;
    }

    sovereign::BinaryMergeOptions opts;
    opts.existing_wins_on_tie = existing_wins;

    const auto res = sovereign::BinaryTsMerger::mergeFiles(existing_bin, incoming_bin, output_bin, opts);
    if (!res.ok) {
        std::cout << "{\"ok\":false,\"error\":\"" << jsonEscape(res.error) << "\"}\n";
        return 1;
    }

    std::cout << "{\"ok\":true,\"count\":" << res.count
              << ",\"existing_count\":" << res.existing_count
              << ",\"incoming_count\":" << res.incoming_count << "}\n";
    return 0;
}

void printUsage() {
    std::cout
        << "Sovereign C++ Core\n"
        << "Commands:\n"
        << "  status --snapshot PATH --quality PATH --json\n"
        << "  stats --equity 100,110,105 --json\n"
        << "  data summary --symbol AAPL --timeframe 1d --json\n"
        << "  correlation --symbols AAPL,MSFT,SPY --timeframe 1d --json\n"
        << "  universe --input storage/data/cache/backtest_history.json --json\n"
        << "  portfolio --cash 10000.0 --positions \"AAPL,10,150,180;MSFT,5,300,320\"\n"
        << "  indicators --symbol AAPL --timeframe 1d --json\n"
        << "  risk check --notional 1000 --equity 5000 --drawdown 0.05\n"
        << "  ml compare --frame storage/data/ml/feature_frame.csv --json\n"
        << "  ml predict --model xgboost_v1 --frame PATH [--limit N]\n"
        << "  sweep --datasets FAMILY:SYMBOL@TIMEFRAME#SHA256 --evaluators ARCHETYPE [--top-k N]\n";
}

} // namespace

int main(int argc, char** argv) {
    std::vector<std::string> args;
    args.reserve(static_cast<std::size_t>(argc > 0 ? argc - 1 : 0));
    for (int i = 1; i < argc; ++i) {
        args.emplace_back(argv[i]);
    }

    const bool verbose = hasFlag(args, "--verbose");
    if (verbose) {
        std::cerr << "[VISIBILITY] Process Seam Invoke: ";
        for (const auto& arg : args) std::cerr << arg << " ";
        std::cerr << std::endl;
    }

    if (args.empty() || args[0] == "--help" || args[0] == "-h" || args[0] == "help") {
        printUsage();
        return 0;
    }

    if (args[0] == "status") {
        return printStatus(args);
    }
    if (args[0] == "stats") {
        return printStats(args);
    }
    if (args[0] == "optimize") {
        return printOptimize(args);
    }
    if (args[0] == "mass-bt" || args[0] == "massbt") {
        return printMassBt(args);
    }
    if (args[0] == "sweep") {
        return printSweep(args);
    }
    if (args[0] == "kill-switch") {
        const auto lockPath = std::filesystem::path("storage/data/cache/kill_switch.lock");
        if (args.size() > 1) {
            const std::string sub = args[1];
            if (sub == "engage") {
                std::filesystem::create_directories(lockPath.parent_path());
                std::FILE* f = std::fopen(lockPath.string().c_str(), "w");
                if (f) std::fclose(f);
                std::cout << "{\"ok\":true,\"status\":\"engaged\"}\n";
                return 0;
            } else if (sub == "disengage") {
                std::error_code ec;
                std::filesystem::remove(lockPath, ec);
                std::cout << "{\"ok\":true,\"status\":\"disengaged\"}\n";
                return 0;
            } else if (sub == "status") {
                const bool engaged = std::filesystem::exists(lockPath);
                std::cout << "{\"ok\":true,\"status\":\"" << (engaged ? "engaged" : "disengaged") << "\"}\n";
                return 0;
            }
        }
        std::cerr << "Usage: kill-switch [engage|disengage|status]\n";
        return 1;
    }
    if (args[0] == "data") {
        const std::string subcommand = args.size() > 1 ? args[1] : "summary";
        if (subcommand == "summary") {
            return printDataSummary(args);
        }
        std::cerr << "Unknown data subcommand: " << subcommand << "\n";
        return 1;
    }
    if (args[0] == "correlation") {
        return printCorrelation(args);
    }
    if (args[0] == "universe") {
        return printUniverse(args);
    }
    if (args[0] == "portfolio") {
        return printPortfolio(args);
    }
    if (args[0] == "indicators") {
        return printIndicators(args);
    }
    if (args[0] == "risk" && args.size() > 1 && args[1] == "check") {
        return printRiskCheck(args);
    }
    if (args[0] == "backtest") {
        return printBacktest(args);
    }
    if (args[0] == "ml") {
        return printMl(args);
    }
    if (args[0] == "ts-merge") {
        return printTsMerge(args);
    }

    std::cerr << "Unknown command: " << args[0] << "\n";
    printUsage();
    return 1;
}
