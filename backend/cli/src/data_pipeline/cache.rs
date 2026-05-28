#[derive(Debug, Clone)]
pub struct CacheEntry {
    pub key: String,
    pub value: String,
}

#[derive(Debug, Clone, Default)]
pub struct CacheIndex {
    pub entries: Vec<CacheEntry>,
}
