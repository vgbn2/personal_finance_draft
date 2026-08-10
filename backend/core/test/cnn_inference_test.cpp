#include "../src/ml/cnn_inference.hpp"

#include <cstdlib>
#include <iostream>

#define CHECK(condition) do { if (!(condition)) { std::cerr << "CHECK failed: " #condition << "\n"; std::exit(1); } } while (false)

int main() {
    using namespace sovereign::ml;

    CnnTensor tensor;
    tensor.shape = {1U, 3U, 2U};
    tensor.data = {
        0.1f, 0.2f,
        0.3f, 0.4f,
        0.5f, 0.7f,
    };

    CnnInferenceEngine engine("cnn_baseline_v0");
    const auto result = engine.predict(tensor);

    CHECK(result.ok);
    CHECK(result.predicted_class == 2);
    CHECK(result.probabilities.size() == 3U);
    CHECK(result.probabilities[2] > result.probabilities[0]);
    CHECK(result.reason == "cnn_baseline_inference");

    std::cout << "cnn_inference_test passed!\n";
    return 0;
}
