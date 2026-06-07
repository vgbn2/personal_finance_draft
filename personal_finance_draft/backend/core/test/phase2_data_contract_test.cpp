#include "../src/assets/asset_universe.hpp"
#include "../src/data/data_validator.hpp"

#include <filesystem>
#include <iostream>

namespace {

bool expect(bool condition, const char* message) {
    if (!condition) {
        std::cerr << message << "\n";
    }
    return condition;
}

std::filesystem::path locateConfig() {
    const std::filesystem::path candidates[] = {
        std::filesystem::path("../../../config/markets/data_sources.yaml"),
        std::filesystem::path("../../config/markets/data_sources.yaml"),
        std::filesystem::path("../config/markets/data_sources.yaml"),
        std::filesystem::path("config/markets/data_sources.yaml"),
        // Legacy fallback (pre-markets/ relocation)
        std::filesystem::path("../../../config/data_sources.yaml"),
        std::filesystem::path("../../config/data_sources.yaml"),
        std::filesystem::path("../config/data_sources.yaml"),
        std::filesystem::path("config/data_sources.yaml"),
    };
    for (const auto& candidate : candidates) {
        if (std::filesystem::exists(candidate)) {
            return candidate;
        }
    }
    return {};
}

} // namespace

int main() {
    const auto config_path = locateConfig();
    if (!expect(!config_path.empty(), "Could not locate config/markets/data_sources.yaml")) {
        return 1;
    }

    const auto universe = sovereign::AssetUniverse::fromConfigFile(config_path.string());
    if (!expect(!universe.assets().empty(), "Expected configured assets")) {
        return 1;
    }
    if (!expect(universe.findBySymbol("AAPL") != nullptr, "Expected AAPL in universe")) {
        return 1;
    }

    sovereign::DataQualityReport report;
    sovereign::OhlcvBar good_bar{
        "equities:AAPL",
        "2026-05-18T09:30:00Z",
        "1d",
        100.0,
        105.0,
        99.0,
        102.0,
        1000.0,
        "fixture",
        "2026-05-18T09:35:00Z",
    };
    if (!expect(sovereign::DataValidator::validateBar(good_bar, report), "Expected valid OHLCV bar")) {
        return 1;
    }

    good_bar.close = -1.0;
    if (!expect(!sovereign::DataValidator::validateBar(good_bar, report), "Expected negative price rejection")) {
        return 1;
    }

    const sovereign::MacroObservation safe{
        "CPI",
        "2026-05-01",
        "2026-05-10T08:30:00Z",
        3.2,
        "fixture",
        "2026-05-10T08:31:00Z",
    };
    if (!expect(sovereign::DataValidator::validateMacroObservation(safe, report), "Expected released macro observation")) {
        return 1;
    }

    const sovereign::MacroObservation early{
        "CPI",
        "2026-05-01",
        "2026-05-10T08:30:00Z",
        3.2,
        "fixture",
        "2026-05-10T08:29:00Z",
    };
    if (!expect(!sovereign::DataValidator::validateMacroObservation(early, report), "Expected macro lookahead rejection")) {
        return 1;
    }

    return 0;
}
