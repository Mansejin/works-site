# 구독자 자연 증가 (추정) — 보류 (확정)

차트에는 **총 구독자만** 표시한다. 자연/광고 분리 선은 UI에서 쓰지 않는다.

## 2026-08-07 타당성 점검 결과

| 신호 | 결과 |
|------|------|
| Analytics 일별 gained/lost → 주간 total | **신뢰 가능** (예: 2026-07-25~31 net 784 = 차트 Δ) |
| Analytics `subscribersGained` × `insightTrafficSourceType` | **행 0건** (90일·주간 모두). 주간 광고 구독 API 신호 **없음** |
| Studio 구독 프로모션 lifetime 분배 | 주간 Δ를 거의 전부 덮어 **organicΔ ≈ 0**이 됨 |

**결정:** Analytics로 광고/자연 구독을 나눌 수 없으므로 초안식은 도입하지 않고 **총량만 유지(C)**.

나중에 Studio 고급모드에서 주간 광고 구독을 캡처·수동 입력할 수 있으면 그때 **방안 B**만 재검토.

## 폐기된 초안 (참고)

```text
organic_delta ≈ total_delta − max(Analytics adGained, Studio 구독 프로모션 분배분)
```

- `adGained` API가 비어 max가 항상 promo → 자연이 평평해지는 편향
- 프로모션 `subscribers`는 캠페인 lifetime이라 주간 순증과 스케일이 다름

API는 `organicEstimateEnabled: false`를 유지한다.
