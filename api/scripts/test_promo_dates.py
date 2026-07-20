#!/usr/bin/env python3
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.youtube_report_store import normalize_promotion  # noqa: E402


def test_normalize_promotion_completed_sets_end_date() -> None:
    promo = normalize_promotion(
        {
            "status": "완료",
            "notes": ["Studio 캡처 2026-07-16"],
            "subscribers": 100,
        }
    )
    assert promo["capturedAt"] == "2026-07-16"
    assert promo["endDate"] == "2026-07-16"


def test_normalize_promotion_active_keeps_manual_end_date() -> None:
    promo = normalize_promotion(
        {
            "status": "진행중",
            "capturedAt": "2026-07-10",
            "endDate": "2026-07-20",
            "subscribers": 50,
        }
    )
    assert promo["capturedAt"] == "2026-07-10"
    assert promo["endDate"] == "2026-07-20"


def test_normalize_promotion_active_without_end_date() -> None:
    promo = normalize_promotion(
        {
            "status": "진행중",
            "notes": ["Studio 캡처 2026-07-14"],
            "subscribers": 50,
        }
    )
    assert promo["capturedAt"] == "2026-07-14"
    assert "endDate" not in promo


if __name__ == "__main__":
    test_normalize_promotion_completed_sets_end_date()
    test_normalize_promotion_active_keeps_manual_end_date()
    test_normalize_promotion_active_without_end_date()
    print("ok")
