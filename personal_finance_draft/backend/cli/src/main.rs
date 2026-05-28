use sovereign_cli::runtime_surface::runtime_surface_lines;
use sovereign_cli::config::app_config::AppConfig;
use sovereign_cli::portfolio::state::{PortfolioState, Position};
use sovereign_cli::portfolio::pnl_calculator;
use sovereign_cli::utils::cli_formatter::{bullet_line, kv_line, title_line};
use std::io::{self, Read};
use std::thread;
use std::time::Duration;

fn main() {
    let config = AppConfig::default();
    let mut state = PortfolioState::default();
    state.cash = 1000.0;
    state.positions.push(Position {
        symbol: "BTCUSDT".to_string(),
        quantity: 1.0,
        average_cost: 100.0,
        current_price: 120.0,
    });

    println!("--- Starting Sovereign CLI. Press 'q' to exit/switch provider. ---");

    loop {
        let metrics = pnl_calculator::calculate(&state);
        println!("{}", title_line("Sovereign CLI"));
        println!("{}", kv_line("profile", config.profile));
        println!("{}", kv_line("dry_run", config.dry_run));
        println!("{}", bullet_line("portfolio_equity", metrics.total_equity));
        for line in runtime_surface_lines() {
            println!("{}", line);
        }

        // Non-blocking check for 'q'
        if let Ok(mut stdin) = io::stdin().try_lock() {
            let mut buffer = [0; 1];
            if stdin.read(&mut buffer).is_ok() && buffer[0] == b'q' {
                println!("Exiting...");
                break;
            }
        }

        thread::sleep(Duration::from_secs(2));
    }
}
