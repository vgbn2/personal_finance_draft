#pragma once

#include <string>
#include <vector>

namespace sovereign {

struct SimulationParams {
    double initInv = 1000.0;
    int years = 20;
    double wage = 100.0;
    double wageGrow = 5.0;
    double ret = 12.0;
    double retSd = 6.0;
};

struct MonthResult {
    int month = 0;
    double netWorth = 0.0;
    double portfolio = 0.0;
};

class FinanceEngine {
public:
    explicit FinanceEngine(SimulationParams params);

    std::vector<MonthResult> runSimulation() const;

private:
    SimulationParams params_;
};

SimulationParams defaultPhase1Params();
SimulationParams loadParamsFromJsonFile(const std::string& path);

} // namespace sovereign
