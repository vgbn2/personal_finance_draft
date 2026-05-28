#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

cmake -S "$repo_root" -B "$repo_root/build"
cmake --build "$repo_root/build"
