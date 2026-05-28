#include "ingestion_adapter.hpp"

#include <memory>

namespace sovereign::ingestion {

std::unique_ptr<IngestionAdapter> makeIndexIngestionAdapter() {
    return std::make_unique<FileIngestionAdapter>("indices", "stooq/yahoo/fred");
}

} // namespace sovereign::ingestion
