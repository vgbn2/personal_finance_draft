#[derive(Debug, Clone, Default)]
pub struct ProgressTracker {
    pub completed: usize,
    pub total: usize,
}

impl ProgressTracker {
    pub fn percent(&self) -> f64 {
        if self.total == 0 {
            0.0
        } else {
            (self.completed as f64 / self.total as f64) * 100.0
        }
    }
}
