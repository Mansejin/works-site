# 디디딧 콘티 작성기

기획안 → 줄글 초안 → 5열 변환 → 장면·사이즈 → 자막·시트 공유

- **시트가 원본(SSOT)**: 최종 편집은 Google 스프레드시트
- **프로젝트**: `?project=vendict` 등

## 로컬 실행

### Windows (PowerShell) — 권장

```powershell
cd C:\Users\sea36\OneDrive\문서\GitHub\works-site   # 본인 clone 경로
git pull origin main
.\dddit\script\start-local.ps1
```

브라우저: **http://localhost:8080/dddit/script/?project=vendict**

또는 `dddit\script\start-local.bat` 더블클릭.

### Mac / Linux

```bash
./dddit/script/start-local.sh
```

### 주의

- 서버는 **저장소 루트**(`works-site`)에서 띄워야 합니다.
- `file://` 는 시트 연동에 제한이 있습니다.

## UI

- `← 워크스페이스` + **콘티 작성기**
- 단계: **1 기획안 · 2 줄글 · 3 변환 · 4 장면 · 5 공유**

## works-api

배포 URL(`works.mansejin.com`)에서는 NAS `works-api`가 Gemini·시트 키를 대신합니다.
