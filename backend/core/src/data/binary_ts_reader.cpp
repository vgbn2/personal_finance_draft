#include "binary_ts_reader.hpp"

#include <algorithm>
#include <chrono>
#include <cmath>
#include <cstddef>
#include <cstdint>
#include <ctime>
#include <fstream>
#include <iomanip>
#include <sstream>

namespace sovereign {

std::string BinaryTsReader::formatIsoTimestamp(double ts_ms) {
    if (!std::isfinite(ts_ms) || ts_ms < 0.0) {
        return "1970-01-01T00:00:00.000Z";
    }
    const auto total_ms = static_cast<std::int64_t>(ts_ms);
    const auto secs = static_cast<std::time_t>(total_ms / 1000);
    const auto millis = static_cast<int>(total_ms % 1000);

    std::tm tm_buf{};
#if defined(_WIN32)
    gmtime_s(&tm_buf, &secs);
#else
    gmtime_r(&secs, &tm_buf);
#endif

    std::ostringstream ss;
    ss << std::setfill('0')
       << std::setw(4) << (tm_buf.tm_year + 1900) << '-'
       << std::setw(2) << (tm_buf.tm_mon + 1) << '-'
       << std::setw(2) << tm_buf.tm_mday << 'T'
       << std::setw(2) << tm_buf.tm_hour << ':'
       << std::setw(2) << tm_buf.tm_min << ':'
       << std::setw(2) << tm_buf.tm_sec << '.'
       << std::setw(3) << (millis < 0 ? 0 : millis) << 'Z';
    return ss.str();
}

std::string BinaryTsReader::sanitizeSymbol(const std::string& symbol) {
    std::string safe = symbol;
    for (char& c : safe) {
        if (!std::isalnum(static_cast<unsigned char>(c)) && c != '_') {
            c = '_';
        }
    }
    return safe;
}

std::filesystem::path BinaryTsReader::buildBinaryPath(
    const std::filesystem::path& ts_dir,
    const std::string& symbol,
    const std::string& timeframe) {
    const std::string filename = sanitizeSymbol(symbol) + "_" + timeframe + ".bin";
    return ts_dir / filename;
}

bool BinaryTsReader::readHeader(const std::filesystem::path& path, RawTsHeader& out_header, std::string& out_error) {
    out_error.clear();
    std::error_code ec;
    const auto file_size = std::filesystem::file_size(path, ec);
    if (ec || file_size < sizeof(RawTsHeader)) {
        out_error = "file_too_small_for_header";
        return false;
    }

    std::ifstream file(path, std::ios::binary);
    if (!file.is_open()) {
        out_error = "unable_to_open_file";
        return false;
    }

    file.read(reinterpret_cast<char*>(&out_header), sizeof(RawTsHeader));
    if (file.gcount() != sizeof(RawTsHeader)) {
        out_error = "failed_to_read_header_bytes";
        return false;
    }

    if (out_header.magic[0] != 'S' || out_header.magic[1] != 'O' ||
        out_header.magic[2] != 'V' || out_header.magic[3] != 'T') {
        out_error = "invalid_magic_header";
        return false;
    }

    return true;
}

BinaryTsReaderResult BinaryTsReader::readBinaryFile(
    const std::filesystem::path& path,
    const std::string& symbol,
    const std::string& timeframe,
    std::size_t max_bars,
    bool format_bars) {

    BinaryTsReaderResult result;
    result.symbol = symbol;
    result.timeframe = timeframe;

    RawTsHeader header{};
    if (!readHeader(path, header, result.error)) {
        result.ok = false;
        return result;
    }

    result.total_records = header.count;
    std::error_code ec;
    const auto file_size = std::filesystem::file_size(path, ec);
    if (ec) {
        result.ok = false;
        result.error = "file_stat_failed";
        return result;
    }

    const std::uintmax_t expected_size = sizeof(RawTsHeader) + static_cast<std::uintmax_t>(header.count) * sizeof(RawTsRecord);
    if (file_size < expected_size) {
        // Adjust count to readable full records if truncated
        result.total_records = static_cast<std::uint32_t>((file_size - sizeof(RawTsHeader)) / sizeof(RawTsRecord));
    }

    std::ifstream file(path, std::ios::binary);
    if (!file.is_open()) {
        result.ok = false;
        result.error = "unable_to_open_file";
        return result;
    }

    file.seekg(sizeof(RawTsHeader), std::ios::beg);

    std::size_t records_to_read = result.total_records;
    if (max_bars > 0 && max_bars < records_to_read) {
        // Seek to the tail `max_bars` records
        const std::size_t offset_records = records_to_read - max_bars;
        file.seekg(sizeof(RawTsHeader) + offset_records * sizeof(RawTsRecord), std::ios::beg);
        records_to_read = max_bars;
    }

    result.raw_records.resize(records_to_read);
    if (records_to_read > 0) {
        file.read(reinterpret_cast<char*>(result.raw_records.data()), records_to_read * sizeof(RawTsRecord));
        const auto read_bytes = file.gcount();
        const std::size_t actual_records = read_bytes / sizeof(RawTsRecord);
        result.raw_records.resize(actual_records);
        result.loaded_records = static_cast<std::uint32_t>(actual_records);
    }

    // Sort/Sanitize raw records if timestamps non-monotonic or contain non-finite values
    std::size_t valid_count = 0;
    for (std::size_t i = 0; i < result.raw_records.size(); ++i) {
        auto& r = result.raw_records[i];
        if (!std::isfinite(r.ts_ms) || !std::isfinite(r.close) || r.close <= 0.0) {
            continue;
        }
        if (!std::isfinite(r.open) || r.open <= 0.0) r.open = r.close;
        if (!std::isfinite(r.high) || r.high < r.close) r.high = std::max(r.open, r.close);
        if (!std::isfinite(r.low) || r.low <= 0.0 || r.low > r.close) r.low = std::min(r.open, r.close);
        if (!std::isfinite(r.volume) || r.volume < 0.0) r.volume = 0.0;

        if (valid_count != i) {
            result.raw_records[valid_count] = r;
        }
        valid_count++;
    }
    result.raw_records.resize(valid_count);

    // Monotonic timestamp check
    bool is_sorted = true;
    for (std::size_t i = 1; i < result.raw_records.size(); ++i) {
        if (result.raw_records[i].ts_ms < result.raw_records[i - 1].ts_ms) {
            is_sorted = false;
            break;
        }
    }
    if (!is_sorted) {
        std::stable_sort(result.raw_records.begin(), result.raw_records.end(), [](const RawTsRecord& a, const RawTsRecord& b) {
            return a.ts_ms < b.ts_ms;
        });
    }

    if (format_bars) {
        result.bars.reserve(result.raw_records.size());
        for (const auto& r : result.raw_records) {
            OhlcvBar bar;
            bar.asset_id = symbol;
            bar.timeframe = timeframe;
            bar.timestamp = formatIsoTimestamp(r.ts_ms);
            bar.open = r.open;
            bar.high = r.high;
            bar.low = r.low;
            bar.close = r.close;
            bar.volume = r.volume;
            bar.source = "binary_ts_reader";
            result.bars.push_back(std::move(bar));
        }
    }

    result.ok = true;
    return result;
}

BinaryTsReaderResult BinaryTsReader::loadSymbolBinary(
    const std::filesystem::path& ts_dir,
    const std::string& symbol,
    const std::string& timeframe,
    std::size_t max_bars,
    bool format_bars) {

    const auto bin_path = buildBinaryPath(ts_dir, symbol, timeframe);
    return readBinaryFile(bin_path, symbol, timeframe, max_bars, format_bars);
}

} // namespace sovereign
