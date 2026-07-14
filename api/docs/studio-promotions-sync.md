# YouTube Studio 프로모션 자동 동기화

Studio 「프로모션」탭 데이터를 **공식 API가 아니라 Studio 내부(youtubei) 요청을 재생**해서
`promotions.json`에 반영합니다.

## Response가 안 보일 때 (challenge만 보임)

**Response 내용을 읽을 필요 없습니다.** Search로 `45489` 같은 숫자가 `list_promotions`에 있다면 이미 맞는 요청입니다.

### 방법 A — cURL만 복사 (가장 쉬움)

1. Network 상단 필터에 `list_promotions` 입력
2. 목록에 뜬 **`list_promotions` 행** 우클릭 → **Copy** → **Copy as cURL (bash)**
3. 보고 페이지 **캡처 저장** → **Studio 동기화**

Response 탭은 열지 않아도 됩니다.

### 방법 B — Search 결과에서 Network로 이동

1. DevTools **Search** 탭에서 `45489` 검색
2. `list_promotions` 줄 번호 **클릭** → Network 패널로 이동
3. 그 요청 행 우클릭 → **Copy as cURL**

### 방법 C — 콘솔로 JSON 뽑기 (Preview/Response가 막혔을 때)

Studio 프로모션 탭에서 `F12` → **Console**에 아래 붙여넣기 → Enter → **F5 새로고침**:

```javascript
(function(){const o=fetch;fetch=async(...a)=>{const r=await o(...a);const u=String(a[0]||"");if(u.includes("list_promotions")){r.clone().text().then(t=>{window.__studioPromoJson=t;console.log("저장됨 → copy(__studioPromoJson)");});}return r;};console.log("훅 설치 — 새로고침하세요");})();
```

콘솔에 `copy(__studioPromoJson)` 입력 후, 보고 페이지 **Response가 안 보일 때 — JSON 붙여넣기** → **JSON 가져오기**.

## 1회 설정 (캡처)

1. Chrome에서 [studio.youtube.com](https://studio.youtube.com) 로그인
2. 왼쪽 **프로모션** (또는 수익 창출 → 프로모션) 열기
3. `F12` → **Network** → 목록이 다시 로드되게 새로고침
4. 필터에 `youtubei` 또는 `promotion` / `campaign` / `ypc` 입력
5. **비용·노출·조회**가 들어 있는 XHR/fetch 요청 선택

**맞는 요청 (찾아야 할 것):**

| URL | 특징 |
|-----|------|
| `list_promotions` | Response에 `"units": "45489"` 같은 비용·노출 수치 |

JSON **맨 위**에 `challenge` / `botguardData`가 보여도 정상입니다. 보안 메타데이터이고,
실제 프로모션은 같은 응답 **아래쪽**에 있습니다. Search(`Ctrl+F`)로 비용 숫자를 찾은 뒤
그 요청(`list_promotions`)을 Network에서 클릭 → Copy as cURL 하세요.

**쓰면 안 되는 요청 (자주 잘못 복사됨):**

| URL | 이유 |
|-----|------|
| `youtubei/v1/att/esr` | 봇 검증(attestation) 전용 — 프로모션 수치 없음 |
| `get_creator_videos` | 영상 목록 |
| `log_event`, `get_survey` | 로깅·설문 |
6. 우클릭 → **Copy** → **Copy as cURL (bash)**
7. 디디딧 채널 보고 → **보고 데이터 편집** → cURL 붙여넣기 → **캡처 저장**
8. **Studio 동기화** 클릭

캡처 URL·바디는 NAS `api/data/youtube/studio-promo-capture.json`에,
쿠키는 `studio-cookies.json`에 저장됩니다(gitignore).

## 이후

- 보고 페이지 **Studio 동기화** 버튼
- 또는 `POST /api/dddit/youtube/report/studio-promotions/sync`

쿠키가 만료되면(보통 며칠~몇 주) cURL을 다시 저장하면 됩니다.

## API

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/dddit/youtube/report/studio-promotions/status` | 캡처/쿠키/lastSync |
| POST | `/api/dddit/youtube/report/studio-promotions/capture` | `{ "curl": "..." }` |
| POST | `/api/dddit/youtube/report/studio-promotions/sync` | 캡처 재생 → promotions.json |
| POST | `/api/dddit/youtube/report/studio-promotions/import` | 응답 JSON 직접 import |

## 환경변수 (선택)

```env
# cURL 저장 대신 쿠키를 직접 넣을 때
YOUTUBE_STUDIO_COOKIES=SID=...; HSID=...; SSID=...; APISID=...; SAPISID=...
```

## 주의

- 비공식 Studio API라 YouTube가 엔드포인트를 바꾸면 캡처를 다시 해야 합니다.
- 팀 내부용. ToS·계정 보안상 쿠키를 git에 올리지 마세요.
