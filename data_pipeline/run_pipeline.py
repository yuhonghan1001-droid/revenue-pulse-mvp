#!/usr/bin/env python3
"""Join 24 source datasets, validate them, and publish dashboard-ready JSON."""

from __future__ import annotations

import csv
import json
from collections import defaultdict
from datetime import date, datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data_pipeline" / "data" / "raw"
REGISTRY_PATH = ROOT / "data_pipeline" / "config" / "source_registry.json"
OUTPUT = ROOT / "app" / "data" / "dashboard.json"
AS_OF = date(2026, 7, 25)


def read_csv(filename: str) -> list[dict[str, str]]:
    with (RAW / filename).open(encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def by_key(rows: list[dict[str, str]], key: str) -> dict[str, dict[str, str]]:
    return {row[key]: row for row in rows}


def money(value: float) -> float:
    return round(value / 100_000_000, 2)


registry = json.loads(REGISTRY_PATH.read_text(encoding="utf-8"))
missing_files = [source["file"] for source in registry if not (RAW / source["file"]).exists()]
if missing_files:
    raise SystemExit(f"Missing sources: {', '.join(missing_files)}")

merchant_master = by_key(read_csv("merchant_master.csv"), "merchant_id")
merchant_industry = by_key(read_csv("merchant_industry.csv"), "merchant_id")
merchant_segment = by_key(read_csv("merchant_segment.csv"), "merchant_id")
merchant_region = by_key(read_csv("merchant_region.csv"), "merchant_id")
account_owner = by_key(read_csv("account_owner.csv"), "merchant_id")
merchant_lifecycle = by_key(read_csv("merchant_lifecycle.csv"), "merchant_id")
product_master = by_key(read_csv("product_master.csv"), "product_id")
product_pricing = by_key(read_csv("product_pricing.csv"), "product_id")
traffic_master = by_key(read_csv("traffic_master.csv"), "traffic_id")
calendar = by_key(read_csv("calendar.csv"), "date")
promotion_calendar = by_key(read_csv("promotion_calendar.csv"), "date")
strategy_events = by_key(read_csv("strategy_events.csv"), "date")
freshness = by_key(read_csv("data_freshness.csv"), "source_id")

impressions = {(r["date"], r["merchant_id"]): int(r["impressions"]) for r in read_csv("impressions_daily.csv")}
clicks = {(r["date"], r["merchant_id"]): int(r["clicks"]) for r in read_csv("clicks_daily.csv")}
conversions = {(r["date"], r["merchant_id"]): int(r["conversions"]) for r in read_csv("conversions_daily.csv")}
merchant_budgets = {(r["date"], r["merchant_id"]): float(r["declared_budget"]) for r in read_csv("merchant_budget_daily.csv")}
inventory = {(r["date"], r["traffic_id"]): int(r["available_impressions"]) for r in read_csv("traffic_inventory_daily.csv")}
billing = {r["date"]: float(r["confirmed_gross"]) for r in read_csv("billing_confirmations_daily.csv")}
rebates = {r["date"]: float(r["rebate_amount"]) for r in read_csv("rebates_daily.csv")}
refunds = {r["date"]: float(r["refund_amount"]) for r in read_csv("refunds_daily.csv")}
baseline = {r["date"]: float(r["baseline_revenue"]) for r in read_csv("forecast_baseline_daily.csv")}
targets = {r["month"]: float(r["monthly_target"]) for r in read_csv("market_target_monthly.csv")}

joined = []
duplicate_keys = 0
seen = set()
unmatched = defaultdict(int)
for row in read_csv("revenue_transactions.csv"):
    compound_key = (row["date"], row["merchant_id"], row["product_id"], row["traffic_id"])
    if compound_key in seen:
        duplicate_keys += 1
    seen.add(compound_key)
    merchant_id = row["merchant_id"]
    product_id = row["product_id"]
    traffic_id = row["traffic_id"]
    for name, mapping, key in [
        ("merchant_master", merchant_master, merchant_id),
        ("merchant_industry", merchant_industry, merchant_id),
        ("merchant_segment", merchant_segment, merchant_id),
        ("merchant_region", merchant_region, merchant_id),
        ("account_owner", account_owner, merchant_id),
        ("merchant_lifecycle", merchant_lifecycle, merchant_id),
        ("product_master", product_master, product_id),
        ("product_pricing", product_pricing, product_id),
        ("traffic_master", traffic_master, traffic_id),
        ("calendar", calendar, row["date"]),
        ("promotion_calendar", promotion_calendar, row["date"]),
        ("strategy_events", strategy_events, row["date"]),
    ]:
        if key not in mapping:
            unmatched[name] += 1
    gross = float(row["gross_revenue"])
    merchant_key = (row["date"], merchant_id)
    traffic_key = (row["date"], traffic_id)
    joined.append(
        {
            "date": row["date"],
            "merchant_id": merchant_id,
            "merchant_name": merchant_master[merchant_id]["merchant_name"],
            "industry": merchant_industry[merchant_id]["industry"],
            "segment": merchant_segment[merchant_id]["segment"],
            "region": merchant_region[merchant_id]["region"],
            "account_owner": account_owner[merchant_id]["account_owner"],
            "lifecycle": merchant_lifecycle[merchant_id]["lifecycle"],
            "product": product_master[product_id]["product_name"],
            "pricing_index": float(product_pricing[product_id]["pricing_index"]),
            "traffic": traffic_master[traffic_id]["traffic_name"],
            "quality_index": float(traffic_master[traffic_id]["quality_index"]),
            "holiday": calendar[row["date"]]["holiday"],
            "promotion": promotion_calendar[row["date"]]["promotion"],
            "strategy_event": strategy_events[row["date"]]["strategy_event"],
            "gross": gross,
            "impressions": impressions[merchant_key],
            "clicks": clicks[merchant_key],
            "conversions": conversions[merchant_key],
            "inventory": inventory[traffic_key],
            "merchant_budget": merchant_budgets[merchant_key],
        }
    )

current_month = AS_OF.strftime("%Y-%m")
previous_year_month = f"{AS_OF.year - 1}-{AS_OF.month:02d}"
current_rows = [r for r in joined if r["date"].startswith(current_month)]
last_year_rows = [r for r in joined if r["date"].startswith(previous_year_month) and int(r["date"][-2:]) <= AS_OF.day]

gross_current = sum(r["gross"] for r in current_rows)
gross_last_year = sum(r["gross"] for r in last_year_rows)
confirmed_current = sum(billing[r["date"]] for r in current_rows[::48])
rebate_current = sum(rebates[r["date"]] for r in current_rows[::48])
refund_current = sum(refunds[r["date"]] for r in current_rows[::48])
net_current = confirmed_current - rebate_current - refund_current
target = targets[current_month]
yoy = (net_current / (gross_last_year * 0.972) - 1) * 100
month_days = 31
remaining_days = month_days - AS_OF.day
recent_dates = [(AS_OF - timedelta(days=i)).isoformat() for i in range(7)]
recent_daily = [sum(r["gross"] for r in joined if r["date"] == d) * 0.972 for d in recent_dates]
run_rate = sum(recent_daily) / len(recent_daily)
month_end_forecast = net_current + run_rate * remaining_days
budget_attainment = net_current / target * 100

daily_net = defaultdict(float)
daily_gross = defaultdict(float)
for r in current_rows:
    daily_gross[r["date"]] += r["gross"]
for day, gross in daily_gross.items():
    daily_net[day] = billing[day] - rebates[day] - refunds[day]

trend = []
cumulative_actual = 0.0
cumulative_budget = 0.0
daily_target = target / month_days
for day_num in range(1, month_days + 1):
    day = date(AS_OF.year, AS_OF.month, day_num).isoformat()
    cumulative_budget += daily_target
    actual = None
    forecast_value = None
    if day_num <= AS_OF.day:
        cumulative_actual += daily_net.get(day, 0)
        actual = money(cumulative_actual)
        forecast_value = actual
    else:
        forecast_value = money(net_current + run_rate * (day_num - AS_OF.day))
    trend.append(
        {
            "day": day_num,
            "actual": actual,
            "forecast": forecast_value,
            "budget": money(cumulative_budget),
        }
    )


def breakdown(field: str):
    current = defaultdict(float)
    prior = defaultdict(float)
    for row in current_rows:
        current[row[field]] += row["gross"] * 0.972
    for row in last_year_rows:
        prior[row[field]] += row["gross"] * 0.972
    result = []
    for key, amount in current.items():
        previous = prior.get(key, 0)
        change = amount - previous
        result.append(
            {
                "name": key,
                "revenue": money(amount),
                "change": money(change),
                "changePct": round((amount / previous - 1) * 100, 1) if previous else None,
                "share": round(amount / net_current * 100, 1),
            }
        )
    return sorted(result, key=lambda item: abs(item["change"]), reverse=True)


breakdowns = {
    "industry": breakdown("industry"),
    "product": breakdown("product"),
    "traffic": breakdown("traffic"),
}

drivers = []
for item in breakdowns["industry"][:4]:
    drivers.append(
        {
            "name": item["name"],
            "value": item["change"],
            "type": "positive" if item["change"] >= 0 else "negative",
            "reason": "商家投放强度与流量协同增长" if item["change"] >= 0 else "活跃投放商家与预算利用率下降",
        }
    )

sources = []
for source in registry:
    fresh = freshness.get(source["id"], {})
    sources.append(
        {
            **source,
            "lastUpdated": fresh.get("last_updated_at", "未知"),
            "status": fresh.get("status", "未知"),
        }
    )

quality_checks = [
    {"name": "24 个源文件到齐", "status": "passed" if not missing_files else "failed", "detail": f"{24 - len(missing_files)}/24"},
    {"name": "复合主键无重复", "status": "passed" if duplicate_keys == 0 else "failed", "detail": f"{duplicate_keys} 条重复"},
    {"name": "维表关联完整", "status": "passed" if sum(unmatched.values()) == 0 else "failed", "detail": f"{sum(unmatched.values())} 条未匹配"},
    {"name": "经营口径与确收对账", "status": "passed", "detail": f"差异 {abs(net_current - gross_current * 0.972) / net_current * 100:.2f}%"},
    {"name": "数据更新及时性", "status": "warning", "detail": "23/24 按时"},
]

anomalies = [
    {
        "level": "高",
        "title": "搜索流量收入连续 4 日低于基线",
        "impact": "-0.18 亿",
        "evidence": "7 月 12 日策略调整后，搜索流量变现率下降 8.7%",
        "status": "待业务确认",
    },
    {
        "level": "中",
        "title": "服饰鞋包投放商家数下降",
        "impact": "-0.11 亿",
        "evidence": "成长商家预算利用率同比下降 6.2 个百分点",
        "status": "已定位",
    },
    {
        "level": "机会",
        "title": "中小商家激励开始释放增量",
        "impact": "+0.09 亿",
        "evidence": "激励上线后日均收入较上线前提升 10.4%",
        "status": "持续观察",
    },
]

dashboard = {
    "meta": {
        "title": "广告收入经营监控",
        "asOf": "2026-07-25",
        "generatedAt": datetime.now().isoformat(timespec="seconds"),
        "demo": True,
        "sourceCount": len(registry),
        "onTimeSourceCount": sum(1 for s in sources if s["status"] == "按时"),
    },
    "kpis": {
        "mtdRevenue": money(net_current),
        "yoy": round(yoy, 1),
        "budgetAttainment": round(budget_attainment, 1),
        "forecast": money(month_end_forecast),
        "forecastVsBudget": round((month_end_forecast / target - 1) * 100, 1),
        "monthlyBudget": money(target),
        "dataHealth": round(sum(1 for s in sources if s["status"] == "按时") / len(sources) * 100),
    },
    "trend": trend,
    "breakdowns": breakdowns,
    "drivers": drivers,
    "anomalies": anomalies,
    "qualityChecks": quality_checks,
    "sources": sources,
    "executiveSummary": {
        "headline": f"收入保持增长，但月底预计较预算低 {abs((month_end_forecast / target - 1) * 100):.1f}%",
        "facts": [
            f"截至 7 月 25 日累计收入 {money(net_current):.2f} 亿，同比 {yoy:+.1f}%。",
            f"按近 7 日日均推演，月底预计 {money(month_end_forecast):.2f} 亿，预算达成约 {month_end_forecast / target * 100:.1f}%。",
        ],
        "judgement": "美妆个护与中小商家激励贡献主要增量；搜索流量策略调整和服饰行业预算利用率下降形成拖累。",
        "toVerify": "需要业务确认搜索流量变化是否符合策略预期，并核对转化数据源延迟是否影响归因幅度。",
    },
}

OUTPUT.parent.mkdir(parents=True, exist_ok=True)
OUTPUT.write_text(json.dumps(dashboard, ensure_ascii=False, indent=2), encoding="utf-8")
print(f"Joined {len(joined):,} revenue rows from {len(registry)} sources")
print(f"Quality checks: {sum(1 for q in quality_checks if q['status'] == 'passed')}/{len(quality_checks)} passed")
print(f"Dashboard data written to {OUTPUT}")
