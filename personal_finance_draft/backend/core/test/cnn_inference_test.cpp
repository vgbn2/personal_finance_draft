#include "../src/ml/cnn_inference.hpp"

#include <cassert>
#include <iostream>

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

    assert(result.ok);
    assert(result.predicted_class == 2);
    assert(result.probabilities.size() == 3U);
    assert(result.probabilities[2] > result.probabilities[0]);
    assert(result.reason == "cnn_baseline_inference");

    std::cout << "cnn_inference_test passed!\n";
    return 0;
}
