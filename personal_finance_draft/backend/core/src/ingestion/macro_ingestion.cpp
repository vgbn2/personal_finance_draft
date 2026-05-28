#include "ingestion_adapter.hpp"

#include <memory>

namespace sovereign::ingestion {

std::unique_ptr<IngestionAdapter> makeMacroIngestionAdapter() {
    return std::make_unique<FileIngestionAdapter>("macro", "fred/ism/spglobal");
}

} // namespace sovereign::ingestion
