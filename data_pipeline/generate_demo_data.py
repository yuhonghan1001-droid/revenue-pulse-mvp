#!/usr/bin/env python3
"""Generate 24 synthetic-but-realistic source datasets for the revenue MVP."""

from __future__ import annotations

import csv
import json
import math
import random
from datetime import date, datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data_pipeline" / "data" / "raw"
REGISTRY = ROOT / "data_pipeline" / "config" / "source_registry.json"
AS_OF = date(2026, 7, 25)
START = date(2025, 1, 1)
random.seed(20260725)


def daterange(start: date, end: date):
    cursor = start
    while cursor <= end:
        yield cursor
        cursor += timedelta(days=1)


def write_csv(name: str, fields: list[str], rows: list[dict]):
    RAW.mkdir(parents=True, exist_ok=True)
    with (RAW / name).open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)


industries = ["美妆个护", "服饰鞋包", "食品饮料", "家居家电", "数码3C", "母婴宠物"]
segments = ["品牌旗舰", "成长商家", "中小商家"]
regions = ["华东", "华南", "华北", "西南"]
products = [
    ("P01", "搜索广告", 1.16),
    ("P02", "推荐信息流", 1.32),
    ("P03", "商城广告", 0.94),
    ("P04", "直播加热", 1.08),
]
traffic = [
    ("T01", "推荐流量", 1.30),
    ("T02", "搜索流量", 1.12),
    ("T03", "商城流量", 0.88),
    ("T04", "直播流量", 1.05),
]
merchants = []
for idx in range(48):
    merchants.append(
        {
            "merchant_id": f"M{idx + 1:03d}",
            "merchant_name": f"示例商家{idx + 1:02d}",
            "industry": industries[idx % len(industries)],
            "segment": segments[(idx // 2) % len(segments)],
            "region": regions[(idx // 3) % len(regions)],
            "owner": f"AM-{idx % 8 + 1:02d}",
            "lifecycle": ["成熟", "成长", "新入驻"][idx % 3],
            "base": 65000 + idx * 2350 + (idx % 7) * 9000,
        }
    )

write_csv(
    "merchant_master.csv",
    ["merchant_id", "merchant_name", "active_flag"],
    [{"merchant_id": m["merchant_id"], "merchant_name": m["merchant_name"], "active_flag": 1} for m in merchants],
)
write_csv("merchant_industry.csv", ["merchant_id", "industry"], [{"merchant_id": m["merchant_id"], "industry": m["industry"]} for m in merchants])
write_csv("merchant_segment.csv", ["merchant_id", "segment"], [{"merchant_id": m["merchant_id"], "segment": m["segment"]} for m in merchants])
write_csv("merchant_region.csv", ["merchant_id", "region"], [{"merchant_id": m["merchant_id"], "region": m["region"]} for m in merchants])
write_csv("account_owner.csv", ["merchant_id", "account_owner"], [{"merchant_id": m["merchant_id"], "account_owner": m["owner"]} for m in merchants])
write_csv("merchant_lifecycle.csv", ["merchant_id", "lifecycle"], [{"merchant_id": m["merchant_id"], "lifecycle": m["lifecycle"]} for m in merchants])
write_csv("product_master.csv", ["product_id", "product_name"], [{"product_id": p[0], "product_name": p[1]} for p in products])
write_csv("product_pricing.csv", ["product_id", "pricing_index"], [{"product_id": p[0], "pricing_index": p[2]} for p in products])
write_csv("traffic_master.csv", ["traffic_id", "traffic_name", "quality_index"], [{"traffic_id": t[0], "traffic_name": t[1], "quality_index": t[2]} for t in traffic])

calendar_rows = []
promotion_rows = []
strategy_rows = []
for day in daterange(START, AS_OF):
    weekend = int(day.weekday() >= 5)
    holiday = "春节" if (day.month == 2 and 1 <= day.day <= 7) else ("618" if day.month == 6 and 15 <= day.day <= 20 else "")
    promotion = "年中大促" if day.month == 6 and 1 <= day.day <= 20 else ("暑期上新" if day.month == 7 and day.day >= 10 else "")
    strategy = ""
    if day == date(2026, 7, 12):
        strategy = "搜索流量策略调整"
    if day == date(2026, 7, 20):
        strategy = "中小商家激励上线"
    calendar_rows.append({"date": day.isoformat(), "weekday": day.weekday() + 1, "is_weekend": weekend, "holiday": holiday})
    promotion_rows.append({"date": day.isoformat(), "promotion": promotion, "promotion_index": 1.18 if promotion else 1.0})
    strategy_rows.append({"date": day.isoformat(), "strategy_event": strategy, "expected_direction": "结构性影响" if strategy else ""})

write_csv("calendar.csv", ["date", "weekday", "is_weekend", "holiday"], calendar_rows)
write_csv("promotion_calendar.csv", ["date", "promotion", "promotion_index"], promotion_rows)
write_csv("strategy_events.csv", ["date", "strategy_event", "expected_direction"], strategy_rows)

revenue_rows = []
impression_rows = []
click_rows = []
conversion_rows = []
budget_rows = []
inventory_rows = []
billing_rows = []
rebate_rows = []
refund_rows = []
forecast_rows = []
daily_gross: dict[str, float] = {}

for day in daterange(START, AS_OF):
    year_growth = 1.085 if day.year == 2026 else 1.0
    month_curve = 1 + 0.07 * math.sin((day.month - 1) / 12 * math.pi * 2)
    weekday_curve = 0.92 if day.weekday() >= 5 else 1.02
    promo_curve = 1.22 if (day.month == 6 and day.day <= 20) else (1.08 if day.month == 7 and day.day >= 10 else 1.0)
    day_total = 0.0
    for merchant_idx, merchant in enumerate(merchants):
        product = products[(merchant_idx + day.day) % len(products)]
        traffic_item = traffic[(merchant_idx * 2 + day.day) % len(traffic)]
        july_shift = 1.0
        if day.year == 2026 and day.month == 7:
            if merchant["industry"] == "美妆个护":
                july_shift *= 1.18
            if merchant["industry"] == "服饰鞋包":
                july_shift *= 0.87
            if merchant["segment"] == "中小商家" and day.day >= 20:
                july_shift *= 1.11
            if traffic_item[0] == "T02" and day.day >= 12:
                july_shift *= 0.90
        noise = 0.92 + random.random() * 0.16
        gross = merchant["base"] * year_growth * month_curve * weekday_curve * promo_curve * product[2] * traffic_item[2] * july_shift * noise
        gross = round(gross, 2)
        day_total += gross
        revenue_rows.append(
            {
                "date": day.isoformat(),
                "merchant_id": merchant["merchant_id"],
                "product_id": product[0],
                "traffic_id": traffic_item[0],
                "gross_revenue": gross,
            }
        )
        impressions = int(gross * (73 + merchant_idx % 9))
        ctr = 0.031 + (merchant_idx % 6) * 0.002
        clicks = int(impressions * ctr)
        cvr = 0.062 + (merchant_idx % 5) * 0.006
        conversions = int(clicks * cvr)
        impression_rows.append({"date": day.isoformat(), "merchant_id": merchant["merchant_id"], "impressions": impressions})
        click_rows.append({"date": day.isoformat(), "merchant_id": merchant["merchant_id"], "clicks": clicks})
        conversion_rows.append({"date": day.isoformat(), "merchant_id": merchant["merchant_id"], "conversions": conversions})
        budget_rows.append({"date": day.isoformat(), "merchant_id": merchant["merchant_id"], "declared_budget": round(merchant["base"] * 1.24, 2)})
    daily_gross[day.isoformat()] = day_total
    for traffic_id, _, quality in traffic:
        inventory_rows.append(
            {
                "date": day.isoformat(),
                "traffic_id": traffic_id,
                "available_impressions": int(day_total * 22 * quality),
            }
        )
    confirmed = day_total * (0.994 + random.random() * 0.004)
    rebate = day_total * (0.022 + random.random() * 0.006)
    refund = day_total * (0.002 + random.random() * 0.002)
    billing_rows.append({"date": day.isoformat(), "confirmed_gross": round(confirmed, 2)})
    rebate_rows.append({"date": day.isoformat(), "rebate_amount": round(rebate, 2)})
    refund_rows.append({"date": day.isoformat(), "refund_amount": round(refund, 2)})
    forecast_rows.append({"date": day.isoformat(), "baseline_revenue": round(day_total / year_growth * 1.07, 2)})

write_csv("revenue_transactions.csv", ["date", "merchant_id", "product_id", "traffic_id", "gross_revenue"], revenue_rows)
write_csv("impressions_daily.csv", ["date", "merchant_id", "impressions"], impression_rows)
write_csv("clicks_daily.csv", ["date", "merchant_id", "clicks"], click_rows)
write_csv("conversions_daily.csv", ["date", "merchant_id", "conversions"], conversion_rows)
write_csv("traffic_inventory_daily.csv", ["date", "traffic_id", "available_impressions"], inventory_rows)
write_csv("merchant_budget_daily.csv", ["date", "merchant_id", "declared_budget"], budget_rows)
write_csv("billing_confirmations_daily.csv", ["date", "confirmed_gross"], billing_rows)
write_csv("rebates_daily.csv", ["date", "rebate_amount"], rebate_rows)
write_csv("refunds_daily.csv", ["date", "refund_amount"], refund_rows)
write_csv("forecast_baseline_daily.csv", ["date", "baseline_revenue"], forecast_rows)

target_rows = []
for year in (2025, 2026):
    for month in range(1, 13):
        first = date(year, month, 1)
        next_month = date(year + (month == 12), 1 if month == 12 else month + 1, 1)
        days = (next_month - first).days
        comparable = sum(daily_gross.get((first + timedelta(days=i)).isoformat(), 0) for i in range(days))
        if comparable == 0:
            comparable = 215_000_000 * (1 + 0.04 * math.sin(month / 12 * math.pi * 2))
        if year == 2026 and month == 7:
            previous_july = sum(
                daily_gross.get((date(2025, 7, 1) + timedelta(days=i)).isoformat(), 0)
                for i in range(31)
            )
            comparable = previous_july * 1.10
        target_rows.append({"month": f"{year}-{month:02d}", "monthly_target": round(comparable * (1.0 if (year == 2026 and month == 7) else (1.035 if year == 2026 else 1.02)), 2)})
write_csv("market_target_monthly.csv", ["month", "monthly_target"], target_rows)

registry = json.loads(REGISTRY.read_text(encoding="utf-8"))
freshness_rows = []
for source in registry:
    if source["id"] == "data_freshness":
        continue
    delayed = source["id"] == "conversions_daily"
    timestamp = datetime(2026, 7, 24 if delayed else 25, 7 if delayed else 9, 30)
    freshness_rows.append(
        {
            "source_id": source["id"],
            "last_updated_at": timestamp.isoformat(timespec="minutes"),
            "status": "延迟" if delayed else "按时",
        }
    )
freshness_rows.append({"source_id": "data_freshness", "last_updated_at": "2026-07-25T09:31", "status": "按时"})
write_csv("data_freshness.csv", ["source_id", "last_updated_at", "status"], freshness_rows)

print(f"Generated {len(registry)} demo sources in {RAW}")
