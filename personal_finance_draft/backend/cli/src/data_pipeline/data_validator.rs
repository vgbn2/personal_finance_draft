#[derive(Debug, Clone)]
pub struct ValidationReport {
    pub ok: bool,
    pub reason: String,
}

pub fn validate_symbol(symbol: &str) -> ValidationReport {
    if symbol.trim().is_empty() {
        ValidationReport {
            ok: false,
            reason: "empty_symbol".to_string(),
        }
    } else {
        ValidationReport {
            ok: true,
            reason: "ok".to_string(),
        }
    }
}
