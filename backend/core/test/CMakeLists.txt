# Local test manifest for the C++ core.
#
# This file is intentionally lightweight and acts as a human-readable index of
# the active test targets in this tree. It mirrors the root CMakeLists target
# names so future refactors can lift the test wiring into a helper module
# without rediscovering the current layout.

set(SOVEREIGN_CPP_CORE_TEST_TARGETS
    phase2_data_contract_test
    research_contract_test
    stats_test
    risk_test
    crypto_replay_runner_test
    quote_feed_interface_test
    correlation_test
    data_snapshot_test
    indicator_test
    backtest_test
    portfolio_test
    ingestion_adapter_test
    phase1_compounding_test
    kronos_integration_test
    onnx_model_test
    tensor_builder_test
    cnn_tensor_builder_test
    cnn_inference_test
    model_registry_test
    execution_test
    kill_switch_test
    technical_features_test
    parser_position_sizer_test
    normalization_optimizer_test
    macro_features_test
    regime_test
    regime_strategy_test
    feature_pipeline_test
    portfolio_risk_test
)
