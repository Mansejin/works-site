# 디디딧 시나리오 머신

브리프 → 줄글 초안 → 5열 변환 → 장면·사이즈 → 자막·시트 공유

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

> `tmux` / `start-local.sh` 는 Linux·Mac·클라우드 전용입니다. Windows에서는 위 PowerShell 스크립트를 쓰세요.

### Mac / Linux

```bash
./dddit/script/start-local.sh
```

### 주의

- 서버는 **저장소 루트**(`works-site`)에서 띄워야 합니다. `dddit/script` 폴더만 서빙하면 경로가 어긋납니다.
- `열기.bat` / `file://` 는 시드 JSON·시트 연동에 제한이 있습니다.

## 최신 UI 확인

pull 후 상단이 아래처럼 보이면 성공:

- 로고 없음 · `← 워크스페이스` + **시나리오 머신**
- 단계: **1 브리프 · 2 줄글 · 3 변환 · 4 장면 · 5 공유** (서치 없음)

`git log -1 --oneline` → `aa2d61d` 이후 커밋이면 최신.

## works-api

- **works.mansejin.com** / localhost(기본): NAS works-api 자동 연동 (API 키 불필요)
- 직접 Gemini: URL에 `?api=direct`

## main.js 빌드

```bash
cd dddit/script/js && node bundle.js
```
