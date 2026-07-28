#!/usr/bin/env python3

import json
import subprocess
import sys
import unittest
from pathlib import Path

PROJECT = Path(__file__).resolve().parents[1]


class PipelineV3Test(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        subprocess.run(
            [sys.executable, "data_pipeline/generate_demo_data_v3.py"],
            cwd=PROJECT,
            check=True,
            capture_output=True,
            text=True,
        )
        subprocess.run(
            [sys.executable, "data_pipeline/run_pipeline_v3.py"],
            cwd=PROJECT,
            check=True,
            capture_output=True,
            text=True,
        )
        cls.snapshot = json.loads(
            (PROJECT / "app/data/dashboard-v3.json").read_text(encoding="utf-8")
        )

    def test_snapshot_has_two_reconciling_paths(self) -> None:
        current = self.snapshot["input"]["current"]
        traffic_revenue = (
            current["monetizableVv"] * current["adLoad"] * current["eCpm"] / 1000
        )
        gmv_revenue = current["gmv"] * (current["revenue"] / current["gmv"])
        self.assertAlmostEqual(current["revenue"], traffic_revenue, places=4)
        self.assertAlmostEqual(current["revenue"], gmv_revenue, places=4)

    def test_snapshot_is_demo_and_has_no_forbidden_business_fields(self) -> None:
        text = json.dumps(self.snapshot, ensure_ascii=False).lower()
        self.assertEqual(self.snapshot["input"]["classification"], "demo")
        for field in (
            "monthly_budget",
            "time_phased_budget",
            "budget_attainment",
            "forecast_vs_budget",
            "merchant_budget",
            "budget_utilization",
        ):
            self.assertNotIn(f'"{field}"', text)

    def test_registry_has_explicit_grain_and_keys(self) -> None:
        for profile in self.snapshot["input"]["profiles"]:
            self.assertTrue(profile["timeGrain"])
            self.assertTrue(profile["primaryKeyColumns"])
            self.assertIn("dimensionGrain", profile)


if __name__ == "__main__":
    unittest.main()
