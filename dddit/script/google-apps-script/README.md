# 디디딧 콘티 · Google 시트 연동

팀원은 **Google 스프레드시트**에서 콘티를 편집하고, 시나리오 머신은 **생성·시트로 보내기**만 담당합니다.

**브랜드(프로젝트)마다 스프레드시트 파일 1개**가 디디딧 계정 Drive에 생성됩니다.

## 1. Apps Script 배포 (디디딧 계정)

1. [Google Apps Script](https://script.google.com) → 새 프로젝트 (또는 기존 프로젝트)
2. `Code.gs` 내용을 이 폴더의 `Code.gs`로 교체
3. **프로젝트 설정** → **스크립트 속성**:

| 속성 | 값 |
|------|-----|
| `API_TOKEN` | 팀만 아는 임의 문자열 |
| `DRIVE_FOLDER_ID` | (선택) 시트를 넣을 Drive 폴더 ID |

`PROJECT_REGISTRY`는 API가 자동으로 채웁니다.

4. **배포** → **새 배포** → 유형: **웹 앱**
   - 실행 계정: **디디딧 계정(나)**
   - 액세스: **모든 사용자**
5. 배포 URL 복사 (`.../exec`)

팀 내부 설정값(API_TOKEN, DRIVE_FOLDER_ID 등)은 git에 넣지 말고  
`google-apps-script/SETUP.local.md`에 메모하세요 (`.gitignore` 처리됨).

선택: `setupDdditProjects` 함수를 한 번 실행하면 `default`, `xenics` 시트를 미리 만들 수 있습니다.

## 2. NAS works-api (.env)

```env
DDDIT_SHEET_API_URL=https://script.google.com/macros/s/...../exec
DDDIT_SHEET_API_TOKEN=위 API_TOKEN 과 동일
```

`DDDIT_SHEET_OPEN_URL`은 더 이상 단일 시트용이 아닙니다. 프로젝트별 URL은 API가 반환합니다.

## 3. 시나리오 머신 사용

URL에 프로젝트 지정:

- `https://works.mansejin.com/dddit/script/?project=xenics`

| 버튼 | 동작 |
|------|------|
| **시트로 보내기** | 프로젝트 시트가 없으면 Drive에 **새로 생성** 후 덮어쓰기 |
| **시트 열기** | 해당 프로젝트 시트를 새 탭에서 열기 |
| **시트에서 불러오기** | 시트 내용을 미리보기 표로 가져오기 |

로컬 실행 시: API 패널에서 시트 API URL·토큰 입력.

## 4. 시트 구조

| 항목 | 값 |
|------|-----|
| 파일명 예 | `디디딧 콘티 · Xenics` |
| 탭 이름 | `콘티` (고정) |
| 1행 헤더 | `대본 \| 장면 \| 사이즈 \| 자막 \| 코멘트` |

## 5. API

| 메서드 | action | 설명 |
|--------|--------|------|
| GET | `meta` | 등록된 프로젝트·시트 목록 |
| GET | `ensure&project=xenics` | 없으면 생성, URL 반환 |
| GET | `get&project=xenics` | 행 JSON (없으면 시트 생성) |
| POST | `replace` | 전체 덮어쓰기 `{ token, project, rows }` |
| POST | `append` | 하단 추가 |

## 6. 팀 워크플로

1. 담당: 시나리오 머신 `?project=xenics` → 파트 생성 → **시트로 보내기**
2. 실무: Google 시트에서 장면·자막 편집
3. 담당: **시트에서 불러오기** → AI 수정 → 다시 **시트로 보내기**
4. 광고주: 브랜드 페이지 대본 뷰 (추후 — 시트 링크 공유 안 함)
