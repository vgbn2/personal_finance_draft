#pragma once

#include "live_market_snapshot.hpp"

#include <filesystem>
#include <memory>
#include <string>
#include <vector>

namespace sovereign::ingestion {

struct IngestionAdapterResult {
    std::string family;
    std::string provider;
    std::filesystem::path path;
    LiveMarketSnapshotSummary summary;
    bool family_present = false;
};

class IngestionAdapter {
public:
    virtual ~IngestionAdapter() = default;
    virtual std::string family() const = 0;
    virtual std::string provider() const = 0;
    virtual IngestionAdapterResult summarize(const std::filesystem::path& path) const = 0;
};

class FileIngestionAdapter final : public IngestionAdapter {
public:
    FileIngestionAdapter(std::string family, std::string provider);

    std::string family() const override;
    std::string provider() const override;
    IngestionAdapterResult summarize(const std::filesystem::path& path) const override;

private:
    std::string family_;
    std::string provider_;
};

std::unique_ptr<IngestionAdapter> makeEquityIngestionAdapter();
std::unique_ptr<IngestionAdapter> makeCryptoIngestionAdapter();
std::unique_ptr<IngestionAdapter> makeFxIngestionAdapter();
std::unique_ptr<IngestionAdapter> makeIndexIngestionAdapter();
std::unique_ptr<IngestionAdapter> makeMacroIngestionAdapter();
std::unique_ptr<IngestionAdapter> makeNewsIngestionAdapter();
std::unique_ptr<IngestionAdapter> makeSentimentIngestionAdapter();

std::unique_ptr<IngestionAdapter> makeAdapterForFamily(const std::string& family);
std::vector<std::unique_ptr<IngestionAdapter>> makeDefaultAdapters();
IngestionAdapterResult routeSnapshot(const std::string& family, const std::filesystem::path& path);

} // namespace sovereign::ingestion
