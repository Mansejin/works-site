# YouTube Studio 프로모션 동기화

공식 API로는 Studio Promote 비용·노출을 가져올 수 없습니다.

## 추천 A — Console 동기화 코드 (가장 확실)

1. 채널 보고 → **동기화 코드 복사**
2. Studio 프로모션 탭 → `F12` → **Console**
3. 붙여넣기 → Enter
4. 우측 상단 토스트(또는 alert) 확인 → 보고 페이지 새로고침

브라우저가 Studio에 직접 요청하므로 NAS 쿠키 401이 없습니다.

응답 JSON 파싱에 실패하면, 같은 스크립트가 Studio 페이지에 렌더된
프로모션 표/Polymer 데이터로 한 번 더 시도합니다.
실패 시 콘솔에 `window.__ddditLastPayload` 가 남으니 키 구조를 확인할 수 있습니다.

## 추천 B — 숫자만 입력

보고 페이지 프로모션 폼에 비용·노출·조회·구독만 입력 → **숫자 저장**.
