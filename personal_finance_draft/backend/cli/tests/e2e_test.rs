use sovereign_cli::backtest_queue::job_queue::{Job, JobQueue};
use sovereign_cli::backtest_queue::job_worker::execute_job;
use sovereign_cli::backtest_queue::progress_tracker::ProgressTracker;
use sovereign_cli::broker_api::order_executor::route_order;
use sovereign_cli::config::strategy_config::StrategyConfig;
use sovereign_cli::data_pipeline::data_validator::validate_symbol;
use sovereign_cli::notifications::alert_manager::AlertManager;
use sovereign_cli::portfolio::paper_trading::simulate_fill;
use sovereign_cli::portfolio::pnl_calculator::calculate;
use sovereign_cli::portfolio::state::PortfolioState;

#[test]
fn cli_core_end_to_end_smoke() {
    let strategy = StrategyConfig::default();
    assert_eq!(strategy.strategy_name, "hybrid");

    let validation = validate_symbol("BTCUSDT");
    assert!(validation.ok);

    let mut state = PortfolioState::default();
    simulate_fill(&mut state, "BTCUSDT", 1.0, 100.0);
    let metrics = calculate(&state);
    assert!(metrics.total_equity > 0.0);

    let routed = route_order("paper", "BTCUSDT", "buy");
    assert_eq!(routed.broker, "paper");

    let mut queue = JobQueue::default();
    queue.push(Job {
        id: "job-1".to_string(),
        name: "backtest".to_string(),
    });
    assert_eq!(execute_job(&queue.jobs[0]), "executed job job-1 (backtest)");

    let tracker = ProgressTracker {
        completed: 1,
        total: 2,
    };
    assert!(tracker.percent() > 0.0);

    let mut alerts = AlertManager::default();
    alerts.push("email", "portfolio update");
    assert_eq!(alerts.alerts.len(), 1);
}
