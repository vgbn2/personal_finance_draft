#include "ingestion_adapter.hpp"

#include <memory>

namespace sovereign::ingestion {

std::unique_ptr<IngestionAdapter> makeFxIngestionAdapter() {
    return std::make_unique<FileIngestionAdapter>("fx", "ecb/frankfurter");
}

} // namespace sovereign::ingestion
