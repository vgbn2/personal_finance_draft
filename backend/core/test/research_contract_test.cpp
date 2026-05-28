#include "../src/data/corporate_action.hpp"
#include "../src/data/market_event.hpp"
#include "../src/data/order_book_snapshot.hpp"
#include "../src/research/cost_model.hpp"
#include "../src/research/promotion_gate.hpp"
#include "../src/research/research_hypothesis.hpp"
#include "../src/regime/spectral_clustering.hpp"
#include "../src/research/walk_forward_split.hpp"

#include <iostream>
#include <vector>

namespace {

bool expect(bool condition, const char* message) {
    if (!condition) {
        std::cerr << message << "\n";
    }
    return condition;
}

} // namespace

int main() {
    sovereign::ResearchCostModel research_cost;
    if (!expect(research_cost.estimate_bps(0.2, 0.05) > 0.0, "Expected positive research cost estimate")) {
        return 1;
    }

    sovereign::PromotionGate gate;
    const sovereign::PromotionMetrics approved_metrics{
        1.5,
        1.6,
        0.58,
        0.12,
        0.24,
        20.0,
        48,
    };
    const auto approved = gate.evaluate(approved_metrics);
    if (!expect(approved.approved, "Expected promotion approval for strong metrics")) {
        return 1;
    }

    sovereign::ResearchHypothesis hypothesis{
        "AAPL momentum breakout",
        "Can momentum + regime filters improve AAPL swing entries?",
        "AAPL",
        "1d",
        "quant-research",
        "2026-05-01",
        "2026-05-18",
        sovereign::HypothesisStatus::Active,
        40,
        1.2,
    };
    if (!expect(hypothesis.is_active(), "Expected active hypothesis")) {
        return 1;
    }
    if (!expect(hypothesis.is_publishable(), "Expected publishable hypothesis")) {
        return 1;
    }

    sovereign::WalkForwardSplit split{
        {"2025-01-01", "2025-06-30"},
        {"2025-07-01", "2025-09-30"},
        {"2025-10-01", "2025-12-31"},
        120,
        60,
        60,
    };
    if (!expect(split.valid(), "Expected valid walk-forward split")) {
        return 1;
    }
    if (!expect(split.total_bars() == 240, "Expected total walk-forward bars")) {
        return 1;
    }

    const sovereign::CorporateAction split_action{
        sovereign::CorporateActionType::Split,
        "AAPL",
        "2026-05-18T00:00:00Z",
        "2026-05-19",
        2.0,
        1.0,
        0.0,
        "USD",
        "fixture",
    };
    if (!expect(split_action.is_price_adjusting(), "Expected split to be price-adjusting")) {
        return 1;
    }
    if (!expect(split_action.split_factor() == 0.5, "Expected 2-for-1 split factor")) {
        return 1;
    }

    const sovereign::OrderBookSnapshot book{
        "AAPL",
        "2026-05-18T09:30:00Z",
        "NASDAQ",
        {{100.0, 200.0}},
        {{100.5, 150.0}},
        "fixture",
    };
    if (!expect(book.best_bid() != nullptr, "Expected best bid")) {
        return 1;
    }
    if (!expect(book.best_ask() != nullptr, "Expected best ask")) {
        return 1;
    }
    if (!expect(book.mid_price() == 100.25, "Expected mid price")) {
        return 1;
    }
    if (!expect(book.spread() == 0.5, "Expected bid/ask spread")) {
        return 1;
    }

    const sovereign::MarketEvent price_event{
        sovereign::MarketEventType::Bar,
        "AAPL",
        "equities:AAPL",
        "1d",
        "2026-05-18T09:30:00Z",
        "fixture",
        100.0,
        99.9,
        100.1,
        1000.0,
    };
    if (!expect(price_event.is_price_event(), "Expected bar event to count as a price event")) {
        return 1;
    }

    const sovereign::MarketEvent macro_event{
        sovereign::MarketEventType::Macro,
        "CPI",
        "",
        "monthly",
        "2026-05-10T08:30:00Z",
        "fixture",
    };
    if (!expect(!macro_event.is_price_event(), "Expected macro event not to count as a price event")) {
        return 1;
    }

    sovereign::regime::AzranGhahramaniClustering clustering(2, 1.0);
    const std::vector<std::vector<double>> clustering_input{
        {0.0, 0.0},
        {0.1, 0.2},
        {5.0, 5.0},
        {5.1, 4.9},
    };
    const auto labels = clustering.fit_predict(clustering_input);
    if (!expect(labels.size() == clustering_input.size(), "Expected clustering labels for each input row")) {
        return 1;
    }
    bool has_zero = false;
    bool has_one = false;
    for (const auto label : labels) {
        if (!expect(label == 0 || label == 1, "Expected cluster labels to stay within the requested range")) {
            return 1;
        }
        has_zero = has_zero || label == 0;
        has_one = has_one || label == 1;
    }
    if (!expect(has_zero && has_one, "Expected the two obvious clusters to separate")) {
        return 1;
    }

    return 0;
}
