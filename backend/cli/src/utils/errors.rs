use std::fmt;

#[derive(Debug, Clone)]
pub enum CliError {
    InvalidArguments(String),
    MissingData(String),
    Unavailable(String),
}

impl fmt::Display for CliError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            CliError::InvalidArguments(msg) => write!(f, "invalid arguments: {}", msg),
            CliError::MissingData(msg) => write!(f, "missing data: {}", msg),
            CliError::Unavailable(msg) => write!(f, "unavailable: {}", msg),
        }
    }
}

impl std::error::Error for CliError {}
