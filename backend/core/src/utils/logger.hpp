#pragma once

#include <chrono>
#include <iostream>
#include <string_view>

namespace sovereign::utils {

enum class LogLevel {
    debug,
    info,
    warn,
    error,
};

inline std::string_view toString(LogLevel level) {
    switch (level) {
    case LogLevel::debug: return "DEBUG";
    case LogLevel::info: return "INFO";
    case LogLevel::warn: return "WARN";
    case LogLevel::error: return "ERROR";
    }
    return "INFO";
}

inline void log(LogLevel level, std::string_view message, std::ostream& out = std::cout) {
    out << '[' << toString(level) << "] " << message << '\n';
}

} // namespace sovereign::utils
