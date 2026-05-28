#[derive(Debug, Clone)]
pub struct StrategyConfig {
    pub strategy_name: String,
    pub universe: String,
    pub model_name: String,
}

impl Default for StrategyConfig {
    fn default() -> Self {
        Self {
            strategy_name: "hybrid".to_string(),
            universe: "crypto".to_string(),
            model_name: "cnn_baseline_v0".to_string(),
        }
    }
}
