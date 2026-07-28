#!/usr/bin/env python3
"""Build the governed Revenue Pulse v3 demo input snapshot."""

from __future__ import annotations

import csv
import json
from collections import defaultdict
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent
PROJECT = ROOT.parent
REGISTRY_PATH = ROOT / "config" / "source_registry_v3.json"
OUTPUT_PATH = PROJECT / "app" / "data" / "dashboard-v3.json"


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open(encoding="utf-8", newline="") as handle:
        return list(csv.DictReader(handle))


def number(row: dict[str, str], key: str) -> float:
    return float(row[key])


def sum_key(rows: list[dict[str, str]], key: str) -> float:
    return sum(number(row, key) for row in rows)


def weighted_average(
    rows: list[dict[str, str]], value_key: str, weight_key: str
) -> float:
    total_weight = sum_key(rows, weight_key)
    if total_weight == 0:
        raise ValueError(f"Cannot weight {value_key}: {weight_key} sums to zero")
    return sum(number(row, value_key) * number(row, weight_key) for row in rows) / total_weight


def validate_primary_keys(
    rows: list[dict[str, str]], keys: list[str], source_id: str
) -> None:
    seen: set[tuple[str, ...]] = set()
    for row in rows:
        key = tuple(row[column] for column in keys)
        if key in seen:
            raise ValueError(f"{source_id}: duplicate primary key {key}")
        seen.add(key)


def aggregate(
    period: str,
    operations: list[dict[str, str]],
    commerce: list[dict[str, str]],
    health: list[dict[str, str]],
    experience: list[dict[str, str]],
) -> dict[str, Any]:
    operation_rows = [row for row in operations if row["period"] == period]
    commerce_rows = [row for row in commerce if row["period"] == period]
    health_rows = [row for row in health if row["period"] == period]
    experience_rows = [row for row in experience if row["period"] == period]
    impressions = sum_key(operation_rows, "impressions")
    revenue = sum_key(operation_rows, "revenue")
    return {
        "start": min(row["date"] for row in operation_rows),
        "end": max(row["date"] for row in operation_rows),
        "label": "本期" if period == "current" else "上期",
        "revenue": round(revenue, 2),
        "monetizableVv": round(sum_key(operation_rows, "monetizable_vv")),
        "adLoad": impressions / sum_key(operation_rows, "monetizable_vv"),
        "eCpm": revenue * 1000 / impressions,
        "opportunities": round(sum_key(operation_rows, "opportunities")),
        "requests": round(sum_key(operation_rows, "requests")),
        "filledRequests": round(sum_key(operation_rows, "filled_requests")),
        "impressions": round(impressions),
        "clicks": round(sum_key(operation_rows, "clicks")),
        "actualAdSpend": round(sum_key(operation_rows, "actual_ad_spend"), 2),
        "gmv": round(sum_key(commerce_rows, "gmv"), 2),
        "attributedGmv": round(sum_key(health_rows, "attributed_gmv"), 2),
        "dau": round(sum_key(experience_rows, "dau")),
        "activeAdvertisers": round(sum_key(health_rows, "active_advertisers")),
        "priorActiveAdvertisers": round(
            sum_key(health_rows, "prior_active_advertisers")
        ),
        "retainedAdvertisers": round(
            sum_key(health_rows, "retained_advertisers")
        ),
        "bounceRate": weighted_average(experience_rows, "bounce_rate", "dau"),
        "averageDwellSeconds": weighted_average(
            experience_rows, "average_dwell_seconds", "dau"
        ),
        "organicConversionRate": weighted_average(
            experience_rows, "organic_conversion_rate", "dau"
        ),
    }


def breakdowns(operations: list[dict[str, str]]) -> list[dict[str, Any]]:
    dimensions = {
        "ad_format": "ad_format",
        "traffic_scene": "traffic_scene",
        "billing_method": "billing_method",
        "category": "category",
        "advertiser_tier": "advertiser_tier",
    }
    output: list[dict[str, Any]] = []
    for dimension, column in dimensions.items():
        grouped: dict[tuple[str, str], list[dict[str, str]]] = defaultdict(list)
        for row in operations:
            grouped[(row["period"], row[column])].append(row)
        members = sorted({row[column] for row in operations})
        for member in members:
            values: dict[str, dict[str, float]] = {}
            for period in ("current", "comparison"):
                rows = grouped[(period, member)]
                impressions = sum_key(rows, "impressions")
                revenue = sum_key(rows, "revenue")
                values[period] = {
                    "revenue": round(revenue, 2),
                    "monetizableVv": round(sum_key(rows, "monetizable_vv")),
                    "adLoad": impressions / sum_key(rows, "monetizable_vv"),
                    "eCpm": revenue * 1000 / impressions,
                    "impressions": round(impressions),
                    "clicks": round(sum_key(rows, "clicks")),
                }
            output.append(
                {
                    "dimension": dimension,
                    "member": member,
                    "current": values["current"],
                    "comparison": values["comparison"],
                }
            )
    return output


def profile(source: dict[str, Any], row_count: int) -> dict[str, Any]:
    return {
        "sourceId": source["source_id"],
        "displayLabel": source["display_label"],
        "format": "csv",
        "sourceRoles": source["roles"],
        "rowCount": row_count,
        "timeGrain": source["time_grain"],
        "dimensionGrain": source["dimension_grain"],
        "primaryKeyColumns": source["primary_key"],
        "currency": source["currency"],
        "timezone": "Asia/Shanghai",
    }


def main() -> None:
    registry = json.loads(REGISTRY_PATH.read_text(encoding="utf-8"))
    sources: dict[str, list[dict[str, str]]] = {}
    profiles: list[dict[str, Any]] = []
    for source in registry["sources"]:
        rows = read_csv(ROOT / source["path"])
        validate_primary_keys(rows, source["primary_key"], source["source_id"])
        sources[source["source_id"]] = rows
        profiles.append(profile(source, len(rows)))

    operations = sources["ad_operations_v3"]
    commerce = sources["commerce_v3"]
    health = sources["advertiser_health_v3"]
    experience = sources["user_experience_v3"]
    events = sources["strategy_events_v3"]

    current = aggregate("current", operations, commerce, health, experience)
    comparison = aggregate("comparison", operations, commerce, health, experience)
    snapshot = {
        "snapshotVersion": "3.0",
        "generatedAt": "2026-07-28T01:45:00.000Z",
        "input": {
            "contractVersion": "3.0",
            "classification": "demo",
            "basis": "operating_ad_revenue",
            "basisLabel": "广告经营收入（程序生成模拟）",
            "current": current,
            "comparison": comparison,
            "profiles": profiles,
            "mappings": [],
            "quality": [
                {
                    "id": "primary_keys",
                    "label": "主键唯一性",
                    "status": "pass",
                    "path": "all",
                    "detail": "所有模拟源主键唯一",
                },
                {
                    "id": "traffic_reconciliation",
                    "label": "流量公式勾稽",
                    "status": "pass",
                    "path": "traffic_monetization",
                    "detail": "收入与曝光和 eCPM 可勾稽",
                },
                {
                    "id": "common_grain",
                    "label": "共同粒度",
                    "status": "pass",
                    "path": "all",
                    "detail": "下钻仅使用共同维度，不展开粗粒度指标",
                },
            ],
            "slices": breakdowns(operations),
            "strategyEvents": [
                {
                    "eventId": row["event_id"],
                    "label": row["label"],
                    "start": row["start"],
                    "end": row["end"],
                    "scope": row["traffic_scene"],
                }
                for row in events
            ],
        },
    }
    OUTPUT_PATH.write_text(
        json.dumps(snapshot, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(
        f"Wrote {OUTPUT_PATH} with {len(profiles)} sources and "
        f"{len(snapshot['input']['slices'])} breakdown rows"
    )


if __name__ == "__main__":
    main()
