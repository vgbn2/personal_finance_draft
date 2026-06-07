use sovereign_cli::commands::registry::{command_label, command_names, command_registry};
use sovereign_cli::js_surface::{command_aliases, command_spec, help_lines};
use serde_json::json;
use std::env;

fn print_lines(lines: &[&str]) {
    for line in lines {
        println!("{}", line);
    }
}

fn print_catalog() {
    print_lines(help_lines("overview"));
    println!();
    print_lines(help_lines("commands"));
    println!();
    println!("Available commands:");
    for entry in command_registry() {
        let label = command_label(entry.name).unwrap_or_else(|| entry.name.to_string());
        println!("  {:<24} {}", label, entry.help);
    }
}

fn print_help(topic: &str) {
    print_lines(help_lines(topic));
}

fn run_command(command: &str, args: &[String]) -> i32 {
    if let Some(spec) = command_spec(command) {
        let output = json!({
            "type": "rust_cli_mirror",
            "command": spec.name,
            "aliases": spec.aliases,
            "category": spec.category,
            "summary": spec.summary,
            "status": "mirrored-contract-only",
            "notes": "This Rust surface matches the current JS CLI command map. Execution logic will be ported later.",
        });
        if args.iter().any(|arg| arg == "--json") {
            match serde_json::to_string_pretty(&output) {
                Ok(text) => println!("{}", text),
                Err(error) => {
                    eprintln!("Failed to serialize command payload: {}", error);
                    return 1;
                }
            }
        } else {
            println!("Sovereign Rust CLI mirror");
            println!("command: {}", spec.name);
            println!("aliases: {}", command_aliases(spec));
            println!("category: {}", spec.category);
            println!("summary: {}", spec.summary);
            println!("status: mirrored-contract-only");
            println!("notes: This Rust surface matches the current JS CLI command map. Execution logic will be ported later.");
        }
        0
    } else {
        eprintln!("Unknown command: {}", command);
        eprintln!("Known commands: {}", command_names().join(", "));
        1
    }
}

fn main() {
    let args: Vec<String> = env::args().skip(1).collect();
    if args.is_empty() {
        print_catalog();
        return;
    }

    let command = args[0].as_str();
    match command {
        "-h" | "--help" | "help" => {
            let topic = args.get(1).map(|value| value.as_str()).unwrap_or("overview");
            print_help(topic);
        }
        "commands" => print_help("commands"),
        "backtest" | "bt" => {
            std::process::exit(run_command(command, &args[1..]));
        }
        "indicators" | "features" => {
            std::process::exit(run_command(command, &args[1..]));
        }
        "status" | "cockpit" | "watch" | "ingest" | "backfill" | "cache-clean" | "clean" | "validate" | "check" | "backend" | "quotes" | "strategy" | "models" | "optimize" | "trade" | "prune" | "db-prune" | "demo" | "loc" | "universe" => {
            std::process::exit(run_command(command, &args[1..]));
        }
        _ => {
            eprintln!("Unknown command: {}", command);
            eprintln!("Use `help` to list the mirrored command surface.");
            std::process::exit(1);
        }
    }
}
