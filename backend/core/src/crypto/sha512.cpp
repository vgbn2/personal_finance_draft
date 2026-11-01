#include "crypto/sha512.hpp"

#include <array>
#include <bit>
#include <cstdint>
#include <fstream>
#include <iomanip>
#include <sstream>

namespace sovereign::crypto {

namespace {

constexpr std::array<std::uint64_t, 80> kSha512RoundConstants = {
    0x428a2f98d728ae22ULL, 0x7137449123ef65cdULL, 0xb5c0fbcfec4d3b2fULL, 0xe9b5dba58189dbbcULL,
    0x3956c25bf348b538ULL, 0x59f111f1b605d019ULL, 0x923f82a4af194f9bULL, 0xab1c5ed5da6d8118ULL,
    0xd807aa98a3030242ULL, 0x12835b0145706fbeULL, 0x243185be4ee4b28cULL, 0x550c7dc3d5ffb4e2ULL,
    0x72be5d74f27b896fULL, 0x80deb1fe3b1696b1ULL, 0x9bdc06a725c71235ULL, 0xc19bf174cf692694ULL,
    0xe49b69c19ef14ad2ULL, 0xefbe4786384f25e3ULL, 0x0fc19dc68b8cd5b5ULL, 0x240ca1cc77ac9c65ULL,
    0x2de92c6f592b0275ULL, 0x4a7484aa6ea6e483ULL, 0x5cb0a9dcbd41fbd4ULL, 0x76f988da831153b5ULL,
    0x983e5152ee66dfabULL, 0xa831c66d2db43210ULL, 0xb00327c898fb213fULL, 0xbf597fc7beef0ee4ULL,
    0xc6e00bf33da88fc2ULL, 0xd5a79147930aa725ULL, 0x06ca6351e003826fULL, 0x142929670a0e6e70ULL,
    0x27b70a8546d22ffcULL, 0x2e1b21385c26c926ULL, 0x4d2c6dfc5ac42aedULL, 0x53380d139d95b3dfULL,
    0x650a73548baf63deULL, 0x766a0abb3c77b2a8ULL, 0x81c2c92e47edaee6ULL, 0x92722c851482353bULL,
    0xa2bfe8a14cf10364ULL, 0xa81a664bbc423001ULL, 0xc24b8b70d0f89791ULL, 0xc76c51a30654be30ULL,
    0xd192e819d6ef5218ULL, 0xd69906245565a910ULL, 0xf40e35855771202aULL, 0x106aa07032bbd1b8ULL,
    0x19a4c116b8d2d0c8ULL, 0x1e376c085141ab53ULL, 0x2748774cdf8eeb99ULL, 0x34b0bcb5e19b48a8ULL,
    0x391c0cb3c5c95a63ULL, 0x4ed8aa4ae3418acbULL, 0x5b9cca4f7763e373ULL, 0x682e6ff3d6b2b8a3ULL,
    0x748f82ee5defb2fcULL, 0x78a5636f43172f60ULL, 0x84c87814a1f0ab72ULL, 0x8cc702081a6439ecULL,
    0x90befffa23631e28ULL, 0xa4506cebde82bde9ULL, 0xbef9a3f7b2c67915ULL, 0xc67178f2e372532bULL,
    0xca273eceea26619cULL, 0xd186b8c721c0c207ULL, 0xeada7dd6cde0eb1eULL, 0xf57d4f7fee6ed178ULL,
    0x06f067aa72176fbaULL, 0x0a637dc5a2c898a6ULL, 0x113f9804bef90daeULL, 0x1b710b35131c471bULL,
    0x28db77f523047d84ULL, 0x32caab7b40c72493ULL, 0x3c9ebe0a15c9bebcULL, 0x431d67c49c100d4cULL,
    0x4cc5d4becb3e42b6ULL, 0x597f299cfc657e2aULL, 0x5fcb6fab3ad6faecULL, 0x6c44198c4a475817ULL,
};

void transformSha512Block(
    std::array<std::uint64_t, 8>& state,
    const std::array<unsigned char, 128>& block) {
    std::array<std::uint64_t, 80> schedule{};
    for (std::size_t i = 0; i < 16U; ++i) {
        const std::size_t offset = i * 8U;
        schedule[i] = (static_cast<std::uint64_t>(block[offset]) << 56U)
            | (static_cast<std::uint64_t>(block[offset + 1U]) << 48U)
            | (static_cast<std::uint64_t>(block[offset + 2U]) << 40U)
            | (static_cast<std::uint64_t>(block[offset + 3U]) << 32U)
            | (static_cast<std::uint64_t>(block[offset + 4U]) << 24U)
            | (static_cast<std::uint64_t>(block[offset + 5U]) << 16U)
            | (static_cast<std::uint64_t>(block[offset + 6U]) << 8U)
            | static_cast<std::uint64_t>(block[offset + 7U]);
    }
    for (std::size_t i = 16U; i < schedule.size(); ++i) {
        const std::uint64_t s0 = std::rotr(schedule[i - 15U], 1U)
            ^ std::rotr(schedule[i - 15U], 8U)
            ^ (schedule[i - 15U] >> 7U);
        const std::uint64_t s1 = std::rotr(schedule[i - 2U], 19U)
            ^ std::rotr(schedule[i - 2U], 61U)
            ^ (schedule[i - 2U] >> 6U);
        schedule[i] = schedule[i - 16U] + s0 + schedule[i - 7U] + s1;
    }

    auto [a, b, c, d, e, f, g, h] = state;
    for (std::size_t i = 0; i < schedule.size(); ++i) {
        const std::uint64_t sum1 = std::rotr(e, 14U) ^ std::rotr(e, 18U) ^ std::rotr(e, 41U);
        const std::uint64_t choose = (e & f) ^ ((~e) & g);
        const std::uint64_t temp1 = h + sum1 + choose + kSha512RoundConstants[i] + schedule[i];
        const std::uint64_t sum0 = std::rotr(a, 28U) ^ std::rotr(a, 34U) ^ std::rotr(a, 39U);
        const std::uint64_t majority = (a & b) ^ (a & c) ^ (b & c);
        const std::uint64_t temp2 = sum0 + majority;
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

} // namespace

bool sha512File(
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

    std::array<std::uint64_t, 8> state = {
        0x6a09e667f3bcc908ULL, 0xbb67ae8584caa73bULL,
        0x3c6ef372fe94f82bULL, 0xa54ff53a5f1d36f1ULL,
        0x510e527fade682d1ULL, 0x9b05688c2b3e6c1fULL,
        0x1f83d9abfb41bd6bULL, 0x5be0cd19137e2179ULL,
    };
    std::array<unsigned char, 128> block{};
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
                transformSha512Block(state, block);
                buffered = 0U;
            }
        }
    }
    if (!file.eof()) {
        out_error = "dataset_hash_read_failed";
        return false;
    }

    block[buffered++] = 0x80U;
    if (buffered > 112U) {
        std::fill(block.begin() + static_cast<std::ptrdiff_t>(buffered), block.end(), 0U);
        transformSha512Block(state, block);
        block.fill(0U);
        buffered = 0U;
    }
    std::fill(
        block.begin() + static_cast<std::ptrdiff_t>(buffered),
        block.begin() + 112,
        0U);
    const __uint128_t bit_length = static_cast<__uint128_t>(total_bytes) * 8U;
    for (std::size_t i = 0; i < 16U; ++i) {
        block[127U - i] = static_cast<unsigned char>(bit_length >> (i * 8U));
    }
    transformSha512Block(state, block);

    std::ostringstream digest;
    digest << std::hex << std::setfill('0');
    for (const std::uint64_t word : state) digest << std::setw(16) << word;
    out_digest = digest.str();
    return true;
}

std::string sha512Buffer(const void* data, std::size_t size) {
    std::array<std::uint64_t, 8> state = {
        0x6a09e667f3bcc908ULL, 0xbb67ae8584caa73bULL,
        0x3c6ef372fe94f82bULL, 0xa54ff53a5f1d36f1ULL,
        0x510e527fade682d1ULL, 0x9b05688c2b3e6c1fULL,
        0x1f83d9abfb41bd6bULL, 0x5be0cd19137e2179ULL,
    };
    std::array<unsigned char, 128> block{};
    std::size_t buffered = 0U;
    const auto* bytes = static_cast<const unsigned char*>(data);

    for (std::size_t i = 0; i < size; ++i) {
        block[buffered++] = bytes[i];
        if (buffered == block.size()) {
            transformSha512Block(state, block);
            buffered = 0U;
        }
    }

    block[buffered++] = 0x80U;
    if (buffered > 112U) {
        std::fill(block.begin() + static_cast<std::ptrdiff_t>(buffered), block.end(), 0U);
        transformSha512Block(state, block);
        block.fill(0U);
        buffered = 0U;
    }
    std::fill(
        block.begin() + static_cast<std::ptrdiff_t>(buffered),
        block.begin() + 112,
        0U);
    const __uint128_t bit_length = static_cast<__uint128_t>(size) * 8U;
    for (std::size_t i = 0; i < 16U; ++i) {
        block[127U - i] = static_cast<unsigned char>(bit_length >> (i * 8U));
    }
    transformSha512Block(state, block);

    std::ostringstream digest;
    digest << std::hex << std::setfill('0');
    for (const std::uint64_t word : state) digest << std::setw(16) << word;
    return digest.str();
}

} // namespace sovereign::crypto
