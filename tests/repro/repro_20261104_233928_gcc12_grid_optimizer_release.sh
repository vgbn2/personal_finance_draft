#!/usr/bin/env bash
# GCC 12 Release regression: retain optimization and fatal warnings.
set -euo pipefail
cd "$(dirname "$0")/../.."
"${CXX:-g++}" -O3 -DNDEBUG -Wall -Wextra -Werror -Wpedantic -fopenmp \
  -std=c++20 -Ibackend/cpp_core/src -Ibackend/cpp_core/include \
  -c backend/cpp_core/test/backtest/grid_optimizer_test.cpp -o /dev/null
