pub struct CommandSummary {
    pub command: &'static str,
    pub description: &'static str,
}

pub fn analytics_command_name() -> &'static str {
    "analytics"
}

pub fn analytics_summary() -> CommandSummary {
    CommandSummary {
        command: analytics_command_name(),
        description: "local analytics and reporting",
    }
}
