#pragma once

#include <string>
#include <string_view>
#include <vector>

namespace sovereign::parser {

std::vector<std::string> splitCsvRow(std::string_view line);
std::string trim(std::string_view value);

} // namespace sovereign::parser
