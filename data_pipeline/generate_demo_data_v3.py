#!/usr/bin/env python3
"""Generate deterministic, anonymous advertising-revenue demo data for v3."""

from __future__ import annotations

import csv
import random
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "data" / "v3"
RANDOM = random.Random(20260728)

SCENES = ["首页推荐", "搜索", "商品详情", "直播"]
FORMATS = ["信息流", "搜索广告", "直播广告"]
CATEGORIES = ["服饰", "美妆", "食品", "数码"]
TIERS = ["头部", "中腰部", "成长型"]


def write_csv(filename: str, fieldnames: list[str], rows: list[dict[str, object]]) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    with (OUT / filename).open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)


def period_dates(start: date, days: int = 14) -> list[date]:
    return [start + timedelta(days=offset) for offset in range(days)]


def generate_operations() -> None:
    rows: list[dict[str, object]] = []
    periods = [
        ("comparison", period_dates(date(2026, 6, 17)), 1.0),
        ("current", period_dates(date(2026, 7, 1)), 1.12),
    ]
    for period, dates, growth in periods:
        for day_index, day in enumerate(dates):
            for scene_index, scene in enumerate(SCENES):
                for format_index, ad_format in enumerate(FORMATS):
                    category = CATEGORIES[(day_index + scene_index + format_index) % len(CATEGORIES)]
                    tier = TIERS[(scene_index + format_index) % len(TIERS)]
                    base_vv = 1_500_000 * (1 + scene_index * 0.16) * growth
                    monetizable_vv = round(base_vv * (0.96 + RANDOM.random() * 0.08))
                    opportunities = round(monetizable_vv * (1.08 + 0.04 * format_index))
                    request_rate = 0.875 + 0.012 * scene_index + (0.012 if period == "current" else 0)
                    requests = round(opportunities * request_rate)
                    fill_rate = 0.79 + 0.025 * format_index + (0.018 if period == "current" else 0)
                    filled = round(requests * fill_rate)
                    render_rate = 0.91 + 0.008 * scene_index
                    impressions = round(filled * render_rate)
                    ctr = 0.011 + scene_index * 0.0015 + format_index * 0.0008
                    clicks = round(impressions * ctr)
                    ecpm = 52 + scene_index * 5 + format_index * 7 + (2.8 if period == "current" else 0)
                    revenue = round(impressions * ecpm / 1000, 2)
                    rows.append(
                        {
                            "date": day.isoformat(),
                            "period": period,
                            "ad_format": ad_format,
                            "traffic_scene": scene,
                            "billing_method": "CPC" if ad_format == "搜索广告" else "CPM",
                            "category": category,
                            "advertiser_tier": tier,
                            "monetizable_vv": monetizable_vv,
                            "opportunities": opportunities,
                            "requests": requests,
                            "filled_requests": filled,
                            "impressions": impressions,
                            "clicks": clicks,
                            "actual_ad_spend": revenue,
                            "revenue": revenue,
                        }
                    )
    write_csv(
        "ad_operations.csv",
        [
            "date",
            "period",
            "ad_format",
            "traffic_scene",
            "billing_method",
            "category",
            "advertiser_tier",
            "monetizable_vv",
            "opportunities",
            "requests",
            "filled_requests",
            "impressions",
            "clicks",
            "actual_ad_spend",
            "revenue",
        ],
        rows,
    )


def generate_commerce() -> None:
    rows: list[dict[str, object]] = []
    for period, dates, growth in [
        ("comparison", period_dates(date(2026, 6, 17)), 1.0),
        ("current", period_dates(date(2026, 7, 1)), 1.09),
    ]:
        for day_index, day in enumerate(dates):
            for scene_index, scene in enumerate(SCENES):
                for category_index, category in enumerate(CATEGORIES):
                    gmv = round(
                        12_000_000
                        * growth
                        * (1 + scene_index * 0.09)
                        * (1 + category_index * 0.07)
                        * (0.97 + RANDOM.random() * 0.06),
                        2,
                    )
                    rows.append(
                        {
                            "date": day.isoformat(),
                            "period": period,
                            "traffic_scene": scene,
                            "category": category,
                            "gmv": gmv,
                            "orders": round(gmv / (190 + category_index * 24)),
                        }
                    )
    write_csv(
        "commerce.csv",
        ["date", "period", "traffic_scene", "category", "gmv", "orders"],
        rows,
    )


def generate_advertiser_health() -> None:
    rows: list[dict[str, object]] = []
    for period, growth in [("comparison", 1.0), ("current", 1.08)]:
        for tier_index, tier in enumerate(TIERS):
            prior_active = 1600 + tier_index * 1100
            active = round(prior_active * growth)
            retained = round(prior_active * (0.82 + tier_index * 0.025))
            spend = round((7_800_000 + tier_index * 2_400_000) * growth, 2)
            roi = 5.1 - tier_index * 0.35 + (0.16 if period == "current" else 0)
            rows.append(
                {
                    "period": period,
                    "advertiser_tier": tier,
                    "active_advertisers": active,
                    "prior_active_advertisers": prior_active,
                    "retained_advertisers": retained,
                    "actual_ad_spend": spend,
                    "attributed_gmv": round(spend * roi, 2),
                }
            )
    write_csv(
        "advertiser_health.csv",
        [
            "period",
            "advertiser_tier",
            "active_advertisers",
            "prior_active_advertisers",
            "retained_advertisers",
            "actual_ad_spend",
            "attributed_gmv",
        ],
        rows,
    )


def generate_experience() -> None:
    rows: list[dict[str, object]] = []
    for period, dates, growth in [
        ("comparison", period_dates(date(2026, 6, 17)), 1.0),
        ("current", period_dates(date(2026, 7, 1)), 1.06),
    ]:
        for day_index, day in enumerate(dates):
            for scene_index, scene in enumerate(SCENES):
                rows.append(
                    {
                        "date": day.isoformat(),
                        "period": period,
                        "traffic_scene": scene,
                        "dau": round((1_900_000 + scene_index * 180_000) * growth),
                        "bounce_rate": round(
                            0.245 - scene_index * 0.009 - (0.007 if period == "current" else 0),
                            4,
                        ),
                        "average_dwell_seconds": round(
                            356 + scene_index * 21 + (14 if period == "current" else 0),
                            2,
                        ),
                        "organic_conversion_rate": round(
                            0.028 + scene_index * 0.003 + (0.0015 if period == "current" else 0),
                            4,
                        ),
                    }
                )
    write_csv(
        "user_experience.csv",
        [
            "date",
            "period",
            "traffic_scene",
            "dau",
            "bounce_rate",
            "average_dwell_seconds",
            "organic_conversion_rate",
        ],
        rows,
    )


def generate_strategy_events() -> None:
    write_csv(
        "strategy_events.csv",
        ["event_id", "label", "start", "end", "traffic_scene"],
        [
            {
                "event_id": "evt-demo-001",
                "label": "搜索广告样式实验（模拟）",
                "start": "2026-07-06",
                "end": "2026-07-10",
                "traffic_scene": "搜索",
            }
        ],
    )


def main() -> None:
    generate_operations()
    generate_commerce()
    generate_advertiser_health()
    generate_experience()
    generate_strategy_events()
    print(f"Generated v3 demo sources in {OUT}")


if __name__ == "__main__":
    main()
