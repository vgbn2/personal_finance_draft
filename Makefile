# Root Makefile for Sovereign Finance

.PHONY: all clean test build-core

all: build-core

build-core:
	cmake -S . -B build
	cmake --build build

test:
	ctest --test-dir build/cpp_core

clean:
	cmake -E remove_directory build
