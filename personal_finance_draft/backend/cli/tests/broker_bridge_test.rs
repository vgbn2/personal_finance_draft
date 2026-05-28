use sovereign_cli::{
    analytics_command_name,
    analytics_summary,
    execute_job,
    gate_io_endpoint,
    mt5_bridge_name,
    mt5_endpoint,
    order_path,
    route_order,
    GateIoOrderRequest,
    Job,
    JobQueue,
    Mt5ConnectionProfile,
};

#[test]
fn broker_and_queue_contracts_are_exposed_from_the_cli_core() {
    assert_eq!(analytics_command_name(), "analytics");

    let summary = analytics_summary();
    assert_eq!(summary.command, "analytics");
    assert!(summary.description.contains("local analytics"));

    let gate_request = GateIoOrderRequest {
        symbol: "BTC_USDT".to_string(),
        side: "buy".to_string(),
        quantity: 1.25,
    };
    assert_eq!(gate_io_endpoint(), "gate_io");
    assert_eq!(order_path(), "/api/v4/spot/orders");
    assert_eq!(gate_request.symbol, "BTC_USDT");
    assert_eq!(gate_request.side, "buy");
    assert!((gate_request.quantity - 1.25).abs() < f64::EPSILON);

    let mt5_profile = Mt5ConnectionProfile {
        terminal_path: "C:/MetaTrader/terminal64.exe".to_string(),
        login: "demo-login".to_string(),
    };
    assert_eq!(mt5_endpoint(), "mt5_native");
    assert_eq!(mt5_bridge_name(), "MetaTrader 5");
    assert!(mt5_profile.terminal_path.ends_with("terminal64.exe"));
    assert_eq!(mt5_profile.login, "demo-login");

    let routed = route_order("paper", "BTCUSDT", "buy");
    assert_eq!(routed.broker, "paper");
    assert_eq!(routed.symbol, "BTCUSDT");
    assert_eq!(routed.side, "buy");

    let mut queue = JobQueue::default();
    queue.push(Job {
        id: "job-bridge-1".to_string(),
        name: "contract-check".to_string(),
    });
    assert_eq!(queue.jobs.len(), 1);
    assert_eq!(execute_job(&queue.jobs[0]), "executed job job-bridge-1 (contract-check)");
}
