# 구독자 자연 증가 (추정) — 보류 (확정)

차트에는 **총 구독자만** 표시한다. 자연/광고 분리 선은 UI에서 쓰지 않는다.

## 2026-08-07 타당성 점검 결과

| 신호 | 결과 |
|------|------|
| Analytics 일별 gained/lost → 주간 total | **신뢰 가능** |
| Analytics `subscribersGained` × `insightTrafficSourceType` | **행 0건** → 주간 광고 구독 API 신호 없음 |
| Studio 프로모션 lifetime 분배 | 주간 Δ를 덮어 **organicΔ ≈ 0** 편향 |

**결정:** 총량만 유지. 자연 선은 재도입하지 않음.

## 광고 구독 증가 집계 (도입)

Analytics 소스 대신 **동기화 Δ**로 광고 구독만 따로 쌓는다 (`api/data/youtube/ad-subscriber-events.json`).

1. **Studio 프로모션** — 캠페인별 `subscribers` 워터마크. 첫 동기화는 시드만, 이후 `max(0, 현재−워터마크)`만 이벤트 기록.
2. **Google Ads** — 전환 액션 이름에 `구독`/`subscribe`(또는 category에 SUBSCRIBE)가 있는 것만 골라 `segments.date` 일별로 upsert.

과거 lifetime을 주에 뿌리던 방식은 제거했다. 이벤트 로그가 쌓이기 전까지 주간 광고 구독 신호는 비어 있을 수 있다.

## 폐기된 초안

```text
organic_delta ≈ total_delta − max(Analytics adGained, Studio lifetime 분배)
```
