디디딧 콘티 작성기 — 프롬프트 파일 관리

이 폴더에 시스템 프롬프트를 .txt 로 보관하세요.
Git으로 버전 관리하는 것을 권장합니다.

파일 이름 예시
  default-v1.0.0.txt     정식 기본 프롬프트
  dididit-v1.0.1-it.txt  IT 리뷰용 수정본
  dididit-v1.0.2-test.txt  실험용

사용 방법
  1. VS Code 등에서 txt 수정 후 저장
  2. 앱 [프롬프트 편집] → [txt 불러오기] 로 적용
  3. 수정 후 [txt로 저장] → prompts 폴더에 덮어쓰기 또는 새 파일명으로 저장

앱에서 [prompts 기본값 불러오기]는
  prompts/default-v1.1.1.txt 를 읽습니다.

단계별 출력 규칙(줄글/변환/장면/자막)은 코드에서 자동 주입됩니다.
기본 txt에는 역할·톤·촬영 제약만 두고, 행 분할·JSON 규칙은 넣지 마세요.

style-anchor.txt
  줄글 작성 시 톤·호흡 참고용 few-shot. QC Pass 후 갱신 (dev/qc/).
  - 실사용 블록: 체감·상황·솔직한 단점
  - 성능·제원 블록: 스펙 덩어리 + 짧은 해석
  - 프롤로그 블록: 기본형 / 결론 선행형 / 후속·비교형
  - 디자인 블록: 형태·배치·디자인 트레이드오프
  - 가격 블록: 단독 챕터용 (라인업·구매 주의)
  - 총평 블록: 가격 엮음(보통) / 경쟁 비교(강조) 두 패턴

format-item-roundup.txt (선택)
  N개 아이템 라운드업 QC Pass. 기획안이 라운드업일 때만 자동 주입.
  감지: N가지·꿀템 N·베스트 N 등 개수 신호만 (브랜드 단독은 단일 제품).
  소스별 힌트는 config.js ROUNDUP_CATEGORIES · dev/qc/formats/categories.json

대본 QC 도구: dev/qc/index.html (콘티 작성기 UI에 없음)
