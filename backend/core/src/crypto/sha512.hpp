#pragma once

#include <filesystem>
#include <string>

namespace sovereign::crypto {

// [Security: Cryptographic Dataset Integrity] FIPS 180-4 SHA-512 block fingerprinting
// Computes 128-hex character digest for regular files, rejecting symlinks to prevent
// snapshot substitution or race attacks.
bool sha512File(
    const std::filesystem::path& path,
    std::string& out_digest,
    std::string& out_error);

// Computes SHA-512 hex digest for in-memory buffer
std::string sha512Buffer(const void* data, std::size_t size);

} // namespace sovereign::crypto
