#[derive(Debug, Clone)]
pub struct TradeRecord {
    pub symbol: String,
    pub side: String,
    pub quantity: f64,
    pub price: f64,
}

#[derive(Debug, Clone, Default)]
pub struct TradeLog {
    pub records: Vec<TradeRecord>,
}

impl TradeLog {
    pub fn push(&mut self, record: TradeRecord) {
        self.records.push(record);
    }
}
