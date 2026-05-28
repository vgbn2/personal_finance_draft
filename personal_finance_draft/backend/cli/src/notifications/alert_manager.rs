#[derive(Debug, Clone)]
pub struct Alert {
    pub channel: String,
    pub message: String,
}

#[derive(Debug, Clone, Default)]
pub struct AlertManager {
    pub alerts: Vec<Alert>,
}

impl AlertManager {
    pub fn push(&mut self, channel: &str, message: &str) {
        self.alerts.push(Alert {
            channel: channel.to_string(),
            message: message.to_string(),
        });
    }
}
