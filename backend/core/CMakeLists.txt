# Sovereign C++ Core - Wealth Engine
cmake_minimum_required(VERSION 3.15)
project(sovereign_wealth_core LANGUAGES CXX)

set(CMAKE_EXPORT_COMPILE_COMMANDS ON)
set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)
option(SOVEREIGN_ENABLE_SANITIZERS "Enable ASAN/UBSAN for supported compiler toolchains" OFF)
option(SOVEREIGN_ENABLE_ONNX_RUNTIME "Enable external ONNX Runtime linkage boundary instead of the deterministic local baseline" OFF)

if(CMAKE_SYSTEM_NAME MATCHES "Windows")
    add_compile_definitions(_CRT_SECURE_NO_WARNINGS)
endif()

if(CMAKE_CXX_COMPILER_ID MATCHES "GNU|Clang")
    add_compile_options(-Wall -Wextra -Werror -Wpedantic)
    if(SOVEREIGN_ENABLE_SANITIZERS)
        add_compile_options(-fsanitize=address,undefined -fno-omit-frame-pointer)
        add_link_options(-fsanitize=address,undefined)
    endif()
elseif(CMAKE_CXX_COMPILER_ID MATCHES "MSVC")
    add_compile_options(/W4 /WX)
endif()

if(SOVEREIGN_ENABLE_ONNX_RUNTIME)
    include(FetchContent)

    set(ONNXRUNTIME_VERSION "1.17.1")

    if(CMAKE_SYSTEM_NAME MATCHES "Linux")
        set(ONNXRUNTIME_URL "https://github.com/microsoft/onnxruntime/releases/download/v${ONNXRUNTIME_VERSION}/onnxruntime-linux-x64-${ONNXRUNTIME_VERSION}.tgz")
    elseif(CMAKE_SYSTEM_NAME MATCHES "Darwin")
        set(ONNXRUNTIME_URL "https://github.com/microsoft/onnxruntime/releases/download/v${ONNXRUNTIME_VERSION}/onnxruntime-osx-universal2-${ONNXRUNTIME_VERSION}.tgz")
    elseif(CMAKE_SYSTEM_NAME MATCHES "Windows")
        set(ONNXRUNTIME_URL "https://github.com/microsoft/onnxruntime/releases/download/v${ONNXRUNTIME_VERSION}/onnxruntime-win-x64-${ONNXRUNTIME_VERSION}.zip")
    else()
        message(FATAL_ERROR "SOVEREIGN_ENABLE_ONNX_RUNTIME is enabled, but no ONNX Runtime package URL is configured for ${CMAKE_SYSTEM_NAME}")
    endif()

    FetchContent_Declare(
        onnxruntime_release
        URL ${ONNXRUNTIME_URL}
    )
    FetchContent_MakeAvailable(onnxruntime_release)

    set(SOVEREIGN_ONNXRUNTIME_LIBDIR "${onnxruntime_release_SOURCE_DIR}/lib" CACHE INTERNAL "onnxruntime lib dir")

    add_library(onnxruntime::onnxruntime SHARED IMPORTED)

    set_target_properties(onnxruntime::onnxruntime PROPERTIES
        INTERFACE_INCLUDE_DIRECTORIES "${onnxruntime_release_SOURCE_DIR}/include"
    )

    if(CMAKE_SYSTEM_NAME MATCHES "Linux")
        set_target_properties(onnxruntime::onnxruntime PROPERTIES
            IMPORTED_LOCATION "${onnxruntime_release_SOURCE_DIR}/lib/libonnxruntime.so"
        )
    elseif(CMAKE_SYSTEM_NAME MATCHES "Darwin")
        set_target_properties(onnxruntime::onnxruntime PROPERTIES
            IMPORTED_LOCATION "${onnxruntime_release_SOURCE_DIR}/lib/libonnxruntime.dylib"
        )
    elseif(CMAKE_SYSTEM_NAME MATCHES "Windows")
        set_target_properties(onnxruntime::onnxruntime PROPERTIES
            IMPORTED_IMPLIB "${onnxruntime_release_SOURCE_DIR}/lib/onnxruntime.lib"
            IMPORTED_LOCATION "${onnxruntime_release_SOURCE_DIR}/lib/onnxruntime.dll"
        )
    endif()
endif()

# Copies the onnxruntime shared libs next to a target's executable on Windows so
# the loader finds them at runtime (otherwise the exe fails with STATUS_DLL_NOT_FOUND).
# No-op when ONNX is disabled or on non-Windows platforms.
function(sovereign_copy_onnx_runtime target)
    if(SOVEREIGN_ENABLE_ONNX_RUNTIME AND CMAKE_SYSTEM_NAME MATCHES "Windows")
        add_custom_command(TARGET ${target} POST_BUILD
            COMMAND ${CMAKE_COMMAND} -E copy_if_different
                "${SOVEREIGN_ONNXRUNTIME_LIBDIR}/onnxruntime.dll" "$<TARGET_FILE_DIR:${target}>"
            COMMAND ${CMAKE_COMMAND} -E copy_if_different
                "${SOVEREIGN_ONNXRUNTIME_LIBDIR}/onnxruntime_providers_shared.dll" "$<TARGET_FILE_DIR:${target}>"
            VERBATIM)
    endif()
endfunction()

# Core Library Sources
set(CORE_SOURCES
    src/data/binary_ts_reader.cpp
    src/data/binary_ts_merger.cpp
    src/backtest/grid_optimizer.cpp
    src/correlation/correlation_engine.cpp
    src/data/data_snapshot.cpp
    src/data/data_validator.cpp
    src/stats/stats_engine.cpp
    src/stats/confidence.cpp
    src/trading_system.cpp
    src/replay/strategy_runner.cpp
    src/backtest/backtester.cpp
    src/backtest/frame_backtester.cpp
    src/indicators/indicator_engine.cpp
    src/risk/cost_model.cpp
    src/portfolio/pnl_calculator.cpp
    src/portfolio/kelly_sizing.cpp
    src/portfolio/multi_asset.cpp
    src/portfolio/exposure_monitor.cpp
    src/ingestion/ingestion_adapter.cpp
    src/ingestion/equity_ingestion.cpp
    src/ingestion/crypto_ingestion.cpp
    src/ingestion/fx_ingestion.cpp
    src/ingestion/index_ingestion.cpp
    src/ingestion/macro_ingestion.cpp
    src/ingestion/news_ingestion.cpp
    src/ingestion/stream_router.cpp
    src/ml/kalman_filter.cpp
    src/ml/sentiment_ingestion.cpp
    src/ml/kronos_tokenizer.cpp
    src/ml/kronos_tensor_builder.cpp
    src/ml/cnn_tensor_builder.cpp
    src/ml/cnn_inference.cpp
    src/ml/model_registry.cpp
    src/ml/onnx_model.cpp
    src/features/technical_features.cpp
    src/features/label_builder.cpp
    src/features/lookahead_guard.cpp
    src/features/sentiment_features.cpp
    src/features/path_signature.cpp
    src/features/macro_features.cpp
    src/strategies/hybrid_strategy.cpp
    src/regime/spectral_clustering.cpp
    src/regime/regime_detector.cpp
    src/execution/live_broker_adapter.cpp
    src/execution/paper_broker.cpp
    src/execution/rl_router.cpp
    src/execution/simple_market.cpp
    src/execution/twap_vwap.cpp
    src/risk/drawdown_guard.cpp
    src/risk/pre_trade_risk.cpp
    src/parser/ohlcv_parser.cpp
    src/strategies/options_trading.cpp
    src/strategies/spot_futures_arb.cpp
    src/strategies/spot_only.cpp
    src/strategies/strategy_sweep_evaluator.cpp
    src/backtest/global_sweep_optimizer.cpp
)

add_library(sovereign_core STATIC ${CORE_SOURCES})
target_include_directories(sovereign_core PUBLIC src include)

target_compile_definitions(sovereign_core PRIVATE
    SOVEREIGN_ONNX_RUNTIME_ENABLED=$<BOOL:${SOVEREIGN_ENABLE_ONNX_RUNTIME}>
)

if(SOVEREIGN_ENABLE_ONNX_RUNTIME)
    target_link_libraries(sovereign_core PRIVATE onnxruntime::onnxruntime)
endif()

# Main Executable
add_executable(sovereign_wealth src/main.cpp)
target_link_libraries(sovereign_wealth PRIVATE sovereign_core)
target_compile_definitions(sovereign_wealth PRIVATE
    SOVEREIGN_ONNX_RUNTIME_ENABLED=$<BOOL:${SOVEREIGN_ENABLE_ONNX_RUNTIME}>
)
if(SOVEREIGN_ENABLE_ONNX_RUNTIME)
    # sovereign_core is STATIC and links onnxruntime PRIVATE, so the final exe must
    # satisfy the Ort symbols itself.
    target_link_libraries(sovereign_wealth PRIVATE onnxruntime::onnxruntime)
endif()
sovereign_copy_onnx_runtime(sovereign_wealth)

# Testing
enable_testing()

macro(add_sovereign_test name src_file)
    add_executable(${name} ${src_file})
    target_link_libraries(${name} PRIVATE sovereign_core)
    target_compile_definitions(${name} PRIVATE
        SOVEREIGN_REPO_ROOT="${CMAKE_CURRENT_LIST_DIR}/../.."
    )
    add_test(NAME ${name} COMMAND ${name})
endmacro()

add_sovereign_test(phase2_data_contract_test test/phase2_data_contract_test.cpp)
add_sovereign_test(research_contract_test test/research_contract_test.cpp)
add_sovereign_test(stats_test test/stats_test.cpp)
add_sovereign_test(risk_test test/risk_test.cpp)
add_sovereign_test(cost_model_test test/cost_model_test.cpp)
add_sovereign_test(crypto_replay_runner_test test/crypto_replay_runner_test.cpp)
add_sovereign_test(quote_feed_interface_test test/quote_feed_interface_test.cpp)
add_sovereign_test(correlation_test test/correlation_test.cpp)
add_sovereign_test(data_snapshot_test test/data_snapshot_test.cpp)
add_sovereign_test(indicator_test test/indicator_test.cpp)
add_sovereign_test(backtest_test test/backtest_test.cpp)
add_sovereign_test(portfolio_test test/portfolio_test.cpp)
add_sovereign_test(ingestion_adapter_test test/ingestion_contract_test.cpp)
add_sovereign_test(phase1_compounding_test test/phase1_compounding_test.cpp)
add_sovereign_test(kronos_integration_test test/kronos_integration_test.cpp)
add_sovereign_test(onnx_model_test test/onnx_model_test.cpp)
add_sovereign_test(tensor_builder_test test/tensor_builder_test.cpp)
add_sovereign_test(cnn_tensor_builder_test test/cnn_tensor_builder_test.cpp)
add_sovereign_test(cnn_inference_test test/cnn_inference_test.cpp)
add_sovereign_test(model_registry_test test/model_registry_test.cpp)
add_sovereign_test(execution_test test/execution_test.cpp)
add_sovereign_test(kill_switch_test test/kill_switch_test.cpp)
add_sovereign_test(technical_features_test test/technical_features_test.cpp)
add_sovereign_test(parser_position_sizer_test test/parser_position_sizer_test.cpp)
add_sovereign_test(normalization_optimizer_test test/normalization_optimizer_test.cpp)
add_sovereign_test(macro_features_test test/macro_features_test.cpp)
add_sovereign_test(regime_test test/regime_test.cpp)
add_sovereign_test(regime_strategy_test test/regime_strategy_test.cpp)
add_sovereign_test(feature_pipeline_test test/feature_pipeline_test.cpp)
add_sovereign_test(portfolio_risk_test test/portfolio_risk_test.cpp)
add_sovereign_test(binary_ts_reader_test test/binary_ts_reader_test.cpp)
add_sovereign_test(binary_ts_merger_test test/binary_ts_merger_test.cpp)
add_sovereign_test(grid_optimizer_test test/grid_optimizer_test.cpp)
add_sovereign_test(global_sweep_optimizer_test test/global_sweep_optimizer_test.cpp)

# Specialized Test Configuration
target_compile_definitions(kronos_integration_test PRIVATE
    SOVEREIGN_ONNX_RUNTIME_ENABLED=$<BOOL:${SOVEREIGN_ENABLE_ONNX_RUNTIME}>
)
if(SOVEREIGN_ENABLE_ONNX_RUNTIME)
    target_link_libraries(kronos_integration_test PRIVATE onnxruntime::onnxruntime)
endif()
sovereign_copy_onnx_runtime(kronos_integration_test)

target_compile_definitions(onnx_model_test PRIVATE
    SOVEREIGN_ONNX_RUNTIME_ENABLED=$<BOOL:${SOVEREIGN_ENABLE_ONNX_RUNTIME}>
    SOVEREIGN_REPO_ROOT="${CMAKE_CURRENT_LIST_DIR}/../.."
)
if(SOVEREIGN_ENABLE_ONNX_RUNTIME)
    target_link_libraries(onnx_model_test PRIVATE onnxruntime::onnxruntime)
endif()
sovereign_copy_onnx_runtime(onnx_model_test)

