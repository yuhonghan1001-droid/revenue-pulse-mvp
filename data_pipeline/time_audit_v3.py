#!/usr/bin/env python3
"""Record auditable workflow timestamps for the Revenue Pulse v3 demo run."""

from __future__ import annotations

import argparse
import json
from datetime import datetime, time, timezone, timedelta
from pathlib import Path

PROJECT = Path(__file__).resolve().parents[1]
DEFAULT_PATH = PROJECT / "work" / "timing-v3.json"
SHANGHAI = timezone(timedelta(hours=8))
FIELDS = {
    "start": "started_at",
    "pipeline": "pipeline_finished_at",
    "analysis": "analysis_finished_at",
    "feishu": "feishu_sent_at",
    "complete": "completed_at",
}


def now_iso() -> str:
    return datetime.now(timezone.utc).astimezone(SHANGHAI).isoformat(timespec="seconds")


def scheduled_iso(now: datetime | None = None) -> str:
    current = (now or datetime.now(timezone.utc)).astimezone(SHANGHAI)
    scheduled = datetime.combine(current.date(), time(9, 45), SHANGHAI)
    return scheduled.isoformat(timespec="seconds")


def update(stage: str, path: Path = DEFAULT_PATH) -> dict[str, str | None]:
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        payload = json.loads(path.read_text(encoding="utf-8"))
    else:
        payload = {
            "timezone": "Asia/Shanghai",
            "scheduled_at": scheduled_iso(),
            "started_at": None,
            "pipeline_finished_at": None,
            "analysis_finished_at": None,
            "feishu_sent_at": None,
            "completed_at": None,
        }
    payload[FIELDS[stage]] = now_iso()
    path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    return payload


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("stage", choices=sorted(FIELDS))
    parser.add_argument("--path", type=Path, default=DEFAULT_PATH)
    args = parser.parse_args()
    payload = update(args.stage, args.path)
    print(json.dumps(payload, ensure_ascii=False))


if __name__ == "__main__":
    main()
