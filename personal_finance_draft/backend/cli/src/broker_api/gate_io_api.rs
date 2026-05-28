#[derive(Debug, Clone)]
pub struct GateIoOrderRequest {
    pub symbol: String,
    pub side: String,
    pub quantity: f64,
}

pub fn endpoint() -> &'static str {
    "gate_io"
}

pub fn order_path() -> &'static str {
    "/api/v4/spot/orders"
}
