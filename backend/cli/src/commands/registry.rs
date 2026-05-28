use crate::commands::{
    analytics::{analytics_command_name, analytics_summary},
    backtest::{backtest_command_name, backtest_help},
    correlation::{correlation_command_name, correlation_help},
    data::{data_command_name, data_help},
    execute::{execute_command_name, execute_help},
    macro_cmd::{macro_command_name, macro_help},
    notify::{notify_command_name, notify_help},
    optimize::{optimize_command_name, optimize_help},
    paper_trade::{paper_trade_command_name, paper_trade_help},
    portfolio::{portfolio_command_name, portfolio_help},
    retrain::{retrain_command_name, retrain_help},
    sentiment::{sentiment_command_name, sentiment_help},
    signal::{signal_command_name, signal_help},
    strategies::{strategies_command_name, strategies_help},
    test::{test_command_name, test_help},
};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct CommandRegistryEntry {
    pub name: &'static str,
    pub help: &'static str,
}

pub fn command_registry() -> Vec<CommandRegistryEntry> {
    vec![
        CommandRegistryEntry {
            name: analytics_command_name(),
            help: analytics_summary().description,
        },
        CommandRegistryEntry {
            name: backtest_command_name(),
            help: backtest_help(),
        },
        CommandRegistryEntry {
            name: correlation_command_name(),
            help: correlation_help(),
        },
        CommandRegistryEntry {
            name: data_command_name(),
            help: data_help(),
        },
        CommandRegistryEntry {
            name: execute_command_name(),
            help: execute_help(),
        },
        CommandRegistryEntry {
            name: macro_command_name(),
            help: macro_help(),
        },
        CommandRegistryEntry {
            name: notify_command_name(),
            help: notify_help(),
        },
        CommandRegistryEntry {
            name: optimize_command_name(),
            help: optimize_help(),
        },
        CommandRegistryEntry {
            name: paper_trade_command_name(),
            help: paper_trade_help(),
        },
        CommandRegistryEntry {
            name: portfolio_command_name(),
            help: portfolio_help(),
        },
        CommandRegistryEntry {
            name: retrain_command_name(),
            help: retrain_help(),
        },
        CommandRegistryEntry {
            name: sentiment_command_name(),
            help: sentiment_help(),
        },
        CommandRegistryEntry {
            name: signal_command_name(),
            help: signal_help(),
        },
        CommandRegistryEntry {
            name: strategies_command_name(),
            help: strategies_help(),
        },
        CommandRegistryEntry {
            name: test_command_name(),
            help: test_help(),
        },
    ]
}

pub fn command_names() -> Vec<&'static str> {
    command_registry().into_iter().map(|entry| entry.name).collect()
}
