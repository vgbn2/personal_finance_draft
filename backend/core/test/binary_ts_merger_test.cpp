#include "data/binary_ts_merger.hpp"
#include "data/binary_ts_reader.hpp"

#include <filesystem>
#include <fstream>
#include <iostream>
#include <vector>

namespace {

bool expect(bool condition, const char* message) {
    if (!condition) {
        std::cerr << "FAIL: " << message << "\n";
    }
    return condition;
}

bool writeTestBinary(const std::filesystem::path& path, const std::vector<sovereign::RawTsRecord>& records) {
    std::ofstream out(path, std::ios::binary | std::ios::trunc);
    if (!out.is_open()) {
        std::cerr << "Failed to open test binary for writing: " << path << "\n";
        return false;
    }
    sovereign::RawTsHeader header{};
    header.magic[0] = 'S';
    header.magic[1] = 'O';
    header.magic[2] = 'V';
    header.magic[3] = 'T';
    header.count = static_cast<std::uint32_t>(records.size());
    out.write(reinterpret_cast<const char*>(&header), sizeof(header));
    if (!records.empty()) {
        out.write(reinterpret_cast<const char*>(records.data()), static_cast<std::streamsize>(records.size() * sizeof(sovereign::RawTsRecord)));
    }
    return out.good();
}

} // namespace

int main() {
    const std::filesystem::path temp_dir = std::filesystem::temp_directory_path() / "sovereign_ts_merger_test";
    std::filesystem::create_directories(temp_dir);

    const auto existing_path = temp_dir / "existing.bin";
    const auto incoming_path = temp_dir / "incoming.bin";
    const auto out_path = temp_dir / "merged.bin";

    // Test 1: Merge when existing file does not exist
    {
        std::error_code ec;
        std::filesystem::remove(existing_path, ec);
        std::filesystem::remove(out_path, ec);

        std::vector<sovereign::RawTsRecord> incoming = {
            {1000.0, 10.0, 12.0, 9.0, 11.0, 100.0},
            {2000.0, 11.0, 13.0, 10.0, 12.0, 200.0},
        };
        if (!writeTestBinary(incoming_path, incoming)) return 1;

        const auto res = sovereign::BinaryTsMerger::mergeFiles(existing_path, incoming_path, out_path);
        if (!expect(res.ok, "mergeFiles when existing missing should succeed")) return 1;
        if (!expect(res.count == 2, "mergeFiles count should be 2")) return 1;
        if (!expect(res.incoming_count == 2, "incoming_count should be 2")) return 1;
        if (!expect(res.existing_count == 0, "existing_count should be 0")) return 1;

        const auto read_res = sovereign::BinaryTsReader::readBinaryFile(out_path, "TEST", "1m");
        if (!expect(read_res.ok, "readBinaryFile should succeed")) return 1;
        if (!expect(read_res.total_records == 2, "readBinaryFile total_records should be 2")) return 1;
        if (!expect(read_res.raw_records[0].ts_ms == 1000.0, "record 0 ts_ms should be 1000")) return 1;
        if (!expect(read_res.raw_records[1].ts_ms == 2000.0, "record 1 ts_ms should be 2000")) return 1;
    }

    // Test 2: Two-pointer merge with disjoint and overlapping timestamps
    {
        std::vector<sovereign::RawTsRecord> existing = {
            {1000.0, 10.0, 12.0, 9.0, 11.0, 100.0},
            {3000.0, 12.0, 14.0, 11.0, 13.0, 300.0}, // old value at 3000
            {5000.0, 14.0, 16.0, 13.0, 15.0, 500.0},
        };
        if (!writeTestBinary(existing_path, existing)) return 1;

        std::vector<sovereign::RawTsRecord> incoming = {
            {2000.0, 11.0, 13.0, 10.0, 12.0, 200.0},
            {3000.0, 12.5, 14.5, 11.5, 13.5, 350.0}, // new value at 3000 (incoming wins by default)
            {4000.0, 13.0, 15.0, 12.0, 14.0, 400.0},
            {6000.0, 15.0, 17.0, 14.0, 16.0, 600.0},
        };
        if (!writeTestBinary(incoming_path, incoming)) return 1;

        const auto res = sovereign::BinaryTsMerger::mergeFiles(existing_path, incoming_path, out_path);
        if (!expect(res.ok, "mergeFiles should succeed")) return 1;
        if (!expect(res.count == 6, "merged count should be 6")) return 1;
        if (!expect(res.existing_count == 3, "existing_count should be 3")) return 1;
        if (!expect(res.incoming_count == 4, "incoming_count should be 4")) return 1;

        const auto read_res = sovereign::BinaryTsReader::readBinaryFile(out_path, "TEST", "1m");
        if (!expect(read_res.ok, "readBinaryFile should succeed")) return 1;
        if (!expect(read_res.total_records == 6, "total_records should be 6")) return 1;
        if (!expect(read_res.raw_records[0].ts_ms == 1000.0, "ts_ms 0 mismatch")) return 1;
        if (!expect(read_res.raw_records[1].ts_ms == 2000.0, "ts_ms 1 mismatch")) return 1;
        if (!expect(read_res.raw_records[2].ts_ms == 3000.0, "ts_ms 2 mismatch")) return 1;
        if (!expect(read_res.raw_records[2].close == 13.5, "incoming should win on tie by default")) return 1;
        if (!expect(read_res.raw_records[3].ts_ms == 4000.0, "ts_ms 3 mismatch")) return 1;
        if (!expect(read_res.raw_records[4].ts_ms == 5000.0, "ts_ms 4 mismatch")) return 1;
        if (!expect(read_res.raw_records[5].ts_ms == 6000.0, "ts_ms 5 mismatch")) return 1;
    }

    // Test 3: Existing wins on tie
    {
        sovereign::BinaryMergeOptions opts;
        opts.existing_wins_on_tie = true;

        const auto res = sovereign::BinaryTsMerger::mergeFiles(existing_path, incoming_path, out_path, opts);
        if (!expect(res.ok, "mergeFiles with existing_wins_on_tie should succeed")) return 1;
        if (!expect(res.count == 6, "count should be 6")) return 1;

        const auto read_res = sovereign::BinaryTsReader::readBinaryFile(out_path, "TEST", "1m");
        if (!expect(read_res.ok, "readBinaryFile should succeed")) return 1;
        if (!expect(read_res.raw_records[2].ts_ms == 3000.0, "ts_ms 2 mismatch")) return 1;
        if (!expect(read_res.raw_records[2].close == 13.0, "existing should win on tie with option")) return 1;
    }

    // Clean up
    std::error_code ec;
    std::filesystem::remove_all(temp_dir, ec);

    std::cout << "{\"test\":\"binary_ts_merger_test\",\"status\":\"passed\"}\n";
    return 0;
}
