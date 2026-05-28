#include "ingestion/ingestion_adapter.hpp"

#include <memory>

namespace sovereign::ingestion {

std::unique_ptr<IngestionAdapter> makeSentimentIngestionAdapter() {
    return std::make_unique<FileIngestionAdapter>("sentiment", "google/trends/custom_search");
}

} // namespace sovereign::ingestion
