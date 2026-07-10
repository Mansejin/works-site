# 콘티 Google 시트 (OAuth — Apps Script 없이)

Apps Script 웹앱 배포가 막힐 때 **NAS works-api가 Google Sheets API를 직접** 호출합니다.

## 1. GCP (YouTube와 동일 프로젝트)

1. [Google Cloud Console](https://console.cloud.google.com) → API 및 서비스
2. **Google Sheets API** · **Google Drive API** 사용 설정
3. OAuth 클라이언트는 기존 `YOUTUBE_OAUTH_CLIENT_ID` / `SECRET` 재사용 가능
4. OAuth 동의 화면에 테스트 사용자로 디디딧 계정 추가

## 2. refresh token 발급 (1회, Chrome)

```bash
cd api
export YOUTUBE_OAUTH_CLIENT_ID=...
export YOUTUBE_OAUTH_CLIENT_SECRET=...
python scripts/issue-sheets-oauth-token.py
```

- 디디딧 계정만 로그인
- 리다이렉트 URL의 `code=` 값 붙여넣기

## 3. NAS `api/.env`

```env
DDDIT_SHEETS_OAUTH_REFRESH_TOKEN=발급받은값
DDDIT_SHEETS_DRIVE_FOLDER_ID=1BH-5_kdPSKEmWIZmY-ESD9mfF3_pdjQm
```

`DDDIT_SHEET_API_URL` / `DDDIT_SHEET_API_TOKEN` 은 **비워도 됨** (OAuth 우선).

## 4. 재시작

```bash
cd /volume1/docker/works-site/api && docker compose up -d --force-recreate works-api
```

## 5. 확인

```bash
curl -s "https://works-api.mansejin.com/api/dddit/sheet/meta" | head
curl -s "https://works-api.mansejin.com/api/dddit/config"
# sheetBackend: "google-api"
```

## setupDdditProjects로 이미 만든 시트 연결 (선택)

`api/data/dddit/sheet-registry.json` 에 수동 등록:

```json
{
  "xenics": {
    "spreadsheetId": "시트ID",
    "spreadsheetUrl": "https://docs.google.com/spreadsheets/d/.../edit",
    "title": "디디딧 콘티 · Xenics",
    "createdAt": "2026-07-10T00:00:00+00:00"
  }
}
```

없으면 **시트로 보내기** 시 새 파일이 폴더에 생성됩니다.
