# 구독자 자연 증가 (추정) — 보류

차트에는 **총 구독자만** 표시한다. 자연/광고 분리 선은 UI에서 제거했고, 타당성 확정 전까지 재도입하지 않는다.

## 추정 초안 (미확정)

주간 슬롯마다:

```text
organic_delta ≈ total_delta − max(Analytics adGained, Studio 구독 프로모션 캠페인분)
```

- `total_delta`: Analytics 일별 순증을 ISO 주 슬롯에 역산한 총구독자 차분 (현재 차트에 쓰는 값)
- `adGained`: Analytics 주간 `ADVERTISING` 구독 유입 (있으면)
- Studio 프로모션: 목표=시청자층 성장 캠페인의 `subscribers`를 캠페인 기간(또는 기본 3주)에 분배

## 보류 이유

1. Analytics 주간 `adGained`가 비거나 과소계상되는 경우가 있음 → 프로모션 플로어가 한 주에 쏠리면 자연이 깨짐
2. 스냅샷에 남은 `organic`이 오래된 수동 값이면 Analytics 역산 총구독자와 불일치
3. Studio 고급모드와 주간 자연분을 맞춰 본 뒤에야 선을 다시 켤 수 있음

API는 `organicEstimateEnabled: false`와 `organicEstimateDraft` 문구를 내려 두었고, point의 `organic`/`adDriven` 필드는 나중에 켤 때 쓰기 위해 계산만 유지할 수 있다(UI 미표시).
