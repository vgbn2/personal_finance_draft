#include "ingestion_adapter.hpp"

#include <memory>

namespace sovereign::ingestion {

std::unique_ptr<IngestionAdapter> makeCryptoIngestionAdapter() {
    return std::make_unique<FileIngestionAdapter>("crypto", "binance/coinbase");
}

} // namespace sovereign::ingestion
