# Cloudflare Access checklist — works.mansejin.com

코드 쪽 팀 게이트와 함께 Pages 앞단을 막는 운영 절차입니다.  
상세 배경: [`docs/team-gate-hardening.md`](../docs/team-gate-hardening.md)

## 전제

- Zone: `mansejin.com` (Cloudflare DNS)
- Origin: GitHub Pages `mansejin.github.io` (CNAME `works`)
- Zero Trust 팀 도메인 / IdP(OTP 또는 Google 등) 준비
- **Cloudflare MCP** (`https://mcp.cloudflare.com/mcp`) 또는 API 토큰으로 계정 접근

> Cloud Agent에 Cloudflare MCP/API 토큰이 없으면 Dashboard에서 동일 단계를 수동 적용합니다.

## 1) Self-hosted Access app

1. Zero Trust → **Access controls** → **Applications** → Create
2. Type: **Self-hosted**
3. Public hostname: `works.mansejin.com`
4. Session duration: 팀 취향 (예: 24h)

### Policies (순서 중요)

| Order | Name | Action | Path / Include |
|------:|------|--------|----------------|
| 1 | `public-brand-share` | **Bypass** | `/dddit/xenics*`, `/dddit/vendict*`, `/dddit/inic*`, `/dddit/galaxy*` |
| 2 | `team-only` | **Allow** | 나머지 전체 (`/`, `/logitechG*`, `/project*`, `/api*`, `/dddit*` 등) + 팀 IdP |

- **하지 말 것:** `/logitechG/*` Bypass (구 정책). 로지텍은 Protect.
- Bypass가 Allow보다 **위**에 있어야 브랜드 공유가 열립니다.

## 2) DNS + SSL

1. DNS → `works` CNAME → `mansejin.github.io` → **Proxied (주황)**
2. SSL/TLS → Overview → **Full** 또는 **Full (strict)**
3. Access는 주황 구름일 때만 적용됨 (회색=무시)

### Pages TLS 깨질 때

1. 잠시 `works`를 **DNS only**로 되돌림
2. GitHub Pages 커스텀 도메인 `works.mansejin.com` 재확인
3. Cloudflare Universal SSL / Full 모드 정리 후 다시 Proxied
4. `curl -sI works.mansejin.com/` 에 `cf-ray` / Access 응답 확인

## 3) MCP / API로 적용할 때

### A. 스크립트 (권장 · 토큰만 있으면)

```bash
export CF_API_TOKEN=...   # Zero Trust Write + Zone DNS/SSL Edit
# optional: WORKS_ACCESS_ALLOW_EMAILS=you@example.com
# optional: CF_DELETE_LOGITECH_BYPASS=1
python3 scripts/apply_cloudflare_access.py
# DRY_RUN=1 python3 scripts/apply_cloudflare_access.py
```

Cloud Agent에 `CF_API_TOKEN` 시크릿을 넣고 같은 명령을 재실행하면 DNS Proxied + Bypass/Protect 앱을 맞춥니다.

### B. Cloudflare MCP

Cursor에 `https://mcp.cloudflare.com/mcp` 연결(OAuth) 후 동일 작업을 도구로 수행.  
이 Cloud Agent 런타임에는 Cloudflare MCP가 아직 주입되지 않았고, OAuth도 headless에서 완료할 수 없습니다.

권한 예: Account Zero Trust Write, Zone DNS Edit, Zone SSL Edit.

## 4) 검증

```bash
# Access 미인증 → 본문(works 허브) 나오면 안 됨
curl -sL works.mansejin.com/ | head -n 40

# 브랜드 Bypass
curl -sI works.mansejin.com/dddit/xenics/productlist/ | head -n 20

# API 팀 토큰 (별도)
curl -sI https://works-api.mansejin.com/api/dddit/hub | head -n 15
```

브라우저 (시크릿):

1. `works.mansejin.com/` → Cloudflare Access 로그인
2. 통과 후 → works 팀 게이트(또는 기존 세션)
3. `.../dddit/xenics/productlist/` → Access·게이트 없이 열림

## 5) 롤백

1. Access app Disable 또는 정책 전부 Bypass
2. 필요 시 `works` DNS → DNS only
3. 팀 게이트는 NAS `DDDIT_TEAM_GATE_PASSCODE` / 프론트 스크립트로 독립 유지
