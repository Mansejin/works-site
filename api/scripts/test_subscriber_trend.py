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
    # Default: spread each campaign over 3 weeks ending on credit date
    assert sum(s for _, s in timeline) == 300
    assert _cumulative_promo_subscribers(timeline, date(2026, 7, 20)) == 300
    assert _cumulative_promo_subscribers(timeline, date(2026, 7, 10)) >= 100


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
            {"label": "2주전", "total": 1, "date": "2026-07-05"},
            {"label": "1주전", "total": 1, "date": "2026-07-12"},
            {"label": "최신", "total": 1, "date": "2026-07-19"},
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
    week_ends = [date(2026, 7, 5), date(2026, 7, 12), date(2026, 7, 19)]
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
    assert points[-2]["organic"] > 0
    assert points[-1]["organic"] > 0
    assert points[-1]["organic"] >= points[-2]["organic"]
    assert points[-1]["total"] == 5610
    assert all(point["organic"] > 0 for point in points)




def test_organic_updates_when_analytics_reports_zero_organic() -> None:
    snapshots = {
        "snapshots": [
            {"label": "2주전", "total": 1000, "organic": 400, "date": "2026-07-05"},
            {"label": "1주전", "total": 1300, "organic": 420, "date": "2026-07-12"},
            {"label": "최신", "total": 1500, "organic": 440, "date": "2026-07-19"},
        ]
    }
    analytics_weeks = {
        "ok": True,
        "weeks": [
            {"week": 202627, "net": 100, "adGained": 100, "organicGained": 0},
            {"week": 202628, "net": 200, "adGained": 200, "organicGained": 0},
            {"week": 202629, "net": 300, "adGained": 250, "organicGained": 0},
        ],
    }
    trend = _build_subscriber_trend(
        snapshots,
        1800,
        promotions=[],
        analytics_weeks=analytics_weeks,
    )
    points = trend["points"]
    assert points[0]["organic"] == 400
    assert points[1]["organic"] == 420
    # live bump 300 with analytics ad 250 → organic stock 440+50=490
    assert points[2]["organic"] == 490
    assert points[2]["organicDelta"] == 70  # 490 - previous 420
    assert points[2]["adDelta"] == 230  # totalDelta 300 - organicDelta 70
    assert points[2]["adDelta"] > points[2]["organicDelta"]


def test_promo_beats_undercounted_analytics_ad() -> None:
    """Studio promo subs should win when Analytics ADVERTISING undercounts."""
    snapshots = {
        "snapshots": [
            {"label": "2주전", "total": 1000, "organic": 400, "date": "2026-07-05"},
            {"label": "1주전", "total": 1300, "organic": 420, "date": "2026-07-12"},
            {"label": "최신", "total": 1500, "organic": 440, "date": "2026-07-19"},
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
    analytics_weeks = {
        "ok": True,
        "weeks": [
            {"week": 202627, "net": 100, "adGained": 10, "organicGained": 90},
            {"week": 202628, "net": 200, "adGained": 10, "organicGained": 190},
            {"week": 202629, "net": 500, "adGained": 18, "organicGained": 480},
        ],
    }
    trend = _build_subscriber_trend(
        snapshots,
        2000,
        promotions=promos,
        analytics_weeks=analytics_weeks,
    )
    points = trend["points"]
    assert points[-1]["total"] == 2000
    # Tip growth should be mostly ad (promo), not organic
    assert points[-1]["adDelta"] >= points[-1]["organicDelta"]
    assert points[-1]["organic"] <= 500
    assert points[-1]["adDriven"] > points[-1]["organic"]


def test_organic_updates_despite_same_day_promo_dump() -> None:
    snapshots = {
        "snapshots": [
            {"label": "2주전", "total": 1000, "organic": 400, "date": "2026-07-05"},
            {"label": "1주전", "total": 1300, "organic": 420, "date": "2026-07-12"},
            {"label": "최신", "total": 1500, "organic": 440, "date": "2026-07-19"},
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
    trend = _build_subscriber_trend(snapshots, 2000, promotions=promos)
    points = trend["points"]
    assert points[-1]["total"] == 2000
    # Promo claims the tip — organic stays at snapshot baseline (no invented growth)
    assert points[-1]["organic"] == 440
    assert points[-1]["adDriven"] == 1560
    assert points[-1]["adDelta"] >= points[-1]["organicDelta"]

def test_live_tip_uses_historical_ad_share_when_signals_undercount() -> None:
    """When Analytics/promo miss the tip, use snapshot ad-share so organic isn't inflated."""
    snapshots = {
        "snapshots": [
            {"label": "2주전", "total": 1000, "organic": 400, "date": "2026-07-05"},
            {"label": "1주전", "total": 1300, "organic": 420, "date": "2026-07-12"},
            {"label": "최신", "total": 1500, "organic": 440, "date": "2026-07-19"},
        ]
    }
    # Growth 1000→1500 gained only +40 organic → ~92% historical ad share
    analytics_weeks = {
        "ok": True,
        "weeks": [
            {"week": 202627, "net": 100, "adGained": 10, "organicGained": 90},
            {"week": 202628, "net": 200, "adGained": 10, "organicGained": 190},
            {"week": 202629, "net": 500, "adGained": 18, "organicGained": 480},
        ],
    }
    trend = _build_subscriber_trend(
        snapshots,
        2000,
        promotions=[],
        analytics_weeks=analytics_weeks,
    )
    points = trend["points"]
    assert points[-1]["total"] == 2000
    assert points[-1]["adDelta"] > points[-1]["organicDelta"]
    assert points[-1]["organic"] < 600
    assert points[-1]["adDriven"] > points[-1]["organic"]


if __name__ == "__main__":
    test_promo_timeline_is_date_ordered()
    test_build_subscriber_trend_uses_promo_dates()
    test_build_subscriber_trend_rebuilds_totals_from_analytics()
    test_organic_does_not_drop_when_promo_batch_exceeds_total()
    test_organic_updates_when_analytics_reports_zero_organic()
    test_promo_beats_undercounted_analytics_ad()
    test_organic_updates_despite_same_day_promo_dump()
    test_live_tip_uses_historical_ad_share_when_signals_undercount()
    print("ok")
