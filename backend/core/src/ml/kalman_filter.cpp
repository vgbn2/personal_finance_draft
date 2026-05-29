#include "kalman_filter.hpp"

KalmanFilter::KalmanFilter(double process_noise, double measurement_noise, double initial_estimate, double initial_error)
    : q(process_noise), r(measurement_noise), x(initial_estimate), p(initial_error) {}

double KalmanFilter::update(double measurement) {
    // Prediction
    p = p + q;

    // Measurement Update
    double k = p / (p + r);
    x = x + k * (measurement - x);
    p = (1 - k) * p;

    return x;
}
