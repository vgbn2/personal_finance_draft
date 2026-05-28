#[derive(Debug, Clone)]
pub struct GateIoMarketRequest {
    pub symbol: String,
    pub timeframe: String,
}

pub fn provider_name() -> &'static str {
    "gate_io"
}
