# Root Makefile for Sovereign Finance

.PHONY: all clean test build-core

CORE_BUILD_DIR ?= build/core

all: build-core

build-core:
	cmake -S backend/cpp_core -B "$(CORE_BUILD_DIR)"
	cmake --build "$(CORE_BUILD_DIR)"

test:
	ctest --test-dir "$(CORE_BUILD_DIR)" --output-on-failure --no-tests=error

clean:
	cmake -E remove_directory build
