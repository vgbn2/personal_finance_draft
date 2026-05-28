use sovereign_cli::config::app_config::AppConfig;
use sovereign_cli::portfolio::paper_trading::simulate_fill;
use sovereign_cli::portfolio::pnl_calculator::calculate;
use sovereign_cli::portfolio::state::PortfolioState;
use sovereign_cli::utils::cli_formatter::title_line;

#[test]
fn cli_helpers_and_portfolio_flow_are_available() {
    let config = AppConfig::default();
    assert!(config.dry_run);
    assert_eq!(title_line("Sovereign CLI"), "=== Sovereign CLI ===");

    let mut state = PortfolioState::default();
    simulate_fill(&mut state, "BTCUSDT", 1.0, 100.0);
    let metrics = calculate(&state);
    assert!(metrics.total_equity > 0.0);
}
