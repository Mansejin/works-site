#!/usr/bin/env python3
from __future__ import annotations

import shutil
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import app.ad_subscriber_events as events  # noqa: E402
from app.routes.youtube_report import (  # noqa: E402
    _build_subscriber_trend,
    _cumulative_promo_subscribers,
    _promo_ad_delta,
)


def test_watermark_emits_delta_only_on_increase(tmp_path: Path) -> None:
    events.EVENTS_FILE = tmp_path / "ad-subscriber-events.json"
    promos = [
        {
            "id": "studio-a",
            "goal": "시청자층 성장",
            "subscribers": 100,
            "source": "studio",
        }
    ]
    first = events.ingest_promo_subscriber_snapshots(promos, as_of="2026-08-01")
    assert first["seeded"] == 1
    assert first["deltaAdded"] == 0
    assert events.event_timeline() == []

    promos[0]["subscribers"] = 130
    second = events.ingest_promo_subscriber_snapshots(promos, as_of="2026-08-07")
    assert second["deltaAdded"] == 30
    timeline = events.event_timeline()
    assert timeline == [(date(2026, 8, 7), 30)]
    assert _promo_ad_delta(timeline, date(2026, 8, 7), date(2026, 7, 31)) == 30
    assert _cumulative_promo_subscribers(timeline, date(2026, 8, 7)) == 30


def test_google_ads_daily_events_replace_window(tmp_path: Path) -> None:
    events.EVENTS_FILE = tmp_path / "ad-subscriber-events.json"
    events.replace_google_ads_subscribe_events(
        [
            {"date": "2026-08-01", "promoId": "ads-1", "delta": 10},
            {"date": "2026-08-02", "promoId": "ads-1", "delta": 5},
        ],
        wipe_start="2026-08-01",
        wipe_end="2026-08-02",
    )
    events.replace_google_ads_subscribe_events(
        [{"date": "2026-08-01", "promoId": "ads-1", "delta": 12}],
        wipe_start="2026-08-01",
        wipe_end="2026-08-02",
    )
    timeline = events.event_timeline()
    assert timeline == [(date(2026, 8, 1), 12)]


def test_trend_uses_event_deltas_not_lifetime(tmp_path: Path) -> None:
    events.EVENTS_FILE = tmp_path / "ad-subscriber-events.json"
    events.replace_google_ads_subscribe_events(
        [{"date": "2026-07-16", "promoId": "ads-1", "delta": 40}],
        wipe_start="2026-07-01",
        wipe_end="2026-07-31",
    )
    snapshots = {
        "snapshots": [
            {"label": "2주전", "total": 1000, "date": "2026-07-05"},
            {"label": "1주전", "total": 1300, "date": "2026-07-12"},
            {"label": "최신", "total": 1500, "date": "2026-07-19"},
        ]
    }
    promos = [
        {
            "id": "studio-huge",
            "goal": "시청자층 성장",
            "subscribers": 4000,
            "capturedAt": "2026-07-16",
            "endDate": "2026-07-16",
        }
    ]
    trend = _build_subscriber_trend(snapshots, 1500, promotions=promos)
    points = trend["points"]
    assert points[-1]["adDelta"] == 40
    assert points[-1]["organicDelta"] == 160


if __name__ == "__main__":
    base = Path(__file__).resolve().parent / "_tmp_ad_events"
    if base.exists():
        shutil.rmtree(base)
    for name, fn in [
        ("w1", test_watermark_emits_delta_only_on_increase),
        ("w2", test_google_ads_daily_events_replace_window),
        ("w3", test_trend_uses_event_deltas_not_lifetime),
    ]:
        path = base / name
        path.mkdir(parents=True)
        fn(path)
    shutil.rmtree(base)
    print("ok")
