(function () {
  "use strict";

  /** Shared with PPM deck — same password unlocks both */
  const EDIT_AUTH_KEY = "works/project/tinasinger/mv/ppm/edit/v1";
  const EDIT_PASS_SHA256 = "c74cead93d83c7317ad62515eec8333429048cc8e1ed5971eae50ae66f8d7fcb";
  const STORAGE_KEY = "works/project/tinasinger/mv/ppm/callsheet/v3";
  const CHECKS_KEY = "works/project/tinasinger/mv/ppm/callsheet-checks/v1";

  const DEFAULT_PLACE = "신촌 합주실";
  const DEFAULT_SCHEDULE = [
    { time: "09:00–10:00", block: "집결 · 세팅", place: DEFAULT_PLACE, detail: "장비·조명·배경 / 음원·슬레이트", isBreak: false },
    { time: "10:00–12:00", block: "오전 촬영", place: DEFAULT_PLACE, detail: "연출 컷 · 의상·배경 변경", isBreak: false },
    { time: "12:00–13:00", block: "점심", place: DEFAULT_PLACE, detail: "식사 · 오후 룩 준비", isBreak: true },
    { time: "13:00–15:00", block: "오후 촬영", place: DEFAULT_PLACE, detail: "원테이크(롱테이크) · 앵글 변경", isBreak: false },
    { time: "15:00–15:30", block: "프리뷰", place: DEFAULT_PLACE, detail: "모니터링 · 부족 컷", isBreak: false },
    { time: "15:30–17:00", block: "보충 · 인서트", place: DEFAULT_PLACE, detail: "추가 촬영 · 소품 디테일", isBreak: false },
    { time: "17:00–18:00", block: "저녁 · 철수", place: DEFAULT_PLACE, detail: "식사 · 철수 · 백업 확인", isBreak: true },
  ];

  const editModal = document.getElementById("editModal");
  const editForm = document.getElementById("editForm");
  const editPasswordEl = document.getElementById("editPassword");
  const editErrorEl = document.getElementById("editError");
  const btnEdit = document.getElementById("btnEdit");
  const btnReset = document.getElementById("btnReset");
  const btnPrint = document.getElementById("btnPrint");
  const btnAddSchedule = document.getElementById("btnAddSchedule");
  const saveStatusEl = document.getElementById("saveStatus");
  const scheduleBody = document.getElementById("scheduleBody");

  let schedule = cloneSchedule(DEFAULT_SCHEDULE);
  let editMode = sessionStorage.getItem(EDIT_AUTH_KEY) === "1";
  let saveTimer = null;
  let flashTimer = null;
  const fieldDefaults = collectStaticFields();

  function cloneSchedule(rows) {
    return JSON.parse(JSON.stringify(rows));
  }

  async function sha256(text) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  async function verifyPassword(password) {
    return (await sha256(password)) === EDIT_PASS_SHA256;
  }

  function escapeHtml(text) {
    return String(text ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function collectStaticFields() {
    const data = {};
    document.querySelectorAll("[data-key]").forEach((el) => {
      data[el.dataset.key] = el.textContent;
    });
    return data;
  }

  function applyStaticFields(data) {
    if (!data || typeof data !== "object") return;
    document.querySelectorAll("[data-key]").forEach((el) => {
      const key = el.dataset.key;
      if (Object.prototype.hasOwnProperty.call(data, key)) {
        el.textContent = data[key];
      }
    });
  }

  function readScheduleFromDom() {
    if (!scheduleBody) return schedule;
    const rows = [];
    scheduleBody.querySelectorAll("tr[data-sched]").forEach((tr) => {
      rows.push({
        time: tr.querySelector("[data-field='time']")?.textContent ?? "",
        block: tr.querySelector("[data-field='block']")?.textContent ?? "",
        place: tr.querySelector("[data-field='place']")?.textContent ?? "",
        detail: tr.querySelector("[data-field='detail']")?.textContent ?? "",
        isBreak: tr.classList.contains("break"),
      });
    });
    return rows;
  }

  function renderSchedule() {
    if (!scheduleBody) return;
    scheduleBody.innerHTML = schedule
      .map((row, i) => {
        const breakClass = row.isBreak ? " break" : "";
        return `<tr class="${breakClass.trim()}" data-sched="${i}">
          <td class="t cs-edit" data-field="time" spellcheck="false">${escapeHtml(row.time)}</td>
          <td class="b cs-edit" data-field="block" spellcheck="false">${escapeHtml(row.block)}</td>
          <td class="p cs-edit" data-field="place" spellcheck="false">${escapeHtml(row.place)}</td>
          <td class="cs-edit" data-field="detail" spellcheck="false">${escapeHtml(row.detail)}</td>
          <td class="c-actions edit-only no-print">
            <button type="button" class="row-btn row-btn--del" data-del-sched="${i}" title="행 삭제" aria-label="행 삭제">−</button>
          </td>
        </tr>`;
      })
      .join("");
    setEditableState(editMode);
    syncEditOnlyUI();
    updatePageScale();
  }

  function loadSaved() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        if (parsed.fields) applyStaticFields(parsed.fields);
        else applyStaticFields(parsed); // legacy flat
        if (Array.isArray(parsed.schedule) && parsed.schedule.length) {
          schedule = parsed.schedule.map((row) => ({
            time: row.time || "",
            block: row.block || "",
            place: row.place || DEFAULT_PLACE,
            detail: row.detail || "",
            isBreak: Boolean(row.isBreak),
          }));
        }
      }
    } catch {
      /* ignore */
    }
  }

  function persistAll() {
    schedule = readScheduleFromDom();
    const payload = {
      fields: collectStaticFields(),
      schedule,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    flashSaved();
  }

  function schedulePersist() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      persistAll();
    }, 120);
  }

  function flashSaved() {
    if (!saveStatusEl || !editMode) return;
    saveStatusEl.hidden = false;
    saveStatusEl.textContent = "저장됨";
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => {
      if (saveStatusEl) saveStatusEl.textContent = "";
    }, 1200);
  }

  function loadChecks() {
    try {
      const raw = localStorage.getItem(CHECKS_KEY);
      const data = raw ? JSON.parse(raw) : {};
      document.querySelectorAll("[data-check]").forEach((el) => {
        el.checked = Boolean(data[el.dataset.check]);
      });
    } catch {
      /* ignore */
    }
  }

  function persistChecks() {
    const data = {};
    document.querySelectorAll("[data-check]").forEach((el) => {
      data[el.dataset.check] = el.checked;
    });
    localStorage.setItem(CHECKS_KEY, JSON.stringify(data));
  }

  function setEditableState(on) {
    document.querySelectorAll(".cs-edit").forEach((el) => {
      el.contentEditable = on ? "true" : "false";
      el.tabIndex = on ? 0 : -1;
    });
  }

  function syncEditOnlyUI() {
    document.querySelectorAll(".edit-only").forEach((el) => {
      el.hidden = !editMode;
      if (el.classList.contains("c-actions") || el.matches("th.c-actions")) {
        el.setAttribute("aria-hidden", editMode ? "false" : "true");
      }
    });
    updatePageScale();
  }

  function updateEditUI() {
    document.body.classList.toggle("is-edit-mode", editMode);
    if (btnEdit) {
      btnEdit.textContent = editMode ? "편집 종료" : "편집";
      btnEdit.classList.toggle("is-active", editMode);
    }
    if (btnReset) btnReset.hidden = !editMode;
    if (saveStatusEl) {
      saveStatusEl.hidden = !editMode;
      if (!editMode) saveStatusEl.textContent = "";
    }
    setEditableState(editMode);
    syncEditOnlyUI();
  }

  function setEditMode(on) {
    editMode = on;
    if (on) sessionStorage.setItem(EDIT_AUTH_KEY, "1");
    else sessionStorage.removeItem(EDIT_AUTH_KEY);
    updateEditUI();
  }

  function openEditModal() {
    if (!editModal) return;
    editModal.hidden = false;
    if (editErrorEl) editErrorEl.hidden = true;
    if (editPasswordEl) {
      editPasswordEl.value = "";
      editPasswordEl.focus();
    }
  }

  function closeEditModal() {
    if (editModal) editModal.hidden = true;
    if (editErrorEl) editErrorEl.hidden = true;
  }

  function toggleEditMode() {
    if (editMode) {
      setEditMode(false);
      return;
    }
    openEditModal();
  }

  function addScheduleRow() {
    schedule = readScheduleFromDom();
    schedule.push({
      time: "",
      block: "",
      place: DEFAULT_PLACE,
      detail: "",
      isBreak: false,
    });
    renderSchedule();
    persistAll();
    const last = scheduleBody?.querySelector("tr:last-child [data-field='time']");
    last?.focus();
  }

  function deleteScheduleRow(index) {
    schedule = readScheduleFromDom();
    if (schedule.length <= 1) {
      alert("스케줄은 최소 1행이 필요합니다.");
      return;
    }
    schedule.splice(index, 1);
    renderSchedule();
    persistAll();
  }

  function resetFields() {
    if (!confirm("저장된 편집 내용을 초기화할까요?")) return;
    applyStaticFields(fieldDefaults);
    schedule = cloneSchedule(DEFAULT_SCHEDULE);
    renderSchedule();
    localStorage.removeItem(STORAGE_KEY);
    flashSaved();
  }

  // Viewport scaling — fit 1180px canvas to available width and height
  const pageViewport = document.querySelector(".page-viewport");
  const pageFrame = document.querySelector(".page-frame");
  const pageEl = document.querySelector(".page");
  const PAGE_DESIGN_W = 1180;
  const PAGE_PAD_X = 16;
  const PAGE_PAD_Y = 20;

  function updatePageScale() {
    if (!pageViewport || !pageFrame || !pageEl) return;
    const availableW = pageViewport.clientWidth - PAGE_PAD_X;
    const availableH = pageViewport.clientHeight - PAGE_PAD_Y;
    const naturalH = pageEl.offsetHeight;
    if (!availableW || !availableH || !naturalH) return;

    const scaleW = availableW / PAGE_DESIGN_W;
    const scaleH = availableH / naturalH;
    const scale = Math.min(scaleW, scaleH);

    pageFrame.style.setProperty("--page-scale", String(scale));
    pageFrame.style.height = `${naturalH}px`;
    pageFrame.style.marginBottom = `${naturalH * (scale - 1)}px`;
  }

  const scaleObserver = new ResizeObserver(() => updatePageScale());
  if (pageViewport) scaleObserver.observe(pageViewport);
  if (pageEl) scaleObserver.observe(pageEl);
  window.addEventListener("resize", updatePageScale);
  window.addEventListener("load", updatePageScale);
  if (document.fonts?.ready) {
    document.fonts.ready.then(updatePageScale);
  }

  // Init
  loadSaved();
  renderSchedule();
  loadChecks();
  updateEditUI();

  btnEdit?.addEventListener("click", toggleEditMode);
  btnReset?.addEventListener("click", resetFields);
  btnPrint?.addEventListener("click", () => window.print());
  btnAddSchedule?.addEventListener("click", addScheduleRow);

  scheduleBody?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-del-sched]");
    if (!btn || !editMode) return;
    deleteScheduleRow(Number(btn.dataset.delSched));
  });

  editForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const password = editPasswordEl?.value || "";
    if (await verifyPassword(password)) {
      closeEditModal();
      setEditMode(true);
      return;
    }
    if (editErrorEl) editErrorEl.hidden = false;
    editPasswordEl?.select();
  });

  document.getElementById("editCancel")?.addEventListener("click", closeEditModal);
  editModal?.addEventListener("click", (e) => {
    if (e.target === editModal) closeEditModal();
  });

  document.addEventListener("input", (e) => {
    const t = e.target;
    if (!(t instanceof HTMLElement)) return;
    if (t.matches("[data-check]")) {
      persistChecks();
      return;
    }
    if (editMode && t.closest(".cs-edit")) {
      schedulePersist();
    }
  });

  document.addEventListener("focusout", (e) => {
    if (!editMode) return;
    const t = e.target;
    if (t instanceof HTMLElement && t.closest(".cs-edit")) {
      persistAll();
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && editModal && !editModal.hidden) {
      closeEditModal();
      e.preventDefault();
    }
  });

  updatePageScale();
})();
