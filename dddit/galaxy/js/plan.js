(function () {
  const STORAGE_KEY = "works/dddit/galaxy/plan";
  const DEFAULT_STATE = window.DdditPlanDefaults?.galaxy;
  if (!DEFAULT_STATE) throw new Error("DdditPlanDefaults.galaxy 로드 실패");

  const GUIDE_KEYS = [
    "summary",
    "concept",
    "keyMessage",
    "targetAudience",
    "tone",
    "structure",
    "brandMust",
    "brandAvoid",
    "reviewGuide",
    "shootChecklist",
    "tags",
    "descriptionDraft",
    "notes",
    "uploadDate",
    "schedulePlan",
    "scheduleShoot",
    "scheduleEdit",
    "scheduleUpload",
    "targetLength",
    "title",
  ];

  let state = structuredClone(DEFAULT_STATE);
  let saveTimer = null;
  let storageRevision = Number(DEFAULT_STATE.defaultsRevision || 1);

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

  const qcEl = document.getElementById("f-description-qc");

  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(persist, 400);
  }

  function persist() {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          updatedAt: Date.now(),
          revision: storageRevision,
          data: state,
        })
      );
    } catch {
      /* ignore */
    }
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!parsed?.data) return;
      state = { ...DEFAULT_STATE, ...parsed.data };
      const currentRev = Number(DEFAULT_STATE.defaultsRevision || 1);
      const savedRev = Number(parsed.revision || 0);
      if (savedRev < currentRev) {
        GUIDE_KEYS.forEach((key) => {
          if (DEFAULT_STATE[key] != null) state[key] = DEFAULT_STATE[key];
        });
        storageRevision = currentRev;
      } else {
        storageRevision = savedRev || currentRev;
      }
    } catch {
      /* keep defaults */
    }
  }

  function renderDescriptionQc() {
    if (!qcEl || !window.DdditDescriptionQc) return;
    const result = window.DdditDescriptionQc.summary(state.descriptionDraft || "", {
      sponsored: false,
    });
    qcEl.dataset.status = result.ok ? (result.warns ? "warn" : "ok") : "error";
    const lines = result.issues.map((i) => `· [${i.level}] ${i.message}`);
    qcEl.textContent = lines.length
      ? `${result.label}\n${lines.join("\n")}`
      : result.label;
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
        if (key === "descriptionDraft") renderDescriptionQc();
        scheduleSave();
      });
    }
  }

  function renderAll() {
    Object.keys(fields).forEach((key) => bindField(key, fields[key]));
    renderDescriptionQc();
  }

  function init() {
    load();
    renderAll();
    persist();
  }

  init();
})();
