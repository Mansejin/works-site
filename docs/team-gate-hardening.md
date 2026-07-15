# Team gate + Cloudflare Access hardening

works.mansejin.com 내부 페이지(`/dddit/` 허브·리포트·콘티 작성기 등)는  
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

## 2) Cloudflare Access — Pages 앞단 차단 (인프라)

GitHub Pages는 자체 Basic Auth가 없습니다.  
**정적 파일**까지 막으려면 Cloudflare Access(또는 동급)로 `works` 호스트를 보호해야 합니다.

### 현재 DNS

| 이름 | 프록시 | 비고 |
|------|--------|------|
| `works` → `mansejin.github.io` | **DNS only (회색)** | Pages TLS 간단 구성 |
| `works-api` tunnel | Proxied (주황) | API는 이미 터널 앞단 |

### Access를 쓰려면 (권장 절차)

1. Cloudflare Dashboard → **Zero Trust** → Access → Applications → Add
2. Application type: **Self-hosted**
3. Application domain: `works.mansejin.com`
4. Path policies (예시):

**Protect (Require login)**  
- `/dddit`  
- `/dddit/`  
- `/dddit/script*`  
- `/dddit/report*`  
- `/dddit/conti*`  
- `/dddit/gate.html` — Access로 대체해도 되고, 팀 게이트를 유지해도 됨  
- `/dddit/js*` (선택 — HTML만 막아도 API는 토큰으로 보호됨)

**Bypass (공개 브랜드 공유)** — Policy order에 **Bypass를 Protect보다 위**에 두세요.

| Include path | 설명 |
|--------------|------|
| `/dddit/xenics` | 브랜드 홈 |
| `/dddit/xenics/*` | productlist / plan / conti |
| `/dddit/vendict` | |
| `/dddit/vendict/*` | |
| `/dddit/inic` | |
| `/dddit/inic/*` | |
| `/logitechG/*` | 로지텍 일정(별도 제품) |

Identity: One-time PIN / Google / GitHub 등 팀용 IdP.

5. DNS: `works` CNAME을 **Proxied (주황 구름)** 으로 전환  
   - SSL/TLS 모드: **Full** (strict 가능하면 Full (strict))  
   - GitHub Pages 커스텀 도메인 인증서가 깨지면 잠시 DNS only로 되돌린 뒤  
     Cloudflare “Orange-to-Orange / Pages” 문서를 참고해 재설정합니다.

> 회색 구름 상태에서는 Access가 **적용되지 않습니다.**  
> API 토큰 강제만으로도 데이터 유출은 막히지만, HTML/JS 셸·프롬프트 파일은 여전히 내려받을 수 있습니다.

### 정책 JSON 스케치

```json
{
  "application": "works-dddit",
  "domain": "works.mansejin.com",
  "policies": [
    {
      "name": "public-brand-share",
      "decision": "bypass",
      "include": [
        { "path": { "prefix": "/dddit/xenics" } },
        { "path": { "prefix": "/dddit/vendict" } },
        { "path": { "prefix": "/dddit/inic" } },
        { "path": { "prefix": "/logitechG/" } }
      ]
    },
    {
      "name": "team-only",
      "decision": "allow",
      "include": [{ "email_domain": { "domain": "YOUR_TEAM_DOMAIN" } }],
      "paths": ["/", "/dddit", "/dddit/*"]
    }
  ]
}
```

실제 UI에서는 path별 Application을 나누거나, Bypass policy precedence로 동일 효과를 냅니다.

## 검증 체크리스트

1. 비밀번호 없이 `curl https://works-api.<domain>/api/dddit/hub` → **401**
2. 게이트 로그인 후 브라우저 허브/리포트 정상
3. `https://works.<domain>/dddit/xenics/productlist/` 비밀번호 없이 열림
4. (Access 적용 후) 시크릿 창으로 `/dddit/` → Cloudflare 로그인 화면
5. Studio 프로모션 동기화 북마크릿 동작(Origin 예외)

## 로컬 테스트

```bash
cd api
DDDIT_TEAM_GATE_PASSCODE=test python3 scripts/test_team_gate_auth.py
```
