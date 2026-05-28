#include "ingestion_adapter.hpp"

#include <memory>

namespace sovereign::ingestion {

std::unique_ptr<IngestionAdapter> makeNewsIngestionAdapter() {
    return std::make_unique<FileIngestionAdapter>("news", "newsapi/marketwatch");
}

} // namespace sovereign::ingestion
