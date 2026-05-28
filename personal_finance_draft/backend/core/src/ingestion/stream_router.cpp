#include "ingestion_adapter.hpp"

#include <memory>

namespace sovereign::ingestion {

std::unique_ptr<IngestionAdapter> makeAdapterForFamily(const std::string& family) {
    if (family == "equities") return makeEquityIngestionAdapter();
    if (family == "crypto") return makeCryptoIngestionAdapter();
    if (family == "fx") return makeFxIngestionAdapter();
    if (family == "indices" || family == "index") return makeIndexIngestionAdapter();
    if (family == "macro") return makeMacroIngestionAdapter();
    if (family == "news") return makeNewsIngestionAdapter();
    if (family == "sentiment") return makeSentimentIngestionAdapter();
    return {};
}

std::vector<std::unique_ptr<IngestionAdapter>> makeDefaultAdapters() {
    std::vector<std::unique_ptr<IngestionAdapter>> adapters;
    adapters.push_back(makeEquityIngestionAdapter());
    adapters.push_back(makeCryptoIngestionAdapter());
    adapters.push_back(makeFxIngestionAdapter());
    adapters.push_back(makeIndexIngestionAdapter());
    adapters.push_back(makeMacroIngestionAdapter());
    adapters.push_back(makeNewsIngestionAdapter());
    adapters.push_back(makeSentimentIngestionAdapter());
    return adapters;
}

IngestionAdapterResult routeSnapshot(const std::string& family, const std::filesystem::path& path) {
    auto adapter = makeAdapterForFamily(family);
    if (!adapter) {
        return {};
    }
    return adapter->summarize(path);
}

} // namespace sovereign::ingestion
