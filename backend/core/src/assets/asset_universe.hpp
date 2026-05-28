#pragma once

#include "asset.hpp"

#include <fstream>
#include <map>
#include <string>
#include <unordered_map>
#include <utility>
#include <vector>

namespace sovereign {

class AssetUniverse {
public:
    static AssetUniverse fromConfigFile(const std::string& path) {
        AssetUniverse universe;
        universe.load(path);
        return universe;
    }

    const Asset* findBySymbol(const std::string& symbol) const {
        const auto it = by_symbol_.find(symbol);
        return it == by_symbol_.end() ? nullptr : &assets_.at(it->second);
    }

    const std::vector<Asset>& assets() const {
        return assets_;
    }

private:
    static std::string trim(const std::string& value) {
        const auto first = value.find_first_not_of(" \t\r\n");
        if (first == std::string::npos) {
            return {};
        }
        const auto last = value.find_last_not_of(" \t\r\n");
        return value.substr(first, last - first + 1);
    }

    static std::vector<std::string> parseList(const std::string& value) {
        std::vector<std::string> out;
        std::string current;
        bool in_quotes = false;
        for (char ch : value) {
            if (ch == '"') {
                in_quotes = !in_quotes;
            } else if (ch == ',' && !in_quotes) {
                const auto item = trim(current);
                if (!item.empty()) {
                    out.push_back(item);
                }
                current.clear();
            } else if (ch != '[' && ch != ']') {
                current.push_back(ch);
            }
        }
        const auto item = trim(current);
        if (!item.empty()) {
            out.push_back(item);
        }
        for (auto& entry : out) {
            if (entry.size() >= 2 && entry.front() == '"' && entry.back() == '"') {
                entry = entry.substr(1, entry.size() - 2);
            }
        }
        return out;
    }

    static std::string defaultExchangeForGroup(const std::string& group_key) {
        if (group_key == "equities") {
            return "SMART";
        }
        if (group_key == "indices") {
            return "INDEX";
        }
        if (group_key == "commodities") {
            return "CME";
        }
        if (group_key == "fx") {
            return "OTC";
        }
        if (group_key == "crypto") {
            return "CRYPTO";
        }
        if (group_key == "macro" || group_key == "pmi") {
            return "MACRO";
        }
        return "UNKNOWN";
    }

    void load(const std::string& path) {
        std::ifstream input(path);
        std::string line;
        std::string current_group;
        std::string current_domain;
        while (std::getline(input, line)) {
            const auto trimmed = trim(line);
            if (trimmed.empty() || trimmed.front() == '#') {
                continue;
            }
            const auto indent = line.find_first_not_of(' ');
            if (indent == std::string::npos) {
                continue;
            }
            if (indent == 0 && trimmed.back() == ':') {
                current_group = trimmed.substr(0, trimmed.size() - 1);
                current_domain.clear();
                continue;
            }
            if (indent == 2 && trimmed.back() == ':') {
                current_domain = trimmed.substr(0, trimmed.size() - 1);
                continue;
            }
            const auto colon = trimmed.find(':');
            if (colon == std::string::npos) {
                continue;
            }
            const auto key = trim(trimmed.substr(0, colon));
            const auto value = trim(trimmed.substr(colon + 1));
            if (current_group == "sources" && !current_domain.empty() && (key == "symbols" || key == "series" || key == "locations" || key == "metrics" || key == "countries" || key == "chains" || key == "regions" || key == "fields")) {
                const auto items = parseList(value);
                for (const auto& item : items) {
                    if (!item.empty()) {
                        addAsset(current_domain, item);
                    }
                }
            }
        }
    }

    void addAsset(const std::string& group_key, const std::string& symbol) {
        const auto type = instrumentTypeFromConfigKey(group_key);
        if (type == InstrumentType::Unknown) {
            return;
        }
        Asset asset;
        asset.asset_id = group_key + ":" + symbol;
        asset.symbol = symbol;
        asset.name = symbol;
        asset.instrument_type = type;
        asset.exchange = defaultExchangeForGroup(group_key);
        asset.currency = "USD";
        asset.timezone = "UTC";
        asset.tick_size = 0.01;
        asset.lot_size = 1.0;
        asset.active_from = "1970-01-01";
        by_symbol_[symbol] = assets_.size();
        assets_.push_back(std::move(asset));
    }

    std::vector<Asset> assets_;
    std::unordered_map<std::string, std::size_t> by_symbol_;
};

}
