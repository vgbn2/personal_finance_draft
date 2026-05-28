use sovereign_cli::{command_names, command_registry, runtime_surface::runtime_surface_lines};

#[test]
fn runtime_surface_exposes_the_cli_bridge_contract() {
    let lines = runtime_surface_lines();
    let names = command_names();
    let registry = command_registry();

    assert_eq!(registry.len(), 15);
    assert_eq!(names.len(), registry.len());
    assert!(names.contains(&"backtest"));
    assert!(names.contains(&"signal"));
    assert!(names.contains(&"portfolio"));

    assert!(lines.iter().any(|line| line.contains("analytics")));
    assert!(lines.iter().any(|line| line.contains("gate_io")));
    assert!(lines.iter().any(|line| line.contains("mt5_bridge")));
    assert!(lines.iter().any(|line| line.contains("job_execution")));
    assert!(lines.iter().any(|line| line.contains("executed job job-main-1")));
    for entry in registry {
        assert!(lines.iter().any(|line| line.contains(entry.name)));
        assert!(lines.iter().any(|line| line.contains(entry.help)));
    }
}
