(function () {
  const STORAGE_KEY = "works/dddit/xenics/plan";

  const DEFAULT_STATE = {
    title: "제닉스 데스크테리어 데스크 세팅 완성",
    uploadDate: "",
    targetLength: "15~20분",
    summary: "오비스 모션데스크 1400×750 기반으로 제닉스 제품으로 데스크 세팅을 완성하는 콘텐츠",
    concept:
      "기존 데스크를 제닉스 제품으로 전면 교체·정리하며 '완성된 데스크'를 보여주는 콘텐츠.\n데스크·의자·액세서리가 하나의 세트로 어우러지는 모습에 초점.",
    keyMessage: "제닉스로 만드는 나만의 완성형 데스크테리어",
    targetAudience: "데스크 꾸미기·생산성에 관심 있는 20~30대",
    tone: "차분하고 정보 전달 위주, 제품 특징은 실사용 맥락에서 자연스럽게",
    structure:
      "인트로(현재 데스크 소개) → 언박싱·설치 → 세팅 과정 → 완성 샷 → 각 제품 포인트 정리 → 마무리",
    schedulePlan: "",
    scheduleShoot: "",
    scheduleEdit: "",
    scheduleUpload: "",
    brandMust: "제닉스(Xenics) 브랜드명·제품명 정확히 표기, 협찬 사실 고지",
    brandAvoid: "타 브랜드 비교·비방, 과장된 성능 표현",
    reviewGuide:
      "【촬영·노출】\n- 제품 로고·디자인이 잘 보이는 앵글 (데스크 전경, 클로즈업)\n- 실제 사용 장면 (타이핑, 의자 착석, 팔받침 사용 등)\n\n【멘트】\n- 스펙 나열 대신 '쓰면서 느낀 점' 위주\n- 장단점 균형 있게 (협찬이지만 신뢰감 유지)\n- 가격·구매처는 설명란·고정댓글 안내 가능\n\n【필수】\n- 영상 내 또는 설명란에 협찬 고지\n- 브랜드 가이드라인 있는 경우 사전 확인 후 반영",
    shootChecklist:
      "□ 데스크 전경 와이드 샷\n□ 제품별 클로즈업\n□ 설치·조립 과정\n□ 사용 시연 (의자, 팔받침 등)\n□ 완성 데스크 투어",
    tags: "#제닉스 #Xenics #데스크테리어 #데스크셋업 #협찬",
    descriptionDraft: "",
    notes: "",
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
