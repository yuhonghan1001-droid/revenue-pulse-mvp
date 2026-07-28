#!/usr/bin/env python3
"""Publish only the reviewed demo aggregate input to the v3 analysis API."""

from __future__ import annotations

import argparse
import json
import os
import urllib.error
import urllib.request
from pathlib import Path

PROJECT = Path(__file__).resolve().parents[1]
SNAPSHOT = PROJECT / "app" / "data" / "dashboard-v3.json"
AUDIT = PROJECT / "work" / "timing-v3.json"
RESPONSE_PATH = PROJECT / "work" / "analysis-response-v3.json"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--url",
        default=os.environ.get(
            "REVENUE_PULSE_URL",
            "https://revenue-pulse-mvp.happynamely.chatgpt.site",
        ),
    )
    args = parser.parse_args()
    token = os.environ.get("REVENUE_PUSH_TOKEN")
    if not token:
        raise SystemExit("REVENUE_PUSH_TOKEN is required")
    snapshot = json.loads(SNAPSHOT.read_text(encoding="utf-8"))
    if snapshot["input"].get("classification") != "demo":
        raise SystemExit("Automation may publish demo inputs only")
    timestamps = (
        json.loads(AUDIT.read_text(encoding="utf-8")) if AUDIT.exists() else {}
    )
    request = urllib.request.Request(
        f"{args.url.rstrip('/')}/api/v3/analyses",
        data=json.dumps(
            {"input": snapshot["input"], "timestamps": timestamps}
        ).encode("utf-8"),
        headers={
            "content-type": "application/json",
            "x-revenue-push-token": token,
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=45) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        body = error.read().decode("utf-8", errors="replace")
        raise SystemExit(f"v3 analysis API returned {error.code}: {body}") from error
    RESPONSE_PATH.parent.mkdir(parents=True, exist_ok=True)
    RESPONSE_PATH.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(
        json.dumps(
            {
                "ok": payload.get("ok"),
                "persisted": payload.get("persisted"),
                "analysis_id": payload.get("result", {}).get("analysisId"),
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
