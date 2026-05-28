#[derive(Debug, Clone)]
pub struct Mt5ConnectionProfile {
    pub terminal_path: String,
    pub login: String,
}

pub fn endpoint() -> &'static str {
    "mt5_native"
}

pub fn bridge_name() -> &'static str {
    "MetaTrader 5"
}
