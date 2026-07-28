#!/usr/bin/env python3
"""Validate a governed Revenue Pulse v3 brief."""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path
from typing import Any

ALLOWED_CLASSIFICATIONS = {"demo", "real"}
ALLOWED_BASIS = {
    "operating_ad_revenue",
    "advertiser_spend",
    "billable_amount",
    "financial_close_revenue",
    "other",
    "unconfirmed",
}
ALLOWED_STATUS = {
    "available",
    "warning",
    "unavailable",
    "pending_confirmation",
    "blocked",
}
ALLOWED_QUALITY = {"pass", "warn", "fail"}
ALLOWED_CLAIMS = {"fact", "observation", "pending_confirmation"}
REQUIRED_FIELDS = {
    "contract_version",
    "classification",
    "analysis_id",
    "as_of",
    "basis",
    "basis_label",
    "comparison_label",
    "quality_status",
    "metrics",
    "paths",
    "contribution_bridges",
    "claims",
    "known_gaps",
    "limitations",
    "review_status",
}
FORBIDDEN_FIELDS = {
    "monthly_budget",
    "time_phased_budget",
    "budget_attainment",
    "forecast_vs_budget",
    "merchant_budget",
    "budget_utilization",
}


def is_number(value: Any) -> bool:
    return (
        isinstance(value, (int, float))
        and not isinstance(value, bool)
        and math.isfinite(value)
    )


def find_forbidden(value: Any, path: str = "$") -> list[str]:
    errors: list[str] = []
    if isinstance(value, list):
        for index, item in enumerate(value):
            errors.extend(find_forbidden(item, f"{path}[{index}]"))
    elif isinstance(value, dict):
        for key, child in value.items():
            if key.lower() in FORBIDDEN_FIELDS:
                errors.append(f"{path}.{key}：v3 不接受该字段")
            errors.extend(find_forbidden(child, f"{path}.{key}"))
    return errors


def validate(data: Any) -> tuple[list[str], list[str]]:
    errors = find_forbidden(data)
    warnings: list[str] = []
    if not isinstance(data, dict):
        return errors + ["JSON 根节点必须是对象。"], warnings

    for field in sorted(REQUIRED_FIELDS - data.keys()):
        errors.append(f"缺少必填字段：{field}")
    if data.get("contract_version") != "3.0":
        errors.append("contract_version 必须为 3.0")
    if data.get("classification") not in ALLOWED_CLASSIFICATIONS:
        errors.append("classification 必须是 demo 或 real")
    if data.get("basis") not in ALLOWED_BASIS:
        errors.append("basis 不是支持的收入口径")
    if data.get("quality_status") not in ALLOWED_QUALITY:
        errors.append("quality_status 必须是 pass、warn 或 fail")
    if data.get("review_status") not in {"draft", "approved"}:
        errors.append("review_status 必须是 draft 或 approved")

    metrics = data.get("metrics")
    if isinstance(metrics, dict) and metrics:
        for metric_id, metric in metrics.items():
            prefix = f"metrics.{metric_id}"
            if not isinstance(metric, dict):
                errors.append(f"{prefix} 必须是对象")
                continue
            status = metric.get("status")
            if status not in ALLOWED_STATUS:
                errors.append(f"{prefix}.status 无效")
            value = metric.get("value")
            if status in {"available", "warning"} and not is_number(value):
                errors.append(f"{prefix}.value 在可用状态下必须是有限数字")
            if status not in {"available", "warning"} and value is not None:
                errors.append(f"{prefix}.value 在不可用状态下必须为 null")
            if status not in {"available", "warning"} and not metric.get("reason"):
                errors.append(f"{prefix}.reason 在不可用状态下为必填")
            if not metric.get("unit"):
                errors.append(f"{prefix}.unit 为必填")
            if not isinstance(metric.get("source_ids"), list):
                errors.append(f"{prefix}.source_ids 必须是数组")
    elif "metrics" in data:
        errors.append("metrics 必须是非空对象")

    paths = data.get("paths")
    if not isinstance(paths, list) or not paths:
        errors.append("paths 必须是非空数组")

    bridges = data.get("contribution_bridges")
    if isinstance(bridges, list):
        for index, bridge in enumerate(bridges):
            if not isinstance(bridge, dict):
                errors.append(f"contribution_bridges[{index}] 必须是对象")
                continue
            if bridge.get("status", "available") in {"available", "warning"}:
                change = bridge.get("change")
                residual = bridge.get("residual")
                contributions = bridge.get("contributions")
                if not is_number(change) or not is_number(residual):
                    errors.append(f"contribution_bridges[{index}] 的变化和残差必须是有限数字")
                if not isinstance(contributions, list):
                    errors.append(f"contribution_bridges[{index}].contributions 必须是数组")
                elif is_number(change) and is_number(residual):
                    total = sum(
                        item.get("contribution", 0)
                        for item in contributions
                        if isinstance(item, dict) and is_number(item.get("contribution"))
                    )
                    if abs(total + residual - change) > 0.01:
                        errors.append(f"contribution_bridges[{index}] 无法与收入变化勾稽")
    elif "contribution_bridges" in data:
        errors.append("contribution_bridges 必须是数组")

    claims = data.get("claims")
    if isinstance(claims, list):
        for index, claim in enumerate(claims):
            prefix = f"claims[{index}]"
            if not isinstance(claim, dict):
                errors.append(f"{prefix} 必须是对象")
                continue
            if claim.get("type") not in ALLOWED_CLAIMS:
                errors.append(f"{prefix}.type 无效")
            if not claim.get("text"):
                errors.append(f"{prefix}.text 为必填")
            if not isinstance(claim.get("metric_ids"), list):
                errors.append(f"{prefix}.metric_ids 必须是数组")
            if not isinstance(claim.get("source_ids"), list):
                errors.append(f"{prefix}.source_ids 必须是数组")
    elif "claims" in data:
        errors.append("claims 必须是数组")

    for field in ("known_gaps", "limitations"):
        if field in data and not isinstance(data[field], list):
            errors.append(f"{field} 必须是数组")

    if data.get("classification") == "real" and data.get("public") is True:
        errors.append("真实数据简报不能标记为公开")
    if data.get("basis") == "unconfirmed":
        revenue = metrics.get("revenue") if isinstance(metrics, dict) else None
        if isinstance(revenue, dict) and revenue.get("status") != "pending_confirmation":
            errors.append("口径待确认时，收入状态必须是 pending_confirmation")

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
