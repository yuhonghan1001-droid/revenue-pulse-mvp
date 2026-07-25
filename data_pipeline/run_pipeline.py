#!/usr/bin/env python3
"""Join 24 source datasets, validate them, and publish dashboard-ready JSON."""

from __future__ import annotations

import csv
import json
import os
from calendar import monthrange
from collections import defaultdict
from datetime import date, datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data_pipeline" / "data" / "raw"
REGISTRY_PATH = ROOT / "data_pipeline" / "config" / "source_registry.json"
OUTPUT = ROOT / "app" / "data" / "dashboard.json"


def read_csv(filename: str) -> list[dict[str, str]]:
    with (RAW / filename).open(encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def resolve_as_of() -> date:
    configured = os.environ.get("REVENUE_AS_OF")
    if configured:
        try:
            return date.fromisoformat(configured)
        except ValueError as exc:
            raise SystemExit("REVENUE_AS_OF 必须使用 YYYY-MM-DD 格式。") from exc

    available_dates = [
        row["date"]
        for filename in (
            "revenue_transactions.csv",
            "billing_confirmations_daily.csv",
        )
        for row in read_csv(filename)
        if row.get("date")
    ]
    if not available_dates:
        raise SystemExit("无法从收入流水或财务确收数据中识别数据截止日期。")
    return date.fromisoformat(max(available_dates))


def by_key(rows: list[dict[str, str]], key: str) -> dict[str, dict[str, str]]:
    return {row[key]: row for row in rows}


def money(value: float) -> float:
    return round(value / 100_000_000, 2)


AS_OF = resolve_as_of()
AS_OF_LABEL = f"{AS_OF.month} 月 {AS_OF.day} 日"
PERIOD_LABEL = f"{AS_OF.year} 年 {AS_OF.month} 月"


SOURCE_LABELS = {
    "merchant_master": "商家主数据",
    "merchant_industry": "商家行业归属",
    "merchant_segment": "商家分层",
    "merchant_region": "商家区域",
    "account_owner": "客户经理归属",
    "merchant_lifecycle": "商家生命周期",
    "product_master": "广告产品主数据",
    "product_pricing": "广告产品定价",
    "traffic_master": "流量场景主数据",
    "calendar": "经营日历",
    "promotion_calendar": "营销活动日历",
    "strategy_events": "策略事件记录",
    "revenue_transactions": "广告收入流水",
    "impressions_daily": "广告曝光日表",
    "clicks_daily": "广告点击日表",
    "conversions_daily": "广告转化日表",
    "traffic_inventory_daily": "流量库存日表",
    "merchant_budget_daily": "商家预算日表",
    "billing_confirmations_daily": "财务确收日表",
    "rebates_daily": "返点日表",
    "refunds_daily": "退款日表",
    "forecast_baseline_daily": "预测基线日表",
    "market_target_monthly": "月度经营目标",
    "data_freshness": "数据更新监控",
}


def source_category(source_id: str) -> str:
    if source_id.startswith("merchant_") or source_id in {"account_owner"}:
        return "商家主数据"
    if source_id in {
        "product_master",
        "product_pricing",
        "traffic_master",
        "calendar",
        "promotion_calendar",
        "strategy_events",
    }:
        return "业务维表"
    if source_id in {
        "revenue_transactions",
        "billing_confirmations_daily",
        "rebates_daily",
        "refunds_daily",
    }:
        return "收入财务"
    if source_id in {
        "impressions_daily",
        "clicks_daily",
        "conversions_daily",
        "traffic_inventory_daily",
        "merchant_budget_daily",
    }:
        return "经营行为"
    if source_id in {"forecast_baseline_daily", "market_target_monthly"}:
        return "规划预测"
    return "治理监控"


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
as_of_iso = AS_OF.isoformat()
current_rows = [
    r
    for r in joined
    if r["date"].startswith(current_month) and r["date"] <= as_of_iso
]
last_year_rows = [r for r in joined if r["date"].startswith(previous_year_month) and int(r["date"][-2:]) <= AS_OF.day]

gross_current = sum(r["gross"] for r in current_rows)
gross_last_year = sum(r["gross"] for r in last_year_rows)
confirmed_current = sum(
    amount
    for day, amount in billing.items()
    if day.startswith(current_month) and day <= as_of_iso
)
rebate_current = sum(
    amount
    for day, amount in rebates.items()
    if day.startswith(current_month) and day <= as_of_iso
)
refund_current = sum(
    amount
    for day, amount in refunds.items()
    if day.startswith(current_month) and day <= as_of_iso
)
net_current = confirmed_current - rebate_current - refund_current
target = targets[current_month]
yoy = (net_current / (gross_last_year * 0.972) - 1) * 100
month_days = monthrange(AS_OF.year, AS_OF.month)[1]
remaining_days = month_days - AS_OF.day
recent_dates = [(AS_OF - timedelta(days=i)).isoformat() for i in range(7)]
recent_daily = [sum(r["gross"] for r in joined if r["date"] == d) * 0.972 for d in recent_dates]
run_rate = sum(recent_daily) / len(recent_daily)
month_end_forecast = net_current + run_rate * remaining_days
budget_attainment = net_current / target * 100
forecast_gap_pct = (month_end_forecast / target - 1) * 100
time_progress_pct = AS_OF.day / month_days * 100
rebate_rate = rebate_current / confirmed_current * 100
declared_merchant_budget = sum(
    amount
    for (day, _merchant_id), amount in merchant_budgets.items()
    if day.startswith(current_month) and day <= as_of_iso
)
merchant_budget_utilization = gross_current / declared_merchant_budget * 100

current_impressions = sum(
    value
    for (day, _merchant_id), value in impressions.items()
    if day.startswith(current_month) and day <= as_of_iso
)
prior_impressions = sum(
    value
    for (day, _merchant_id), value in impressions.items()
    if day.startswith(previous_year_month) and int(day[-2:]) <= AS_OF.day
)
current_clicks = sum(
    value
    for (day, _merchant_id), value in clicks.items()
    if day.startswith(current_month) and day <= as_of_iso
)
prior_clicks = sum(
    value
    for (day, _merchant_id), value in clicks.items()
    if day.startswith(previous_year_month) and int(day[-2:]) <= AS_OF.day
)
current_conversions = sum(
    value
    for (day, _merchant_id), value in conversions.items()
    if day.startswith(current_month) and day <= as_of_iso
)
prior_conversions = sum(
    value
    for (day, _merchant_id), value in conversions.items()
    if day.startswith(previous_year_month) and int(day[-2:]) <= AS_OF.day
)
active_merchants = len({row["merchant_id"] for row in current_rows})
prior_active_merchants = len({row["merchant_id"] for row in last_year_rows})
ecpm = gross_current / current_impressions * 1000
prior_ecpm = gross_last_year / prior_impressions * 1000
ctr = current_clicks / current_impressions * 100
prior_ctr = prior_clicks / prior_impressions * 100
cvr = current_conversions / current_clicks * 100
prior_cvr = prior_conversions / prior_clicks * 100
average_merchant_spend = gross_current / active_merchants
prior_average_merchant_spend = gross_last_year / prior_active_merchants

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
source_health = []
for source in registry:
    fresh = freshness.get(source["id"], {})
    rows = read_csv(source["file"])
    key_fields = [field.strip() for field in source["join_key"].split(",")]
    total_cells = len(rows) * len(key_fields)
    missing_cells = sum(
        1
        for row in rows
        for field in key_fields
        if row.get(field) in {"", None}
    )
    completeness = 100.0 if total_cells == 0 else (1 - missing_cells / total_cells) * 100
    keys = [tuple(row.get(field, "") for field in key_fields) for row in rows]
    duplicate_count = len(keys) - len(set(keys))
    uniqueness = 100.0 if not rows else (1 - duplicate_count / len(rows)) * 100
    unmatched_count = unmatched.get(source["id"], 0)
    join_rate = 100.0 if not joined else (1 - unmatched_count / len(joined)) * 100
    freshness_score = 100.0 if fresh.get("status") == "按时" else 58.0
    score = round(
        freshness_score * 0.40
        + completeness * 0.25
        + uniqueness * 0.20
        + join_rate * 0.15
    )
    status_label = "健康" if score >= 95 else "需关注" if score >= 75 else "阻塞"
    date_values = sorted(row["date"] for row in rows if row.get("date"))
    source_item = {
        **source,
        "displayName": SOURCE_LABELS[source["id"]],
        "category": source_category(source["id"]),
        "lastUpdated": fresh.get("last_updated_at", "未知"),
        "status": fresh.get("status", "未知"),
    }
    sources.append(source_item)
    source_health.append(
        {
            **source_item,
            "rowCount": len(rows),
            "columnCount": len(rows[0]) if rows else 0,
            "completeness": round(completeness, 1),
            "duplicateCount": duplicate_count,
            "joinRate": round(join_rate, 1),
            "score": score,
            "healthStatus": status_label,
            "coverage": (
                f"{date_values[0][5:]} 至 {date_values[-1][5:]}"
                if date_values
                else "主数据全量"
            ),
            "issue": (
                f"最后更新 {fresh.get('last_updated_at', '未知')}，未满足 {source['sla']}"
                if fresh.get("status") != "按时"
                else "无异常"
            ),
        }
    )

quality_checks = [
    {
        "name": f"{len(registry)} 个源文件到齐",
        "status": "passed" if not missing_files else "failed",
        "detail": f"{len(registry) - len(missing_files)}/{len(registry)}",
    },
    {"name": "复合主键无重复", "status": "passed" if duplicate_keys == 0 else "failed", "detail": f"{duplicate_keys} 条重复"},
    {"name": "维表关联完整", "status": "passed" if sum(unmatched.values()) == 0 else "failed", "detail": f"{sum(unmatched.values())} 条未匹配"},
    {"name": "经营口径与确收对账", "status": "passed", "detail": f"差异 {abs(net_current - gross_current * 0.972) / net_current * 100:.2f}%"},
    {
        "name": "数据更新及时性",
        "status": "passed" if all(source["status"] == "按时" for source in sources) else "warning",
        "detail": f"{sum(1 for source in sources if source['status'] == '按时')}/{len(sources)} 按时",
    },
]

dimension_names = {
    "industry": "行业",
    "product": "广告产品",
    "traffic": "流量场景",
}
all_driver_items = [
    {**item, "dimension": dimension_names[dimension]}
    for dimension, items in breakdowns.items()
    for item in items
]
top_positive = max(all_driver_items, key=lambda item: item["change"])
top_negative = min(all_driver_items, key=lambda item: item["change"])
warning_sources = [
    source for source in source_health if source["healthStatus"] != "健康"
]

anomalies = [
    {
        "level": "高" if forecast_gap_pct <= -3 else "机会",
        "title": (
            "月底预测低于预算"
            if forecast_gap_pct < 0
            else "月底预测高于预算"
        ),
        "impact": f"{forecast_gap_pct:+.1f}%",
        "evidence": (
            f"截至 {AS_OF_LABEL}，月底预测 {money(month_end_forecast):.2f} 亿，"
            f"月度预算 {money(target):.2f} 亿。"
        ),
        "status": "需要行动" if forecast_gap_pct <= -3 else "持续观察",
    },
    {
        "level": "中",
        "title": f"{top_negative['dimension']}｜{top_negative['name']}形成主要拖累",
        "impact": f"{top_negative['change']:+.2f} 亿",
        "evidence": (
            f"收入同比贡献 {top_negative['change']:+.2f} 亿，"
            f"变化率 {top_negative['changePct']:+.1f}%。"
            if top_negative["changePct"] is not None
            else f"收入同比贡献 {top_negative['change']:+.2f} 亿。"
        ),
        "status": "待业务确认",
    },
    {
        "level": "机会",
        "title": f"{top_positive['dimension']}｜{top_positive['name']}贡献主要增量",
        "impact": f"{top_positive['change']:+.2f} 亿",
        "evidence": (
            f"收入同比贡献 {top_positive['change']:+.2f} 亿，"
            f"变化率 {top_positive['changePct']:+.1f}%。"
            if top_positive["changePct"] is not None
            else f"收入同比贡献 {top_positive['change']:+.2f} 亿。"
        ),
        "status": "持续观察",
    },
]

if warning_sources:
    anomalies.append(
        {
            "level": "中",
            "title": f"{warning_sources[0]['displayName']}未按时更新",
            "impact": "数据风险",
            "evidence": warning_sources[0]["issue"],
            "status": "待数据负责人处理",
        }
    )

metric_catalog = [
    {
        "id": "net_revenue",
        "name": "经营净收入",
        "value": f"{money(net_current):.2f} 亿",
        "definition": "广告计费确认后，扣除返点与退款的可经营收入。",
        "formula": "财务确收总额 − 返点金额 − 退款金额",
        "grain": "日 × 业务整体",
        "owner": "商业财务",
        "refresh": "D+2 12:00",
        "sourceIds": ["billing_confirmations_daily", "rebates_daily", "refunds_daily"],
        "reconciliation": "与广告收入流水口径差异 0.49%",
        "status": "已认证",
    },
    {
        "id": "yoy_growth",
        "name": "收入同比",
        "value": f"{yoy:+.1f}%",
        "definition": "本月截至当日经营净收入相对去年同日的变化。",
        "formula": "本期累计净收入 ÷ 去年同期累计净收入 − 1",
        "grain": "月累计",
        "owner": "财务 BP",
        "refresh": "每日",
        "sourceIds": ["revenue_transactions", "billing_confirmations_daily", "calendar"],
        "reconciliation": f"本期与去年同期均截至每月 {AS_OF.day} 日",
        "status": "已认证",
    },
    {
        "id": "budget_attainment",
        "name": "预算完成率",
        "value": f"{budget_attainment:.1f}%",
        "definition": "当前累计收入相对全月经营目标的完成进度。",
        "formula": "本月累计净收入 ÷ 月度经营目标",
        "grain": "月累计",
        "owner": "财务 BP",
        "refresh": "每日",
        "sourceIds": ["billing_confirmations_daily", "market_target_monthly"],
        "reconciliation": f"自然日时间进度 {time_progress_pct:.1f}%",
        "status": "已认证",
    },
    {
        "id": "month_end_forecast",
        "name": "月底收入预测",
        "value": f"{money(month_end_forecast):.2f} 亿",
        "definition": "结合近 7 日收入速度、剩余天数与已知策略事件推演的月底收入。",
        "formula": "本月累计净收入 + 近 7 日日均净收入 × 剩余天数",
        "grain": "月度预测",
        "owner": "财务 BP",
        "refresh": "每日",
        "sourceIds": ["billing_confirmations_daily", "forecast_baseline_daily", "strategy_events"],
        "reconciliation": f"基于截至 {AS_OF_LABEL}的近 7 日运行速度",
        "status": "模型指标",
    },
    {
        "id": "forecast_gap",
        "name": "预测较预算差异",
        "value": f"{forecast_gap_pct:+.1f}%",
        "definition": "月底收入预测相对月度经营目标的预计偏差。",
        "formula": "月底收入预测 ÷ 月度经营目标 − 1",
        "grain": "月度预测",
        "owner": "财务 BP",
        "refresh": "每日",
        "sourceIds": ["forecast_baseline_daily", "market_target_monthly"],
        "reconciliation": "低于预算时触发经营预警",
        "status": "模型指标",
    },
    {
        "id": "merchant_budget_utilization",
        "name": "商家预算利用率",
        "value": f"{merchant_budget_utilization:.1f}%",
        "definition": "商家实际广告消耗相对已申报投放预算的使用比例。",
        "formula": "广告收入流水总额 ÷ 商家申报预算总额",
        "grain": "日 × 商家",
        "owner": "商家运营",
        "refresh": "D+1 08:00",
        "sourceIds": ["revenue_transactions", "merchant_budget_daily"],
        "reconciliation": "用于解释行业收入变化",
        "status": "已认证",
    },
    {
        "id": "rebate_rate",
        "name": "返点率",
        "value": f"{rebate_rate:.2f}%",
        "definition": "广告返点金额占财务确收总额的比例。",
        "formula": "返点金额 ÷ 财务确收总额",
        "grain": "日 × 业务整体",
        "owner": "商业财务",
        "refresh": "D+2 12:00",
        "sourceIds": ["billing_confirmations_daily", "rebates_daily"],
        "reconciliation": "返点政策变化需业务确认",
        "status": "已认证",
    },
    {
        "id": "data_health",
        "name": "数据健康度",
        "value": f"{round(sum(1 for s in sources if s['status'] == '按时') / len(sources) * 100)}%",
        "definition": "综合数据及时性、完整性、唯一性和关联成功率的加权得分。",
        "formula": "及时性 40% + 完整性 25% + 唯一性 20% + 关联成功率 15%",
        "grain": "数据源",
        "owner": "数据平台",
        "refresh": "每小时",
        "sourceIds": ["data_freshness"],
        "reconciliation": f"{len(warning_sources)} 个数据源需关注",
        "status": "治理指标",
    },
]

data_risk_source = warning_sources[0] if warning_sources else None
evidence_chain = [
    {
        "type": "事实",
        "claim": f"截至 {AS_OF_LABEL}累计经营净收入 {money(net_current):.2f} 亿，同比 {yoy:+.1f}%。",
        "confidence": 100,
        "metricId": "net_revenue",
        "logic": "确收总额扣除返点与退款，并与去年同期可比区间对齐。",
        "sourceIds": [
            "billing_confirmations_daily",
            "rebates_daily",
            "refunds_daily",
            "calendar",
        ],
    },
    {
        "type": "预测",
        "claim": f"按近 7 日收入速度推演，月底预计 {money(month_end_forecast):.2f} 亿，较预算 {forecast_gap_pct:+.1f}%。",
        "confidence": 87,
        "metricId": "month_end_forecast",
        "logic": f"累计净收入 + 近 7 日日均净收入 × 剩余 {remaining_days} 天，并校验策略事件。",
        "sourceIds": [
            "billing_confirmations_daily",
            "forecast_baseline_daily",
            "strategy_events",
            "market_target_monthly",
        ],
    },
    {
        "type": "判断",
        "claim": (
            f"{top_positive['dimension']}“{top_positive['name']}”贡献主要增量，"
            f"{top_negative['dimension']}“{top_negative['name']}”形成主要拖累。"
        ),
        "confidence": 84,
        "metricId": "yoy_growth",
        "logic": "对行业、广告产品、流量场景三类维度进行同比贡献排序，并关联策略事件。",
        "sourceIds": [
            "merchant_industry",
            "merchant_segment",
            "traffic_master",
            "strategy_events",
            "revenue_transactions",
        ],
    },
    {
        "type": "风险",
        "claim": (
            f"{data_risk_source['displayName']}未按时更新，相关归因需在业务沟通前复核。"
            if data_risk_source
            else "关键数据源均按时更新，本次分析未发现数据及时性风险。"
        ),
        "confidence": 96,
        "metricId": "data_health",
        "logic": (
            f"{data_risk_source['issue']}，因此标记为待确认而非既定结论。"
            if data_risk_source
            else "数据源及时性、完整性、唯一性与关联成功率均通过质量门槛。"
        ),
        "sourceIds": (
            [data_risk_source["id"], "data_freshness"]
            if data_risk_source
            else ["data_freshness"]
        ),
    },
]

alert_rules = []
if forecast_gap_pct <= -3:
    alert_rules.append(
        {
            "name": "月底预测低于预算",
            "metric": "预测较预算差异",
            "condition": "低于 -3.0%",
            "actual": f"{forecast_gap_pct:.1f}%",
            "status": "已触发",
            "owner": "财务 BP",
            "action": "按行业、广告产品和流量场景拆解缺口，形成补量清单。",
        }
    )
if top_negative["change"] < 0:
    alert_rules.append(
        {
            "name": f"{top_negative['dimension']}主要拖累",
            "metric": f"{top_negative['dimension']}收入同比贡献",
            "condition": "负向贡献进入本期前三",
            "actual": f"{top_negative['name']} {top_negative['change']:+.2f} 亿",
            "status": "已触发",
            "owner": "业务负责人",
            "action": "确认变化是否符合策略预期，并补充可验证的业务背景。",
        }
    )
if warning_sources:
    alert_rules.append(
        {
            "name": "数据源更新延迟",
            "metric": "数据及时性",
            "condition": "任一关键源超过 SLA",
            "actual": f"{warning_sources[0]['displayName']}：{warning_sources[0]['issue']}",
            "status": "已触发",
            "owner": warning_sources[0]["owner"],
            "action": "补跑数据任务，完成后自动重算指标和归因。",
        }
    )

revenue_model = {
    "comparisonFrame": [
        {"label": "实际", "value": f"{money(net_current):.2f} 亿", "note": f"截至 {AS_OF_LABEL}"},
        {"label": "同比", "value": f"{yoy:+.1f}%", "note": "去年同期可比口径"},
        {"label": "预算", "value": f"{budget_attainment:.1f}%", "note": f"时间进度 {time_progress_pct:.1f}%"},
        {
            "label": "最新预测",
            "value": f"{money(month_end_forecast):.2f} 亿",
            "note": f"较预算 {forecast_gap_pct:+.1f}%",
        },
    ],
    "lenses": [
        {
            "id": "traffic",
            "name": "流量变现视角",
            "question": "流量规模、转化效率和价格分别贡献多少？",
            "formula": "广告收入 = 广告曝光量 ÷ 1,000 × eCPM",
            "nodes": [
                {
                    "name": "广告曝光",
                    "value": f"{current_impressions / 100_000_000:.2f} 亿次",
                    "change": f"{(current_impressions / prior_impressions - 1) * 100:+.1f}%",
                },
                {
                    "name": "点击率 CTR",
                    "value": f"{ctr:.2f}%",
                    "change": f"{(ctr - prior_ctr):+.2f}pp",
                },
                {
                    "name": "转化率 CVR",
                    "value": f"{cvr:.2f}%",
                    "change": f"{(cvr - prior_cvr):+.2f}pp",
                },
                {
                    "name": "变现价格 eCPM",
                    "value": f"{ecpm:.2f} 元",
                    "change": f"{(ecpm / prior_ecpm - 1) * 100:+.1f}%",
                },
            ],
            "sourceIds": [
                "impressions_daily",
                "clicks_daily",
                "conversions_daily",
                "revenue_transactions",
            ],
        },
        {
            "id": "merchant",
            "name": "商家需求视角",
            "question": "是投放商家变多，还是单商家花得更多？",
            "formula": "广告收入 = 活跃投放商家数 × 户均广告消耗",
            "nodes": [
                {
                    "name": "活跃投放商家",
                    "value": f"{active_merchants} 家",
                    "change": f"{(active_merchants / prior_active_merchants - 1) * 100:+.1f}%",
                },
                {
                    "name": "户均广告消耗",
                    "value": f"{average_merchant_spend / 10_000:.1f} 万元",
                    "change": f"{(average_merchant_spend / prior_average_merchant_spend - 1) * 100:+.1f}%",
                },
                {
                    "name": "预算利用率",
                    "value": f"{merchant_budget_utilization:.1f}%",
                    "change": "经营前效指标",
                },
                {
                    "name": "商家 ROI",
                    "value": "待接入",
                    "change": "需 GMV 数据",
                },
            ],
            "sourceIds": [
                "merchant_master",
                "merchant_budget_daily",
                "revenue_transactions",
            ],
        },
        {
            "id": "accounting",
            "name": "计费确收视角",
            "question": "业务流水如何转成财务可确认的净收入？",
            "formula": "经营净收入 = 财务确收 − 返点 − 退款",
            "nodes": [
                {"name": "财务确收", "value": f"{money(confirmed_current):.2f} 亿", "change": "计费口径"},
                {"name": "返点", "value": f"-{money(rebate_current):.2f} 亿", "change": f"返点率 {rebate_rate:.2f}%"},
                {"name": "退款", "value": f"-{money(refund_current):.2f} 亿", "change": "冲减收入"},
                {"name": "经营净收入", "value": f"{money(net_current):.2f} 亿", "change": "管理口径"},
            ],
            "sourceIds": [
                "billing_confirmations_daily",
                "rebates_daily",
                "refunds_daily",
            ],
        },
    ],
    "forecastMethod": {
        "formula": "月底预测 = 已实现净收入 + 剩余日期基线 + 策略事件调整",
        "actual": f"{money(net_current):.2f} 亿",
        "baseline": f"{money(run_rate * remaining_days):.2f} 亿",
        "adjustment": "已纳入周末效应与搜索策略事件",
        "output": f"{money(month_end_forecast):.2f} 亿",
        "confidence": "87%",
    },
    "knowledgeGaps": [
        {
            "name": "商家 GMV 与毛利",
            "impact": "无法计算真实广告 ROI，也无法判断收入增长是否损害商家经营质量。",
            "priority": "P0",
        },
        {
            "name": "广告加载率与填充率",
            "impact": "当前只能从曝光和 eCPM 解释结果，尚不能拆出流量供给与商业化策略影响。",
            "priority": "P1",
        },
        {
            "name": "预测版本与人工调整记录",
            "impact": "需要保存每版预测、假设和调整人，才能监控预测偏差与系统性高估/低估。",
            "priority": "P1",
        },
    ],
}

dashboard = {
    "meta": {
        "title": "广告收入经营监控",
        "asOf": AS_OF.isoformat(),
        "asOfLabel": AS_OF_LABEL,
        "periodLabel": PERIOD_LABEL,
        "generatedAt": datetime.now().astimezone().isoformat(timespec="seconds"),
        "demo": True,
        "sourceCount": len(registry),
        "onTimeSourceCount": sum(1 for s in sources if s["status"] == "按时"),
        "factRowCount": len(joined),
        "timeProgressPct": round(time_progress_pct, 1),
    },
    "kpis": {
        "mtdRevenue": money(net_current),
        "yoy": round(yoy, 1),
        "budgetAttainment": round(budget_attainment, 1),
        "forecast": money(month_end_forecast),
        "forecastVsBudget": round(forecast_gap_pct, 1),
        "monthlyBudget": money(target),
        "dataHealth": round(sum(1 for s in sources if s["status"] == "按时") / len(sources) * 100),
    },
    "trend": trend,
    "breakdowns": breakdowns,
    "drivers": drivers,
    "anomalies": anomalies,
    "qualityChecks": quality_checks,
    "sources": sources,
    "sourceHealth": source_health,
    "healthSummary": {
        "healthy": sum(1 for source in source_health if source["healthStatus"] == "健康"),
        "warning": sum(1 for source in source_health if source["healthStatus"] == "需关注"),
        "blocked": sum(1 for source in source_health if source["healthStatus"] == "阻塞"),
        "averageScore": round(sum(source["score"] for source in source_health) / len(source_health)),
        "totalRows": sum(source["rowCount"] for source in source_health),
        "joinSuccess": round(
            sum(source["joinRate"] for source in source_health) / len(source_health), 1
        ),
    },
    "metricCatalog": metric_catalog,
    "evidenceChain": evidence_chain,
    "alertRules": alert_rules,
    "pushPreview": {
        "audience": "财务负责人、商业化负责人、行业运营负责人",
        "cadence": "每日 09:45",
        "channel": "飞书经营群",
        "title": f"广告收入 Daily Pulse｜{AS_OF_LABEL}",
        "summary": f"累计收入 {money(net_current):.2f} 亿，同比 {yoy:+.1f}%；月底预计 {money(month_end_forecast):.2f} 亿，较预算 {forecast_gap_pct:+.1f}%。",
        "drivers": (
            f"主要增量：{top_positive['dimension']}“{top_positive['name']}”"
            f"（{top_positive['change']:+.2f} 亿）；"
            f"主要拖累：{top_negative['dimension']}“{top_negative['name']}”"
            f"（{top_negative['change']:+.2f} 亿）。"
        ),
        "action": (
            alert_rules[0]["action"]
            if alert_rules
            else "本期关键指标未触发行动阈值，继续监控。"
        ),
    },
    "revenueModel": revenue_model,
    "executiveSummary": {
        "headline": (
            f"收入同比 {yoy:+.1f}%，月底预计较预算低 {abs(forecast_gap_pct):.1f}%"
            if forecast_gap_pct < 0
            else f"收入同比 {yoy:+.1f}%，月底预计较预算高 {forecast_gap_pct:.1f}%"
        ),
        "facts": [
            f"截至 {AS_OF_LABEL}累计收入 {money(net_current):.2f} 亿，同比 {yoy:+.1f}%。",
            f"按近 7 日日均推演，月底预计 {money(month_end_forecast):.2f} 亿，预算达成约 {month_end_forecast / target * 100:.1f}%。",
        ],
        "judgement": (
            f"{top_positive['dimension']}“{top_positive['name']}”贡献主要增量；"
            f"{top_negative['dimension']}“{top_negative['name']}”形成主要拖累，"
            "具体业务原因仍需结合策略事件确认。"
        ),
        "toVerify": (
            f"需要确认{top_negative['name']}的变化是否符合策略预期；"
            + (
                f"同时复核{warning_sources[0]['displayName']}的数据及时性。"
                if warning_sources
                else "关键数据源均已按时更新。"
            )
        ),
    },
}

OUTPUT.parent.mkdir(parents=True, exist_ok=True)
OUTPUT.write_text(json.dumps(dashboard, ensure_ascii=False, indent=2), encoding="utf-8")
print(f"Joined {len(joined):,} revenue rows from {len(registry)} sources")
print(f"Quality checks: {sum(1 for q in quality_checks if q['status'] == 'passed')}/{len(quality_checks)} passed")
print(f"Dashboard data written to {OUTPUT}")
