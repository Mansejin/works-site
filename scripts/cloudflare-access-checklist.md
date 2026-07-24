# Cloudflare Access checklist — works.<domain>

코드 쪽 팀 게이트와 함께 Pages 앞단을 막는 운영 절차입니다.  
상세 배경: [`docs/team-gate-hardening.md`](../docs/team-gate-hardening.md)

## 전제

- Zone: `mansejin.com` (Cloudflare DNS)
- Origin: GitHub Pages `mansejin.github.io` (CNAME `works`)
- Zero Trust 팀 도메인 / IdP(OTP 또는 Google 등) 준비
- **Cloudflare MCP** (`https://mcp.cloudflare.com/mcp`) 또는 API 토큰으로 계정 접근

> Cloud Agent에 Cloudflare MCP/API 토큰이 없으면 Dashboard에서 동일 단계를 수동 적용합니다.

## Access path split (personal vs company)

| Path | Who |
|------|-----|
| `/` , `/project*` , 기타 catch-all | **본인만** (`WORKS_ACCESS_OWNER_EMAILS`) |
| `/dddit*` , `/logitechG*` | **회사 팀** (`WORKS_ACCESS_COMPANY_EMAILS`, owner 포함) |
| `/dddit/{brand}/plan\|conti\|productlist*` | **공개 Bypass** |
| `/dddit/js*` , `/css*` | **공개 Bypass** (브랜드 페이지 자산) |

적용:

```bash
# defaults baked into scripts/apply_cloudflare_access.py
python3 scripts/apply_cloudflare_access.py
```


1. Zero Trust → **Access controls** → **Applications** → Create
2. Type: **Self-hosted**
3. Public hostname: `works.<domain>`
4. Session duration: 팀 취향 (예: 24h)

### Policies (순서 중요)

| Order | Name | Action | Path / Include |
|------:|------|--------|----------------|
| 1 | `public-brand-share` | **Bypass** | `/dddit/xenics*`, `/dddit/vendict*`, `/dddit/inic*`, `/dddit/galaxy*` |
| 2 | `team-only` | **Allow** | 나머지 전체 (`/`, `/logitechG*`, `/project*`, `/api*`, `/dddit*` 등) + 팀 IdP |

- **하지 말 것:** `/logitechG/*` Bypass (구 정책). 로지텍은 Protect.
- **하지 말 것:** `/dddit/xenics*` 브랜드 전체 wildcard (research/storyboard 노출).
- Bypass에 `/dddit/js*`·`/css*` 포함 (공개 브랜드 페이지 공유 자산).
- 브랜드 Bypass는 `plan*` / `conti*` / `productlist*` (+ 홈)만.
- Bypass가 Allow보다 **위**에 있어야 브랜드 공유가 열립니다.

## 2) DNS + SSL

1. DNS → `works` CNAME → `mansejin.github.io` → **Proxied (주황)**
2. SSL/TLS → Overview → **Full** 또는 **Full (strict)**
3. Access는 주황 구름일 때만 적용됨 (회색=무시)

### Pages TLS 깨질 때

1. 잠시 `works`를 **DNS only**로 되돌림
2. GitHub Pages 커스텀 도메인 `works.<domain>` 재확인
3. Cloudflare Universal SSL / Full 모드 정리 후 다시 Proxied
4. `curl -sI works.<domain>/` 에 `cf-ray` / Access 응답 확인

## 3) MCP / API로 적용할 때

### A. 스크립트 (권장 · 토큰만 있으면)

```bash
export CF_API_TOKEN=...   # Zero Trust Write + Zone DNS/SSL Edit
# optional: WORKS_ACCESS_ALLOW_EMAILS=you@example.com
# optional: CF_DELETE_LOGITECH_BYPASS=1
# optional: CF_ACCOUNT_ID / CF_ZONE_ID (zone-scoped 토큰은 /accounts 가 비는 경우가 많음 — 스크립트가 zone.account로 보완)
python3 scripts/apply_cloudflare_access.py
# DRY_RUN=1 python3 scripts/apply_cloudflare_access.py
```

Cloud Agent에 `CF_API_TOKEN` 시크릿을 넣고 **새 Cloud Agent를 시작**(또는 기존 세션 재시작)한 뒤 같은 명령을 실행하면 DNS Proxied + Bypass/Protect 앱을 맞춥니다.

Zone Settings(SSL) Edit이 토큰에 없으면 SSL 단계는 WARN으로 건너뛰고 DNS·Access만 적용합니다. Dashboard에서 **SSL/TLS = Full 또는 Full (strict)** 를 한 번 확인하세요. Access 전파에는 보통 1–2분이 걸릴 수 있습니다.

> **중요:** Secrets는 에이전트 **시작 시점**에만 주입됩니다.  
> 이미 돌아가는 세션에 토큰을 추가해도 `env`에 안 보입니다.  
> 확인: `echo ${CF_API_TOKEN:+set}` 또는 `CLOUD_AGENT_INJECTED_SECRET_NAMES`에 `CF_API_TOKEN` 포함 여부.

**시크릿 넣는 위치:** [Dashboard → Cloud Agents → Secrets](https://cursor.com/dashboard/cloud-agents)  
(또는 웹 agents 화면의 **Set Up Cloud Agents**)

**토큰 권한 (Custom Token):**
- Account → Zero Trust → Edit
- Zone → DNS → Edit
- Zone → SSL and Certificates → Edit
- Zone resources: `mansejin.com`

### B. Cloudflare MCP

1. Desktop MCP ≠ Cloud Agent MCP. Desktop Settings에만 있으면 Cloud Agent에는 안 보입니다.
2. Cloud Agent용: [cursor.com/agents](https://cursor.com/agents) → **에이전트 대화/입력창 옆 MCP 드롭다운**에서 추가·OAuth.  
   팀: Dashboard → Integrations 하단 **Team MCP Servers** (Slack/GitHub Connect 목록과는 별개).
3. Access/DNS에 필요한 서버: HTTP `https://mcp.cloudflare.com/mcp` (`cloudflare` 3 tools: search/execute).  
   `bindings` / `builds` / `docs` / `observability`만으로는 Access 앱·DNS를 못 바꿉니다.
4. OAuth는 에이전트 실행 **전에** 웹에서 완료. headless 세션 안에서는 새로 끝낼 수 없습니다.

권한 예: Account Zero Trust Write, Zone DNS Edit, Zone SSL Edit.

## 4) 검증

```bash
# Access 미인증 → 본문(works 허브) 나오면 안 됨
curl -sL works.<domain>/ | head -n 40

# 브랜드 Bypass
curl -sI works.<domain>/dddit/xenics/productlist/ | head -n 20

# API 팀 토큰 (별도)
curl -sI https://works-api.mansejin.com/api/dddit/hub | head -n 15
```

브라우저 (시크릿):

1. `works.<domain>/` → Cloudflare Access 로그인
2. 통과 후 → works 팀 게이트(또는 기존 세션)
3. `.../dddit/xenics/productlist/` → Access·게이트 없이 열림

## 5) 롤백

1. Access app Disable 또는 정책 전부 Bypass
2. 필요 시 `works` DNS → DNS only
3. 팀 게이트는 NAS `DDDIT_TEAM_GATE_PASSCODE` / 프론트 스크립트로 독립 유지
