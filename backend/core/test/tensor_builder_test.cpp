#include <cstdlib>
#include <iostream>
#include <vector>

#define CHECK(condition) do { if (!(condition)) { std::cerr << "CHECK failed: " #condition << "\n"; std::exit(1); } } while (false)
#include "ml/kronos_tensor_builder.hpp"

using namespace sovereign::ml;

void test_empty_tokens() {
    KronosTensorBuilder builder(10);
    auto windows = builder.build_windows({});
    CHECK(windows.empty());
    std::cout << "test_empty_tokens passed" << std::endl;
}

void test_insufficient_tokens() {
    KronosTensorBuilder builder(10);
    auto windows = builder.build_windows({1, 2, 3, 4, 5});
    CHECK(windows.empty());
    std::cout << "test_insufficient_tokens passed" << std::endl;
}

void test_sliding_windows() {
    KronosTensorBuilder builder(3);
    std::vector<int> tokens = {10, 20, 30, 40, 50};
    // Expected: [10,20,30], [20,30,40], [30,40,50]
    auto windows = builder.build_windows(tokens);
    
    CHECK(windows.size() == 3);
    CHECK(windows[0].size() == 3);
    CHECK(windows[0][0] == 10 && windows[0][2] == 30);
    CHECK(windows[1][0] == 20 && windows[1][2] == 40);
    CHECK(windows[2][0] == 30 && windows[2][2] == 50);
    
    auto flat = builder.flatten(windows);
    CHECK(flat.size() == 9);
    CHECK(flat[0] == 10);
    CHECK(flat[8] == 50);
    
    std::cout << "test_sliding_windows passed" << std::endl;
}

int main() {
    try {
        test_empty_tokens();
        test_insufficient_tokens();
        test_sliding_windows();
        std::cout << "All tensor_builder_test passed!" << std::endl;
    } catch (const std::exception& e) {
        std::cerr << "Test failed: " << e.what() << std::endl;
        return 1;
    }
    return 0;
}
