#[derive(Debug, Clone)]
pub struct SentimentRequest {
    pub topic: String,
}

pub fn provider_name() -> &'static str {
    "sentiment"
}
