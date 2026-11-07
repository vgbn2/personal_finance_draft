# Workstation Memory, Swap, and Storage Topology

This document details the memory hierarchy, zram compressed RAM swap architecture, kernel paging configuration, and operational trade-offs for developers and quant researchers running Sovereign on local Linux workstations (`steamlinux`) and remote Proxmox LXC containers (`CT 114`).

---

## 1. Physical & Virtual Memory Topology

```text
+--------------------------------------------------------------------------+
|                          PHYSICAL RAM (27 GiB)                           |
|                                                                          |
|  +---------------------------+  +-------------------------------------+  |
|  | Active Applications       |  | /dev/zram0 (Compressed RAM Swap)    |  |
|  | - Node.js Workspaces      |  | - Virtual Size: 14.2 GiB            |  |
|  | - C++ Analytics Engine    |  | - Priority: 100 (Primary)           |  |
|  | - Heavy Dev / Game Tasks  |  | - Compression: LZ4 / ZSTD (~3:1)    |  |
|  | - Page Cache (Clean)      |  | - Physical RAM Footprint: ~1.5 GiB  |  |
|  +---------------------------+  +-------------------------------------+  |
+--------------------------------------------------------------------------+
                                     |
                     (Spillover on extreme pressure)
                                     v
+--------------------------------------------------------------------------+
|                          NVMe DISK SWAP (29.1 GiB)                       |
|  /dev/nvme0n1p3                                                          |
|  - Priority: -2 (Fallback only)                                          |
|  - Zero NVMe write wear under standard operational loads                 |
+--------------------------------------------------------------------------+
```

### Active System Metrics (Workstation)
- **Physical Memory**: 27 GiB Total, ~10 GiB Available.
- **Primary Swap (`/dev/zram0`)**: 14.2 GiB virtual partition with priority `100`. Inactive anonymous memory is compressed in-RAM using LZ4/ZSTD at typical 2.5:1 to 3:1 compression ratios. 4.5 GiB of inactive memory occupies only ~1.5 GiB of actual RAM.
- **Secondary Swap (`/dev/nvme0n1p3`)**: 29.1 GiB partition on NVMe SSD with priority `-2`. The kernel only routes writes here if `zram0` becomes completely saturated.
- **Swappiness (`/proc/sys/vm/swappiness`)**: Set to `10`. The kernel aggressively protects pagecache and only evicts anonymous pages when memory pressure genuinely demands it.

---

## 2. Why Manual Swap Flushing (`swapoff -a`) is Dangerous

A common anti-pattern is attempting to "clean" memory by invoking `swapoff -a` followed by `swapon -a`. In modern Linux memory architectures, this introduces severe hazards:

1. **Instant OOM Cascades**:
   - Running `swapoff -a` forces the kernel to decompress and copy every swapped page back into physical RAM synchronously.
   - If 4.7 GiB of swapped pages is suddenly shoved into an active 27 GiB system with only 9 GiB available, physical contiguous pages can be exhausted instantly.
   - The Linux Out-Of-Memory (OOM) Killer immediately fires, abruptly terminating long-running builds, Node.js daemons, database processes, or IDE sessions.

2. **Zero Permanent Benefit (Page Sloshing)**:
   - Once `swapon -a` is re-enabled, the kernel recognizes that those pages are still cold and inactive, promptly re-compressing and swapping them right back out.
   - The operation produces CPU spikes and bus congestion for zero lasting reduction in memory usage.

3. **Memory Leaks are in Userland, Not Swap**:
   - Swap does not create memory leaks; leaks originate from uncollected object references in user applications (e.g. unpruned event listeners in Node.js or unreleased heap in C++).
   - Swapping out leaked, dead memory is actually beneficial because it frees high-speed physical RAM for active hot execution paths.

---

## 3. Architecture Benefits & Drawbacks

### Key Benefits
- **Zero NVMe Wear**: Over 90% of all swap traffic never touches flash memory, preserving SSD endurance.
- **Microsecond Latency**: Page faults against `zram0` resolve in microseconds from RAM via CPU decompression rather than waiting milliseconds for NVMe I/O queues.
- **Effective RAM Expansion**: A 27 GiB workstation effectively gains ~10–12 GiB of additional virtual headroom for background compilation and large dataset backtesting.

### Engineering Drawbacks & Trade-offs
1. **CPU Overhead on Frequent Page Faults**:
   - Compressing and decompressing pages consumes CPU cycles.
   - If an application experiences thrashing (rapidly reading and writing pages in swap), the CPU spends measurable time in compression routines, creating minor latency jitter for sub-millisecond trading loops.
2. **Incompressible Data Penalty**:
   - High-entropy data (such as encrypted network payloads, compressed `.bin.gz` historical files, or raw float ML tensors) cannot be effectively compressed.
   - Incompressible pages yield near 1:1 storage, consuming precious physical RAM while still incurring CPU compression overhead.
3. **Hard Ceiling Exhaustion**:
   - `zram` is fundamentally bounded by physical RAM. It cannot create memory out of thin air.
   - If uncompressable active memory fills physical RAM, `zram` cannot compress further and the kernel must spill to NVMe or panic.
4. **Environment Divergence (Workstation vs Container)**:
   - The local workstation runs dual-tier `zram0` (Priority 100) + NVMe partition (Priority -2).
   - In contrast, Proxmox LXC containers (e.g., CT 114) operate under container cgroups where RAM (5 GiB) and swap (1 GiB) are assigned and managed directly by the Proxmox host kernel.

---

## 4. Operational Runbook: Memory & Swap Management

### 1. Inspection & Diagnostic Probes (Read-Only)
```bash
# Check overall RAM and swap capacity
free -h

# Inspect active swap devices, allocated sizes, and kernel priorities
cat /proc/swaps

# Inspect kernel swappiness policy (standard: 10)
cat /proc/sys/vm/swappiness

# List top 10 memory-consuming processes
ps aux --sort=-%mem | head -n 11
```

### 2. Targeted Remediation (Safe Mutation)
```bash
# Safely reclaim page cache, dentries, and inodes without forcing swap migration
sync; echo 1 | sudo tee /proc/sys/vm/drop_caches

# Safely terminate stale or orphaned background CLI/agent processes
pkill -f "strategy_interval_generator.*--interval" 2>/dev/null || true
```

### 3. Verification & Oracle Gate (Proof)
```bash
# Verify available memory is above 3.5 GiB
free -m | awk '/^Mem:/ { if ($7 > 3500) print "OK: Available memory healthy (" $7 " MB)"; else print "WARN: Low memory headroom (" $7 " MB)" }'
```

### 4. Rollback & Emergency Exit (Safety)
```bash
# If a specific leaking process approaches process heap limit, terminate it cleanly by PID
kill -15 <PID>
```
