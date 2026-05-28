#[derive(Debug, Clone)]
pub struct FredSeriesRequest {
    pub series_id: String,
    pub start_date: String,
}

pub fn provider_name() -> &'static str {
    "fred"
}
