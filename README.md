# works-site

개인·업무용 페이지. `mansejin.com` 메인 도구함과 분리된 서브도메인.

- 루트: https://works.mansejin.com (비공개, 목록 없음)
- 디디딧 워크스페이스: https://works.mansejin.com/dddit/
- 콘티 작성기: https://works.mansejin.com/dddit/script/
- Xenics 프로젝트: https://works.mansejin.com/dddit/xenics/
- Xenics 콘티: https://works.mansejin.com/dddit/script/?project=xenics
- 벤딕트 프로젝트: https://works.mansejin.com/dddit/vendict/
- 아이닉 프로젝트: https://works.mansejin.com/dddit/inic/
- (내부) 벤딕트 시나리오: https://works.mansejin.com/dddit/script/?project=vendict — **허브에서만** 접근, 브랜드 페이지에 링크 금지
- 로지텍G 납품 일정: https://works.mansejin.com/logitechG/schedule/
- SUPERSTRIKE 클릭 챌린지: https://works.mansejin.com/logitechG/promotion/cpstest/

## 경로 구조

```
works.mansejin.com/
└── dddit/
    ├── index.html                  # 채널 워크스페이스
    ├── js/hub.js
    ├── script/                     # 콘티 작성기 + Google 시트 연동
    │   ├── google-apps-script/     # Apps Script 배포용
    │   └── js/sheet-sync.js
    └── xenics/
        ├── index.html
        ├── plan/
        ├── storyboard/               → conti/ 리다이렉트
        ├── conti/                    # 완성 콘티 읽기 전용
        └── productlist/
    └── vendict/                      # 벤딕트 차량용 청소기 협찬
        ├── index.html
        ├── plan/
        ├── conti/
        └── productlist/
```

추후 다른 프로젝트는 `/dddit/프로젝트명/` 형태로 추가합니다.  
**브랜드 포털**(`dddit/{slug}/`)에는 기획안·콘티·제품 링크만 두고, **콘티 작성기는 허브**(`dddit/`) 채널 도구에서만 접근합니다.  
새 브랜드 추가 시 `dddit/_template/brand/` 복사 · `node dddit/scripts/check-brand-portals.mjs` 로 검증.

예: `/dddit/다른브랜드/`, `/dddit/script/`

## 인프라 요약

| 용도 | 저장소 | 도메인 |
|------|--------|--------|
| 개인 도구함 | [tools-site](https://github.com/Mansejin/tools-site) | `mansejin.com` |
| 업무용 페이지 | **이 저장소** | `works.mansejin.com` |
| 생기부 (Python) | NAS + Cloudflare Tunnel | `sgb.mansejin.com` |

**DNS는 Cloudflare가 실제로 관리합니다.** 가비아에서만 바꿔도 반영되지 않을 수 있습니다.

## DNS (Cloudflare)

| 타입 | 이름 | 값 | 프록시 |
|------|------|-----|--------|
| CNAME | `works` | `mansejin.github.io` | **DNS only (회색 구름)** |

GitHub Pages 서브도메인은 회색 구름이 맞습니다.  
내부 페이지 정적 파일까지 막으려면 Cloudflare Access + 주황 구름으로 전환해야 합니다. 절차: [`docs/team-gate-hardening.md`](docs/team-gate-hardening.md).

works-api는 `DDDIT_TEAM_GATE_PASSCODE` 설정 시 팀 토큰 없이 민감 데이터 API를 거부합니다.

## 배포

`main` 브랜치 push 시 GitHub Pages 자동 배포.

---

## 새 페이지 추가 체크리스트

대부분 **Case A**만 하면 됩니다.

### Case A — 기존 도메인에 페이지 추가 (추천)

예: `works.mansejin.com/dddit/script/`

1. 이 저장소에 `폴더/경로/index.html` 추가
2. 비공개 페이지면 `<meta name="robots" content="noindex, nofollow">` 포함
3. `git add` → `git commit` → `git push origin main`
4. 1~2분 후 URL 접속 확인

DNS·HTTPS·새 저장소는 **필요 없음**.

### Case B — 새 서브도메인 + 새 저장소 (최소화 권장)

정말 도메인을 분리해야 할 때만 진행합니다.

1. 로컬에 저장소 준비 (`index.html`, `CNAME` 파일에 도메인 한 줄)
2. GitHub 저장소 생성 후 push
3. **Settings → Pages** → Branch: `main`, folder: `/`
4. Custom domain 입력
5. **Cloudflare**에 CNAME 추가 (회색 구름)
6. **15분~몇 시간** 대기 (TLS 인증서 발급)
7. 인증서 완료 후 **Enforce HTTPS** 켜기

### Case C — NAS 서비스 (생기부 등)

HTML이 아니라 Python/API면 GitHub Pages를 쓰지 않습니다.

1. NAS에서 서비스 실행
2. Cloudflare Tunnel 연결
3. Cloudflare에 Tunnel 레코드 추가

---

## 자주 틀리는 것

| 증상 | 원인 |
|------|------|
| HTTPS 안 됨 | TLS 인증서 발급 중. DNS가 맞으면 기다리면 됨 |
| 가비아 DNS 변경이 안 먹힘 | Cloudflare가 실제 DNS |
| `github.io/저장소/...` 도 안 됨 | `CNAME` 파일 때문에 커스텀 도메인으로 리다이렉트됨 |
| push 거절됨 | `git pull --rebase origin main` 후 다시 push |

## 원칙

새 사이트마다 저장소·서브도메인을 만들지 말고, **경로만 추가**하세요.

```
works.mansejin.com/프로젝트/페이지/
mansejin.com/도구명/
```
