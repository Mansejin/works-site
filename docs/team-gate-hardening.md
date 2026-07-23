# Team gate + Cloudflare Access hardening

works.mansejin.com 루트·내부 페이지는  
브라우저 게이트만으로는 **정적 HTML/JS가 그대로 공개**됩니다.  
아래 두 층을 함께 쓰는 것이 권장 구성입니다.

## 1) works-api 팀 토큰 (이미 코드에 반영)

`DDDIT_TEAM_GATE_PASSCODE` 가 설정된 NAS에서:

- 민감 API(`/api/dddit/hub`, `/api/dddit/youtube/report/*`, Gemini, sheet write/meta 등)는  
  요청 헤더 `X-Dddit-Team-Token` 필수 → 없으면 **401**
- 공개 유지
  - `GET/POST /api/dddit/team-gate/*`
  - 브랜드 읽기: `GET /api/dddit/conti`, `GET /api/dddit/conti/projects`, `GET /api/dddit/sheet/get`
  - Studio 북마크릿: `POST .../studio-promotions/import` (**Origin=`https://studio.youtube.com`만**)
  - `/health`, `/api/logitechg/*`

프론트는 로그인 후 `sessionStorage` 토큰을 모든 내부 API 호출에 붙입니다.

브라우저 팀 게이트 (`/dddit/js/team-gate.js` + `/dddit/gate.html`):

- **보호**: `/`, `/logitechG/*`, `/project/*`, `/api/*`(Pages 문서), `/script/*`, `/dddit` 내부(허브·리포트·콘티 작성기·storyboard 등)
- **공개**: `/dddit/{xenics|vendict|inic|galaxy}` 홈 및 `plan` / `conti` / `productlist`
- 게이트 문구: **works 팀 로그인**
- `return` 파라미터: same-origin path만 허용 (`/` 포함). `//`·절대 URL 거부

## 2) Cloudflare Access — Pages 앞단 차단 (인프라)

GitHub Pages는 자체 Basic Auth가 없습니다.  
**정적 파일**까지 막으려면 Cloudflare Access(또는 동급)로 `works` 호스트를 보호해야 합니다.

운영 체크리스트: [`scripts/cloudflare-access-checklist.md`](../scripts/cloudflare-access-checklist.md)

### 현재 DNS (목표)

| 이름 | 프록시 | 비고 |
|------|--------|------|
| `works` → `mansejin.github.io` | **Proxied (주황)** | Access 적용에 필요 |
| `works-api` tunnel | Proxied (주황) | API는 이미 터널 앞단 |

> 회색 구름(DNS only)에서는 Access가 **적용되지 않습니다.**

### Access 앱 (권장)

1. Cloudflare Dashboard → **Zero Trust** → Access → Applications → Add
2. Application type: **Self-hosted**
3. Application domain: `works.mansejin.com` (path는 정책에서 구분)
4. Identity: One-time PIN / Google / GitHub 등 팀용 IdP

**Bypass (공개 브랜드 공유)** — Policy order에서 **Protect보다 위**.

| Include path | 설명 |
|--------------|------|
| `/dddit/xenics*` | 브랜드 홈·plan/conti/productlist 등 |
| `/dddit/vendict*` | |
| `/dddit/inic*` | |
| `/dddit/galaxy*` | |

**Protect (Require login)** — Bypass에 안 걸린 전부.

| Include path | 설명 |
|--------------|------|
| `/` | 루트 허브 |
| `/*` 또는 앱 전체 | logitechG · project · api · dddit 내부 포함 |

> **쓰지 말 것:** 예전 `/logitechG/*` Bypass. 로지텍 페이지는 Protect 대상입니다.

5. DNS: `works` CNAME을 **Proxied (주황 구름)** 으로 전환  
   - SSL/TLS 모드: **Full** (가능하면 **Full (strict)**)  
   - GitHub Pages 커스텀 도메인 인증서가 깨지면 잠시 DNS only로 되돌린 뒤  
     Cloudflare “Orange-to-Orange / Pages” 문서를 참고해 재설정합니다.

### 정책 JSON 스케치

```json
{
  "application": "works-mansejin",
  "domain": "works.mansejin.com",
  "policies": [
    {
      "name": "public-brand-share",
      "decision": "bypass",
      "precedence": 1,
      "include": [
        { "path": { "prefix": "/dddit/xenics" } },
        { "path": { "prefix": "/dddit/vendict" } },
        { "path": { "prefix": "/dddit/inic" } },
        { "path": { "prefix": "/dddit/galaxy" } }
      ]
    },
    {
      "name": "team-only",
      "decision": "allow",
      "precedence": 2,
      "include": [{ "email_domain": { "domain": "YOUR_TEAM_DOMAIN" } }],
      "paths": ["/", "/*"]
    }
  ]
}
```

실제 UI에서는 path별 Application을 나누거나, Bypass policy precedence로 동일 효과를 냅니다.  
OTP만 쓸 경우 Allow 조건은 `Everyone` / `emails` 등으로 대체합니다.

## 검증 체크리스트

1. 비밀번호 없이 `curl https://works-api.<domain>/api/dddit/hub` → **401**
2. 게이트 로그인 후 브라우저 허브/리포트 정상
3. `https://works.<domain>/dddit/xenics/productlist/` 비밀번호·Access 없이 열림 (Bypass)
4. (Access 적용 후) 시크릿 창으로 `/` → **Cloudflare Access 먼저**, 통과 후 팀 게이트 또는 세션
5. `curl -sL https://works.<domain>/` → Access 로그인 HTML만 (내부 본문 미노출)
6. Studio 프로모션 동기화 북마크릿 동작(Origin 예외)

## 로컬 테스트

```bash
cd api
DDDIT_TEAM_GATE_PASSCODE=test python3 scripts/test_team_gate_auth.py
```
