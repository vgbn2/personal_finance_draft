#[derive(Debug, Clone)]
pub struct AppConfig {
    pub app_name: String,
    pub profile: String,
    pub dry_run: bool,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            app_name: "sovereign-cli".to_string(),
            profile: "local".to_string(),
            dry_run: true,
        }
    }
}
