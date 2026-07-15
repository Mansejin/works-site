# works-api (NAS)

디디딧 시나리오 머신용 백엔드. **Gemini 공용 키**와 **Google 시트(Apps Script) 비밀**을 NAS에만 보관합니다.

- 공개 URL: `https://works-api.mansejin.com`
- 프론트: `https://works.mansejin.com/dddit/script/` (자동 연동)

## NAS 배포

### 1. 폴더 복사

Synology 예시:

```bash
/volume1/docker/works-api
```

이 저장소의 `api/` 폴더 전체를 NAS에 둡니다.

### 2. .env 작성

```bash
cp .env.example .env
nano .env
```

| 변수 | 설명 |
|------|------|
| `GEMINI_API_KEY` | 팀 공용 Gemini 키 |
| `DDDIT_SHEET_API_URL` | (레거시) Apps Script 웹 앱 URL |
| `DDDIT_SHEET_API_TOKEN` | (레거시) Apps Script 토큰 |
| `DDDIT_SHEETS_OAUTH_REFRESH_TOKEN` | **권장** Google Sheets API refresh token |
| `DDDIT_SHEETS_DRIVE_FOLDER_ID` | 콘티 시트 저장 Drive 폴더 ID |

콘티 시트 연동: **[docs/sheets-oauth.md](docs/sheets-oauth.md)** (Apps Script 웹앱 없이 NAS Google Sheets API)
| `YOUTUBE_API_KEY` | YouTube Data API v3 키 (구독자·조회수) |
| `YOUTUBE_CHANNEL_HANDLE` | 채널 핸들 (기본 `DD-DIT`) |
| `YOUTUBE_CHANNEL_ID` | 채널 ID (`UC…`, Analytics·OAuth 필수) |
| `YOUTUBE_OAUTH_*` | YouTube Analytics API OAuth (노출·CTR·유입·인구통계) |
| `GOOGLE_ADS_*` | Google Ads API (선택, `GOOGLE_ADS_SYNC_ENABLED=1`일 때만 동기화) |

### 3. Docker 실행

```bash
docker compose up -d --build
curl http://127.0.0.1:8788/health
```

### 4. Cloudflare Tunnel

sgb와 동일하게 `cloudflared`에 public hostname 추가:

| 항목 | 값 |
|------|-----|
| Subdomain | `works-api` |
| Domain | `mansejin.com` |
| Service | `http://NAS_IP:8788` 또는 docker network gateway |

Cloudflare DNS: `works-api` CNAME → tunnel (**Proxied ON**)

콘티 **실시간 동시 편집** WebSocket은 별도 호스트:

| Subdomain | Service |
|-----------|---------|
| `conti-ws` | `http://NAS_IP:8789` |

→ `wss://conti-ws.mansejin.com` (상세: [docs/conti-collab.md](docs/conti-collab.md))

### 5. 확인

```bash
curl https://works-api.mansejin.com/health
curl https://works-api.mansejin.com/api/dddit/config
```

브라우저에서 시나리오 머신 열면 API 설정 없이 서치·콘티·시트 버튼 사용 가능.

## 자동 배포 (push만 하면 NAS 반영)

sgb(`auto_script`)와 같은 방식입니다. **한 번만** DSM 작업 스케줄러를 켜 두면 `sudo docker compose up -d --build`를 직접 칠 필요가 없습니다.

→ **[api/docs/deploy-nas-auto.md](docs/deploy-nas-auto.md)** (스케줄러 10분 / GitHub Actions+Tailscale)

요약:

1. NAS에 `git clone` → `/volume1/docker/works-site`
2. DSM 작업: `sh /volume1/docker/works-site/api/scripts/nas-dsm-task.sh` (10분마다, **root**)
3. `api/` push → 자동 pull + rebuild (`dddit/`만 바뀐 push는 docker 스킵)

## API

| Method | Path | 설명 |
|--------|------|------|
| GET | `/health` | 헬스체크 |
| GET | `/api/dddit/config` | 프론트 설정 (시트 URL 등) |
| GET | `/api/dddit/sheet/meta` | 등록된 프로젝트·시트 목록 |
| GET | `/api/dddit/sheet/ensure?project=xenics` | 프로젝트 시트 생성·URL (브랜드별 Drive 파일) |
| GET | `/api/dddit/sheet/get?project=xenics` | 콘티 불러오기 |
| POST | `/api/dddit/sheet/replace` | 콘티 덮어쓰기 |
| POST | `/api/dddit/gemini/v1beta/models/{model}:generateContent` | Gemini 프록시 |
| GET | `/api/dddit/youtube/channel` | 채널 통계 + 최근 영상 4개 (15분 캐시) |
| GET | `/api/dddit/youtube/report/overview` | 채널 보고 대시보드 (KPI·차트·프로모션) |
| GET | `/api/dddit/youtube/report/videos` | 최근 영상 상세 목록 |
| GET | `/api/dddit/youtube/report/subscribers-trend` | 구독자 이중 추이 |
| GET/PUT | `/api/dddit/youtube/report/promotions` | 프로모션 비용·효율 데이터 |
| GET | `/api/dddit/youtube/report/studio-promotions/status` | Studio 캡처/동기화 상태 |
| POST | `/api/dddit/youtube/report/studio-promotions/capture` | Studio 프로모션 cURL 캡처 저장 |
| POST | `/api/dddit/youtube/report/studio-promotions/sync` | Studio 내부 API로 프로모션 동기화 |
| POST | `/api/dddit/youtube/report/studio-promotions/import` | Studio 응답 JSON 직접 import |
| GET/PUT | `/api/dddit/youtube/report/snapshots` | 주간 구독자·7일 조회 추이 |
| GET | `/api/dddit/youtube/report/analytics-overview` | Analytics 노출·CTR·평균 시청 (OAuth) |
| GET | `/api/dddit/youtube/report/traffic-sources` | 유입 경로 (OAuth) |
| GET | `/api/dddit/youtube/report/retention` | 시청 유지 (`?video_id=`) |
| GET | `/api/dddit/youtube/report/demographics` | 연령·성별·국가 (OAuth) |
| GET | `/api/dddit/youtube/report/ads/status` | Google Ads 동기화 상태 |
| POST | `/api/dddit/youtube/report/ads/sync` | Google Ads 캠페인 동기화 |
| GET | `/api/dddit/hub` | 워크스페이스 데이터 불러오기 |
| PUT | `/api/dddit/hub` | 워크스페이스 데이터 저장 (NAS `data/hub.json`) |
| GET | `/api/dddit/team-gate/status` | 팀 게이트 사용 여부 |
| POST | `/api/dddit/team-gate/login` | 워크스페이스 비밀번호 → 세션 토큰 (7일) |
| GET | `/api/dddit/team-gate/verify` | 토큰 검증 (`X-Dddit-Team-Token`) |

**인증:** `DDDIT_TEAM_GATE_PASSCODE` 설정 시 `/api/dddit/*` 민감 API는 `X-Dddit-Team-Token` 필수(미전달 시 401).  
예외(공개): team-gate 엔드포인트, 브랜드 읽기(`GET /conti`, `/conti/projects`, `/sheet/get`), Studio Origin의 프로모션 import.  
상세: [`docs/team-gate-hardening.md`](../docs/team-gate-hardening.md)

NAS `.env`에 `DDDIT_TEAM_GATE_PASSCODE`를 설정하면 `/dddit/` 등 내부 페이지는 비밀번호가 필요합니다. 브랜드 `productlist`·`plan`·`conti` URL은 공개로 유지됩니다.

CORS: `WORKS_ALLOWED_ORIGINS`에 `https://works.mansejin.com` 포함.

### 채널 보고 데이터 (`data/youtube/`)

| 파일 | 용도 |
|------|------|
| `promotions.json` | 프로모션 비용·노출·조회·구독 (CPV/CPS 자동 계산) |
| `subscriber-snapshots.json` | 주간 `total` / `organic` 구독자, `viewsTrend7d` |
| `ads-sync.json` | Google Ads API 동기화 캐시 (자동 생성) |

프론트: `https://works.mansejin.com/dddit/report/` · 워크스페이스 「채널 보고」 카드

프로모션 예시 필드: `title`, `cost`, `impressions`, `views`, `subscribers`, `status`, `targeting`, `notes`

## 로컬 개발

```bash
cd api
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
python server.py
```

`file://` 또는 localhost에서 시나리오 머신을 열면 기존처럼 API 패널에서 키를 직접 입력합니다.
