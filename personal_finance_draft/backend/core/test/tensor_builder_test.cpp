#include <iostream>
#include <vector>
#include <cassert>
#include "ml/kronos_tensor_builder.hpp"

using namespace sovereign::ml;

void test_empty_tokens() {
    KronosTensorBuilder builder(10);
    auto windows = builder.build_windows({});
    assert(windows.empty());
    std::cout << "test_empty_tokens passed" << std::endl;
}

void test_insufficient_tokens() {
    KronosTensorBuilder builder(10);
    auto windows = builder.build_windows({1, 2, 3, 4, 5});
    assert(windows.empty());
    std::cout << "test_insufficient_tokens passed" << std::endl;
}

void test_sliding_windows() {
    KronosTensorBuilder builder(3);
    std::vector<int> tokens = {10, 20, 30, 40, 50};
    // Expected: [10,20,30], [20,30,40], [30,40,50]
    auto windows = builder.build_windows(tokens);
    
    assert(windows.size() == 3);
    assert(windows[0].size() == 3);
    assert(windows[0][0] == 10 && windows[0][2] == 30);
    assert(windows[1][0] == 20 && windows[1][2] == 40);
    assert(windows[2][0] == 30 && windows[2][2] == 50);
    
    auto flat = builder.flatten(windows);
    assert(flat.size() == 9);
    assert(flat[0] == 10);
    assert(flat[8] == 50);
    
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
