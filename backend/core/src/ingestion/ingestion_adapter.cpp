#include "ingestion_adapter.hpp"

#include <algorithm>
#include <utility>

namespace sovereign::ingestion {

namespace {

bool textHasFamily(const std::string& text, const std::string& family) {
    return text.find("\"family\": \"" + family + "\"") != std::string::npos;
}

} // namespace

FileIngestionAdapter::FileIngestionAdapter(std::string family, std::string provider)
    : family_(std::move(family)), provider_(std::move(provider)) {}

std::string FileIngestionAdapter::family() const { return family_; }

std::string FileIngestionAdapter::provider() const { return provider_; }

IngestionAdapterResult FileIngestionAdapter::summarize(const std::filesystem::path& path) const {
    const std::string text = read_text_file(path.generic_string());
    IngestionAdapterResult result;
    result.family = family_;
    result.provider = provider_;
    result.path = path;
    result.summary = summarize_live_market_snapshot(path.generic_string());
    result.family_present = textHasFamily(text, family_) || has_family(result.summary, family_);
    return result;
}

} // namespace sovereign::ingestion
