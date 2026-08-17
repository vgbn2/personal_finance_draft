#include "binary_ts_reader.hpp"

#include <algorithm>
#include <array>
#include <bit>
#include <chrono>
#include <cmath>
#include <cstddef>
#include <cstdint>
#include <ctime>
#include <fstream>
#include <iomanip>
#include <sstream>

namespace sovereign {

namespace {

constexpr std::array<std::uint32_t, 64> kSha256RoundConstants = {
    0x428a2f98U, 0x71374491U, 0xb5c0fbcfU, 0xe9b5dba5U, 0x3956c25bU, 0x59f111f1U, 0x923f82a4U, 0xab1c5ed5U,
    0xd807aa98U, 0x12835b01U, 0x243185beU, 0x550c7dc3U, 0x72be5d74U, 0x80deb1feU, 0x9bdc06a7U, 0xc19bf174U,
    0xe49b69c1U, 0xefbe4786U, 0x0fc19dc6U, 0x240ca1ccU, 0x2de92c6fU, 0x4a7484aaU, 0x5cb0a9dcU, 0x76f988daU,
    0x983e5152U, 0xa831c66dU, 0xb00327c8U, 0xbf597fc7U, 0xc6e00bf3U, 0xd5a79147U, 0x06ca6351U, 0x14292967U,
    0x27b70a85U, 0x2e1b2138U, 0x4d2c6dfcU, 0x53380d13U, 0x650a7354U, 0x766a0abbU, 0x81c2c92eU, 0x92722c85U,
    0xa2bfe8a1U, 0xa81a664bU, 0xc24b8b70U, 0xc76c51a3U, 0xd192e819U, 0xd6990624U, 0xf40e3585U, 0x106aa070U,
    0x19a4c116U, 0x1e376c08U, 0x2748774cU, 0x34b0bcb5U, 0x391c0cb3U, 0x4ed8aa4aU, 0x5b9cca4fU, 0x682e6ff3U,
    0x748f82eeU, 0x78a5636fU, 0x84c87814U, 0x8cc70208U, 0x90befffaU, 0xa4506cebU, 0xbef9a3f7U, 0xc67178f2U,
};

void transformSha256Block(
    std::array<std::uint32_t, 8>& state,
    const std::array<unsigned char, 64>& block) {
    std::array<std::uint32_t, 64> schedule{};
    for (std::size_t i = 0; i < 16U; ++i) {
        const std::size_t offset = i * 4U;
        schedule[i] = (static_cast<std::uint32_t>(block[offset]) << 24U)
            | (static_cast<std::uint32_t>(block[offset + 1U]) << 16U)
            | (static_cast<std::uint32_t>(block[offset + 2U]) << 8U)
            | static_cast<std::uint32_t>(block[offset + 3U]);
    }
    for (std::size_t i = 16U; i < schedule.size(); ++i) {
        const std::uint32_t s0 = std::rotr(schedule[i - 15U], 7U)
            ^ std::rotr(schedule[i - 15U], 18U)
            ^ (schedule[i - 15U] >> 3U);
        const std::uint32_t s1 = std::rotr(schedule[i - 2U], 17U)
            ^ std::rotr(schedule[i - 2U], 19U)
            ^ (schedule[i - 2U] >> 10U);
        schedule[i] = schedule[i - 16U] + s0 + schedule[i - 7U] + s1;
    }

    auto [a, b, c, d, e, f, g, h] = state;
    for (std::size_t i = 0; i < schedule.size(); ++i) {
        const std::uint32_t sum1 = std::rotr(e, 6U) ^ std::rotr(e, 11U) ^ std::rotr(e, 25U);
        const std::uint32_t choose = (e & f) ^ ((~e) & g);
        const std::uint32_t temp1 = h + sum1 + choose + kSha256RoundConstants[i] + schedule[i];
        const std::uint32_t sum0 = std::rotr(a, 2U) ^ std::rotr(a, 13U) ^ std::rotr(a, 22U);
        const std::uint32_t majority = (a & b) ^ (a & c) ^ (b & c);
        const std::uint32_t temp2 = sum0 + majority;
        h = g;
        g = f;
        f = e;
        e = d + temp1;
        d = c;
        c = b;
        b = a;
        a = temp1 + temp2;
    }
    state[0] += a;
    state[1] += b;
    state[2] += c;
    state[3] += d;
    state[4] += e;
    state[5] += f;
    state[6] += g;
    state[7] += h;
}

std::string extractJsonString(const std::string& json, const std::string& key) {
    const std::string marker = "\"" + key + "\"";
    const std::size_t key_pos = json.find(marker);
    if (key_pos == std::string::npos) return {};
    const std::size_t colon = json.find(':', key_pos + marker.size());
    const std::size_t quote = colon == std::string::npos ? std::string::npos : json.find('"', colon + 1U);
    if (quote == std::string::npos) return {};
    const std::size_t end = json.find('"', quote + 1U);
    return end == std::string::npos ? std::string{} : json.substr(quote + 1U, end - quote - 1U);
}

} // namespace

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

bool BinaryTsReader::sha256File(
    const std::filesystem::path& path,
    std::string& out_digest,
    std::string& out_error) {
    out_digest.clear();
    out_error.clear();
    std::error_code ec;
    const auto status = std::filesystem::symlink_status(path, ec);
    if (ec || !std::filesystem::is_regular_file(status) || std::filesystem::is_symlink(status)) {
        out_error = "dataset_not_regular_file";
        return false;
    }
    std::ifstream file(path, std::ios::binary);
    if (!file.is_open()) {
        out_error = "unable_to_open_file";
        return false;
    }

    std::array<std::uint32_t, 8> state = {
        0x6a09e667U, 0xbb67ae85U, 0x3c6ef372U, 0xa54ff53aU,
        0x510e527fU, 0x9b05688cU, 0x1f83d9abU, 0x5be0cd19U,
    };
    std::array<unsigned char, 64> block{};
    std::size_t buffered = 0U;
    std::uint64_t total_bytes = 0U;
    std::array<char, 64 * 1024> chunk{};
    while (file) {
        file.read(chunk.data(), static_cast<std::streamsize>(chunk.size()));
        const std::streamsize count = file.gcount();
        if (count < 0) {
            out_error = "dataset_hash_read_failed";
            return false;
        }
        for (std::streamsize i = 0; i < count; ++i) {
            block[buffered++] = static_cast<unsigned char>(chunk[static_cast<std::size_t>(i)]);
            ++total_bytes;
            if (buffered == block.size()) {
                transformSha256Block(state, block);
                buffered = 0U;
            }
        }
    }
    if (!file.eof()) {
        out_error = "dataset_hash_read_failed";
        return false;
    }

    block[buffered++] = 0x80U;
    if (buffered > 56U) {
        std::fill(block.begin() + static_cast<std::ptrdiff_t>(buffered), block.end(), 0U);
        transformSha256Block(state, block);
        block.fill(0U);
        buffered = 0U;
    }
    std::fill(
        block.begin() + static_cast<std::ptrdiff_t>(buffered),
        block.begin() + 56,
        0U);
    const std::uint64_t bit_length = total_bytes * 8U;
    for (std::size_t i = 0; i < 8U; ++i) {
        block[63U - i] = static_cast<unsigned char>(bit_length >> (i * 8U));
    }
    transformSha256Block(state, block);

    std::ostringstream digest;
    digest << std::hex << std::setfill('0');
    for (const std::uint32_t word : state) digest << std::setw(8) << word;
    out_digest = digest.str();
    return true;
}

bool BinaryTsReader::readSidecarFamily(
    const std::filesystem::path& ts_dir,
    const std::string& symbol,
    const std::string& timeframe,
    std::string& out_family,
    std::string& out_error) {
    out_family.clear();
    out_error.clear();
    auto sidecar = buildBinaryPath(ts_dir, symbol, timeframe);
    sidecar.replace_extension(".meta.json");

    std::error_code ec;
    const auto status = std::filesystem::symlink_status(sidecar, ec);
    if (ec || !std::filesystem::is_regular_file(status) || std::filesystem::is_symlink(status)) {
        out_error = "dataset_sidecar_not_regular_file";
        return false;
    }
    const auto bytes = std::filesystem::file_size(sidecar, ec);
    if (ec || bytes == 0U || bytes > 1024U * 1024U) {
        out_error = "dataset_sidecar_invalid_size";
        return false;
    }

    std::ifstream file(sidecar);
    if (!file.is_open()) {
        out_error = "dataset_sidecar_open_failed";
        return false;
    }
    std::ostringstream contents;
    contents << file.rdbuf();
    if (!file.good() && !file.eof()) {
        out_error = "dataset_sidecar_read_failed";
        return false;
    }
    out_family = extractJsonString(contents.str(), "family");
    if (out_family.empty()) {
        out_error = "dataset_sidecar_family_missing";
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
        r.high = std::max({r.open, r.close, r.high});
        r.low = std::min({r.open, r.close, r.low});
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
