#!/usr/bin/env python3
"""
Structural contract test for 9Router AI Code Review Workflow.
Validates workflow permissions, triggers, guards, bounded diffs, and SDK usage offline.
"""
import ast
import os
import re
import subprocess
import sys
import tempfile
import unittest
import yaml

WORKFLOW_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    ".github",
    "workflows",
    "nine-router-review.yml",
)

class TestNineRouterReviewWorkflowStructure(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        assert os.path.exists(WORKFLOW_PATH), f"Workflow file missing: {WORKFLOW_PATH}"
        unittest.TestCase().assertTrue(os.path.exists(WORKFLOW_PATH), f"Workflow file missing: {WORKFLOW_PATH}")
        with open(WORKFLOW_PATH, "r", encoding="utf-8") as f:
            cls.raw_yaml = f.read()
        cls.doc = yaml.safe_load(cls.raw_yaml)

    def test_workflow_dispatch_trigger_only(self):
        """Workflow must be strictly manual: workflow_dispatch only, no push or pull_request."""
        triggers = self.doc.get("on") if "on" in self.doc else self.doc.get(True)
        self.assertIsInstance(triggers, dict)
        self.assertEqual(list(triggers.keys()), ["workflow_dispatch"])
        inputs = triggers["workflow_dispatch"].get("inputs", {})
        self.assertIn("base_sha", inputs)
        self.assertTrue(inputs["base_sha"].get("required"))

    def test_least_privilege_permissions(self):
        """Must have read-only permissions: contents: read only."""
        permissions = self.doc.get("permissions")
        self.assertEqual(permissions, {"contents": "read"})

    def test_steps_guards_and_execution(self):
        """Verify guards, bounded diff limits, pinned SDK, and inline python compilation."""
        jobs = self.doc.get("jobs", {})
        self.assertIn("review", jobs)
        self.assertEqual(jobs["review"].get("timeout-minutes"), 5)
        steps = jobs["review"].get("steps", [])

        # 1. Default branch guard: env variables, full ref + ref_type check, no direct github.* interpolation
        branch_step = next((s for s in steps if "Default Branch" in s.get("name", "")), None)
        self.assertIsNotNone(branch_step)
        branch_env = branch_step.get("env", {})
        self.assertIn("EVENT_DEFAULT_BRANCH", branch_env)
        self.assertIn("REF", branch_env)
        self.assertIn("REF_TYPE", branch_env)
        self.assertNotIn("${{ github.", branch_step["run"])
        self.assertIn("refs/heads/", branch_step["run"])
        self.assertIn("exit 1", branch_step["run"])

        # 2. Checkout step with persist-credentials: false
        checkout_step = next((s for s in steps if "Checkout" in s.get("name", "")), None)
        self.assertIsNotNone(checkout_step)
        with_clause = checkout_step.get("with", {})
        self.assertEqual(with_clause.get("fetch-depth"), 0)
        self.assertFalse(with_clause.get("persist-credentials"))

        # 3. 40-hex SHA validation, reachable commit check, and merge-base ancestor check
        sha_step = next((s for s in steps if "Base Commit SHA" in s.get("name", "")), None)
        self.assertIsNotNone(sha_step)
        self.assertIn("^[0-9a-fA-F]{40}$", sha_step["run"])
        self.assertIn("git cat-file -e", sha_step["run"])
        self.assertIn("git merge-base --is-ancestor", sha_step["run"])

        # 4. Bounded diff check (fails if oversized, no truncation, no-pager/ext-diff/textconv)
        diff_step = next((s for s in steps if "Bounded Diff" in s.get("name", "")), None)
        self.assertIsNotNone(diff_step)
        self.assertIn("MAX_DIFF_BYTES", diff_step["run"])
        self.assertIn("--no-pager diff --no-ext-diff --no-textconv", diff_step["run"])
        self.assertIn("candidate.diff", diff_step["run"])
        self.assertIn("exit 1", diff_step["run"])

        # 5. Pinned official Anthropic SDK installation
        install_step = next((s for s in steps if "Install Official" in s.get("name", "")), None)
        self.assertIsNotNone(install_step)
        self.assertRegex(install_step["run"], r"pip install anthropic==[0-9\.]+")

        # 6. Review execution step and inline Python validation
        review_step = next((s for s in steps if "Execute Gated Review" in s.get("name", "")), None)
        self.assertIsNotNone(review_step)
        env = review_step.get("env", {})
        self.assertEqual(env.get("NINE_ROUTER_API_KEY"), "${{ secrets.NINE_ROUTER_API_KEY }}")
        self.assertEqual(env.get("NINE_ROUTER_BASE_URL"), "${{ vars.NINE_ROUTER_BASE_URL }}")
        self.assertEqual(env.get("NINE_ROUTER_REVIEW_MODEL"), "${{ vars.NINE_ROUTER_REVIEW_MODEL }}")

        # Extract inline python script from EOF block
        match = re.search(r"python3 - << 'EOF'\n(.*?)\nEOF", review_step["run"], re.DOTALL)
        self.assertIsNotNone(match, "Inline python script not found in execution step")
        py_code = match.group(1)

        # Compile Python AST locally (ensures 0 syntax errors offline)
        parsed_ast = ast.parse(py_code)
        self.assertIsInstance(parsed_ast, ast.Module)

        # Inspect security invariants in Python code
        self.assertIn("import anthropic", py_code)
        self.assertIn("urllib.parse.urlparse", py_code)
        self.assertIn('parsed.scheme != "https"', py_code)
        self.assertIn("not parsed.hostname", py_code)
        self.assertIn("parsed.username or parsed.password", py_code)
        self.assertIn("parsed.query or parsed.fragment", py_code)
        self.assertIn("max_retries=0", py_code)
        self.assertIn("timeout=30.0", py_code)
        self.assertIn('stop_reason", None) != "end_turn"', py_code)
        self.assertIn("review_summary.txt", py_code)

    def test_default_branch_guard_probe(self):
        """Execution probe: verify default branch guard passes for default branch, rejects other branches and tags."""
        steps = self.doc["jobs"]["review"]["steps"]
        branch_step = next(s for s in steps if "Default Branch" in s.get("name", ""))
        run_script = branch_step["run"]

        # 1. Matching default branch should pass (exit 0)
        res_ok = subprocess.run(
            ["bash", "-c", run_script],
            env={**os.environ, "EVENT_DEFAULT_BRANCH": "main", "REF": "refs/heads/main", "REF_TYPE": "branch"},
            capture_output=True,
            text=True,
        )
        self.assertEqual(res_ok.returncode, 0, f"Expected valid default branch to pass: {res_ok.stderr}")

        # 2. Mismatched branch should be rejected (exit 1)
        res_diff_branch = subprocess.run(
            ["bash", "-c", run_script],
            env={**os.environ, "EVENT_DEFAULT_BRANCH": "main", "REF": "refs/heads/feature", "REF_TYPE": "branch"},
            capture_output=True,
            text=True,
        )
        self.assertNotEqual(res_diff_branch.returncode, 0, "Non-default branch must be rejected")

        # 3. Tag with same name as default branch ('main') MUST be rejected (exit 1)
        res_same_name_tag = subprocess.run(
            ["bash", "-c", run_script],
            env={**os.environ, "EVENT_DEFAULT_BRANCH": "main", "REF": "refs/tags/main", "REF_TYPE": "tag"},
            capture_output=True,
            text=True,
        )
        self.assertNotEqual(res_same_name_tag.returncode, 0, "Tag with same name as default branch must be rejected")

        # 4. Any other tag must be rejected (exit 1)
        res_tag = subprocess.run(
            ["bash", "-c", run_script],
            env={**os.environ, "EVENT_DEFAULT_BRANCH": "main", "REF": "refs/tags/v1.0.0", "REF_TYPE": "tag"},
            capture_output=True,
            text=True,
        )
        self.assertNotEqual(res_tag.returncode, 0, "Tag ref must be rejected")

    def test_sha_and_diff_execution_probes(self):
        """Real git execution probe: valid ancestor passes, existing nonancestor rejected, malformed SHA rejected, oversize diff rejected."""
        steps = self.doc["jobs"]["review"]["steps"]
        sha_step = next(s for s in steps if "Base Commit SHA" in s.get("name", ""))
        diff_step = next(s for s in steps if "Bounded Diff" in s.get("name", ""))

        tmpfs_parent = "/dev/shm" if os.path.exists("/dev/shm") else None
        with tempfile.TemporaryDirectory(dir=tmpfs_parent) as td:
            subprocess.run(["git", "init", "-b", "main"], cwd=td, check=True, capture_output=True)
            subprocess.run(["git", "config", "user.name", "Tester"], cwd=td, check=True)
            subprocess.run(["git", "config", "user.email", "test@example.com"], cwd=td, check=True)

            # Commit A (base)
            with open(os.path.join(td, "file.txt"), "w") as f:
                f.write("base content\n")
            subprocess.run(["git", "add", "file.txt"], cwd=td, check=True)
            subprocess.run(["git", "commit", "-m", "A"], cwd=td, check=True, capture_output=True)
            commit_a = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=td, text=True).strip()

            # Commit B (main HEAD)
            with open(os.path.join(td, "file.txt"), "a") as f:
                f.write("added line\n")
            subprocess.run(["git", "add", "file.txt"], cwd=td, check=True)
            subprocess.run(["git", "commit", "-m", "B"], cwd=td, check=True, capture_output=True)
            commit_b = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=td, text=True).strip()

            # Divergent Commit C branched from A (exists in repo, but NOT ancestor of main HEAD)
            subprocess.run(["git", "checkout", "-b", "divergent", commit_a], cwd=td, check=True, capture_output=True)
            with open(os.path.join(td, "divergent.txt"), "w") as f:
                f.write("divergent line\n")
            subprocess.run(["git", "add", "divergent.txt"], cwd=td, check=True)
            subprocess.run(["git", "commit", "-m", "C"], cwd=td, check=True, capture_output=True)
            commit_c = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=td, text=True).strip()

            # Switch back to main (HEAD = commit B)
            subprocess.run(["git", "checkout", "main"], cwd=td, check=True, capture_output=True)

            # Probe 1: Valid ancestor passes
            r_valid = subprocess.run(
                ["bash", "-c", sha_step["run"]],
                cwd=td,
                env={**os.environ, "BASE_SHA": commit_a},
                capture_output=True,
                text=True,
            )
            self.assertEqual(r_valid.returncode, 0, f"Valid ancestor unexpectedly rejected: {r_valid.stderr}")

            # Probe 2: Existing nonancestor rejected (cat-file succeeds, but merge-base --is-ancestor fails)
            r_nonancestor = subprocess.run(
                ["bash", "-c", sha_step["run"]],
                cwd=td,
                env={**os.environ, "BASE_SHA": commit_c},
                capture_output=True,
                text=True,
            )
            self.assertNotEqual(r_nonancestor.returncode, 0, "Existing nonancestor commit must be rejected")

            # Probe 3: Malformed SHA rejected
            r_malformed = subprocess.run(
                ["bash", "-c", sha_step["run"]],
                cwd=td,
                env={**os.environ, "BASE_SHA": "not-a-valid-sha"},
                capture_output=True,
                text=True,
            )
            self.assertNotEqual(r_malformed.returncode, 0, "Malformed SHA must be rejected")

            # Probe 4: 40-hex non-existent SHA rejected
            r_nonexistent = subprocess.run(
                ["bash", "-c", sha_step["run"]],
                cwd=td,
                env={**os.environ, "BASE_SHA": "0" * 40},
                capture_output=True,
                text=True,
            )
            self.assertNotEqual(r_nonexistent.returncode, 0, "Unreachable 40-hex SHA must be rejected")

            # Probe 5: Normal bounded diff passes
            r_diff_ok = subprocess.run(
                ["bash", "-c", diff_step["run"]],
                cwd=td,
                env={**os.environ, "BASE_SHA": commit_a, "MAX_DIFF_BYTES": "65536"},
                capture_output=True,
                text=True,
            )
            self.assertEqual(r_diff_ok.returncode, 0, f"Normal diff rejected: {r_diff_ok.stderr}")
            self.assertTrue(os.path.exists(os.path.join(td, "candidate.diff")))

            # Probe 6: Oversize diff rejected (fails closed without truncation)
            with open(os.path.join(td, "oversize.txt"), "w") as f:
                f.write("Z" * 70000)
            subprocess.run(["git", "add", "oversize.txt"], cwd=td, check=True)
            subprocess.run(["git", "commit", "-m", "oversize"], cwd=td, check=True, capture_output=True)

            r_diff_over = subprocess.run(
                ["bash", "-c", diff_step["run"]],
                cwd=td,
                env={**os.environ, "BASE_SHA": commit_a, "MAX_DIFF_BYTES": "65536"},
                capture_output=True,
                text=True,
            )
            self.assertNotEqual(r_diff_over.returncode, 0, "Oversized diff must fail closed")

if __name__ == "__main__":
    unittest.main()
