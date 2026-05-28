# Legacy Wealth Math

This document identifies the wealth math that already exists in the legacy HTML dashboard and explains how it should be ported into the C++ core.

The goal is not to redesign these formulas from scratch. The goal is to extract, name, test, and stabilize the behavior that already works in the dashboard.

## Legacy Source Of Truth

Legacy implementation:

```text
../sovereign_wealth_console/index.html
```

Important legacy functions:

- `simForecast(S, retOverride, essInfOverride, discInfOverride, isMC=false)`
- `calculateVnPit(wage)`
- `renderMC()`
- `renderHousing()`
- `updateLevArbitrage()`

Important legacy state object:

```text
const S = {
  initInv,
  years,
  wage,
  wageGrow,
  ess,
  disc,
  emFund,
  ret,
  eqPct,
  essInf,
  discInf,
  vndDep,
  taxOn,
  taxMode,
  taxRate,
  cgtRate,
  retSd,
  infSd,
  nSims,
  housingOn,
  houseYear,
  txCost,
  hPrice,
  down,
  mortRate,
  mortTerm,
  propGrow,
  maint,
  rent,
  rentGrow,
  leverageOn,
  levYear,
  loanAmt,
  levRate,
  levTerm,
  swr,
  fireSpend,
  kids,
  kidCost,
  kidEd,
  kidYear,
  events
}
```

## Porting Principle

For wealth logic, the C++ implementation should match the legacy dashboard first. Improvements can happen later, but only after the matching behavior is tested and documented.

Porting order:

1. Extract one formula or behavior from the dashboard.
2. Write a C++ test vector that locks the expected output.
3. Implement the formula in the owning C++ module.
4. Compare C++ output against dashboard output.
5. Document any deliberate difference.

## Core Math Already Ported Or Being Ported

The initial legacy port covers the smallest useful subset of `simForecast`.

### Annual Return To Monthly Return

Legacy formula:

```text
mRet = (1 + ret)^(1 / 12) - 1
```

Inputs:

- `ret`: annual return as a decimal

Example:

```text
ret = 12% -> mRet = (1.12)^(1 / 12) - 1
```

### Monthly Portfolio Compounding

Legacy behavior:

```text
inv = inv * (1 + currentMRet)
```

The C++ port uses deterministic return only, without contributions, taxes, housing, leverage, inflation, kids, or events.

Baseline test vector:

```text
initInv = 1000
years = 20
ret = 12
expected final net worth = 9646.293093274
```

## Wealth Math Still To Port From Legacy Dashboard

These are not new ideas. They already exist in the dashboard and need to be migrated carefully.

## Wage Growth

Legacy formula:

```text
mWageGrow = (1 + wageGrow / 100)^(1 / 12) - 1
rw = wage * (1 + mWageGrow)^(month - 1)
```

Port target:

```text
cpp_core/src/wealth/
```

Required tests:

- wage with 0% growth remains constant
- wage with positive growth matches dashboard monthly values
- wage growth does not affect deterministic compounding unless contributions are enabled

## Income Tax

Legacy function:

```text
calculateVnPit(wage)
```

Legacy brackets:

| Monthly Wage Band | Rate |
| --- | --- |
| first 5 | 5% |
| next 5 | 10% |
| next 8 | 15% |
| next 14 | 20% |
| next 20 | 25% |
| next 28 | 30% |
| remainder | 35% |

Port target:

```text
cpp_core/src/wealth/
```

Required tests:

- each bracket boundary
- wage above all brackets
- tax disabled
- flat tax mode
- auto VN tax mode

## Spending And Savings

Legacy behavior:

```text
nw = rawWage - pit
intendedSpend = ess + disc + housingCost + kidSpend
maxPossibleSpend = nw + max(0, inv)
spend = min(intendedSpend, maxPossibleSpend)
save = nw - spend
inv = inv + save + lump - uniLump
```

Port target:

```text
cpp_core/src/wealth/
```

Required tests:

- spending below after-tax wage
- spending above after-tax wage with positive portfolio
- spending above after-tax wage with empty portfolio
- negative savings months

## Inflation And Currency Drag

Legacy behavior:

```text
infDrag = (1 + mEssInf) * (1 + mVndDep) - 1
ess = ess0 * (1 + infDrag)^(month - 1)
disc = disc0 * (1 + discDrag)^(month - 1)
```

Port target:

```text
cpp_core/src/wealth/
```

Required tests:

- zero inflation and zero depreciation
- positive inflation only
- positive depreciation only
- combined inflation and depreciation

## Mortgage Payment

Legacy formula:

```text
payment = loan * (monthlyRate * (1 + monthlyRate)^n) / ((1 + monthlyRate)^n - 1)
```

Fallback when rate is zero:

```text
payment = loan / n
```

Port target:

```text
cpp_core/src/wealth/
```

Required tests:

- zero-rate mortgage
- positive-rate mortgage
- final balance reaches zero
- principal increases over time
- interest decreases over time

## Housing Equity

Legacy behavior:

```text
currentHouseVal = price * (1 + propGrow / 100 / 12)^(month - houseMonth)
houseEquity = currentHouseVal - mortgageBalance
netWorth = portfolio + houseEquity - leverageLoanBalance
```

Required tests:

- no housing
- house purchase month
- mortgage balance decline
- maintenance cost
- property growth

## Leverage Loan

Legacy behavior:

```text
if leverage starts:
  inv += loanAmount
  loanBal = loanAmount

while loanBal > 0:
  levInt = loanBal * monthlyLeverageRate
  levPrin = min(levPayment - levInt, loanBal)
  loanBal -= levPrin
  housingCost += levPayment
```

Legacy arbitrage display:

```text
arbitrage = expectedReturn - leverageRate
```

Required tests:

- loan starts at configured month
- loan increases investable capital
- loan balance amortizes
- outstanding loan reduces net worth
- positive and negative arbitrage spread

## Capital Gains Tax

Legacy behavior:

```text
rawGain = invAfterReturn - invBeforeReturn
accumulatedGainsYear += max(0, rawGain)

if month is year end:
  cgt = accumulatedGainsYear * cgtRate
  inv -= cgt
  accumulatedGainsYear = 0
```

Required tests:

- no gains means no capital gains tax
- gains accumulate through the year
- tax applies at year end
- accumulated gains reset after tax

## Monte Carlo

Legacy behavior:

```text
mSd = (retSd / 100) / sqrt(12)
currentMRet = mRet + randn() * mSd
```

Legacy annual randomization in `renderMC()` also varies:

- annual return
- essential inflation
- discretionary inflation

Required tests:

- deterministic seed support in C++
- stable percentile output for fixed seed
- P10, P50, P90 are ordered correctly
- negative-return cases are handled

## C++ Module Plan

Recommended wealth module split:

```text
cpp_core/src/wealth/
  finance_engine.cpp
  param_loader.cpp
  rates.hpp
  tax.hpp
  spending.hpp
  mortgage.hpp
  leverage.hpp
  monte_carlo.hpp
```

Recommended tests:

```text
cpp_core/test/
  phase1_compounding_test.cpp
  wealth_tax_test.cpp
  wealth_spending_test.cpp
  wealth_mortgage_test.cpp
  wealth_leverage_test.cpp
  wealth_monte_carlo_test.cpp
```

## Port Completion Definition

A legacy math feature is considered ported only when:

- C++ code exists in the owning module
- unit tests cover normal and boundary cases
- at least one dashboard comparison vector is recorded
- docs name the source legacy behavior
- any intentional difference from the dashboard is documented
