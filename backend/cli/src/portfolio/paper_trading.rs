use super::state::{PortfolioState, Position};

pub fn simulate_fill(state: &mut PortfolioState, symbol: &str, quantity: f64, price: f64) {
    state.positions.push(Position {
        symbol: symbol.to_string(),
        quantity,
        average_cost: price,
        current_price: price,
    });
}
