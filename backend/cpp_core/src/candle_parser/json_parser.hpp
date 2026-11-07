#pragma once

#include <optional>
#include <string>
#include <string_view>

namespace sovereign::parser {

std::optional<std::string> jsonStringField(std::string_view object, std::string_view key);
std::optional<double> jsonNumberField(std::string_view object, std::string_view key);

} // namespace sovereign::parser
