# SPEC: Scaling & Performance Refinement

## Context
The current `PRICE_SCALE` is hardcoded at 100. For low-priced assets (e.g. $0.00123), this loses significant precision.

## Requirements
1. **Dynamic Scaling**: The system should support per-asset or per-market price scales.
2. **Aggregator Performance**: Review the `getAggregated` method in `aggregator.hpp` for bottlenecks (specifically the use of `std::map` inside the tight broadcast loop).
3. **RingBuffer Safety**: Ensure `RingBuffer` handles wrapping correctly without data loss under high load.

## Success Criteria
- [ ] Build succeeds.
- [ ] Precision preserved for assets < $0.01.
- [ ] `npm test` passes.
