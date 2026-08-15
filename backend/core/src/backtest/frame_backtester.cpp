#include "frame_backtester.hpp"

#include "../stats/stats_engine.hpp"
#include "../utils/constants.hpp"

#include <algorithm>
#include <charconv>
#include <cmath>
#include <fstream>
#include <map>
#include <numeric>
#include <sstream>
#include <string_view>

namespace sovereign {

namespace {

// ── PRNG ─────────────────────────────────────────────────────────────────────
uint64_t xorshift64(uint64_t& state) noexcept {
    state ^= state << 13;
    state ^= state >> 7;
    state ^= state << 17;
    return state;
}

// ── Minimal file reader ───────────────────────────────────────────────────────
std::string readFileStr(const std::string& path, bool& ok) {
    std::ifstream f(path, std::ios::binary);
    if (!f) { ok = false; return {}; }
    std::ostringstream buf;
    buf << f.rdbuf();
    ok = true;
    return buf.str();
}

// ── Minimal JSON field extractors (string_view scanning) ─────────────────────
bool jsonStr(std::string_view obj, std::string_view key, std::string& out) {
    std::string k = "\"";
    k += key;
    k += "\"";
    auto p = obj.find(k);
    if (p == std::string_view::npos) return false;
    p += k.size();
    while (p < obj.size() && (obj[p] == ':' || obj[p] == ' ' || obj[p] == '\t' || obj[p] == '\n' || obj[p] == '\r')) ++p;
    if (p >= obj.size()) return false;
    if (obj[p] == 'n') { out.clear(); return true; } // null
    if (obj[p] != '"') return false;
    ++p;
    const auto start = p;
    bool esc = false;
    while (p < obj.size()) {
        if (esc) { esc = false; }
        else if (obj[p] == '\\') { esc = true; }
        else if (obj[p] == '"') break;
        ++p;
    }
    if (p >= obj.size()) return false;
    out = std::string(obj.substr(start, p - start));
    return true;
}

bool jsonDbl(std::string_view obj, std::string_view key, double& out) {
    std::string k = "\"";
    k += key;
    k += "\"";
    auto p = obj.find(k);
    if (p == std::string_view::npos) return false;
    p += k.size();
    while (p < obj.size() && (obj[p] == ':' || obj[p] == ' ' || obj[p] == '\t' || obj[p] == '\n' || obj[p] == '\r')) ++p;
    if (p >= obj.size() || obj[p] == 'n') return false;
    const auto start = p;
    while (p < obj.size() && (std::isdigit(static_cast<unsigned char>(obj[p])) ||
                               obj[p] == '-' || obj[p] == '+' || obj[p] == '.' ||
                               obj[p] == 'e' || obj[p] == 'E')) ++p;
    if (p == start) return false;
    const auto sv = obj.substr(start, p - start);
    const auto [ptr, ec] = std::from_chars(sv.data(), sv.data() + sv.size(), out);
    if (ec == std::errc()) return true;
    try {
        std::size_t processed = 0;
        out = std::stod(std::string(sv), &processed);
        return processed > 0;
    } catch (...) { return false; }
}

// Extract top-level JSON objects inside a named array key
std::vector<std::string_view> jsonObjects(std::string_view content, std::string_view array_key) {
    std::vector<std::string_view> result;
    std::string search = "\"";
    search += array_key;
    search += "\"";
    const auto pos = content.find(search);
    if (pos == std::string_view::npos) return result;
    const auto bracket = content.find('[', pos);
    if (bracket == std::string_view::npos) return result;

    bool in_str = false, esc = false;
    int depth = 0;
    std::size_t obj_start = std::string_view::npos;
    for (std::size_t i = bracket + 1; i < content.size(); ++i) {
        const char ch = content[i];
        if (esc) { esc = false; continue; }
        if (ch == '\\' && in_str) { esc = true; continue; }
        if (ch == '"') { in_str = !in_str; continue; }
        if (in_str) continue;
        if (ch == '{') {
            if (depth == 0) obj_start = i;
            ++depth;
        } else if (ch == '}') {
            --depth;
            if (depth == 0 && obj_start != std::string_view::npos) {
                result.push_back(content.substr(obj_start, i - obj_start + 1));
                obj_start = std::string_view::npos;
            }
        } else if (ch == ']' && depth == 0) {
            break;
        }
    }
    return result;
}

// Max drawdown on an equity curve passed as vector of equity values
double maxDrawdown(const std::vector<EquityPoint>& points) {
    double peak = 1.0, dd = 0.0;
    for (const auto& pt : points) {
        if (pt.equity > peak) peak = pt.equity;
        if (peak > 0.0) dd = std::max(dd, (peak - pt.equity) / peak);
    }
    return dd;
}

} // anonymous namespace

// ── MonteCarloResult ──────────────────────────────────────────────────────────
MonteCarloResult FrameBacktester::runMonteCarlo(
    const std::vector<double>& returns,
    int runs,
    double tail_alpha,
    uint64_t seed)
{
    MonteCarloResult mc;
    mc.sample_size = static_cast<int>(returns.size());
    if (returns.empty() || runs <= 0) return mc;

    const auto n = static_cast<uint64_t>(returns.size());
    std::vector<double> final_returns;
    std::vector<double> max_drawdowns;
    final_returns.reserve(static_cast<std::size_t>(runs));
    max_drawdowns.reserve(static_cast<std::size_t>(runs));

    uint64_t state = seed ^ (n * 6364136223846793005ULL + 1442695040888963407ULL);

    for (int r = 0; r < runs; ++r) {
        double equity = 1.0, peak = 1.0, sim_dd = 0.0;
        for (uint64_t i = 0; i < n; ++i) {
            const std::size_t idx = static_cast<std::size_t>(xorshift64(state) % n);
            equity *= (1.0 + returns[idx]);
            if (equity > peak) peak = equity;
            if (peak > 0.0) sim_dd = std::max(sim_dd, (peak - equity) / peak);
        }
        final_returns.push_back(equity - 1.0);
        max_drawdowns.push_back(sim_dd);
    }

    std::sort(final_returns.begin(), final_returns.end());
    std::sort(max_drawdowns.begin(), max_drawdowns.end());

    mc.runs = runs;
    mc.mean_final_return = std::accumulate(final_returns.begin(), final_returns.end(), 0.0)
                           / static_cast<double>(runs);

    const auto p05i = static_cast<std::size_t>(std::max(0, static_cast<int>(tail_alpha * static_cast<double>(runs))));
    const auto p95i = static_cast<std::size_t>(std::min(runs - 1, static_cast<int>((1.0 - tail_alpha) * static_cast<double>(runs))));
    const auto midi = static_cast<std::size_t>(runs / 2);
    mc.p05_final_return    = final_returns[p05i];
    mc.p95_final_return    = final_returns[p95i];
    mc.median_final_return = final_returns[midi];
    mc.probability_of_loss = static_cast<double>(
        std::count_if(final_returns.begin(), final_returns.end(), [](double x){ return x < 0.0; })
    ) / static_cast<double>(runs);
    mc.mean_max_drawdown = std::accumulate(max_drawdowns.begin(), max_drawdowns.end(), 0.0)
                           / static_cast<double>(runs);
    mc.p95_max_drawdown  = max_drawdowns[p95i];
    return mc;
}

// ── Mode A: native signal from OHLCV bars ─────────────────────────────────────
FrameBacktestResult FrameBacktester::runNative(
    std::span<const OhlcvBar> bars,
    const BacktestConfig& config,
    const FrameBacktestConfig& frame_cfg)
{
    FrameBacktestResult fr;
    fr.mode = "native";
    fr.base = Backtester::run(bars, config);

    std::vector<double> returns;
    returns.reserve(fr.base.trades.size());
    for (const auto& t : fr.base.trades)
        returns.push_back(t.net_return);

    const uint64_t seed = static_cast<uint64_t>(returns.size()) * 6364136223846793005ULL;
    fr.monte_carlo = runMonteCarlo(returns, frame_cfg.monte_carlo_runs, frame_cfg.tail_alpha, seed);
    return fr;
}

// ── Mode B: JS-annotated predictions ─────────────────────────────────────────
FrameBacktestResult FrameBacktester::runFromAnnotated(
    const std::vector<AnnotatedRow>& rows,
    const FrameBacktestConfig& frame_cfg)
{
    FrameBacktestResult fr;
    fr.mode = "frame";

    const double threshold  = frame_cfg.threshold;
    const int    horizon    = std::max(1, frame_cfg.horizon);
    const double drag       = frame_cfg.cost_bps / constants::BPS_DIVISOR;

    // Group rows by symbol preserving insertion order per symbol
    std::vector<std::string> symbol_order;
    std::map<std::string, std::vector<const AnnotatedRow*>> groups;
    for (const auto& row : rows) {
        if (!frame_cfg.timeframe.empty() && row.timeframe != frame_cfg.timeframe) continue;
        if (!frame_cfg.from_date.empty() && row.as_of < frame_cfg.from_date) continue;
        if (!frame_cfg.to_date.empty()   && row.as_of > frame_cfg.to_date)   continue;
        if (groups.find(row.symbol) == groups.end()) symbol_order.push_back(row.symbol);
        groups[row.symbol].push_back(&row);
    }

    double equity = 1.0;
    fr.base.equity_curve.initial_equity = 1.0;
    fr.base.equity_curve.points.push_back({"start", 1.0});

    std::vector<double> trade_returns;

    for (const auto& sym : symbol_order) {
        const auto& sym_rows = groups[sym];
        const int n = static_cast<int>(sym_rows.size());
        for (int i = 0; i + horizon < n; ++i) {
            const auto& entry = *sym_rows[static_cast<std::size_t>(i)];
            const auto& exit  = *sym_rows[static_cast<std::size_t>(i + horizon)];

            if (entry.predicted_direction != "long")         continue;
            if (entry.predicted_confidence < threshold)      continue;
            if (entry.close <= 0.0 || exit.close <= 0.0)    continue;

            const double adj_entry  = entry.close * (1.0 + drag);
            const double adj_exit   = exit.close  * (1.0 - drag);
            const double gross_ret  = exit.close / entry.close - 1.0;
            const double net_ret    = adj_exit / adj_entry - 1.0;

            equity *= (1.0 + net_ret);
            trade_returns.push_back(net_ret);

            if (net_ret > 0.0) ++fr.base.summary.winners;
            else if (net_ret < 0.0) ++fr.base.summary.losers;

            fr.base.trades.push_back(Trade{
                sym,
                entry.timeframe,
                entry.as_of,
                exit.as_of,
                entry.close,
                exit.close,
                gross_ret,
                net_ret,
                entry.predicted_confidence,
                static_cast<std::size_t>(horizon),
            });
            fr.base.equity_curve.points.push_back({exit.as_of, equity});
            i += (horizon - 1);
        }
    }

    fr.base.summary.trades       = fr.base.trades.size();
    fr.base.summary.net_return   = equity - 1.0;
    fr.base.summary.max_drawdown = maxDrawdown(fr.base.equity_curve.points);
    fr.base.summary.win_rate     = fr.base.summary.trades > 0
        ? static_cast<double>(fr.base.summary.winners) / static_cast<double>(fr.base.summary.trades) : 0.0;
    fr.base.summary.expectancy   = !trade_returns.empty()
        ? std::accumulate(trade_returns.begin(), trade_returns.end(), 0.0) / static_cast<double>(trade_returns.size()) : 0.0;

    if (!fr.base.equity_curve.points.empty()) {
        std::vector<double> eq_vals;
        eq_vals.reserve(fr.base.equity_curve.points.size());
        for (const auto& pt : fr.base.equity_curve.points) eq_vals.push_back(pt.equity);
        const auto stats = StatsEngine::summarize(eq_vals, constants::DEFAULT_RISK_FREE_RATE, constants::TRADING_DAYS_PER_YEAR);
        fr.base.summary.sharpe  = stats.sharpe;
        fr.base.summary.sortino = stats.sortino;
    }
    fr.base.summary.ok = !fr.base.trades.empty();

    const uint64_t seed = static_cast<uint64_t>(trade_returns.size()) * 6364136223846793005ULL;
    fr.monte_carlo = runMonteCarlo(trade_returns, frame_cfg.monte_carlo_runs, frame_cfg.tail_alpha, seed);
    return fr;
}

// ── Annotated frame file parser ───────────────────────────────────────────────
std::vector<AnnotatedRow> FrameBacktester::parseFrameFile(
    const std::string& path,
    FrameBacktestConfig& out_cfg)
{
    bool ok = false;
    const std::string content = readFileStr(path, ok);
    if (!ok) return {};

    std::string_view sv(content);

    // Read top-level config (values in frame override caller defaults)
    { double d = 0.0; if (jsonDbl(sv, "threshold", d))          out_cfg.threshold        = d; }
    { double d = 0.0; if (jsonDbl(sv, "horizon", d))             out_cfg.horizon          = static_cast<int>(d); }
    { double d = 0.0; if (jsonDbl(sv, "cost_bps", d))            out_cfg.cost_bps         = d; }
    { double d = 0.0; if (jsonDbl(sv, "monte_carlo_runs", d))    out_cfg.monte_carlo_runs = static_cast<int>(d); }
    { double d = 0.0; if (jsonDbl(sv, "tail_alpha", d))          out_cfg.tail_alpha       = d; }
    jsonStr(sv, "timeframe", out_cfg.timeframe);
    jsonStr(sv, "from",      out_cfg.from_date);
    jsonStr(sv, "to",        out_cfg.to_date);

    const auto feature_objects = jsonObjects(sv, "features");
    std::vector<AnnotatedRow> rows;
    rows.reserve(feature_objects.size());

    for (auto obj : feature_objects) {
        AnnotatedRow row;
        jsonStr(obj, "symbol",                row.symbol);
        jsonStr(obj, "timeframe",             row.timeframe);
        jsonStr(obj, "as_of",                 row.as_of);
        jsonDbl(obj, "close",                 row.close);
        jsonStr(obj, "predicted_direction",   row.predicted_direction);
        jsonDbl(obj, "predicted_confidence",  row.predicted_confidence);
        if (!row.symbol.empty() && row.close > 0.0)
            rows.push_back(std::move(row));
    }
    return rows;
}

} // namespace sovereign
