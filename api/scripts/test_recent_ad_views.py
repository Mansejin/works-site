#!/usr/bin/env python3
"""Unit tests for recent longform traffic-source / ad-view attribution."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.routes.youtube_report import _build_recent_videos_bar
from app.youtube_analytics import (
    aggregate_video_advertising_views,
    aggregate_video_traffic_source_views,
)


def test_aggregate_sums_advertising_only() -> None:
    rows = [
        {"video": "a", "insightTrafficSourceType": "ADVERTISING", "views": 100},
        {"video": "a", "insightTrafficSourceType": "YT_SEARCH", "views": 50},
        {"video": "b", "insightTrafficSourceType": "ADVERTISING", "views": 20},
        {"video": "b", "insightTrafficSourceType": "ADVERTISING", "views": 5},
        {"video": "c", "insightTrafficSourceType": "SUBSCRIBER", "views": 99},
    ]
    assert aggregate_video_advertising_views(rows) == {"a": 100, "b": 25}


def test_aggregate_traffic_source_totals() -> None:
    rows = [
        {"video": "daiso", "insightTrafficSourceType": "ADVERTISING", "views": 20387},
        {"video": "daiso", "insightTrafficSourceType": "YT_SEARCH", "views": 77},
        {"video": "daiso", "insightTrafficSourceType": "BROWSE_FEATURES", "views": 71},
        {"video": "daiso", "insightTrafficSourceType": "CHANNEL_PAGE", "views": 47},
        {"video": "daiso", "insightTrafficSourceType": "DIRECT_OR_UNKNOWN", "views": 9},
        {"video": "daiso", "insightTrafficSourceType": "EXT_URL", "views": 5},
        {"video": "daiso", "insightTrafficSourceType": "END_SCREEN", "views": 4},
        {"video": "daiso", "insightTrafficSourceType": "NOTIFICATION", "views": 3},
        {"video": "daiso", "insightTrafficSourceType": "RELATED_VIDEO", "views": 1},
        {"video": "daiso", "insightTrafficSourceType": "OTHER", "views": 1},
        {"video": "daiso", "insightTrafficSourceType": "PLAYLIST", "views": 1},
    ]
    totals = aggregate_video_traffic_source_views(rows)
    assert totals["daiso"]["views"] == 20606
    assert totals["daiso"]["adViews"] == 20387


def test_chart_uses_traffic_sum_for_views() -> None:
    videos = [
        {
            "id": "vid-daiso",
            "title": "다이소 여름 꿀템 BEST 20",
            "views": 20585,  # Data API (slightly off vs Studio Advanced Mode)
            "durationSec": 586,
        }
    ]
    rows = _build_recent_videos_bar(
        videos,
        promotions=[],
        traffic_views_map={"vid-daiso": {"views": 20606, "adViews": 20387}},
    )
    assert rows[0]["views"] == 20606
    assert rows[0]["dataApiViews"] == 20585
    assert rows[0]["adViews"] == 20387
    assert rows[0]["organicViews"] == 20606 - 20387
    assert rows[0]["viewsSource"] == "traffic"
    assert rows[0]["adViewsSource"] == "analytics"


def test_chart_prefers_analytics_over_small_promo() -> None:
    videos = [
        {
            "id": "vid-lumena",
            "title": "10만 원 대 예쁜 제습기? 루메나 오브제 제습기 직접 써봤습니다",
            "views": 5974,
            "durationSec": 372,
        }
    ]
    promotions = [
        {
            "id": "lumena-objet-views",
            "title": "루메나 오브제 제습기 (조회수)",
            "videoTitle": "10만 원 대 예쁜 제습기? 루메나 오브제 제습기 직접 써봤습니다",
            "videoId": "vid-lumena",
            "views": 455,
        }
    ]
    rows = _build_recent_videos_bar(
        videos,
        promotions,
        traffic_views_map={"vid-lumena": {"views": 5974, "adViews": 5660}},
    )
    assert len(rows) == 1
    assert rows[0]["adViews"] == 5660
    assert rows[0]["organicViews"] == 5974 - 5660
    assert rows[0]["adViewsSource"] == "analytics"


def test_chart_uses_promo_when_analytics_missing() -> None:
    videos = [
        {
            "id": "vid-lenovo",
            "title": "펜까지 기본인데 26만 원? 레노버 아이디어 탭 11 솔직 리뷰",
            "views": 10808,
            "durationSec": 306,
        }
    ]
    promotions = [
        {
            "id": "lenovo-ideatab11-subs",
            "title": "레노버 아이디어 탭 11 (구독)",
            "videoTitle": "펜까지 기본인데 26만 원? 레노버 아이디어 탭 11 솔직 리뷰",
            "videoId": "vid-lenovo",
            "views": 298,
        },
        {
            "id": "lenovo-ideatab11-views",
            "title": "레노버 아이디어 탭 11 (조회수)",
            "videoTitle": "펜까지 기본인데 26만 원? 레노버 아이디어 탭 11 솔직 리뷰",
            "videoId": "vid-lenovo",
            "views": 67,
        },
    ]
    rows = _build_recent_videos_bar(videos, promotions, traffic_views_map={})
    assert rows[0]["views"] == 10808
    assert rows[0]["viewsSource"] == "dataApi"
    assert rows[0]["adViews"] == 365
    assert rows[0]["adViewsSource"] == "promo"


def test_chart_picks_up_ads_without_studio_promo() -> None:
    videos = [
        {
            "id": "vid-daiso",
            "title": "다이소 여름 꿀템 BEST 20",
            "views": 20585,
            "durationSec": 586,
        }
    ]
    rows = _build_recent_videos_bar(
        videos,
        promotions=[],
        traffic_views_map={"vid-daiso": {"views": 20585, "adViews": 19880}},
    )
    assert rows[0]["adViews"] == 19880
    assert rows[0]["organicViews"] == 20585 - 19880
    assert rows[0]["adViewsSource"] == "analytics"


if __name__ == "__main__":
    test_aggregate_sums_advertising_only()
    test_aggregate_traffic_source_totals()
    test_chart_uses_traffic_sum_for_views()
    test_chart_prefers_analytics_over_small_promo()
    test_chart_uses_promo_when_analytics_missing()
    test_chart_picks_up_ads_without_studio_promo()
    print("ok")
