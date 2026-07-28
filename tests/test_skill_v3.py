#!/usr/bin/env python3

import importlib.util
import json
import unittest
from pathlib import Path

PROJECT = Path(__file__).resolve().parents[1]
VALIDATOR_PATH = (
    PROJECT / "skills/analyze-ecommerce-ad-revenue/scripts/validate_brief.py"
)
SPEC = importlib.util.spec_from_file_location("validate_brief_v3", VALIDATOR_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(MODULE)


class SkillV3Test(unittest.TestCase):
    def test_valid_fixture_passes(self) -> None:
        data = json.loads(
            (PROJECT / "tests/fixtures/revenue-v3-brief-valid.json").read_text(
                encoding="utf-8"
            )
        )
        errors, _ = MODULE.validate(data)
        self.assertEqual(errors, [])

    def test_real_result_cannot_be_public(self) -> None:
        data = json.loads(
            (PROJECT / "tests/fixtures/revenue-v3-brief-valid.json").read_text(
                encoding="utf-8"
            )
        )
        data["classification"] = "real"
        data["public"] = True
        errors, _ = MODULE.validate(data)
        self.assertTrue(any("不能标记为公开" in error for error in errors))

    def test_forbidden_field_is_rejected_recursively(self) -> None:
        data = json.loads(
            (PROJECT / "tests/fixtures/revenue-v3-brief-valid.json").read_text(
                encoding="utf-8"
            )
        )
        data["metrics"]["merchant_budget"] = {"value": 1}
        errors, _ = MODULE.validate(data)
        self.assertTrue(any("不接受该字段" in error for error in errors))


if __name__ == "__main__":
    unittest.main()
