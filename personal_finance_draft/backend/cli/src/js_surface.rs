use serde::Serialize;

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
pub struct CommandSpec {
    pub name: &'static str,
    pub aliases: &'static [&'static str],
    pub summary: &'static str,
    pub category: &'static str,
}

const COMMAND_SPECS: &[CommandSpec] = &[
    CommandSpec {
        name: "status",
        aliases: &[],
        summary: "Show phase, cache, and data-quality status",
        category: "operational",
    },
    CommandSpec {
        name: "cockpit",
        aliases: &[],
        summary: "Open the terminal dashboard",
        category: "operational",
    },
    CommandSpec {
        name: "watch",
        aliases: &[],
        summary: "Periodically synchronize market data in the background",
        category: "operational",
    },
    CommandSpec {
        name: "ingest",
        aliases: &[],
        summary: "Ingest market data into the local cache",
        category: "operational",
    },
    CommandSpec {
        name: "backfill",
        aliases: &[],
        summary: "Build a historical cache for real-data backtests",
        category: "operational",
    },
    CommandSpec {
        name: "cache-clean",
        aliases: &["clean"],
        summary: "Clean stale or rejected cache files",
        category: "operational",
    },
    CommandSpec {
        name: "validate",
        aliases: &["check"],
        summary: "Validate the current live cache",
        category: "operational",
    },
    CommandSpec {
        name: "backend",
        aliases: &[],
        summary: "Show backend runtime, stats, data, correlation, and integrity",
        category: "operational",
    },
    CommandSpec {
        name: "quotes",
        aliases: &[],
        summary: "Show configured quote imports and dedup status",
        category: "operational",
    },
    CommandSpec {
        name: "strategy",
        aliases: &[],
        summary: "Create, inspect, validate, and automate strategy plans",
        category: "operational",
    },
    CommandSpec {
        name: "backtest",
        aliases: &["bt"],
        summary: "Run backtests against live cache data",
        category: "research",
    },
    CommandSpec {
        name: "indicators",
        aliases: &["features"],
        summary: "Show indicator period options",
        category: "research",
    },
    CommandSpec {
        name: "models",
        aliases: &[],
        summary: "Compare model candidates",
        category: "research",
    },
    CommandSpec {
        name: "optimize",
        aliases: &[],
        summary: "Test indicator periods against backtest metrics",
        category: "research",
    },
    CommandSpec {
        name: "trade",
        aliases: &[],
        summary: "Place trades and check balances",
        category: "execution",
    },
    CommandSpec {
        name: "prune",
        aliases: &["db-prune"],
        summary: "Prune local records and retained artifacts",
        category: "operational",
    },
    CommandSpec {
        name: "demo",
        aliases: &[],
        summary: "Run sample features, models, backtest, and optimization",
        category: "research",
    },
    CommandSpec {
        name: "loc",
        aliases: &[],
        summary: "Count lines of code in the project",
        category: "operational",
    },
    CommandSpec {
        name: "universe",
        aliases: &[],
        summary: "Inspect the current market universe",
        category: "operational",
    },
];

const OVERVIEW_LINES: &[&str] = &[
    "Sovereign Rust CLI mirror",
    "",
    "Mirrored command surface",
    "  status, cockpit, watch, ingest, backfill",
    "  cache-clean | clean, validate | check, backend, quotes, strategy",
    "  backtest | bt, indicators | features, models, optimize, trade",
    "  prune | db-prune, demo, loc, universe",
    "",
    "Help topics",
    "  help commands",
    "  help backtest",
    "  help indicators",
    "  help examples",
];

const COMMANDS_LINES: &[&str] = &[
    "Command Map",
    "",
    "Operational",
    "  status",
    "  cockpit",
    "  watch",
    "  ingest",
    "  backfill",
    "  cache-clean | clean",
    "  validate | check",
    "  backend",
    "  quotes",
    "  strategy",
    "  prune | db-prune",
    "  loc",
    "  universe",
    "",
    "Research",
    "  backtest | bt",
    "  indicators | features",
    "  models",
    "  optimize",
    "  demo",
    "",
    "Execution",
    "  trade",
];

const BACKTEST_LINES: &[&str] = &[
    "Backtest Help",
    "",
    "Mirrored defaults",
    "  --timeframe 1d",
    "  --from YYYY-MM-DD",
    "  --to YYYY-MM-DD",
    "  --train-ratio 0.70",
    "  --horizon 5",
    "  --threshold 0.55",
    "  --fee-bps 2",
    "  --slippage-bps 3",
    "  --cost-bps 5",
    "  --tail-alpha 0.05",
    "  --monte-carlo-runs 200",
    "  --allow-degraded",
];

const INDICATOR_LINES: &[&str] = &[
    "Indicator Period Help",
    "",
    "Mirrored periods",
    "  --return-fast N",
    "  --return-slow N",
    "  --volatility N",
    "  --rsi N",
    "  --atr N",
    "  --bollinger N",
];

const EXAMPLE_LINES: &[&str] = &[
    "Examples",
    "",
    "  node backend/cli/sovereign_cli.js status",
    "  node backend/cli/sovereign_cli.js bt --json",
    "  node backend/cli/sovereign_cli.js optimize --allow-degraded",
];

pub fn command_specs() -> &'static [CommandSpec] {
    COMMAND_SPECS
}

pub fn command_spec(input: &str) -> Option<&'static CommandSpec> {
    let normalized = input.trim();
    command_specs().iter().find(|spec| {
        spec.name == normalized || spec.aliases.iter().any(|alias| alias == &normalized)
    })
}

pub fn help_lines(topic: &str) -> &'static [&'static str] {
    match topic {
        "overview" => OVERVIEW_LINES,
        "commands" => COMMANDS_LINES,
        "backtest" => BACKTEST_LINES,
        "indicators" => INDICATOR_LINES,
        "examples" => EXAMPLE_LINES,
        _ => OVERVIEW_LINES,
    }
}

pub fn command_aliases(spec: &CommandSpec) -> String {
    if spec.aliases.is_empty() {
        spec.name.to_string()
    } else {
        format!("{} | {}", spec.name, spec.aliases.join(" | "))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolves_aliases() {
        assert_eq!(command_spec("bt").map(|spec| spec.name), Some("backtest"));
        assert_eq!(command_spec("check").map(|spec| spec.name), Some("validate"));
    }

    #[test]
    fn overview_mentions_core_commands() {
        let overview = help_lines("overview").join("\n");
        assert!(overview.contains("backtest | bt"));
        assert!(overview.contains("strategy"));
    }
}
