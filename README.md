# works-site

개인·업무용 페이지. `mansejin.com` 메인 도구함과 분리된 서브도메인.

- 루트: https://works.mansejin.com (비공개, 목록 없음)
- 디디딧 협찬 제품 리스트: https://works.mansejin.com/dddit/productlist/

## 경로 구조

```
works.mansejin.com/
├── index.html                 # 비공개 루트
└── dddit/
    └── productlist/
        └── index.html         # 협찬 제품 리스트
```

추후 다른 채널·프로젝트는 `/{채널}/{페이지}/` 형태로 추가.

## DNS (가비아)

| 타입 | 호스트 | 값 |
|------|--------|-----|
| CNAME | `works` | `Mansejin.github.io` |

## 배포

`master` 브랜치 push 시 GitHub Pages 자동 배포.
