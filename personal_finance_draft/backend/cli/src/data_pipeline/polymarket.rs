#[derive(Debug, Clone)]
pub struct PolymarketRequest {
    pub market: String,
    pub side: String,
}

pub fn provider_name() -> &'static str {
    "polymarket"
}
