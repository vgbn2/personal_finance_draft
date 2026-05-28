---
name: cpp-standards
description: Enforce C++ institutional-grade memory safety and coding standards.
---
# C++ Institutional Standard Skill

Use this skill when modifying `cpp_core/` to ensure adherence to our safety protocols.

## Principles
- No raw `new`/`delete`; use smart pointers (`std::unique_ptr`, `std::shared_ptr`).
- No unchecked data access; always validate ranges in data contracts.
- Explicit memory alignment where performance is critical.
- Strict error checking on external data streams.
