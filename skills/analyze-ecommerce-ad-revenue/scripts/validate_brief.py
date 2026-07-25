#!/usr/bin/env python3
"""校验广告收入经营简报是否满足最低控制要求。"""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path
from typing import Any


ALLOWED_AUDIENCES = {"finance_bp", "business_owner", "finance_leader", "executive"}
ALLOWED_DECISIONS = {"no_action", "watch", "action"}
ALLOWED_QUALITY = {"pass", "warn", "fail"}
ALLOWED_CLAIMS = {"fact", "forecast", "judgment", "risk"}
ALLOWED_CONFIDENCE = {"low", "medium", "high"}
REQUIRED_METRICS = {
    "actual_net_revenue",
    "yoy_growth_pct",
    "budget_attainment_pct",
    "month_end_forecast",
    "forecast_vs_budget_pct",
}
QUALITY_FIELDS = {
    "freshness_pct",
    "completeness_pct",
    "uniqueness_pct",
    "join_success_pct",
}


def is_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def validate(data: Any) -> tuple[list[str], list[str]]:
    errors: list[str] = []
    warnings: list[str] = []

    if not isinstance(data, dict):
        return ["JSON 根节点必须是对象。"], warnings

    for field in ("as_of", "audience", "decision_status", "data_quality", "metrics", "claims", "drivers", "actions", "known_gaps"):
        if field not in data:
            errors.append(f"缺少必填字段：{field}")

    if data.get("audience") not in ALLOWED_AUDIENCES:
        errors.append(f"audience 必须是以下值之一：{', '.join(sorted(ALLOWED_AUDIENCES))}")
    if data.get("decision_status") not in ALLOWED_DECISIONS:
        errors.append(f"decision_status 必须是以下值之一：{', '.join(sorted(ALLOWED_DECISIONS))}")

    quality = data.get("data_quality")
    if isinstance(quality, dict):
        status = quality.get("status")
        if status not in ALLOWED_QUALITY:
            errors.append(f"data_quality.status 必须是以下值之一：{', '.join(sorted(ALLOWED_QUALITY))}")
        for field in QUALITY_FIELDS:
            value = quality.get(field)
            if not is_number(value) or not 0 <= value <= 100:
                errors.append(f"data_quality.{field} 必须是 0 到 100 之间的数字")
        if not isinstance(quality.get("blockers"), list):
            errors.append("data_quality.blockers 必须是数组")
        if status == "fail" and data.get("decision_status") != "watch":
            errors.append("数据质量失败时，decision_status 必须设为 watch")
        if status != "pass" and not data.get("limitations"):
            errors.append("数据质量未通过时，必须填写至少一项 limitation")
    elif "data_quality" in data:
        errors.append("data_quality 必须是对象")

    metrics = data.get("metrics")
    if isinstance(metrics, dict):
        missing_metrics = sorted(REQUIRED_METRICS - metrics.keys())
        if missing_metrics:
            errors.append(f"缺少受治理指标：{', '.join(missing_metrics)}")
        for metric_id, metric in metrics.items():
            if not isinstance(metric, dict):
                errors.append(f"metrics.{metric_id} 必须是对象")
                continue
            if not is_number(metric.get("value")):
                errors.append(f"metrics.{metric_id}.value 必须是有限数字")
            if not metric.get("unit"):
                errors.append(f"metrics.{metric_id}.unit 为必填项")
            if not isinstance(metric.get("source_ids"), list) or not metric.get("source_ids"):
                errors.append(f"metrics.{metric_id}.source_ids 必须是非空数组")
    elif "metrics" in data:
        errors.append("metrics 必须是对象")

    claims = data.get("claims")
    claim_types: set[str] = set()
    if isinstance(claims, list) and claims:
        for index, claim in enumerate(claims):
            prefix = f"claims[{index}]"
            if not isinstance(claim, dict):
                errors.append(f"{prefix} 必须是对象")
                continue
            claim_type = claim.get("type")
            claim_types.add(claim_type)
            if claim_type not in ALLOWED_CLAIMS:
                errors.append(f"{prefix}.type 必须是以下值之一：{', '.join(sorted(ALLOWED_CLAIMS))}")
            if not claim.get("text"):
                errors.append(f"{prefix}.text 为必填项")
            if not isinstance(claim.get("evidence_refs"), list) or not claim.get("evidence_refs"):
                errors.append(f"{prefix}.evidence_refs 必须是非空数组")
            if not isinstance(claim.get("source_ids"), list) or not claim.get("source_ids"):
                errors.append(f"{prefix}.source_ids 必须是非空数组")
            if claim.get("confidence") not in ALLOWED_CONFIDENCE:
                errors.append(f"{prefix}.confidence 必须是以下值之一：{', '.join(sorted(ALLOWED_CONFIDENCE))}")
    elif "claims" in data:
        errors.append("claims 必须是非空数组")
    if claims and "fact" not in claim_types:
        warnings.append("简报中没有 fact 类型结论")
    if claims and "forecast" not in claim_types:
        warnings.append("简报中没有 forecast 类型结论")

    drivers = data.get("drivers")
    if isinstance(drivers, dict):
        for direction in ("positive", "negative"):
            if not isinstance(drivers.get(direction), list):
                errors.append(f"drivers.{direction} 必须是数组")
        if "unexplained_residual" not in drivers or not is_number(drivers.get("unexplained_residual")):
            errors.append("drivers.unexplained_residual 必须是有限数字")
    elif "drivers" in data:
        errors.append("drivers 必须是对象")

    actions = data.get("actions")
    if isinstance(actions, list):
        for index, action in enumerate(actions):
            prefix = f"actions[{index}]"
            if not isinstance(action, dict):
                errors.append(f"{prefix} 必须是对象")
                continue
            for field in ("action", "owner", "due_date", "trigger"):
                if not action.get(field):
                    errors.append(f"{prefix}.{field} 为必填项")
    elif "actions" in data:
        errors.append("actions 必须是数组")

    if isinstance(data.get("known_gaps"), list) is False and "known_gaps" in data:
        errors.append("known_gaps 必须是数组")

    if "forecast" in claim_types:
        assumptions = data.get("forecast_assumptions")
        if not isinstance(assumptions, list) or not assumptions:
            errors.append("存在 forecast 类型结论时，forecast_assumptions 必须为非空数组")

    return errors, warnings


def main() -> int:
    if len(sys.argv) != 2:
        print("用法：validate_brief.py 简报.json", file=sys.stderr)
        return 2

    path = Path(sys.argv[1])
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        print(f"错误：找不到文件：{path}", file=sys.stderr)
        return 2
    except json.JSONDecodeError as exc:
        print(f"错误：JSON 格式无效：{exc}", file=sys.stderr)
        return 2

    errors, warnings = validate(data)
    for warning in warnings:
        print(f"警告：{warning}")
    for error in errors:
        print(f"错误：{error}")

    if errors:
        print(f"校验失败：{len(errors)} 项错误，{len(warnings)} 项警告")
        return 1

    print(f"校验通过：0 项错误，{len(warnings)} 项警告")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
