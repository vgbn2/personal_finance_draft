#pragma once

#include <string>
#include <unordered_map>

namespace sovereign {

enum class InstrumentType {
    Equity,
    Index,
    Future,
    Option,
    FxPair,
    CryptoSpot,
    CryptoDerivative,
    MacroSeries,
    Unknown,
};

inline std::string toString(InstrumentType type) {
    switch (type) {
    case InstrumentType::Equity: return "equity";
    case InstrumentType::Index: return "index";
    case InstrumentType::Future: return "future";
    case InstrumentType::Option: return "option";
    case InstrumentType::FxPair: return "fx_pair";
    case InstrumentType::CryptoSpot: return "crypto_spot";
    case InstrumentType::CryptoDerivative: return "crypto_derivative";
    case InstrumentType::MacroSeries: return "macro_series";
    default: return "unknown";
    }
}

inline InstrumentType instrumentTypeFromConfigKey(const std::string& key) {
    static const std::unordered_map<std::string, InstrumentType> kTypeMap = {
        {"equities", InstrumentType::Equity},
        {"indices", InstrumentType::Index},
        {"commodities", InstrumentType::Future},
        {"fx", InstrumentType::FxPair},
        {"crypto", InstrumentType::CryptoSpot},
        {"pmi", InstrumentType::MacroSeries},
        {"macro", InstrumentType::MacroSeries}
    };
    
    auto it = kTypeMap.find(key);
    return (it != kTypeMap.end()) ? it->second : InstrumentType::Unknown;
}

} 
