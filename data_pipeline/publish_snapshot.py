#!/usr/bin/env python3
"""把最新 dashboard 快照提交给线上收入分析 Skill。"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SNAPSHOT = PROJECT_ROOT / "app" / "data" / "dashboard.json"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="发布收入分析数据快照")
    parser.add_argument(
        "--url",
        default=os.environ.get(
            "REVENUE_PULSE_URL",
            "https://revenue-pulse-mvp.happynamely.chatgpt.site",
        ),
        help="Revenue Pulse 站点地址",
    )
    parser.add_argument(
        "--token",
        default=os.environ.get("REVENUE_PUSH_TOKEN", ""),
        help="服务端执行令牌；建议通过环境变量提供",
    )
    parser.add_argument(
        "--snapshot",
        type=Path,
        default=DEFAULT_SNAPSHOT,
        help="由数据管道生成的 dashboard.json",
    )
    parser.add_argument(
        "--push",
        action="store_true",
        help="分析完成后同步发送飞书",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="只检查快照，不调用线上接口",
    )
    return parser.parse_args()


def load_snapshot(path: Path) -> dict:
    if not path.exists():
        raise SystemExit(f"找不到快照文件：{path}")
    try:
        snapshot = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise SystemExit(f"快照 JSON 格式错误：{exc}") from exc

    required_paths = [
        ("meta", "asOf"),
        ("kpis", "mtdRevenue"),
        ("healthSummary", "averageScore"),
    ]
    for parent, child in required_paths:
        if parent not in snapshot or child not in snapshot[parent]:
            raise SystemExit(f"快照缺少必填字段：{parent}.{child}")
    return snapshot


def publish(url: str, token: str, snapshot: dict, should_push: bool) -> dict:
    if not token:
        raise SystemExit("缺少 REVENUE_PUSH_TOKEN，不能调用线上执行接口。")

    endpoint = f"{url.rstrip('/')}/api/analysis/run"
    request = urllib.request.Request(
        endpoint,
        data=json.dumps(
            {"snapshot": snapshot, "push": should_push},
            ensure_ascii=False,
        ).encode("utf-8"),
        method="POST",
        headers={
            "content-type": "application/json; charset=utf-8",
            "x-revenue-push-token": token,
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise SystemExit(f"线上执行失败（HTTP {exc.code}）：{detail}") from exc
    except urllib.error.URLError as exc:
        raise SystemExit(f"无法连接线上执行接口：{exc.reason}") from exc


def main() -> int:
    args = parse_args()
    snapshot = load_snapshot(args.snapshot)
    if args.dry_run:
        print(
            json.dumps(
                {
                    "ok": True,
                    "mode": "dry-run",
                    "as_of": snapshot["meta"]["asOf"],
                    "source_count": snapshot["meta"].get("sourceCount"),
                    "mtd_revenue": snapshot["kpis"]["mtdRevenue"],
                },
                ensure_ascii=False,
            )
        )
        return 0

    result = publish(args.url, args.token, snapshot, args.push)
    brief = result.get("brief", {})
    print(
        json.dumps(
            {
                "ok": result.get("ok", False),
                "run_id": brief.get("run_id"),
                "as_of": brief.get("as_of"),
                "engine": brief.get("engine"),
                "quality_status": brief.get("data_quality", {}).get("status"),
                "channel": result.get("channel"),
            },
            ensure_ascii=False,
        )
    )
    return 0 if result.get("ok") else 1


if __name__ == "__main__":
    sys.exit(main())
