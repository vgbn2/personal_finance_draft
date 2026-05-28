#[derive(Debug, Clone)]
pub struct RoutedOrder {
    pub broker: String,
    pub symbol: String,
    pub side: String,
}

pub fn route_order(broker: &str, symbol: &str, side: &str) -> RoutedOrder {
    RoutedOrder {
        broker: broker.to_string(),
        symbol: symbol.to_string(),
        side: side.to_string(),
    }
}
