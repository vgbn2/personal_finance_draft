#ifndef KALMAN_FILTER_HPP
#define KALMAN_FILTER_HPP

#include <vector>

class KalmanFilter {
public:
    KalmanFilter(double process_noise, double measurement_noise, double initial_estimate, double initial_error);
    double update(double measurement);
    double getVariance() const { return p; }
private:
    double q; // process noise
    double r; // measurement noise
    double x; // estimate
    double p; // error covariance
};

#endif
