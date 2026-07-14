"""Lightweight checks for Studio promotion payload parsing."""
from __future__ import annotations

from app.youtube_studio_promotions import extract_promotions_from_payload, normalize_studio_promo


def test_units_money_nested() -> None:
    payload = {
        "promotions": [
            {
                "promotionId": "abc123",
                "title": {"simpleText": "테스트 영상"},
                "status": "ACTIVE",
                "amountSpent": {"units": "45489", "nanos": 0, "currencyCode": "KRW"},
                "impressions": "12890",
                "views": 320,
                "subscribersGained": 12,
            }
        ]
    }
    promos = extract_promotions_from_payload(payload)
    assert len(promos) == 1
    assert promos[0]["cost"] == 45489
    assert promos[0]["impressions"] == 12890
    assert promos[0]["views"] == 320
    assert promos[0]["subscribers"] == 12


def test_metric_rows_korean_labels() -> None:
    payload = {
        "campaigns": [
            {
                "id": "camp-9",
                "name": "구독 프로모션",
                "metrics": [
                    {"label": {"simpleText": "비용"}, "value": {"simpleText": "₩12,000"}},
                    {"label": "노출수", "value": "5,432"},
                    {"label": "조회수", "value": "210"},
                    {"label": "구독자", "value": "8"},
                ],
            }
        ]
    }
    promos = extract_promotions_from_payload(payload)
    assert len(promos) == 1
    assert promos[0]["cost"] == 12000
    assert promos[0]["impressions"] == 5432
    assert promos[0]["views"] == 210
    assert promos[0]["subscribers"] == 8


def test_framework_updates_entity() -> None:
    payload = {
        "frameworkUpdates": {
            "entityBatchUpdate": {
                "mutations": [
                    {
                        "entityKey": "x",
                        "payload": {
                            "promotionEntity": {
                                "campaignId": "e1",
                                "title": "엔티티 프로모",
                                "lifecycleMetrics": {
                                    "spend": {"units": "9000", "currencyCode": "KRW"},
                                    "impressionCount": 1000,
                                    "viewCount": 50,
                                    "subscribersGained": 3,
                                },
                            }
                        },
                    }
                ]
            }
        }
    }
    promos = extract_promotions_from_payload(payload)
    assert len(promos) >= 1
    assert any(p["cost"] == 9000 for p in promos)


def test_client_preparsed_rows() -> None:
    payload = {
        "promotions": [
            {
                "id": "studio-dom-0",
                "title": "직접 입력형",
                "cost": 1000,
                "impressions": 2000,
                "views": 30,
                "subscribers": 1,
            }
        ]
    }
    promos = extract_promotions_from_payload(payload)
    assert len(promos) == 1
    assert promos[0]["cost"] == 1000


def test_normalize_micros() -> None:
    promo = normalize_studio_promo(
        {
            "title": "micros",
            "campaignId": "m1",
            "costMicros": 12_500_000,
            "impressions": 10,
        }
    )
    assert promo["cost"] == 12


def test_generic_title_and_status_enum() -> None:
    promo = normalize_studio_promo(
        {
            "title": "Youtube Promotion - 2026-07-10 - 34762609",
            "videoTitle": "레노버 아이디어 탭 11 솔직 리뷰",
            "status": "PROMOTION_STATUS_ACTIVE",
            "goal": "PROMOTION_GOAL_AUDIENCE_GROWTH",
            "amountSpent": {"units": "48308", "currencyCode": "KRW"},
            "impressions": 100,
            "views": 10,
            "promotionId": "34762609",
        }
    )
    assert promo["status"] == "진행중"
    assert promo["goal"] == "시청자층 성장"
    assert "레노버" in promo["title"]
    assert promo["startDate"] == "2026-07-10"
    assert promo["studioCampaignId"] == "34762609"


def test_sort_recent_active_first() -> None:
    from app.youtube_studio_promotions import _sort_promotions

    rows = [
        {"title": "old", "status": "진행중", "cost": 1, "startDate": "2026-04-01"},
        {"title": "new", "status": "진행중", "cost": 1, "startDate": "2026-07-10"},
        {"title": "ended", "status": "완료", "cost": 999, "startDate": "2026-07-11"},
    ]
    sorted_rows = _sort_promotions(rows)
    assert sorted_rows[0]["title"] == "new"
    assert sorted_rows[1]["title"] == "old"
    assert sorted_rows[2]["title"] == "ended"


if __name__ == "__main__":
    test_units_money_nested()
    test_metric_rows_korean_labels()
    test_framework_updates_entity()
    test_client_preparsed_rows()
    test_normalize_micros()
    test_generic_title_and_status_enum()
    test_sort_recent_active_first()
    print("ok")
