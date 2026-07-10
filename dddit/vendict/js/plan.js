(function () {
  const STORAGE_KEY = "works/dddit/vendict/plan";

  const DEFAULT_STATE = {
    title: "벤딕트 실버라이닝 퓨어 PRO — 차량용 청소기 리뷰",
    uploadDate: "2026-08-02",
    targetLength: "제품 노출 1~2분 이상 (전체 러닝타임은 디디딧 스타일)",
    summary:
      "벤딕트 실버라이닝 퓨어 PRO 실사용 리뷰 — 강력 흡입력·필터·먼지통·배터리·노즐 활용 (유료광고)",
    concept:
      "차량·실내에서 실제로 써보며 흡입력과 편의 기능을 체감 위주로 전달.\n" +
      "LED가 앞이 아닌 뒤쪽 배치라 흡입력 저하 없이 강하게 빨아들이는 점을 비교·연출.\n" +
      "다양한 먼지·부스러기를 한 번에 흡입하는 데모로 '실라퓨'급 흡입력을 보여줌.\n" +
      "제목·연출은 디디딧 평소 스타일 — 브랜드는 소구점·필수 고지 위주 확인.",
    keyMessage: "21,000Pa급 강력 흡입 + 3중 필터 + 대용량 먼지통 — 차량·집·사무실 겸용",
    targetAudience: "차량·실내 청소, 무선 청소기에 관심 있는 디디딧 시청자",
    tone: "직설·체감 위주. 스펙 나열보다 사용 장면에서 느낀 점. 협찬이지만 신뢰감 유지",
    structure:
      "인트로(협찬 고지) → 제품·구성 소개 → 흡입력 데모(먼지·부스러기) → LED 위치·흡입 구조 → 필터·먼지통·배터리 → 노즐 6종 활용 → 마무리 + 링크·이벤트 안내",
    schedulePlan: "",
    scheduleShoot: "",
    scheduleEdit: "",
    scheduleUpload: "2026-08-02",
    brandMust:
      "벤딕트·실버라이닝 퓨어 PRO 정확 표기 · 유튜브 '유료 프로모션 포함' 설정 · 본문/고정댓글 링크 https://wlo.kr/mkDqFW · 태그 #벤딕트 #차량용청소기 · 설명란 키워드(벤딕트, 차량용 청소기) · 구독자 이벤트 3회(브랜드·제품 긍정 댓글 유도 가능)",
    brandAvoid:
      "편집 프로그램 워터마크 · 네이버 동영상 편집기·웹툴·앱 편집툴 · 라이선스 불명 편집 프로그램 · 과장된 성능 표현",
    reviewGuide:
      "【촬영】\n" +
      "- 화질 HD 1080P 이상\n" +
      "- 제품 노출 약 1~2분 이상\n" +
      "- 제품 소구점을 자연스럽게 (전 항목 설명 필수 아님)\n" +
      "- 다양한 먼지·부스러기 한 번에 흡입 연출\n" +
      "- LED가 뒤쪽이라 흡입력 약해지지 않는 점 언급 (앞 LED 제품 대비)\n\n" +
      "【편집】\n" +
      "- 워터마크 없는 정식 편집 프로그램만 사용\n\n" +
      "【소구점 참고】\n" +
      "1. 최대 21,000Pa 흡입력 · 150W BLDC 모터\n" +
      "2. 실리콘·스테인리스·H13 HEPA 3중 필터\n" +
      "3. 200ml 대용량 먼지통 · 원터치 비움 · 흡입력 저하 최소화\n" +
      "4. 2,500mAh 배터리 3개 · 15W 고속 충전 · 최대 33분 연속 사용\n" +
      "5. 항공우주급 6061 알루미늄 바디\n" +
      "6. LCD(상태·배터리) · LED 라이트 · SOS\n" +
      "7. 돌출형 흡입구 · 폴리보네이트 소재\n" +
      "8. 원터치 개폐 · 이중 잠금(진공 누출 최소화)\n" +
      "9. 6종 노즐 — 차량·집·사무실\n\n" +
      "【업로드】\n" +
      "- 제목 키워드: 벤딕트, 차량용 청소기 (평소 스타일 OK)\n" +
      "- 업로드 일정 확정·업로드 시 브랜드에 간단 메일",
    shootChecklist:
      "□ 제품 전경·로고\n□ 6종 노즐 구성\n□ 먼지·부스러기 흡입 데모 (와이드·클로즈업)\n□ 먼지통 원터치 비움\n□ LCD·배터리 잔량\n□ LED 라이트 / 어두운 공간\n□ 차량 시트·틈새 / 실내 바닥 등 활용 컷\n□ 협찬 고지 멘트",
    tags: "#벤딕트 #차량용청소기",
    descriptionDraft:
      "벤딕트 실버라이닝 퓨어 PRO 차량용 청소기 리뷰입니다.\n\n" +
      "🛒 구매 링크: https://wlo.kr/mkDqFW\n" +
      "📦 상세페이지: https://brand.naver.com/vendict/products/11200977471\n\n" +
      "#벤딕트 #차량용청소기\n\n" +
      "※ 유료광고 포함",
    notes:
      "담당: 김정범 (벤딕트 마케팅) · 송장 롯데택배 411259947770\n" +
      "업로드 기한 8/2 — 디디딧 일정에 맞게 조정 가능 (메일)\n" +
      "구독자 이벤트 3회 진행 · 방식 자유 · 브랜드·제품 긍정 댓글 유도 권장\n" +
      "문의: 메일 회신",
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
