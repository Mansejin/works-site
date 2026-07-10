# 콘티 실시간 동시 편집 (Yjs)

2~3명이 같은 콘티를 동시에 편집합니다. WebSocket으로 실시간 병합하고, 약 2초마다 JSON 스냅샷을 NAS에 저장합니다.

## 한 줄 요약

| 주소 | 용도 |
|------|------|
| `https://works-api.mansejin.com` | REST (기존 API, 8788) |
| `wss://conti-ws.mansejin.com` | 콘티 동시 편집 WebSocket (8789) |

브랜드 읽기 전용 페이지는 REST만 씁니다 (`GET /api/dddit/conti`).

---

## 1. Docker 먼저 (NAS)

```bash
cd /volume1/docker/works-site
sh api/scripts/nas-docker-update.sh --full-build
```

확인:

```bash
curl http://127.0.0.1:8788/health
curl http://127.0.0.1:8789
# → conti-collab ok
```

---

## 2. WebSocket 외부 공개 — Cloudflare Tunnel (추천)

`works-api`를 이미 Tunnel로 열어 두었다면, **똑같이 서브도메인 하나만 더** 추가하면 됩니다. nginx 설정 파일을 직접 건드릴 필요 없습니다.

### Cloudflare Zero Trust → Networks → Tunnels → (쓰는 터널) → Public Hostname → Add

| 항목 | 값 |
|------|-----|
| Subdomain | `conti-ws` |
| Domain | `mansejin.com` |
| Type | HTTP |
| URL | `http://NAS_내부IP:8789` |

예: NAS IP가 `192.168.0.10`이면 → `http://192.168.0.10:8789`

`works-api` 터널 항목이 `http://192.168.0.10:8788` 인 것과 **포트만 8789로 다름**.

### DNS

Tunnel이 자동으로 `conti-ws.mansejin.com` CNAME을 만듭니다. **Proxied(주황 구름)** ON.

### 동작 확인

브라우저 개발자도구 → Network → WS 필터:

`dddit/conti/?project=xenics` 편집기를 열면

`wss://conti-ws.mansejin.com/conti-xenics` 연결이 **101 Switching Protocols** 로 떠야 합니다.

터미널 (로컬 PC):

```bash
curl https://works-api.mansejin.com/health
curl http://NAS_IP:8789
```

---

## 3. (대안) Synology DSM 리버스 프록시

Tunnel 대신 DSM에서 직접 받는 경우:

**제어판 → 로그인 포털 → 고급 → 역방향 프록시 → 만들기**

| 탭 | 항목 | 값 |
|----|------|-----|
| 역방향 프록시 | 설명 | `conti-ws` |
| | 소스 프로토콜 | HTTPS |
| | 호스트 이름 | `conti-ws.mansejin.com` |
| | 포트 | 443 |
| | 대상 프로토콜 | HTTP |
| | 대상 호스트 | `localhost` (또는 NAS IP) |
| | 대상 포트 | **8789** |
| 사용자 지정 머리글 | 이름 | `Upgrade` / 값 | `$http_upgrade` |
| | 이름 | `Connection` / 값 | `upgrade` |

Let's Encrypt 인증서에 `conti-ws.mansejin.com` 포함.

---

## 4. (대안) nginx 설정 파일 직접 수정

`works-api.mansejin.com` **한 도메인**에 REST + WebSocket을 같이 쓰려면 경로 프록시가 필요합니다.

```nginx
# 기존 works-api (8788) — 예시
location / {
    proxy_pass http://127.0.0.1:8788;
    proxy_set_header Host $host;
}

# 콘티 WebSocket (8789) — /conti-ws/conti-xenics → 8789/conti-xenics
location /conti-ws/ {
    proxy_pass http://127.0.0.1:8789/;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_read_timeout 86400;
}
```

이 방식을 쓰면 프론트 URL을 `wss://works-api.mansejin.com/conti-ws` 로 바꿔야 합니다.  
**Cloudflare Tunnel만 쓰는 경우 경로 잘라내기가 까다로워서 서브도메인(`conti-ws`)을 권장합니다.**

### nginx에서 꼭 필요한 3줄

```nginx
proxy_http_version 1.1;
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection "upgrade";
```

이게 없으면 WebSocket이 일반 HTTP로 끊깁니다.

---

## 5. 안 될 때 체크리스트

| 증상 | 확인 |
|------|------|
| `연결 끊김 · 재연결 중` | `docker ps`에 `conti-collab` 실행 중인지 |
| WS 404 | Tunnel/프록시가 **8789**를 가리키는지 |
| WS 502 | NAS 방화벽·Docker 포트 `8789:8789` |
| REST는 되는데 WS만 안 됨 | `works-api`(8788)와 `conti-ws`(8789) **별도** 호스트인지 |
| 한 명만 되고 동기화 안 됨 | 두 탭 모두 편집기(`dddit/conti/`)인지 (브랜드 뷰는 읽기 전용) |

---

## 데이터 경로

- JSON: `api/data/conti/xenics.json`
- Yjs: `api/data/conti/.yjs/conti-xenics.bin`

방 이름: `conti-{slug}` (예: `conti-xenics`)
