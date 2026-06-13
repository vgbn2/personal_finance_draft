pub mod utils {
    #[path = "errors.rs"]
    pub mod errors;
    #[path = "logger.rs"]
    pub mod logger;
    #[path = "cli_formatter.rs"]
    pub mod cli_formatter;
}

pub mod config {
    #[path = "app_config.rs"]
    pub mod app_config;
    #[path = "broker_config.rs"]
    pub mod broker_config;
    #[path = "strategy_config.rs"]
    pub mod strategy_config;
}

pub mod portfolio {
    #[path = "state.rs"]
    pub mod state;
    #[path = "pnl_calculator.rs"]
    pub mod pnl_calculator;
    #[path = "trade_log.rs"]
    pub mod trade_log;
    #[path = "paper_trading.rs"]
    pub mod paper_trading;
}

pub mod backtest_queue {
    #[path = "job_queue.rs"]
    pub mod job_queue;
    #[path = "job_worker.rs"]
    pub mod job_worker;
    #[path = "progress_tracker.rs"]
    pub mod progress_tracker;
}

pub mod notifications {
    #[path = "alert_manager.rs"]
    pub mod alert_manager;
    #[path = "email.rs"]
    pub mod email;
    #[path = "telegram.rs"]
    pub mod telegram;
    #[path = "webhook.rs"]
    pub mod webhook;
}

pub mod runtime_surface;
pub mod js_surface;

pub mod data_pipeline {
    #[path = "cache.rs"]
    pub mod cache;
    #[path = "data_validator.rs"]
    pub mod data_validator;
    #[path = "fred.rs"]
    pub mod fred;
    #[path = "gate_io.rs"]
    pub mod gate_io;
    #[path = "polymarket.rs"]
    pub mod polymarket;
    #[path = "sentiment.rs"]
    pub mod sentiment;
}

pub mod broker_api {
    #[path = "gate_io_api.rs"]
    pub mod gate_io_api;
    #[path = "mt5_native.rs"]
    pub mod mt5_native;
    #[path = "order_executor.rs"]
    pub mod order_executor;
}

pub mod commands {
    #[path = "analytics.rs"]
    pub mod analytics;
    #[path = "backtest.rs"]
    pub mod backtest;
    #[path = "correlation.rs"]
    pub mod correlation;
    #[path = "data.rs"]
    pub mod data;
    #[path = "execute.rs"]
    pub mod execute;
    #[path = "macro.rs"]
    pub mod macro_cmd;
    #[path = "notify.rs"]
    pub mod notify;
    #[path = "optimize.rs"]
    pub mod optimize;
    #[path = "paper_trade.rs"]
    pub mod paper_trade;
    #[path = "portfolio.rs"]
    pub mod portfolio;
    #[path = "retrain.rs"]
    pub mod retrain;
    #[path = "registry.rs"]
    pub mod registry;
    #[path = "sentiment.rs"]
    pub mod sentiment;
    #[path = "signal.rs"]
    pub mod signal;
    #[path = "strategies.rs"]
    pub mod strategies;
    #[path = "test.rs"]
    pub mod test;
}

pub use backtest_queue::job_queue::{Job, JobQueue};
pub use backtest_queue::job_worker::execute_job;
pub use broker_api::gate_io_api::{endpoint as gate_io_endpoint, order_path, GateIoOrderRequest};
pub use broker_api::mt5_native::{bridge_name as mt5_bridge_name, endpoint as mt5_endpoint, Mt5ConnectionProfile};
pub use broker_api::order_executor::{route_order, RoutedOrder};
pub use commands::analytics::{analytics_command_name, analytics_summary, CommandSummary};
pub use commands::registry::{command_names, command_registry, CommandRegistryEntry};
pub use js_surface::{command_aliases, command_spec, command_specs, help_lines, CommandSpec};
