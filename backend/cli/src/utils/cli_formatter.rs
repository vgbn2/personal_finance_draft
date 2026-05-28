pub fn kv_line(key: &str, value: impl std::fmt::Display) -> String {
    format!("{:>20}: {}", key, value)
}

pub fn title_line(title: &str) -> String {
    format!("=== {} ===", title)
}

pub fn bullet_line(label: &str, value: impl std::fmt::Display) -> String {
    format!("- {}: {}", label, value)
}
