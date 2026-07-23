# Team gate + Cloudflare Access hardening

works.<domain> 루트·내부 페이지는  
브라우저 게이트만으로는 **정적 HTML/JS가 그대로 공개**됩니다.  
아래 두 층을 함께 쓰는 것이 권장 구성입니다.

운영 TODO: [`docs/security-todo.md`](./security-todo.md)

## 1) works-api 팀 토큰 (코드 반영)

`DDDIT_TEAM_GATE_PASSCODE` 가 설정된 NAS에서:

- 민감 API(`/api/dddit/hub`, report, Gemini, sheet write/meta, **`/api/logitechg/*`**)는  
  요청 헤더 `X-Dddit-Team-Token` 필수 → 없으면 **401**
- 공개 유지
  - `GET/POST /api/dddit/team-gate/*` (login은 IP당 rate limit)
  - 브랜드 읽기(allowlist: xenics/vendict/inic/galaxy):  
    `GET /conti`, `GET /conti/projects`(필터됨), `GET /sheet/get`(스프레드시트 ID 제거), `GET /productlist`
  - 브랜드 productlist **PUT**: allowlist + `Origin/Referer = works host` + rate limit  
    (임의 프로젝트 생성 불가)
  - Studio 북마크릿 import: **`Origin=studio.youtube.com` + `X-Dddit-Studio-Import-Key`**  
    (`DDDIT_STUDIO_IMPORT_SECRET` 필수 — Origin만으로는 불가)

권장 NAS env:

```bash
DDDIT_TEAM_GATE_PASSCODE=...
DDDIT_TEAM_GATE_SECRET=...          # passcode와 분리한 긴 랜덤
DDDIT_STUDIO_IMPORT_SECRET=...      # 북마크릿 헤더와 동일 값
```

프론트는 로그인 후 `sessionStorage` 토큰을 내부 API·conti-ws(`?token=`)에 붙입니다.

브라우저 팀 게이트 (`/dddit/js/team-gate.js` + `/dddit/gate.html`):

- **보호**: `/`, `/logitechG/*`, `/project/*`, `/api/*`(Pages 문서), `/script/*`, `/dddit` 내부
- **공개**: `/dddit/{xenics|vendict|inic|galaxy}` 의 `plan` / `conti` / `productlist` (브랜드 홈은 Protect)
- `return` 파라미터: same-origin path만 허용

## 2) Cloudflare Access — Pages 앞단

체크리스트: [`scripts/cloudflare-access-checklist.md`](../scripts/cloudflare-access-checklist.md)

| 이름 | 프록시 | 비고 |
|------|--------|------|
| `works` → `mansejin.github.io` | **Proxied** | Access 필요 |
| `works-api` tunnel | Proxied | API 터널 |

### Bypass (공개 브랜드 공유 + 공유 자산)

| Path | 설명 |
|------|------|
| `/dddit/{brand}/plan*` `/conti*` `/productlist*` | 공유 섹션만 (브랜드 홈·research·storyboard는 Protect) |
| `/dddit/js*` `/css*` | 공개 페이지가 로드하는 공유 자산 |

> **쓰지 말 것:** `/dddit/xenics*` 같은 브랜드 전체 wildcard (research/storyboard 노출).  
> **쓰지 말 것:** `/logitechG/*` Bypass.

### Protect

`works.<domain>` 전체 (Bypass에 안 걸린 경로).  
Allow는 `WORKS_ACCESS_ALLOW_EMAILS` 또는 IdP 그룹으로 조이는 것이 목표.

## 검증

```bash
curl -sI https://$WORKS_HOST/ | head          # 302 Access
curl -sI https://$WORKS_HOST/dddit/xenics/productlist/ | head  # 200
curl -sI https://$WORKS_HOST/dddit/js/productlist-sync.js | head  # 200
curl -sI https://$WORKS_HOST/dddit/galaxy/research/SOURCE.md | head  # 302
curl -sI https://works-api.mansejin.com/api/logitechg/schedule | head  # 401
curl -sI https://works-api.mansejin.com/api/dddit/hub | head  # 401
```

## 로컬 테스트

```bash
cd api
DDDIT_TEAM_GATE_PASSCODE=test python3 scripts/test_team_gate_auth.py
```
