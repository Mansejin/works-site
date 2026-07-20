#!/usr/bin/env python3
from __future__ import annotations

import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.routes.youtube_report import (  # noqa: E402
    _align_analytics_weeks,
    _build_subscriber_trend,
    _cumulative_promo_subscribers,
    _promo_ad_subscribers_by_date,
)


def test_promo_timeline_is_date_ordered() -> None:
    promos = [
        {
            "goal": "시청자층 성장",
            "subscribers": 100,
            "capturedAt": "2026-07-01",
            "endDate": "2026-07-10",
        },
        {
            "goal": "시청자층 성장",
            "subscribers": 200,
            "capturedAt": "2026-07-16",
            "endDate": "2026-07-16",
        },
    ]
    timeline = _promo_ad_subscribers_by_date(promos)
    assert timeline == [(date(2026, 7, 10), 100), (date(2026, 7, 16), 200)]
    assert _cumulative_promo_subscribers(timeline, date(2026, 7, 10)) == 100
    assert _cumulative_promo_subscribers(timeline, date(2026, 7, 20)) == 300


def test_build_subscriber_trend_uses_promo_dates() -> None:
    snapshots = {
        "snapshots": [
            {"label": "2주전", "total": 1000},
            {"label": "1주전", "total": 1300},
            {"label": "최신", "total": 1500},
        ]
    }
    promos = [
        {
            "goal": "시청자층 성장",
            "subscribers": 400,
            "capturedAt": "2026-07-01",
            "endDate": "2026-07-01",
        },
        {
            "goal": "시청자층 성장",
            "subscribers": 300,
            "capturedAt": "2026-07-16",
            "endDate": "2026-07-16",
        },
        {
            "goal": "동영상 조회수",
            "subscribers": 99,
            "notes": ["Studio 캡처 2026-07-16"],
        },
    ]
    trend = _build_subscriber_trend(snapshots, 1500, promotions=promos)
    points = trend["points"]
    assert len(points) == 3
    assert points[-1]["adDriven"] <= 700
    assert points[-1]["organic"] == 1500 - points[-1]["adDriven"]
    assert trend["method"] == "promo-dated"


def test_build_subscriber_trend_rebuilds_totals_from_analytics() -> None:
    snapshots = {
        "snapshots": [
            {"label": "2주전", "total": 1},
            {"label": "1주전", "total": 1},
            {"label": "최신", "total": 1},
        ]
    }
    analytics_weeks = {
        "ok": True,
        "weeks": [
            {"week": 202627, "net": 100, "adGained": 60, "organicGained": 40},
            {"week": 202628, "net": 200, "adGained": 120, "organicGained": 80},
            {"week": 202629, "net": 300, "adGained": 180, "organicGained": 120},
        ],
    }
    week_ends = [date(2026, 7, 6), date(2026, 7, 13), date(2026, 7, 20)]
    aligned = _align_analytics_weeks(analytics_weeks["weeks"], week_ends)
    assert all(item is not None for item in aligned)

    trend = _build_subscriber_trend(
        snapshots,
        1600,
        promotions=[],
        analytics_weeks=analytics_weeks,
    )
    totals = [point["total"] for point in trend["points"]]
    assert totals[-1] == 1600
    assert totals[1] == 1300
    assert totals[0] == 1100
    assert trend["method"] == "analytics+promo"


def test_organic_does_not_drop_when_promo_batch_exceeds_total() -> None:
    snapshots = {
        "snapshots": [
            {"label": "2주전", "total": 1000},
            {"label": "1주전", "total": 1300},
            {"label": "최신", "total": 1500},
        ]
    }
    promos = [
        {
            "goal": "시청자층 성장",
            "subscribers": 4000,
            "capturedAt": "2026-07-16",
            "endDate": "2026-07-16",
        }
    ]
    trend = _build_subscriber_trend(snapshots, 5610, promotions=promos)
    points = trend["points"]
    assert points[-2]["organic"] == 1300
    assert points[-1]["organic"] > 0
    assert points[-1]["organic"] >= points[-2]["organic"]
    assert points[-1]["total"] == 5610


if __name__ == "__main__":
    test_promo_timeline_is_date_ordered()
    test_build_subscriber_trend_uses_promo_dates()
    test_build_subscriber_trend_rebuilds_totals_from_analytics()
    test_organic_does_not_drop_when_promo_batch_exceeds_total()
    print("ok")
