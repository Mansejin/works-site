(function () {
  const STORAGE_KEY = "works/dddit/inic/plan";

  const DEFAULT_STATE = {
    title: "아이닉 미네랄스톤 음식물 처리기 iFD01 — 콘텐츠 협업",
    uploadDate: "",
    targetLength: "인스타그램 릴스·숏폼 (가이드 참고)",
    summary:
      "2026 업그레이드 아이닉 미네랄스톤 음식물 처리기(iFD01) 협업 — 라이프스타일 숏폼, 필수 장면·필수 멘션 준수 (유료광고·제품협찬)",
    concept:
      "【촬영 TIP】 기능 나열보다 '아이닉으로 편해진 일상'에 초점.\n\n" +
      "【콘셉트 옵션 — 1가지 선택】\n" +
      "A. 필수템 추천: 주방 필수템 3가지 소개 후 음식물 처리기로 마무리. 다른 2개는 제품가(599,000원)와 비슷하거나 더 비싼 구성.\n" +
      "B. 자취·직장인·1인가구: 집에서 샤브샤브 등 음식물 많이 나오는 요리 → 식사 → 음식물 처리기로 마무리.\n" +
      "C. 신혼부부: 신혼집 주방·가전 소개 흐름, 마지막에 음식물 처리기 공개.\n" +
      "D. 육아+요리: 아이 간식/식사 만들기 → 껍질·잔반 → 음식물 처리기로 깔끔 마무리.\n" +
      "E. 살림꿀팁: 음식물 봉투 구매·처리 불편 → 비용·시간 절약 강조.\n\n" +
      "예시 릴스: instagram.com/reel/DZUgrlePwyC, instagram.com/p/DZCYT02SOrC 등 (기획안 리뷰 가이드 참고)",
    keyMessage:
      "미네랄스톤 내솥(눌어붙음·코팅 손상↓) + 180°C 고온건조(90% 부피감소·99% 살균) + 7중 분리형 칼날(위생·연마력 유지) + 정부 보조금(Q마크)",
    targetAudience: "자취생·직장인 1인가구 / 신혼부부 / 육아 가정 / 살림·주방 관심층 (선택 콘셉트에 맞게)",
    tone: "라이프스타일 공감형 숏폼. 스펙 나열보다 사용 장면·체감 편리함. 협찬이지만 신뢰감 유지",
    structure:
      "오프닝(음식물 고충·언박싱·제품 소개) → 제품 차별점(미네랄스톤 내솥·7중 분리 칼날) → 성능 시연(다양 투입·가루 결과·180°C·탈취) → 사용 편의성(디스플레이·자동세척·모드·중간투입) → 공간·라이프스타일(한뼘·3L·야간 저소음)",
    schedulePlan: "",
    scheduleShoot: "",
    scheduleEdit: "",
    scheduleUpload: "",
    brandMust:
      "브랜드명 아이닉(inic)·제품명 미네랄스톤 음식물 처리기 명확 표기 · #제품협찬 · 공정위 표기\n" +
      "필수 멘션: 국내 최초 미네랄스톤 코팅 내솥(눌어붙음·스크래치↓) · 180°C 고온건조(부피 90% 감소·99% 살균) · 칼날 완전 분리 세척 · 이중 밀폐·활성탄 필터 탈취(125%↑) · 40dB 저소음 · 진행률 디스플레이 · 습도센서 중간투입 · 정부 음식물처리기 보조금(Q마크)\n" +
      "구매 링크: https://i-nic.co.kr/surl/P/529 (자동 DM·프로필 링크) · 공식 계정 @inic.inc 태그\n" +
      "보조금: 지자체별 상이·별도 확인 필요(자막 또는 음성 필수 안내)\n" +
      "딱딱한 껍데기·뼈 투입 시연 시 자막/음성: '분쇄력 확인을 위한 테스트 촬영입니다'",
    brandAvoid:
      "촬영 금지: 역광, 제품 일부만 노출, 음식물 과도한 클로즈업\n" +
      "경쟁사 브랜드·제품명 언급 금지 · BGM은 저작권 프리 또는 인스타 상위권 음원\n" +
      "가격은 '구매 링크' 표기 후 자동 DM·프로필 링크로 안내",
    reviewGuide:
      "【제품】 iFD01 Mineral Stone · 3L · 정가 599,000원 · 본체+미네랄스톤 내솥+활성탄 필터\n\n" +
      "【특장점 vs 일반기】 3L 대용량 · 국내 최고 180°C 건조 · 미네랄스톤 내솥(내마모 75%↑) · 7중 칼날 · 습도센서 중간투입 · BLDC 40dB · 칼날 완전분리 · Q마크 보조금 최대 80%\n\n" +
      "【필수 소구】 미네랄스톤 내솥 / 습도 감지 센서 / 프리미엄 활성탄 125%↑\n" +
      "【서브 소구】 90% 부피감소·고온살균 · 한뼘(약21cm) 컴팩트 · 3L(4인 가구 1일분) · 칼날 분리·자동세척 · 보조금 · 표준/쾌속/보관 모드\n\n" +
      "【필수 장면】\n" +
      "1 오프닝: 음식물 봉투·냄새·파리 고충 → 언박싱 → 제품 옆 서서 소개\n" +
      "2 차별점: 미네랄스톤 내솥 밝은 색·스크래치/눌어붙음 강조, 7중 칼날 구조 클로즈업\n" +
      "3 성능: 1~2일분 다양 투입(뼈·딱딱한 껍데기·끈적 음식·과일껍질) → 가루 부어 보이기(필수) → 전후 부피·건조감 리액션 → 180°C·99% 살균·활성탄 필터\n" +
      "4 편의: 진행률 % 디스플레이 · 자동세척(물+세제) · 깨끗한 내솥·분리 칼날 · 보관/표준/쾌속 모드 · 가동 중 추가 투입\n" +
      "5 공간: 한뼘 사이즈·좁은 틈 설치 · 3L(4인·집들이) · 야간 저소음(쉿 제스처)\n\n" +
      "【후킹 문구 예시】\n" +
      "- 문의 폭발 주방템 / 돈값 하는 신혼가전 / 육아하면 음식물 2배 / 연간 ○○만원 아끼는 살림꿀팁 / 좁은 공간 한뼘 음식물처리기",
    shootChecklist:
      "□ 음식물 고충 컷(봉투·냄새·파리)\n□ 택배 언박싱·제품 전경\n□ 미네랄스톤 내솥 클로즈업(밝은 색·스크래치 강조)\n□ 7중 칼날 분리·구조\n□ 다양 음식물 순차 투입\n□ 가루 부어 보이기(필수)\n□ 전후 부피 비교·건조 리액션\n□ 활성탄 필터·180°C·살균 멘션\n□ 디스플레이 %·버튼 조작\n□ 자동세척·분리 칼날 세척\n□ 중간투입 시연\n□ 한뼘·틈새 설치·야간 저소음\n□ #제품협찬·@inic.inc·구매링크 안내",
    tags:
      "#제품협찬 #아이닉 #아이닉음식물처리기 #음식물처리기 #미네랄스톤 #음식물처리기추천 #음쓰처리기 #자취템 #신혼가전 #주방가전 #살림꿀팁 #육아꿀팁 #정부보조금",
    descriptionDraft:
      "아이닉 미네랄스톤 음식물 처리기 iFD01 사용 후기입니다.\n\n" +
      "🛒 구매 링크: https://i-nic.co.kr/surl/P/529\n" +
      "📱 공식 @inic.inc\n\n" +
      "#제품협찬 #아이닉 #음식물처리기 #미네랄스톤\n\n" +
      "※ 음식물처리기 정부 보조금은 지자체별로 상이하니 별도 확인이 필요합니다.",
    notes:
      "브랜드 문의: mktsse@i-nic.co.kr\n" +
      "업로드 전 사실관계·필수 멘션 검수 필수 → 최종 자막본·원본 파일 브랜드 제출\n" +
      "콘셉트 5종 중 1개 선택 후 촬영 · 필수 장면은 공통 적용",
  };

  let state = structuredClone(DEFAULT_STATE);
  let saveTimer = null;

  const fields = {
    title: document.getElementById("f-title"),
    uploadDate: document.getElementById("f-upload-date"),
    targetLength: document.getElementById("f-target-length"),
    summary: document.getElementById("f-summary"),
    concept: document.getElementById("f-concept"),
    keyMessage: document.getElementById("f-key-message"),
    targetAudience: document.getElementById("f-target-audience"),
    tone: document.getElementById("f-tone"),
    structure: document.getElementById("f-structure"),
    schedulePlan: document.getElementById("f-schedule-plan"),
    scheduleShoot: document.getElementById("f-schedule-shoot"),
    scheduleEdit: document.getElementById("f-schedule-edit"),
    scheduleUpload: document.getElementById("f-schedule-upload"),
    brandMust: document.getElementById("f-brand-must"),
    brandAvoid: document.getElementById("f-brand-avoid"),
    reviewGuide: document.getElementById("f-review-guide"),
    shootChecklist: document.getElementById("f-shoot-checklist"),
    tags: document.getElementById("f-tags"),
    descriptionDraft: document.getElementById("f-description-draft"),
    notes: document.getElementById("f-notes"),
  };

  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(persist, 400);
  }

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ updatedAt: Date.now(), data: state }));
    } catch {
      /* ignore */
    }
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed?.data) state = { ...DEFAULT_STATE, ...parsed.data };
    } catch {
      /* keep defaults */
    }
  }

  function bindField(key, el) {
    if (!el) return;
    if (el.type === "date" || el.tagName === "INPUT") {
      el.value = state[key] || "";
      el.addEventListener("input", () => {
        state[key] = el.value;
        scheduleSave();
      });
    } else {
      el.textContent = state[key] || "";
      el.addEventListener("input", () => {
        state[key] = el.textContent.trim();
        scheduleSave();
      });
    }
  }

  function renderAll() {
    Object.keys(fields).forEach((key) => bindField(key, fields[key]));
  }

  function init() {
    load();
    renderAll();
    persist();
  }

  init();
})();
