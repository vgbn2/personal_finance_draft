#include "binary_ts_merger.hpp"

#include <algorithm>
#include <array>
#include <cstring>
#include <fstream>
#include <vector>

namespace sovereign {

namespace {

constexpr std::size_t kChunkRecords = 1024; // 1024 * 48 bytes = 48 KB buffer per stream
constexpr char kMagic[4] = {'S', 'O', 'V', 'T'};

class BinaryStreamReader {
public:
    explicit BinaryStreamReader(const std::filesystem::path& path)
        : stream_(path, std::ios::binary) {
        if (!stream_) {
            error_ = "failed to open file";
            return;
        }
        RawTsHeader header{};
        if (!stream_.read(reinterpret_cast<char*>(&header), sizeof(header))) {
            error_ = "failed to read header";
            return;
        }
        if (std::memcmp(header.magic, kMagic, 4) != 0) {
            error_ = "invalid SOVT magic header";
            return;
        }
        total_count_ = header.count;
        valid_ = true;
    }

    bool isValid() const { return valid_; }
    const std::string& error() const { return error_; }
    std::uint32_t totalCount() const { return total_count_; }
    bool hasNext() {
        if (buf_idx_ >= buf_size_) {
            fillBuffer();
        }
        return buf_idx_ < buf_size_;
    }

    const RawTsRecord& peek() {
        if (buf_idx_ >= buf_size_) {
            fillBuffer();
        }
        return buffer_[buf_idx_];
    }

    void advance() {
        if (buf_idx_ < buf_size_) {
            ++buf_idx_;
            ++read_count_;
        }
    }

private:
    void fillBuffer() {
        buf_idx_ = 0;
        buf_size_ = 0;
        if (read_count_ >= total_count_ || !stream_) return;

        const std::size_t to_read = std::min<std::size_t>(
            kChunkRecords,
            total_count_ - read_count_);
        stream_.read(
            reinterpret_cast<char*>(buffer_.data()),
            static_cast<std::streamsize>(to_read * sizeof(RawTsRecord)));
        const auto bytes = stream_.gcount();
        buf_size_ = static_cast<std::size_t>(bytes) / sizeof(RawTsRecord);
    }

    std::ifstream stream_;
    bool valid_ = false;
    std::string error_;
    std::uint32_t total_count_ = 0;
    std::uint32_t read_count_ = 0;
    std::size_t buf_idx_ = 0;
    std::size_t buf_size_ = 0;
    std::array<RawTsRecord, kChunkRecords> buffer_{};
};

class BinaryStreamWriter {
public:
    explicit BinaryStreamWriter(const std::filesystem::path& path)
        : stream_(path, std::ios::binary | std::ios::trunc) {
        if (!stream_) {
            error_ = "failed to create output file";
            return;
        }
        // Write placeholder header
        RawTsHeader header{};
        std::memcpy(header.magic, kMagic, 4);
        header.count = 0;
        stream_.write(reinterpret_cast<const char*>(&header), sizeof(header));
        valid_ = static_cast<bool>(stream_);
    }

    bool isValid() const { return valid_; }
    const std::string& error() const { return error_; }
    std::uint32_t writtenCount() const { return written_count_; }

    void writeRecord(const RawTsRecord& rec) {
        buffer_[buf_size_++] = rec;
        ++written_count_;
        if (buf_size_ >= kChunkRecords) {
            flush();
        }
    }

    bool finalize() {
        flush();
        if (!stream_) return false;
        stream_.seekp(0, std::ios::beg);
        RawTsHeader header{};
        std::memcpy(header.magic, kMagic, 4);
        header.count = written_count_;
        stream_.write(reinterpret_cast<const char*>(&header), sizeof(header));
        stream_.flush();
        return static_cast<bool>(stream_);
    }

private:
    void flush() {
        if (buf_size_ == 0 || !stream_) return;
        stream_.write(
            reinterpret_cast<const char*>(buffer_.data()),
            static_cast<std::streamsize>(buf_size_ * sizeof(RawTsRecord)));
        buf_size_ = 0;
    }

    std::ofstream stream_;
    bool valid_ = false;
    std::string error_;
    std::uint32_t written_count_ = 0;
    std::size_t buf_size_ = 0;
    std::array<RawTsRecord, kChunkRecords> buffer_{};
};

} // namespace

BinaryMergeResult BinaryTsMerger::mergeFiles(
    const std::filesystem::path& existing_bin,
    const std::filesystem::path& incoming_bin,
    const std::filesystem::path& output_tmp_bin,
    const BinaryMergeOptions& options) {
    BinaryMergeResult result{};

    bool has_existing = false;
    std::error_code ec;
    if (std::filesystem::exists(existing_bin, ec) && std::filesystem::file_size(existing_bin, ec) >= sizeof(RawTsHeader)) {
        has_existing = true;
    }

    if (!std::filesystem::exists(incoming_bin, ec)) {
        result.error = "incoming file does not exist: " + incoming_bin.string();
        return result;
    }

    BinaryStreamReader in_reader(incoming_bin);
    if (!in_reader.isValid()) {
        result.error = "incoming reader error: " + in_reader.error();
        return result;
    }
    result.incoming_count = in_reader.totalCount();

    BinaryStreamWriter writer(output_tmp_bin);
    if (!writer.isValid()) {
        result.error = "output writer error: " + writer.error();
        return result;
    }

    if (!has_existing) {
        // Fast path: simply copy/stream incoming records
        while (in_reader.hasNext()) {
            writer.writeRecord(in_reader.peek());
            in_reader.advance();
        }
        if (!writer.finalize()) {
            result.error = "failed to finalize output binary";
            return result;
        }
        result.ok = true;
        result.count = writer.writtenCount();
        return result;
    }

    BinaryStreamReader ex_reader(existing_bin);
    if (!ex_reader.isValid()) {
        result.error = "existing reader error: " + ex_reader.error();
        return result;
    }
    result.existing_count = ex_reader.totalCount();

    // Two-pointer streaming merge with deduplication
    while (ex_reader.hasNext() && in_reader.hasNext()) {
        const auto& ex_rec = ex_reader.peek();
        const auto& in_rec = in_reader.peek();

        if (ex_rec.ts_ms == in_rec.ts_ms) {
            if (options.existing_wins_on_tie) {
                writer.writeRecord(ex_rec);
            } else {
                writer.writeRecord(in_rec);
            }
            ex_reader.advance();
            in_reader.advance();
        } else if (ex_rec.ts_ms < in_rec.ts_ms) {
            writer.writeRecord(ex_rec);
            ex_reader.advance();
        } else {
            writer.writeRecord(in_rec);
            in_reader.advance();
        }
    }

    while (ex_reader.hasNext()) {
        writer.writeRecord(ex_reader.peek());
        ex_reader.advance();
    }

    while (in_reader.hasNext()) {
        writer.writeRecord(in_reader.peek());
        in_reader.advance();
    }

    if (!writer.finalize()) {
        result.error = "failed to finalize output binary";
        return result;
    }

    result.ok = true;
    result.count = writer.writtenCount();
    return result;
}

} // namespace sovereign
