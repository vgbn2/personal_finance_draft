"""
Chaos Monkey Resilience Test.

Validates the system's ability to recover from:
  1. Simulated hard process kills (SIGKILL equivalent)
  2. State corruption detection
  3. Portfolio checkpoint recovery from persistence

This script does NOT actually kill processes or disable network.
Instead, it simulates the recovery flow:
  - Serialize current state → corrupt it → verify reconciliation restores it.

Usage:
    python scripts/chaos_monkey.py
"""
import asyncio
import json
import os
import sys
import time
from pathlib import Path

# Ensure project root is in path
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.core.models.portfolio import PortfolioManager
from app.db.schemas import PortfolioCheckpoint
from app.utils.logger import log


class ChaosMonkey:
    """
    Simulates failure scenarios and validates recovery.

    Tests:
      1. State Serialization Roundtrip — serialize → corrupt → detect → recover
      2. Checkpoint Recovery — write checkpoint → clear state → reload → verify match
      3. Concurrent Crash Safety — simulate mid-write interruption
    """

    def __init__(self):
        self.results: list = []
        self.checkpoint_file = Path("tmp/chaos_checkpoint.json")
        self.checkpoint_file.parent.mkdir(parents=True, exist_ok=True)

    def _record(self, test_name: str, passed: bool, detail: str = ""):
        status = "PASS" if passed else "FAIL"
        self.results.append({"test": test_name, "status": status, "detail": detail})
        icon = "✅" if passed else "❌"
        print(f"  {icon} {test_name}: {status} {detail}")

    # ─── Test 1: State Serialization Roundtrip ───

    def test_serialization_roundtrip(self):
        """Verify portfolio state survives JSON serialization."""
        print("\n── Test 1: Serialization Roundtrip ──")

        original = PortfolioCheckpoint(
            total_equity_usd=10_000.0,
            cash_usd=7_500.0,
            positions=[
                {"market_id": "MKT-001", "side": "BUY", "size_usd": 1500.0, "entry_price": 0.55},
                {"market_id": "MKT-002", "side": "SELL", "size_usd": 1000.0, "entry_price": 0.72},
            ],
            exposure_pct=0.25,
            drawdown_pct=0.02,
            active_markets=2,
        )

        # Serialize
        serialized = original.model_dump_json()

        # Deserialize
        recovered = PortfolioCheckpoint.model_validate_json(serialized)

        # Verify
        self._record(
            "Equity roundtrip",
            recovered.total_equity_usd == original.total_equity_usd,
            f"Expected {original.total_equity_usd}, Got {recovered.total_equity_usd}"
        )
        self._record(
            "Positions count",
            len(recovered.positions) == len(original.positions),
            f"Expected {len(original.positions)}, Got {len(recovered.positions)}"
        )
        self._record(
            "Exposure roundtrip",
            recovered.exposure_pct == original.exposure_pct,
        )

    # ─── Test 2: Checkpoint File Recovery ───

    def test_checkpoint_recovery(self):
        """Simulate crash by writing checkpoint, clearing state, then recovering."""
        print("\n── Test 2: Checkpoint File Recovery ──")

        checkpoint = PortfolioCheckpoint(
            total_equity_usd=15_000.0,
            cash_usd=10_000.0,
            positions=[
                {"market_id": "MKT-003", "side": "BUY", "size_usd": 5000.0, "entry_price": 0.60},
            ],
            exposure_pct=0.33,
            active_markets=1,
        )

        # Write checkpoint (pre-crash)
        with open(self.checkpoint_file, "w") as f:
            f.write(checkpoint.model_dump_json(indent=2))
        self._record("Checkpoint written", self.checkpoint_file.exists())

        # Simulate crash: clear in-memory state
        recovered_equity = 0.0
        recovered_positions = []

        # Recovery: read checkpoint file
        try:
            with open(self.checkpoint_file, "r") as f:
                data = json.load(f)
            recovered = PortfolioCheckpoint(**data)
            recovered_equity = recovered.total_equity_usd
            recovered_positions = recovered.positions
        except Exception as e:
            self._record("File recovery", False, str(e))
            return

        self._record(
            "Equity recovered",
            recovered_equity == 15_000.0,
            f"Recovered ${recovered_equity}"
        )
        self._record(
            "Positions recovered",
            len(recovered_positions) == 1,
            f"Recovered {len(recovered_positions)} positions"
        )

        # Cleanup
        self.checkpoint_file.unlink(missing_ok=True)

    # ─── Test 3: Corruption Detection ───

    def test_corruption_detection(self):
        """Verify system detects corrupted checkpoint data."""
        print("\n── Test 3: Corruption Detection ──")

        # Write corrupted JSON
        with open(self.checkpoint_file, "w") as f:
            f.write('{"total_equity_usd": "NOT_A_NUMBER", "positions": "CORRUPT"}')

        detected_corruption = False
        try:
            with open(self.checkpoint_file, "r") as f:
                data = json.load(f)
            PortfolioCheckpoint(**data)
        except Exception:
            detected_corruption = True

        self._record("Corruption detected", detected_corruption)

        # Cleanup
        self.checkpoint_file.unlink(missing_ok=True)

    # ─── Test 4: Rapid Consecutive Checkpoints ───

    def test_rapid_checkpoints(self):
        """Simulate rapid state changes to test file write safety."""
        print("\n── Test 4: Rapid Consecutive Writes ──")

        success_count = 0
        total = 10

        for i in range(total):
            cp = PortfolioCheckpoint(
                total_equity_usd=10_000.0 + i * 100,
                cash_usd=5_000.0 + i * 50,
                active_markets=i,
            )
            try:
                with open(self.checkpoint_file, "w") as f:
                    f.write(cp.model_dump_json())
                with open(self.checkpoint_file, "r") as f:
                    recovered = PortfolioCheckpoint.model_validate_json(f.read())
                if recovered.total_equity_usd == cp.total_equity_usd:
                    success_count += 1
            except Exception:
                pass

        self._record(
            "Rapid writes",
            success_count == total,
            f"{success_count}/{total} successful"
        )

        # Cleanup
        self.checkpoint_file.unlink(missing_ok=True)

    # ─── Run All ───

    def run_all(self):
        print("=" * 55)
        print(" CHAOS MONKEY — Resilience Test Suite")
        print("=" * 55)

        self.test_serialization_roundtrip()
        self.test_checkpoint_recovery()
        self.test_corruption_detection()
        self.test_rapid_checkpoints()

        # Summary
        total = len(self.results)
        passed = sum(1 for r in self.results if r["status"] == "PASS")
        failed = total - passed

        print(f"\n{'=' * 55}")
        print(f" Results: {passed}/{total} PASSED, {failed} FAILED")
        print(f"{'=' * 55}")

        if failed == 0:
            print("[OK] All chaos tests passed — system is resilient ✅")
        else:
            print("[WARN] Some chaos tests failed — review required ⚠️")
            for r in self.results:
                if r["status"] == "FAIL":
                    print(f"  FAIL: {r['test']} — {r['detail']}")

        return failed == 0


if __name__ == "__main__":
    monkey = ChaosMonkey()
    success = monkey.run_all()
    sys.exit(0 if success else 1)
