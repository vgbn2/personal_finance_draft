pub mod utils {
    #[path = "utils/errors.rs"]
    pub mod errors;
    #[path = "utils/logger.rs"]
    pub mod logger;
    #[path = "utils/cli_formatter.rs"]
    pub mod cli_formatter;
}

pub mod config {
    #[path = "config/app_config.rs"]
    pub mod app_config;
    #[path = "config/broker_config.rs"]
    pub mod broker_config;
    #[path = "config/strategy_config.rs"]
    pub mod strategy_config;
}

pub mod portfolio {
    #[path = "portfolio/state.rs"]
    pub mod state;
    #[path = "portfolio/pnl_calculator.rs"]
    pub mod pnl_calculator;
    #[path = "portfolio/trade_log.rs"]
    pub mod trade_log;
    #[path = "portfolio/paper_trading.rs"]
    pub mod paper_trading;
}

pub mod backtest_queue {
    #[path = "backtest_queue/job_queue.rs"]
    pub mod job_queue;
    #[path = "backtest_queue/job_worker.rs"]
    pub mod job_worker;
    #[path = "backtest_queue/progress_tracker.rs"]
    pub mod progress_tracker;
}

pub mod notifications {
    #[path = "notifications/alert_manager.rs"]
    pub mod alert_manager;
    #[path = "notifications/email.rs"]
    pub mod email;
    #[path = "notifications/telegram.rs"]
    pub mod telegram;
    #[path = "notifications/webhook.rs"]
    pub mod webhook;
}

pub mod runtime_surface;

pub mod data_pipeline {
    #[path = "data_pipeline/cache.rs"]
    pub mod cache;
    #[path = "data_pipeline/data_validator.rs"]
    pub mod data_validator;
    #[path = "data_pipeline/fred.rs"]
    pub mod fred;
    #[path = "data_pipeline/gate_io.rs"]
    pub mod gate_io;
    #[path = "data_pipeline/polymarket.rs"]
    pub mod polymarket;
    #[path = "data_pipeline/sentiment.rs"]
    pub mod sentiment;
}

pub mod broker_api {
    #[path = "broker_api/gate_io_api.rs"]
    pub mod gate_io_api;
    #[path = "broker_api/mt5_native.rs"]
    pub mod mt5_native;
    #[path = "broker_api/order_executor.rs"]
    pub mod order_executor;
}

pub mod commands {
    #[path = "commands/analytics.rs"]
    pub mod analytics;
    #[path = "commands/backtest.rs"]
    pub mod backtest;
    #[path = "commands/correlation.rs"]
    pub mod correlation;
    #[path = "commands/data.rs"]
    pub mod data;
    #[path = "commands/execute.rs"]
    pub mod execute;
    #[path = "commands/macro.rs"]
    pub mod macro_cmd;
    #[path = "commands/notify.rs"]
    pub mod notify;
    #[path = "commands/optimize.rs"]
    pub mod optimize;
    #[path = "commands/paper_trade.rs"]
    pub mod paper_trade;
    #[path = "commands/portfolio.rs"]
    pub mod portfolio;
    #[path = "commands/retrain.rs"]
    pub mod retrain;
    #[path = "commands/registry.rs"]
    pub mod registry;
    #[path = "commands/sentiment.rs"]
    pub mod sentiment;
    #[path = "commands/signal.rs"]
    pub mod signal;
    #[path = "commands/strategies.rs"]
    pub mod strategies;
    #[path = "commands/test.rs"]
    pub mod test;
}

pub use backtest_queue::job_queue::{Job, JobQueue};
pub use backtest_queue::job_worker::execute_job;
pub use broker_api::gate_io_api::{endpoint as gate_io_endpoint, order_path, GateIoOrderRequest};
pub use broker_api::mt5_native::{bridge_name as mt5_bridge_name, endpoint as mt5_endpoint, Mt5ConnectionProfile};
pub use broker_api::order_executor::{route_order, RoutedOrder};
pub use commands::analytics::{analytics_command_name, analytics_summary, CommandSummary};
pub use commands::registry::{command_names, command_registry, CommandRegistryEntry};
