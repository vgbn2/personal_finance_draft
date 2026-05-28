#include <filesystem>
#include <fstream>
#include <initializer_list>
#include <iostream>
#include <sstream>
#include <string>
#include <vector>

#include "../src/ingestion/live_market_snapshot.hpp"
#include "../src/ingestion/ingestion_adapter.hpp"

namespace {

std::string normalize_line_endings(std::string text) {
    std::string normalized;
    normalized.reserve(text.size());

    for (std::size_t i = 0; i < text.size(); ++i) {
        if (text[i] == '\r') {
            if (i + 1 < text.size() && text[i + 1] == '\n') {
                continue;
            }
            normalized.push_back('\n');
            continue;
        }
        normalized.push_back(text[i]);
    }

    return normalized;
}

bool require_contains(const std::string& haystack, const std::string& needle, const char* label) {
    if (haystack.find(needle) == std::string::npos) {
        std::cerr << "Missing " << label << ": " << needle << "\n";
        return false;
    }
    return true;
}

std::filesystem::path locate_repo_root() {
    const std::filesystem::path candidates[] = {
        std::filesystem::current_path(),
        std::filesystem::current_path().parent_path(),
        std::filesystem::current_path().parent_path().parent_path(),
    };
    for (const auto& candidate : candidates) {
        if (std::filesystem::exists(candidate / "config" / "data_sources.yaml")) {
            return candidate;
        }
    }
    return std::filesystem::current_path();
}

} // namespace

int main() {
    const std::filesystem::path repo_root = locate_repo_root();
    const std::filesystem::path config_path = repo_root / "config" / "data_sources.yaml";
    std::ifstream input(config_path);
    if (!input) {
        std::cerr << "Unable to open data source config: " << config_path.string() << "\n";
        return 1;
    }

    const std::filesystem::path options_path = repo_root / "config" / "options_data.yaml";
    std::ifstream options_input(options_path);
    if (!options_input) {
        std::cerr << "Unable to open options config: " << options_path.string() << "\n";
        return 1;
    }

    std::ostringstream buffer;
    buffer << input.rdbuf();
    const std::string config = normalize_line_endings(buffer.str());

    std::ostringstream options_buffer;
    options_buffer << options_input.rdbuf();
    const std::string options_config = normalize_line_endings(options_buffer.str());

    bool ok = true;
    ok &= require_contains(config, "  fx:\n", "FX source block");
    ok &= require_contains(config, "    providers: [\"frankfurter\", \"fxapi\", \"ecb\"]\n", "FX providers");
    ok &= require_contains(config, "    symbols: [\"EURUSD\", \"EURJPY\", \"EURGBP\"]\n", "FX symbol universe");
    ok &= require_contains(config, "    timeframes: [\"1d\"]\n", "FX timeframes");

    ok &= require_contains(config, "  quote_feeds:\n", "quote feed source block");
    ok &= require_contains(config, "    providers: [\"headway_mt5\", \"mt5\", \"webull\"]\n", "quote feed providers");
    ok &= require_contains(config, "    timeframes: [\"tick\", \"1m\", \"5m\", \"1d\"]\n", "quote feed timeframes");

    ok &= require_contains(config, "  equities:\n", "equities source block");
    ok &= require_contains(config, "    providers: [\"stooq\", \"yahoo\"]\n", "equities providers");
    ok &= require_contains(config, "    symbols: [\"AAPL\", \"MSFT\", \"SPY\", \"QQQ\"]\n", "equities symbol universe");
    ok &= require_contains(config, "    timeframes: [\"5m\", \"15m\", \"30m\", \"1h\", \"4h\", \"1d\"]\n", "equities timeframes");

    ok &= require_contains(config, "  indices:\n", "indices source block");
    ok &= require_contains(config, "    providers: [\"stooq\", \"yahoo\", \"fred\"]\n", "indices providers");
    ok &= require_contains(config, "    symbols: [\"SPX\", \"NDX\", \"DJI\", \"VIX\"]\n", "indices symbol universe");
    ok &= require_contains(config, "    timeframes: [\"5m\", \"15m\", \"30m\", \"1h\", \"4h\", \"1d\"]\n", "indices timeframes");

    ok &= require_contains(config, "  commodities:\n", "commodities source block");
    ok &= require_contains(config, "    providers: [\"stooq\", \"yahoo\"]\n", "commodities providers");
    ok &= require_contains(config, "    symbols: [\"XAUUSD\", \"XAGUSD\", \"XCUUSD\", \"USOIL\"]\n", "commodities symbol universe");
    ok &= require_contains(config, "    timeframes: [\"5m\", \"15m\", \"30m\", \"1h\", \"4h\", \"1d\"]\n", "commodities timeframes");

    ok &= require_contains(config, "  crypto:\n", "crypto source block");
    ok &= require_contains(config, "    providers: [\"binance\", \"coinbase\"]\n", "crypto providers");
    ok &= require_contains(config, "    symbols: [\"BTCUSDT\", \"ETHUSDT\", \"BNBUSDT\", \"SOLUSDT\", \"XRPUSDT\", \"DOGEUSDT\", \"SUIUSDT\", \"ADAUSDT\"]\n", "crypto symbol universe");
    ok &= require_contains(config, "    timeframes: [\"5m\", \"15m\", \"30m\", \"1h\", \"4h\", \"1d\"]\n", "crypto timeframes");

    ok &= require_contains(config, "  pmi:\n", "pmi source block");
    ok &= require_contains(config, "    providers: [\"spglobal\"]\n", "pmi providers");
    ok &= require_contains(config, "    series: [\"US_COMPOSITE\", \"US_MANUFACTURING\", \"US_SERVICES\", \"US_MANUFACTURING_OUTPUT\"]\n", "pmi series");

    ok &= require_contains(config, "  macro:\n", "macro source block");
    ok &= require_contains(config, "    providers: [\"fred\"]\n", "macro providers");
    ok &= require_contains(config, "    series: [\"CPI\", \"PPI\", \"US02YIELD\", \"NFP\", \"ADP\", \"JOLTS\", \"JOBLESS_CLAIMS\", \"UNEMPLOYMENT_RATE\", \"GDP\", \"RETAIL_SALES\", \"CONSUMER_CONFIDENCE\"]\n", "macro series");

    ok &= require_contains(config, "  macro_alt:\n", "alternative macro source block");
    ok &= require_contains(config, "    providers: [\"truflation\"]\n", "alternative macro providers");
    ok &= require_contains(config, "    series: [\"US_CPI_HEADLINE\", \"US_CPI_FOOD\", \"US_CPI_HOUSING\", \"US_CPI_ENERGY\", \"US_PCE_HEADLINE\"]\n", "alternative macro series");

    ok &= require_contains(config, "  breadth:\n", "breadth source block");
    ok &= require_contains(config, "    providers: [\"yahoo\"]\n", "breadth providers");
    ok &= require_contains(config, "    metrics: [\"spy_rsp_ratio\", \"qqq_spy_ratio\", \"iwm_spy_ratio\"]\n", "breadth metrics");

    ok &= require_contains(config, "  sentiment:\n", "sentiment source block");
    ok &= require_contains(config, "    providers: [\"alternative_me\"]\n", "sentiment providers");
    ok &= require_contains(config, "    fields: [\"fear_and_greed\", \"fear_and_greed_classification\"]\n", "sentiment fields");

    ok &= require_contains(config, "  onchain:\n", "onchain source block");
    ok &= require_contains(config, "    providers: [\"blockchair\"]\n", "onchain providers");
    ok &= require_contains(config, "    chains: [\"bitcoin\", \"ethereum\"]\n", "onchain chains");
    ok &= require_contains(config, "    metrics: [\"transactions_24h\", \"mempool_transactions\", \"mempool_total_fee_usd\", \"market_price_usd\", \"volume_24h\"]\n", "onchain metrics");

    ok &= require_contains(config, "  prediction_market:\n", "prediction market source block");
    ok &= require_contains(config, "    providers: [\"kalshi\"]\n", "prediction market providers");
    ok &= require_contains(config, "    events: [\"fed_rate_cut_prob\", \"us_recession_prob\", \"inflation_above_target\", \"risk_off_spike\"]\n", "prediction market events");

    ok &= require_contains(config, "  weather:\n", "weather source block");
    ok &= require_contains(config, "    providers: [\"nasa_power\"]\n", "weather providers");
    ok &= require_contains(config, "    locations: [\"us_gulf\", \"us_midwest\", \"europe_central\"]\n", "weather locations");
    ok &= require_contains(config, "    metrics: [\"T2M\", \"T2M_MAX\", \"T2M_MIN\", \"PRECTOTCORR\", \"WS10M\", \"ALLSKY_SFC_SW_DWN\"]\n", "weather metrics");

    ok &= require_contains(config, "  flight:\n", "flight source block");
    ok &= require_contains(config, "    providers: [\"opensky\"]\n", "flight providers");
    ok &= require_contains(config, "    regions: [\"us_gulf\", \"us_midwest\", \"europe_central\"]\n", "flight regions");
    ok &= require_contains(config, "    metrics: [\"aircraft_count\", \"avg_velocity\", \"avg_altitude\", \"on_ground_share\"]\n", "flight metrics");
    
    ok &= require_contains(config, "  crypto_tx:\n", "crypto tx source block");
    ok &= require_contains(config, "    providers: [\"blockchair\"]\n", "crypto tx providers");
    ok &= require_contains(config, "    chains: [\"bitcoin\", \"ethereum\"]\n", "crypto tx chains");
    ok &= require_contains(config, "    metrics: [\"transactions_24h\", \"mempool_transactions\", \"mempool_total_fee_usd\", \"market_price_usd\", \"volume_24h\"]\n", "crypto tx metrics");
    ok &= require_contains(config, "  satellite_nrt:\n", "satellite source block");
    ok &= require_contains(config, "    providers: [\"firms\"]\n", "satellite providers");
    ok &= require_contains(config, "    areas: [\"us_gulf\", \"us_west\"]\n", "satellite areas");
    ok &= require_contains(config, "    metrics: [\"active_fires\", \"fire_radiative_power\"]\n", "satellite metrics");
    ok &= require_contains(config, "  cargo:\n", "cargo source block");
    ok &= require_contains(config, "    providers: [\"marinetraffic\"]\n", "cargo providers");
    ok &= require_contains(config, "    regions: [\"us_gulf\", \"singapore_strait\"]\n", "cargo regions");
    ok &= require_contains(config, "    metrics: [\"vessel_count\", \"avg_speed\", \"congestion_index\"]\n", "cargo metrics");
    ok &= require_contains(config, "  holdings:\n", "holdings source block");
    ok &= require_contains(config, "    providers: [\"sec\"]\n", "holdings providers");
    ok &= require_contains(config, "    symbols: [\"AAPL\", \"MSFT\"]\n", "holdings symbols");
    ok &= require_contains(config, "    metrics: [\"sic\", \"recent_filing_count\", \"latest_filing_form\", \"latest_filing_date\", \"insider_transaction_flags\"]\n", "holdings metrics");
    ok &= require_contains(config, "  reserves:\n", "reserves source block");
    ok &= require_contains(config, "    providers: [\"world_bank\"]\n", "reserves providers");
    ok &= require_contains(config, "    countries: [\"USA\", \"TUR\", \"CHN\"]\n", "reserves countries");
    ok &= require_contains(config, "    metrics: [\"total_reserves_usd\", \"fuel_imports_pct\", \"fuel_exports_pct\"]\n", "reserves metrics");
    ok &= require_contains(config, "quality:\n", "quality block");
    ok &= require_contains(config, "  reject_stale: true\n", "stale-data rejection");
    ok &= require_contains(config, "  reject_lookahead: true\n", "lookahead rejection");
    
    ok &= require_contains(options_config, "prediction_market:\n", "prediction market block");
    ok &= require_contains(options_config, "  enabled: true\n", "prediction market enabled");
    ok &= require_contains(options_config, "  providers: [\"kalshi\"]\n", "prediction market providers");
    ok &= require_contains(options_config, "  events: [\"fed_rate_cut_prob\", \"us_recession_prob\", \"inflation_above_target\", \"risk_off_spike\"]\n", "prediction market events");
    ok &= require_contains(options_config, "equities_options:\n", "equities options block");
    ok &= require_contains(options_config, "  enabled: true\n", "equities options enabled");
    ok &= require_contains(options_config, "  providers: [\"cboe\"]\n", "equities options provider");
    ok &= require_contains(options_config, "  underlyings: [\"SPY\", \"QQQ\"]\n", "equities options underlyings");
    ok &= require_contains(options_config, "  strikes: [\"atm\", \"otm_1\", \"otm_2\"]\n", "equities options strikes");
    ok &= require_contains(options_config, "stock_options:\n", "stock options block");
    ok &= require_contains(options_config, "  providers: [\"cboe\"]\n", "stock options provider");
    ok &= require_contains(options_config, "  underlyings: [\"AAPL\", \"MSFT\"]\n", "stock options underlyings");
    ok &= require_contains(options_config, "sentiment:\n", "sentiment block");
    ok &= require_contains(options_config, "  enabled: false\n", "sentiment disabled");
    ok &= require_contains(options_config, "  providers: [\"cryptopanic\", \"newsapi\"]\n", "sentiment providers");
    ok &= require_contains(options_config, "  fields: [\"news_score\", \"news_velocity\", \"risk_on_off\", \"fear_and_greed\", \"topic_sentiment\"]\n", "sentiment fields");
    ok &= require_contains(options_config, "macro_alt:\n", "alternative macro block");
    ok &= require_contains(options_config, "  providers: [\"truflation\"]\n", "alternative macro provider");
    ok &= require_contains(options_config, "  series: [\"US_CPI_HEADLINE\", \"US_CPI_FOOD\", \"US_CPI_HOUSING\", \"US_CPI_ENERGY\", \"US_PCE_HEADLINE\"]\n", "alternative macro series");
    ok &= require_contains(options_config, "onchain:\n", "onchain block");
    ok &= require_contains(options_config, "  providers: [\"glassnode\", \"cryptoquant\"]\n", "onchain provider");
    ok &= require_contains(options_config, "  metrics: [\"exchange_netflow_btc\", \"exchange_netflow_eth\", \"sopr_btc\", \"sopr_eth\", \"active_addresses_btc\", \"active_addresses_eth\"]\n", "onchain metrics");

    const std::filesystem::path snapshot_path = repo_root / "data" / "cache" / "last_fetch.json";
    std::ifstream snapshot_input(snapshot_path);
    if (!snapshot_input) {
        std::cerr << "Unable to open live cache snapshot: " << snapshot_path.string() << "\n";
        return 1;
    }

    std::ostringstream snapshot_buffer;
    snapshot_buffer << snapshot_input.rdbuf();
    const std::string snapshot = normalize_line_endings(snapshot_buffer.str());
    const auto summary = sovereign::ingestion::summarize_live_market_snapshot(snapshot_path.string());

    ok &= require_contains(snapshot, "\"mode\": \"live\"", "live snapshot mode");
    if (summary.mode != "live") {
        std::cerr << "Expected live snapshot mode from C++ summary\n";
        ok = false;
    }
    ok &= require_contains(snapshot, "\"provider_checks\": [", "provider check section");
    ok &= require_contains(snapshot, "\"family\": \"equities\"", "equities provider check family");
    ok &= require_contains(snapshot, "\"family\": \"indices\"", "indices provider check family");
    ok &= require_contains(snapshot, "\"provider\": \"binance\"", "crypto provider output");
    ok &= require_contains(snapshot, "\"provider\": \"frankfurter\"", "FX provider output");
    ok &= require_contains(snapshot, "\"provider\": \"fxapi\"", "fxapi provider output");
    ok &= require_contains(snapshot, "\"family\": \"commodities\"", "commodities provider check family");
    ok &= require_contains(snapshot, "\"provider\": \"yahoo\"", "commodity provider output");
    ok &= require_contains(snapshot, "\"provider\": \"coinbase\"", "coinbase provider check");
    ok &= require_contains(snapshot, "\"provider\": \"ecb\"", "ecb provider check");
    ok &= require_contains(snapshot, "\"provider\": \"yahoo\"", "yahoo provider check");
    ok &= require_contains(snapshot, "\"provider\": \"fred\"", "fred provider check");
    ok &= require_contains(snapshot, "\"family\": \"pmi\"", "pmi provider check family");
    ok &= require_contains(snapshot, "\"provider\": \"spglobal\"", "spglobal provider output");
    ok &= require_contains(snapshot, "\"family\": \"crypto\"", "crypto provider check family");
    ok &= require_contains(snapshot, "\"family\": \"fx\"", "fx provider check family");
    ok &= require_contains(snapshot, "\"family\": \"macro\"", "macro provider check family");
    ok &= require_contains(snapshot, "\"family\": \"weather\"", "weather provider check family");
    ok &= require_contains(snapshot, "\"family\": \"flight\"", "flight provider check family");
    ok &= require_contains(snapshot, "\"family\": \"crypto_tx\"", "crypto tx provider check family");
    ok &= require_contains(snapshot, "\"family\": \"sentiment\"", "sentiment provider check family");
    ok &= require_contains(snapshot, "\"family\": \"onchain\"", "onchain provider check family");
    ok &= require_contains(snapshot, "\"family\": \"breadth\"", "breadth provider check family");
    ok &= require_contains(snapshot, "\"family\": \"holdings\"", "holdings provider check family");
    ok &= require_contains(snapshot, "\"family\": \"reserves\"", "reserves provider check family");
    ok &= require_contains(snapshot, "\"family\": \"prediction_market\"", "prediction market provider check family");
    ok &= require_contains(snapshot, "\"US_COMPOSITE\"", "pmi composite output");
    ok &= require_contains(snapshot, "\"US_MANUFACTURING\"", "pmi manufacturing output");
    ok &= require_contains(snapshot, "\"US_SERVICES\"", "pmi services output");
    ok &= require_contains(snapshot, "\"BTCUSDT\"", "BTC ingestion output");
    ok &= require_contains(snapshot, "\"ETHUSDT\"", "ETH ingestion output");
    ok &= require_contains(snapshot, "\"EURUSD\"", "EUR/USD ingestion output");
    ok &= require_contains(snapshot, "\"AAPL\"", "equity ingestion output");
    ok &= require_contains(snapshot, "\"XAUUSD\"", "commodity ingestion output");
    ok &= require_contains(snapshot, "\"SPX\"", "index ingestion output");
    ok &= require_contains(snapshot, "\"CPI\"", "macro ingestion output");
    ok &= require_contains(snapshot, "\"weather\"", "weather ingestion output");
    ok &= require_contains(snapshot, "\"flight\"", "flight ingestion output");
    ok &= require_contains(snapshot, "\"bitcoin\"", "crypto tx ingestion output");
    ok &= require_contains(snapshot, "\"fear_and_greed\"", "sentiment ingestion output");
    ok &= require_contains(snapshot, "\"family\": \"onchain\"", "onchain provider check");
    ok &= require_contains(snapshot, "\"spy_rsp_ratio\"", "breadth ingestion output");
    ok &= require_contains(snapshot, "\"USA\"", "reserves ingestion output");
    ok &= require_contains(snapshot, "\"fed_rate_cut_prob\"", "prediction market ingestion output");
    ok &= require_contains(snapshot, "\"family\": \"equities_options\"", "equities options ingestion output");
    ok &= require_contains(snapshot, "\"family\": \"stock_options\"", "stock options ingestion output");
    ok &= require_contains(snapshot, "\"errors\": [", "ingestion errors section");
    if (summary.has_errors) {
        std::cerr << "Expected live cache fixture to have a clean top-level errors array\n";
        ok = false;
    }

    for (const std::string family : {
             "equities",
             "indices",
             "crypto",
             "fx",
             "macro",
             "weather",
             "flight",
             "crypto_tx",
             "sentiment",
             "onchain",
             "breadth",
             "holdings",
             "reserves",
             "prediction_market",
             "equities_options",
             "stock_options",
         }) {
        if (!sovereign::ingestion::has_family(summary, family)) {
            std::cerr << "Missing family in C++ snapshot summary: " << family << "\n";
            ok = false;
        }
    }

    const auto equity_adapter = sovereign::ingestion::makeEquityIngestionAdapter();
    const auto equity_result = equity_adapter->summarize(snapshot_path);
    if (equity_result.family != "equities" || !equity_result.family_present) {
        std::cerr << "Expected equity ingestion adapter to detect equities in the cache\n";
        ok = false;
    }
    const auto crypto_result = sovereign::ingestion::routeSnapshot("crypto", snapshot_path);
    if (crypto_result.family != "crypto" || !crypto_result.family_present) {
        std::cerr << "Expected crypto ingestion route to detect crypto rows in the cache\n";
        ok = false;
    }
    const auto indices_result = sovereign::ingestion::routeSnapshot("indices", snapshot_path);
    if (indices_result.family != "indices" || !indices_result.family_present) {
        std::cerr << "Expected indices ingestion route to detect indices rows in the cache\n";
        ok = false;
    }

    if (!ok) {
        return 1;
    }

    std::cout << "Source ingestion contract verified in config, options config, and live cache snapshot\n";
    return 0;
}
