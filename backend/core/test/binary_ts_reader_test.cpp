#include "data/binary_ts_reader.hpp"

#include <cassert>
#include <cstdint>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <vector>

int main() {
    std::cout << "[TEST] Running binary_ts_reader_test..." << std::endl;

    // Test 1: formatIsoTimestamp
    const std::string iso = sovereign::BinaryTsReader::formatIsoTimestamp(1700000000000.0); // 2023-11-14T22:13:20.000Z
    if (iso.empty() || iso.find("2023-11-14") == std::string::npos) {
        std::cerr << "FAILED: formatIsoTimestamp returned " << iso << std::endl;
        return 1;
    }
    std::cout << "  ✔ formatIsoTimestamp: " << iso << std::endl;

    // Test 2: sanitizeSymbol
    if (sovereign::BinaryTsReader::sanitizeSymbol("BTC/USDT") != "BTC_USDT" ||
        sovereign::BinaryTsReader::sanitizeSymbol("AAPL") != "AAPL") {
        std::cerr << "FAILED: sanitizeSymbol" << std::endl;
        return 1;
    }
    std::cout << "  ✔ sanitizeSymbol passed" << std::endl;

    // Test 3: Write temporary binary TS file & parse header + records
    const auto temp_dir = std::filesystem::temp_directory_path() / "sov_ts_reader_test";
    std::filesystem::create_directories(temp_dir);
    const auto test_bin = temp_dir / "TEST_1d.bin";

    sovereign::RawTsHeader header{'S', 'O', 'V', 'T', 3};
    sovereign::RawTsRecord records[3] = {
        {1700000000000.0, 100.0, 105.0, 99.0, 104.0, 1000.0},
        {1700086400000.0, 104.0, 108.0, 103.0, 107.0, 1200.0},
        {1700172800000.0, 107.0, 110.0, 106.0, 109.0, 1500.0}
    };

    {
        std::ofstream out(test_bin, std::ios::binary);
        out.write(reinterpret_cast<const char*>(&header), sizeof(header));
        out.write(reinterpret_cast<const char*>(records), sizeof(records));
    }

    sovereign::RawTsHeader read_hdr{};
    std::string err;
    if (!sovereign::BinaryTsReader::readHeader(test_bin, read_hdr, err) || read_hdr.count != 3) {
        std::cerr << "FAILED: readHeader: " << err << " (count: " << read_hdr.count << ")" << std::endl;
        return 1;
    }
    std::cout << "  ✔ readHeader verified (magic: " << read_hdr.magic[0] << read_hdr.magic[1] << read_hdr.magic[2] << read_hdr.magic[3] << ", count: " << read_hdr.count << ")" << std::endl;

    const auto res = sovereign::BinaryTsReader::readBinaryFile(test_bin, "TEST", "1d", 0, true);
    if (!res.ok || res.total_records != 3 || res.bars.size() != 3 || res.bars[0].close != 104.0 || res.bars[2].close != 109.0) {
        std::cerr << "FAILED: readBinaryFile" << std::endl;
        return 1;
    }
    std::cout << "  ✔ readBinaryFile parsed " << res.bars.size() << " bars successfully" << std::endl;

    const auto abc_path = temp_dir / "abc.bin";
    {
        std::ofstream out(abc_path, std::ios::binary);
        out << "abc";
    }
    std::string digest;
    if (!sovereign::BinaryTsReader::sha256File(abc_path, digest, err)
        || digest != "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad") {
        std::cerr << "FAILED: sha256File returned " << digest << " (" << err << ")" << std::endl;
        return 1;
    }
    std::cout << "  ✔ sha256File matches the SHA-256 reference vector" << std::endl;

    const auto abc_link = temp_dir / "abc-link.bin";
    std::filesystem::create_symlink(abc_path, abc_link);
    if (sovereign::BinaryTsReader::sha256File(abc_link, digest, err)
        || err != "dataset_not_regular_file") {
        std::cerr << "FAILED: sha256File followed a symlink" << std::endl;
        return 1;
    }
    std::cout << "  ✔ sha256File rejects symlink snapshot swaps" << std::endl;

    {
        std::ofstream out(temp_dir / "TEST_1d.meta.json");
        out << R"({"family":"equities","symbol":"TEST","timeframe":"1d"})";
    }
    std::string family;
    if (!sovereign::BinaryTsReader::readSidecarFamily(temp_dir, "TEST", "1d", family, err)
        || family != "equities") {
        std::cerr << "FAILED: readSidecarFamily returned " << family << " (" << err << ")" << std::endl;
        return 1;
    }
    std::cout << "  ✔ readSidecarFamily binds the dataset family" << std::endl;

    std::filesystem::remove_all(temp_dir);
    std::cout << "✔ binary_ts_reader_test passed cleanly!" << std::endl;
    return 0;
}
