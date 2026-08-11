# Code Atlas

The Code Atlas is the source-linked engineering study layer. It records mechanisms that engineers must understand before safely changing the system.

## Sections

- [Algorithms](algorithms/) — equations, pseudocode, invariants, complexity, and numerical behavior.
- [Structures](structures/) — schemas, state ownership, mutation, persistence, concurrency, and recovery.
- [Protocols](protocols/) — participants, message shapes, sequencing, errors, retries, and compatibility.
- [Topology](topology/) — entrypoints, dependency direction, I/O boundaries, adapters, and failure domains.

## Record Contract

Every record has a globally unique `atlas.<kind>.<domain>.<name>` identifier, one canonical source owner, focused tests or an explicit reviewed exception, review triggers, and honest revision evidence.

`revision: working-tree` means the record was checked against uncommitted source based on `base_commit`; it must not be described as committed-archive proof. A commit hash means only that the source snapshot was reviewed, not that every runtime boundary was qualified.

Module pages link to Atlas records for detail. Research pages own theory. Architecture decisions own why a consequential choice was made. Workspace records own active evidence and lifecycle state. None should copy the Atlas body.