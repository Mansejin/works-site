(function () {
  "use strict";

  /** Shared with PPM deck — same password unlocks both */
  const EDIT_AUTH_KEY = "works/project/tinasinger/mv/ppm/edit/v1";
  const EDIT_PASS_SHA256 = "c74cead93d83c7317ad62515eec8333429048cc8e1ed5971eae50ae66f8d7fcb";
  const STORAGE_KEY = "works/project/tinasinger/mv/ppm/callsheet/v1";
  const CHECKS_KEY = "works/project/tinasinger/mv/ppm/callsheet-checks/v1";

  const editModal = document.getElementById("editModal");
  const editForm = document.getElementById("editForm");
  const editPasswordEl = document.getElementById("editPassword");
  const editErrorEl = document.getElementById("editError");
  const btnEdit = document.getElementById("btnEdit");
  const btnReset = document.getElementById("btnReset");
  const btnPrint = document.getElementById("btnPrint");
  const saveStatusEl = document.getElementById("saveStatus");

  const defaults = collectFields();
  let editMode = sessionStorage.getItem(EDIT_AUTH_KEY) === "1";
  let saveTimer = null;

  async function sha256(text) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  async function verifyPassword(password) {
    return (await sha256(password)) === EDIT_PASS_SHA256;
  }

  function collectFields() {
    const data = {};
    document.querySelectorAll("[data-key]").forEach((el) => {
      data[el.dataset.key] = el.textContent;
    });
    return data;
  }

  function applyFields(data) {
    if (!data || typeof data !== "object") return;
    document.querySelectorAll("[data-key]").forEach((el) => {
      const key = el.dataset.key;
      if (Object.prototype.hasOwnProperty.call(data, key)) {
        el.textContent = data[key];
      }
    });
  }

  function loadSaved() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) applyFields(JSON.parse(raw));
    } catch {
      /* ignore */
    }
  }

  function persistFields() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(collectFields()));
    flashSaved();
  }

  function flashSaved() {
    if (!saveStatusEl || !editMode) return;
    saveStatusEl.hidden = false;
    saveStatusEl.textContent = "저장됨";
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveStatusEl.textContent = "";
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

  function resetFields() {
    if (!confirm("저장된 편집 내용을 초기화할까요?")) return;
    applyFields(defaults);
    localStorage.removeItem(STORAGE_KEY);
    flashSaved();
  }

  // Init
  loadSaved();
  loadChecks();
  updateEditUI();

  btnEdit?.addEventListener("click", toggleEditMode);
  btnReset?.addEventListener("click", resetFields);
  btnPrint?.addEventListener("click", () => window.print());

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
    if (editMode && t.matches(".cs-edit")) {
      persistFields();
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && editModal && !editModal.hidden) {
      closeEditModal();
      e.preventDefault();
    }
  });
})();
