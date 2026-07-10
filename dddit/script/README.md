# 디디딧 시나리오 작성 머신 v1.0.0

브리프 → 파트 구성 → **AI 생성** → **Google 시트** 워크플로.

- **시트가 원본(SSOT)**: 장면·자막 등 실무 편집은 Google 스프레드시트에서만
- **시나리오 머신**: 서치 · 브리프 · AI 파트 생성 · 시트 push/pull · 읽기 전용 미리보기
- **프로젝트별 시트**: `?project=xenics` 등 — `google-apps-script/README.md` 참고

## 로컬 실행

디디딧 유튜브 채널용 리뷰 **콘티(엑셀 5열)** 를 **브리프 → 파트 → 대본 → TSV** 흐름으로 작성하는 HTML 도구입니다.

## 최종 목표

| 단계 | 산출물 |
|------|--------|
| 브리프 | 제품 제원 + 리뷰 방향 |
| 파트 | 프롤로그~총평 라인업 |
| 콘티 | 대본·장면·사이즈·자막·코멘트 (구글 시트) |

**Phase 2 (예정)**: 국내 IT·가전 리서치, 상세페이지·유튜브 분석 → 브리프 자동 채움.  
로드맵: `docs/ROADMAP.md`

## 실행

- **`열기.bat`** 또는 **`index.html`** 더블클릭 (Chrome/Edge 권장)
- `localhost:8080` 서버 **불필요**

## 작성 흐름

| 단계 | 작업 |
|------|------|
| **1 서치** | **공기청정기 서치** — 가격대·평수·우선순위 → Google 검색 (2026 여름) |
| 2 브리프 | 후보 **브리프에 적용** → 제원·리뷰 방향 자동 입력 |
| 3 파트 | AI 파트 초안 → 확정 |
| 4 콘티 | 파트별 대본 생성 → 오른쪽 표 |
| 5 TSV | 구글 시트 붙여넣기 |

## 카테고리 (9종)

가전 + **IT·모바일** (스마트폰, 태블릿, 노트북, 이어폰 등), 청소, 공기, 주방, 세탁, 개인케어, 스마트홈, 기타

## Gemini 모델

- Gemini 3.1 Flash-Lite (기본 추천)
- Gemini 3.5 Flash
- Gemini 3.1 Pro
- Gemini 3 Flash (프리뷰)

## 파일 구조

```
dididit-script-machine/
├── index.html
├── css/style.css
├── js/main.js        ← 브라우저가 로드 (통합 번들)
├── js/app.js         ← 편집용 소스
├── js/config.js
├── js/prompt-manager.js
├── js/file-parser.js
├── js/product-brief.js ← 제원 템플릿 · 브리프 프롬프트
├── js/bundle.js      ← main.js 재생성: node js/bundle.js
├── docs/ROADMAP.md   ← Phase 1~3 로드맵
└── 열기.bat
```

## 프롬프트 (txt 파일)

프롬프트는 브라우저 버전 관리 대신 **`prompts/` 폴더의 .txt`** 로 관리합니다.

```
prompts/
├── default-v1.0.0.txt   # 정식 기본 프롬프트
├── README.txt
└── (직접 추가) dididit-v1.0.1-it.txt …
```

1. VS Code에서 `prompts/*.txt` 수정 → Git 커밋
2. 앱 **[프롬프트 (txt)]** → **txt 불러오기** 또는 **prompts 기본값 불러오기**
3. 수정 후 **txt로 저장** → `prompts/`에 넣기

`prompts 기본값 불러오기`는 `prompts/default-v1.0.0.txt`를 읽습니다.  
`file://`로 열 때 실패하면 내장 fallback을 씁니다. `start.bat` 로컬 서버 사용 시 항상 파일에서 읽습니다.

## main.js 다시 빌드

```bat
node js\bundle.js
```
