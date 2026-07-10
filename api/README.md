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
| `DDDIT_SHEET_API_URL` | Apps Script 웹 앱 URL (`.../exec`) |
| `DDDIT_SHEET_API_TOKEN` | Apps Script 스크립트 속성 `API_TOKEN`과 동일 |
| `DDDIT_SHEET_OPEN_URL` | 팀 공유 스프레드시트 URL |
| `YOUTUBE_API_KEY` | YouTube Data API v3 키 (구독자·조회수) |
| `YOUTUBE_CHANNEL_HANDLE` | 채널 핸들 (기본 `DD-DIT`) |

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
| GET | `/api/dddit/sheet/get?project=xenics` | 콘티 불러오기 |
| POST | `/api/dddit/sheet/replace` | 콘티 덮어쓰기 |
| POST | `/api/dddit/gemini/v1beta/models/{model}:generateContent` | Gemini 프록시 |
| GET | `/api/dddit/youtube/channel` | 채널 통계 + 최근 영상 4개 (15분 캐시) |
| GET | `/api/dddit/hub` | 워크스페이스 데이터 불러오기 |
| PUT | `/api/dddit/hub` | 워크스페이스 데이터 저장 (NAS `data/hub.json`) |

CORS: `WORKS_ALLOWED_ORIGINS`에 `https://works.mansejin.com` 포함.

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
