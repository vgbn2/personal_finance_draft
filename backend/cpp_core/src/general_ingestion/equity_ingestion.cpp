#include "ingestion_adapter.hpp"

#include <memory>

namespace sovereign::ingestion {

std::unique_ptr<IngestionAdapter> makeEquityIngestionAdapter() {
    return std::make_unique<FileIngestionAdapter>("equities", "yahoo/stooq/alpha_vantage");
}

} // namespace sovereign::ingestion
