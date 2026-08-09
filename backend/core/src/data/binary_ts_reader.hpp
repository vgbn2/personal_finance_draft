#pragma once

#include "data_snapshot.hpp"
#include "ohlcv_bar.hpp"

#include <cstdint>
#include <filesystem>
#include <string>
#include <vector>

namespace sovereign {

#pragma pack(push, 1)
struct RawTsHeader {
    char magic[4];       // "SOVT"
    std::uint32_t count; // Little-endian record count
};

struct RawTsRecord {
    double ts_ms;
    double open;
    double high;
    double low;
    double close;
    double volume;
};
#pragma pack(pop)

struct BinaryTsReaderResult {
    bool ok = false;
    std::string error;
    std::string symbol;
    std::string timeframe;
    std::uint32_t total_records = 0;
    std::uint32_t loaded_records = 0;
    std::vector<OhlcvBar> bars;
    std::vector<RawTsRecord> raw_records;
};

class BinaryTsReader {
public:
    static std::string formatIsoTimestamp(double ts_ms);
    static std::string sanitizeSymbol(const std::string& symbol);
    static std::filesystem::path buildBinaryPath(
        const std::filesystem::path& ts_dir,
        const std::string& symbol,
        const std::string& timeframe);

    static bool readHeader(const std::filesystem::path& path, RawTsHeader& out_header, std::string& out_error);

    static bool sha256File(
        const std::filesystem::path& path,
        std::string& out_digest,
        std::string& out_error);

    static bool readSidecarFamily(
        const std::filesystem::path& ts_dir,
        const std::string& symbol,
        const std::string& timeframe,
        std::string& out_family,
        std::string& out_error);

    static BinaryTsReaderResult readBinaryFile(
        const std::filesystem::path& path,
        const std::string& symbol,
        const std::string& timeframe,
        std::size_t max_bars = 0,
        bool format_bars = true);

    static BinaryTsReaderResult loadSymbolBinary(
        const std::filesystem::path& ts_dir,
        const std::string& symbol,
        const std::string& timeframe,
        std::size_t max_bars = 0,
        bool format_bars = true);
};

} // namespace sovereign
