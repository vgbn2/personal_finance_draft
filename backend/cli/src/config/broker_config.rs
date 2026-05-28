#[derive(Debug, Clone)]
pub struct BrokerConfig {
    pub broker_name: String,
    pub enabled: bool,
    pub paper_only: bool,
}

impl Default for BrokerConfig {
    fn default() -> Self {
        Self {
            broker_name: "paper".to_string(),
            enabled: false,
            paper_only: true,
        }
    }
}
