# Sovereign C++ Core - Wealth Engine
cmake_minimum_required(VERSION 3.15)
project(sovereign_wealth_core LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)
option(SOVEREIGN_ENABLE_SANITIZERS "Enable ASAN/UBSAN for supported compiler toolchains" OFF)

if(CMAKE_CXX_COMPILER_ID MATCHES "GNU|Clang")
    add_compile_options(-Wall -Wextra -Werror -Wpedantic)
    if(SOVEREIGN_ENABLE_SANITIZERS)
        add_compile_options(-fsanitize=address,undefined -fno-omit-frame-pointer)
        add_link_options(-fsanitize=address,undefined)
    endif()
elseif(CMAKE_CXX_COMPILER_ID MATCHES "MSVC")
    add_compile_options(/W4 /WX)
endif()

# --- ONNX Runtime Integration ---
include(FetchContent)

set(ONNXRUNTIME_VERSION "1.17.1")

if(CMAKE_SYSTEM_NAME MATCHES "Linux")
    set(ONNXRUNTIME_URL "https://github.com/microsoft/onnxruntime/releases/download/v${ONNXRUNTIME_VERSION}/onnxruntime-linux-x64-${ONNXRUNTIME_VERSION}.tgz")
elseif(CMAKE_SYSTEM_NAME MATCHES "Darwin")
    set(ONNXRUNTIME_URL "https://github.com/microsoft/onnxruntime/releases/download/v${ONNXRUNTIME_VERSION}/onnxruntime-osx-universal2-${ONNXRUNTIME_VERSION}.tgz")
elseif(CMAKE_SYSTEM_NAME MATCHES "Windows")
    set(ONNXRUNTIME_URL "https://github.com/microsoft/onnxruntime/releases/download/v${ONNXRUNTIME_VERSION}/onnxruntime-win-x64-${ONNXRUNTIME_VERSION}.zip")
endif()

FetchContent_Declare(
    onnxruntime_release
    URL ${ONNXRUNTIME_URL}
)
FetchContent_MakeAvailable(onnxruntime_release)

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
# --------------------------------

add_executable(sovereign_wealth 
    src/main.cpp 
    src/correlation/correlation_engine.cpp
    src/data/data_snapshot.cpp
    src/data/data_validator.cpp
    src/stats/stats_engine.cpp
    src/trading_system.cpp
    src/trading_system.hpp
    src/replay/strategy_runner.cpp
    src/backtest/backtester.cpp
    src/indicators/indicator_engine.cpp
    src/risk/cost_model.cpp
    src/portfolio/pnl_calculator.cpp
    src/ingestion/ingestion_adapter.cpp
    src/ingestion/equity_ingestion.cpp
    src/ingestion/crypto_ingestion.cpp
    src/ingestion/fx_ingestion.cpp
    src/ingestion/index_ingestion.cpp
    src/ingestion/macro_ingestion.cpp
    src/ingestion/news_ingestion.cpp
    src/ml/sentiment_ingestion.cpp
    src/ingestion/stream_router.cpp
    src/ml/kronos_tokenizer.cpp
    src/ml/kronos_tensor_builder.cpp
    src/ml/cnn_tensor_builder.cpp
    src/features/technical_features.cpp
    src/ml/onnx_model.cpp
    )

target_link_libraries(sovereign_wealth PRIVATE onnxruntime::onnxruntime)

# Include source directory for local headers
target_include_directories(sovereign_wealth PRIVATE src)

enable_testing()

add_executable(phase2_data_contract_test
    test/phase2_data_contract_test.cpp
    src/data/data_validator.cpp
)
target_include_directories(phase2_data_contract_test PRIVATE src)
add_test(NAME phase2_data_contract_test COMMAND phase2_data_contract_test)

add_executable(stats_test
    test/stats_test.cpp
    src/stats/stats_engine.cpp
)
target_include_directories(stats_test PRIVATE src)
add_test(NAME stats_test COMMAND stats_test)

add_executable(risk_test
    test/risk_test.cpp
    src/risk/drawdown_guard.cpp
    src/stats/stats_engine.cpp
)
target_include_directories(risk_test PRIVATE src)
add_test(NAME risk_test COMMAND risk_test)

add_executable(crypto_replay_runner_test
    test/crypto_replay_runner_test.cpp
    src/replay/strategy_runner.cpp
)
target_include_directories(crypto_replay_runner_test PRIVATE src)
add_test(NAME crypto_replay_runner_test COMMAND crypto_replay_runner_test)

add_executable(quote_feed_interface_test
    test/quote_feed_interface_test.cpp
)
target_include_directories(quote_feed_interface_test PRIVATE src)
add_test(NAME quote_feed_interface_test COMMAND quote_feed_interface_test)

add_executable(correlation_test
    test/correlation_test.cpp
    src/correlation/correlation_engine.cpp
)
target_include_directories(correlation_test PRIVATE src)
add_test(NAME correlation_test COMMAND correlation_test)

add_executable(data_snapshot_test
    test/data_snapshot_test.cpp
    src/data/data_snapshot.cpp
)
target_include_directories(data_snapshot_test PRIVATE src)
add_test(NAME data_snapshot_test COMMAND data_snapshot_test)

add_executable(indicator_test
    test/indicator_test.cpp
    src/indicators/indicator_engine.cpp
)
target_include_directories(indicator_test PRIVATE src)
add_test(NAME indicator_test COMMAND indicator_test)

add_executable(backtest_test
    test/backtest_test.cpp
    src/backtest/backtester.cpp
    src/indicators/indicator_engine.cpp
    src/stats/stats_engine.cpp
    src/risk/cost_model.cpp
    src/data/data_snapshot.cpp
    src/data/data_validator.cpp
)
target_include_directories(backtest_test PRIVATE src)
add_test(NAME backtest_test COMMAND backtest_test)

add_executable(portfolio_test
    test/portfolio_test.cpp
    src/portfolio/pnl_calculator.cpp
)
target_include_directories(portfolio_test PRIVATE src)
add_test(NAME portfolio_test COMMAND portfolio_test)

add_executable(ingestion_adapter_test
    test/ingestion_contract_test.cpp
    src/ingestion/ingestion_adapter.cpp
    src/ingestion/equity_ingestion.cpp
    src/ingestion/crypto_ingestion.cpp
    src/ingestion/fx_ingestion.cpp
    src/ingestion/index_ingestion.cpp
    src/ingestion/macro_ingestion.cpp
    src/ingestion/news_ingestion.cpp
    src/ingestion/sentiment_ingestion.cpp
    src/ingestion/stream_router.cpp
)
target_include_directories(ingestion_adapter_test PRIVATE src)
target_compile_definitions(ingestion_adapter_test PRIVATE
    SOVEREIGN_REPO_ROOT="${CMAKE_CURRENT_LIST_DIR}/.."
)
add_test(NAME ingestion_adapter_test COMMAND ingestion_adapter_test)

add_executable(phase1_compounding_test
    test/phase1_compounding_test.cpp
    src/trading_system.cpp
)
target_include_directories(phase1_compounding_test PRIVATE src include)
add_test(NAME phase1_compounding_test COMMAND phase1_compounding_test)

add_executable(kronos_integration_test
    test/kronos_integration_test.cpp
    src/ml/kronos_tokenizer.cpp
    src/ml/kronos_tensor_builder.cpp
    src/ml/onnx_model.cpp
)
target_include_directories(kronos_integration_test PRIVATE src)
add_test(NAME kronos_integration_test COMMAND kronos_integration_test)

add_executable(tensor_builder_test
    test/tensor_builder_test.cpp
    src/ml/kronos_tensor_builder.cpp
)
target_include_directories(tensor_builder_test PRIVATE src)
add_test(NAME tensor_builder_test COMMAND tensor_builder_test)

add_executable(cnn_tensor_builder_test
    test/cnn_tensor_builder_test.cpp
    src/ml/cnn_tensor_builder.cpp
    src/features/technical_features.cpp
    src/indicators/indicator_engine.cpp
    src/data/data_snapshot.cpp
    src/data/data_validator.cpp
)
target_include_directories(cnn_tensor_builder_test PRIVATE src)
add_test(NAME cnn_tensor_builder_test COMMAND cnn_tensor_builder_test)


add_executable(technical_features_test
    test/technical_features_test.cpp
    src/features/technical_features.cpp
    src/indicators/indicator_engine.cpp
)
target_include_directories(technical_features_test PRIVATE src)
add_test(NAME technical_features_test COMMAND technical_features_test)

add_executable(parser_position_sizer_test
    test/parser_position_sizer_test.cpp
    src/parser/ohlcv_parser.cpp
    src/data/data_validator.cpp
)
target_include_directories(parser_position_sizer_test PRIVATE src)
add_test(NAME parser_position_sizer_test COMMAND parser_position_sizer_test)


add_executable(normalization_optimizer_test
    test/normalization_optimizer_test.cpp
)
target_include_directories(normalization_optimizer_test PRIVATE src)
add_test(NAME normalization_optimizer_test COMMAND normalization_optimizer_test)
