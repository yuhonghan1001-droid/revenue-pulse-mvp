#!/usr/bin/env python3

import importlib.util
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

PROJECT = Path(__file__).resolve().parents[1]
PATH = PROJECT / "data_pipeline/time_audit_v3.py"
SPEC = importlib.util.spec_from_file_location("time_audit_v3", PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(MODULE)


class TimeAuditV3Test(unittest.TestCase):
    def test_schedule_is_beijing_0945(self) -> None:
        now = datetime(2026, 7, 28, 2, 0, tzinfo=timezone.utc)
        self.assertEqual(MODULE.scheduled_iso(now), "2026-07-28T09:45:00+08:00")

    def test_all_timestamps_are_explicit_and_feishu_stays_empty(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "audit.json"
            payload = MODULE.update("start", path)
            payload = MODULE.update("pipeline", path)
            payload = MODULE.update("analysis", path)
            payload = MODULE.update("complete", path)
            self.assertIsNotNone(payload["scheduled_at"])
            self.assertIsNotNone(payload["started_at"])
            self.assertIsNotNone(payload["pipeline_finished_at"])
            self.assertIsNotNone(payload["analysis_finished_at"])
            self.assertIsNone(payload["feishu_sent_at"])
            self.assertIsNotNone(payload["completed_at"])


if __name__ == "__main__":
    unittest.main()
