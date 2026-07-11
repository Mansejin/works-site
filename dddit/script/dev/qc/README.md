# 대본 QC (개발 전용)

콘티 작성기 UI에 노출하지 않습니다.

- **대본 QC**: `dev/qc/index.html`
- **스타일 앵커 컨펌** (대표님 검토용): `dev/qc/style-anchor.html`

## 개념 분리

| 축 | 역할 | QC 대상 |
|----|------|---------|
| **톤** | 문장 리듬·담백함·솔직함 | 협찬 **실사용** 줄글 반복 QC → `anchors/tone-sponsored-prose.txt` |
| **포맷** | 챕터·영상 구조 | 포맷별 프로필 → `formats/*.json` |
| **카테고리** | 큰 챕터 구성·라운드업 소스 | 톤과 무관 → `formats/categories.json` |

## 포맷 프로필

- `sponsored-review` — 제품 1개 협찬·내돈내산 심층 리뷰 (프롤로그 → 본문 챕터 → 총평)
- `item-roundup` — N개 아이템 짧게 (오프닝 → `[제품명]` 블록 반복 → 클로징)
  - 소스 카테고리: `roundup-daiso` · `roundup-coupang` · `roundup-temu` · `roundup-deskterior` · `roundup-muji`
  - **감지 규칙**: `N가지`·`꿀템 N`·`베스트 N` 등 개수 신호 필수. 브랜드만(다이소·무인양품 등)으로는 단일 제품 리뷰.

## QC 워크플로 (협찬 실사용 톤)

1. 포맷 `sponsored-review` · 챕터 **실사용**만 생성
2. `index.html`에서 체크리스트 Pass/Fail (`checklists/prose-sponsored.json`)
3. Fail → 직접 수정 → 재검
4. 전항목 Pass → `prompts/style-anchor.txt` **실사용** 블록 반영

## QC 워크플로 (성능·제원 톤)

1. 포맷 `sponsored-review` · 챕터 **성능** 또는 **제원** 줄글
2. `checklists/prose-spec.json` 기준 검수
3. Pass → `prompts/style-anchor.txt` **성능·제원** 블록 · `anchors/tone-spec-prose.txt` 반영

## QC 워크플로 (디자인·가격·총평)

- 프롤로그: `checklists/prose-prologue.json` (기본·결론 선행·후속 비교)
- 디자인: `checklists/prose-design.json`
- 가격 단독: `checklists/prose-price.json` (가격·라인업이 핵심일 때)
- 총평: `checklists/prose-closing.json` (가격 엮음·경쟁 비교 포함)

가격은 제품마다 **단독 챕터** vs **총평에 엮음** — 기획안·브리프에 맞춤.

## QC 워크플로 (N개 아이템 라운드업)

1. 포맷 `item-roundup` · 소스 카테고리 선택 (다이소·쿠팡·테무·데스크테리어·무인양품)
2. 제품 1블록(또는 오프닝) 붙여넣기 → `checklists/prose-roundup-item.json`
3. Pass → `prompts/format-item-roundup.txt` 갱신 (기획안이 라운드업일 때만 자동 주입)

**2026-07:** 다이소 실촬영 3블록 Pass → `format-item-roundup.txt` (소스는 카테고리로 분리)

## 샘플

- `samples/daiso-summer-20.tsv` — 다이소 여름꿀템 20 (라운드업 샘플, `roundup-daiso` 카테고리)

## 콘티 작성기 연동 (수동)

QC Pass 후 개발자가 복사·붙여넣기:

- 톤: `prompts/style-anchor.txt`
- 라운드업 구조: `prompts/format-item-roundup.txt` (기획안이 라운드업일 때 자동 주입)

## 후속 (톤 QC와 별도)

- 챕터 간 중복 방지: 프롤로그에 쓴 상황·포인트를 실사용에서 다시 쓰지 않도록 파이프라인 로직 필요

