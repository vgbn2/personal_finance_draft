use crate::{
    analytics_summary, command_registry, execute_job, gate_io_endpoint, mt5_bridge_name,
    mt5_endpoint, order_path, route_order, GateIoOrderRequest, Job, JobQueue, Mt5ConnectionProfile,
};
use crate::utils::cli_formatter::bullet_line;

pub fn runtime_surface_lines() -> Vec<String> {
    let summary = analytics_summary();
    let gate_request = GateIoOrderRequest {
        symbol: "BTC_USDT".to_string(),
        side: "buy".to_string(),
        quantity: 0.5,
    };
    let mt5_profile = Mt5ConnectionProfile {
        terminal_path: "C:/MetaTrader/terminal64.exe".to_string(),
        login: "demo-login".to_string(),
    };
    let routed = route_order("paper", "BTCUSDT", "buy");
    let mut queue = JobQueue::default();
    queue.push(Job {
        id: "job-main-1".to_string(),
        name: "runtime-surface".to_string(),
    });

    let mut lines = vec![
        bullet_line("analytics", summary.command),
        bullet_line("analytics_help", summary.description),
        bullet_line("gate_io", gate_io_endpoint()),
        bullet_line("gate_io_path", order_path()),
        bullet_line("mt5", mt5_endpoint()),
        bullet_line("mt5_bridge", mt5_bridge_name()),
        bullet_line("route", format!("{}:{}:{}", routed.broker, routed.symbol, routed.side)),
        bullet_line(
            "gate_request",
            format!("{} {} {}", gate_request.symbol, gate_request.side, gate_request.quantity),
        ),
        bullet_line(
            "mt5_profile",
            format!("{} {}", mt5_profile.terminal_path, mt5_profile.login),
        ),
        bullet_line("queue_jobs", queue.jobs.len()),
        bullet_line("job_execution", execute_job(&queue.jobs[0])),
    ];

    for entry in command_registry() {
        let label = format!("command_{}", entry.name);
        lines.push(bullet_line(&label, entry.help));
    }

    lines
}
