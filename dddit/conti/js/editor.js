import { Y, WebsocketProvider } from "../vendor/collab-lib.js";

const api = window.DdditContiApi;
const HEADERS = api.HEADERS;

const params = new URLSearchParams(location.search);
const projectSlug = (params.get("project") || "").trim().toLowerCase();
const initialTitle = (params.get("title") || "").trim();

const pickerView = document.getElementById("picker-view");
const editorView = document.getElementById("editor-view");
const projectList = document.getElementById("project-list");
const newSlugInput = document.getElementById("new-slug");
const newTitleInput = document.getElementById("new-title");
const btnCreate = document.getElementById("btn-create");
const editorTitle = document.getElementById("editor-title");
const editorSubtitle = document.getElementById("editor-subtitle");
const titleInput = document.getElementById("title-input");
const shareUrlInput = document.getElementById("share-url");
const statusBar = document.getElementById("status-bar");
const presenceBar = document.getElementById("presence-bar");
const tbody = document.getElementById("conti-body");
const btnBack = document.getElementById("btn-back");
const btnAddRow = document.getElementById("btn-add-row");
const btnDeleteRow = document.getElementById("btn-delete-row");
const btnReload = document.getElementById("btn-reload");
const btnCopyShare = document.getElementById("btn-copy-share");

let project = projectSlug;
let selectedRow = -1;
let renderTimer = null;
let suppressRender = false;

let ydoc = null;
let yRows = null;
let yTitle = null;
let wsProvider = null;

const USER_KEY = "works/dddit/conti/user";
const COL_WIDTH_KEY = "works/dddit/conti/col-widths";
const USER_COLORS = ["#2563eb", "#16a34a", "#d97706", "#db2777", "#7c3aed", "#0891b2"];
const RESIZABLE_COLS = ["대본", "장면", "사이즈", "자막", "코멘트"];
const DEFAULT_COL_WIDTHS = {
  대본: 220,
  장면: 160,
  사이즈: 72,
  자막: 140,
  코멘트: 140,
};
const MIN_COL_WIDTH = 56;

const contiTable = document.getElementById("conti-table");
let colResizeReady = false;
let activeColResize = null;
let composing = false;
let pendingRender = false;

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function setStatus(message, kind) {
  statusBar.textContent = message;
  statusBar.className = "status-bar" + (kind ? ` ${kind}` : "");
}

function formatUpdatedAt(ms) {
  if (!ms) return "저장 기록 없음";
  return `마지막 저장 ${new Date(ms).toLocaleString("ko-KR")}`;
}

function navigateToProject(slug) {
  const url = new URL(location.href);
  if (slug) url.searchParams.set("project", slug);
  else url.searchParams.delete("project");
  location.href = url.toString();
}

function getUserProfile() {
  try {
    const saved = JSON.parse(localStorage.getItem(USER_KEY) || "null");
    if (saved?.name) return saved;
  } catch {
    /* ignore */
  }
  const name = prompt("동시 편집에 표시할 이름을 입력하세요.", "디디딧") || "익명";
  const profile = {
    name: name.trim() || "익명",
    color: USER_COLORS[Math.floor(Math.random() * USER_COLORS.length)],
  };
  localStorage.setItem(USER_KEY, JSON.stringify(profile));
  return profile;
}

function loadColWidths() {
  const widths = { ...DEFAULT_COL_WIDTHS };
  try {
    const saved = JSON.parse(localStorage.getItem(COL_WIDTH_KEY) || "null");
    if (saved && typeof saved === "object") {
      RESIZABLE_COLS.forEach((key) => {
        const value = Number(saved[key]);
        if (Number.isFinite(value) && value >= MIN_COL_WIDTH) widths[key] = value;
      });
    }
  } catch {
    /* ignore */
  }
  return widths;
}

function saveColWidths(widths) {
  localStorage.setItem(COL_WIDTH_KEY, JSON.stringify(widths));
}

function applyColWidths() {
  if (!contiTable) return;
  const widths = loadColWidths();
  contiTable.querySelectorAll("col[data-col]").forEach((col) => {
    const key = col.dataset.col;
    if (key && widths[key]) col.style.width = `${widths[key]}px`;
  });
}

function setupColumnResize() {
  if (colResizeReady || !contiTable) return;
  colResizeReady = true;
  applyColWidths();

  contiTable.querySelectorAll(".col-resize").forEach((handle) => {
    handle.addEventListener("mousedown", (event) => {
      event.preventDefault();
      const key = handle.dataset.col;
      const col = contiTable.querySelector(`col[data-col="${key}"]`);
      if (!col) return;

      const widths = loadColWidths();
      activeColResize = {
        key,
        col,
        startX: event.clientX,
        startWidth: widths[key] || col.getBoundingClientRect().width,
      };
      document.body.classList.add("is-col-resizing");

      const onMove = (moveEvent) => {
        if (!activeColResize) return;
        const next = Math.max(
          MIN_COL_WIDTH,
          Math.round(activeColResize.startWidth + (moveEvent.clientX - activeColResize.startX))
        );
        activeColResize.col.style.width = `${next}px`;
        widths[activeColResize.key] = next;
      };

      const onUp = () => {
        if (activeColResize) saveColWidths(widths);
        activeColResize = null;
        document.body.classList.remove("is-col-resizing");
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };

      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    });
  });
}

function captureFocus() {
  const active = document.activeElement;
  if (!active?.classList?.contains("cell-edit")) return null;
  const tr = active.closest("tr");
  if (!tr) return null;
  return {
    index: Number(tr.dataset.index),
    field: active.dataset.field,
    start: active.selectionStart,
    end: active.selectionEnd,
  };
}

function restoreFocus(ref) {
  if (!ref || !Number.isFinite(ref.index)) return;
  const tr = tbody.querySelector(`tr[data-index="${ref.index}"]`);
  const el = tr?.querySelector(`[data-field="${ref.field}"]`);
  if (!el) return;
  el.focus();
  if (typeof ref.start === "number" && typeof el.setSelectionRange === "function") {
    el.setSelectionRange(ref.start, ref.end);
  }
}

function plainRows() {
  const rows = [];
  yRows.forEach((yMap) => {
    if (!(yMap instanceof Y.Map)) return;
    rows.push(api.normalizeRow(Object.fromEntries(HEADERS.map((key) => [key, yMap.get(key) || ""]))));
  });
  return rows;
}

function isEditing() {
  const el = document.activeElement;
  if (!el) return false;
  if (el === titleInput) return true;
  return el.classList?.contains("cell-edit");
}

function flushPendingRender() {
  if (suppressRender || composing || isEditing()) return;
  if (!pendingRender) return;
  pendingRender = false;
  renderTable();
}

function scheduleRender() {
  if (suppressRender) return;
  if (composing || isEditing()) {
    pendingRender = true;
    return;
  }
  clearTimeout(renderTimer);
  renderTimer = setTimeout(() => {
    pendingRender = false;
    renderTable();
  }, 60);
}

function cellCoords(el) {
  const tr = el?.closest("tr");
  if (!tr) return null;
  const index = Number(tr.dataset.index);
  const field = el.dataset.field;
  if (!Number.isFinite(index) || !field) return null;
  return { index, field };
}

function commitCellFromElement(el) {
  if (!ydoc || !yRows) return;
  const coords = cellCoords(el);
  if (!coords) return;
  const yMap = yRows.get(coords.index);
  if (!(yMap instanceof Y.Map)) return;
  const value = el.value;
  if ((yMap.get(coords.field) || "") === value) return;
  ydoc.transact(() => {
    yMap.set(coords.field, value);
  });
}

function commitTitle() {
  if (!yTitle || !ydoc) return;
  const value = titleInput.value;
  if (yTitle.toString() === value) return;
  ydoc.transact(() => {
    yTitle.delete(0, yTitle.length);
    yTitle.insert(0, value);
  });
}

function bindCellEditors() {
  tbody.querySelectorAll(".cell-edit").forEach((el) => {
    el.addEventListener("compositionstart", () => {
      composing = true;
    });
    el.addEventListener("compositionend", (event) => {
      composing = false;
      commitCellFromElement(event.target);
      flushPendingRender();
    });
    el.addEventListener("blur", (event) => {
      commitCellFromElement(event.target);
      queueMicrotask(flushPendingRender);
    });
  });
}

function renderTable() {
  const focusRef = captureFocus();
  const rows = plainRows();
  const displayRows = rows.length ? rows : [api.emptyRow()];

  tbody.innerHTML = displayRows
    .map(
      (row, index) => `
      <tr data-index="${index}">
        <td><input type="radio" name="row-select" value="${index}" ${index === selectedRow ? "checked" : ""} /></td>
        <td class="row-num">${index + 1}</td>
        <td><textarea class="cell-edit" data-field="대본" rows="2">${esc(row.대본)}</textarea></td>
        <td><textarea class="cell-edit" data-field="장면" rows="2">${esc(row.장면)}</textarea></td>
        <td><input class="cell-edit" data-field="사이즈" value="${esc(row.사이즈)}" /></td>
        <td><input class="cell-edit" data-field="자막" value="${esc(row.자막)}" /></td>
        <td><input class="cell-edit" data-field="코멘트" value="${esc(row.코멘트)}" /></td>
      </tr>
    `
    )
    .join("");

  bindCellEditors();

  tbody.querySelectorAll('input[name="row-select"]').forEach((el) => {
    el.addEventListener("change", (event) => {
      selectedRow = Number(event.target.value);
    });
  });

  if (titleInput !== document.activeElement) {
    titleInput.value = yTitle.toString();
  }

  restoreFocus(focusRef);
  updateStatusLine();
}

function ensureAtLeastOneRow() {
  if (yRows.length > 0) return;
  ydoc.transact(() => {
    const yMap = new Y.Map();
    HEADERS.forEach((key) => yMap.set(key, ""));
    yRows.push([yMap]);
  });
}

function renderPresence() {
  if (!wsProvider?.awareness || !presenceBar) return;
  const states = Array.from(wsProvider.awareness.getStates().values())
    .map((state) => state.user)
    .filter(Boolean);
  const unique = [];
  const seen = new Set();
  states.forEach((user) => {
    const key = `${user.name}:${user.color}`;
    if (seen.has(key)) return;
    seen.add(key);
    unique.push(user);
  });

  presenceBar.innerHTML = unique.length
    ? unique
        .map(
          (user) =>
            `<span class="presence-chip" style="--chip-color:${esc(user.color)}">${esc(user.name)}</span>`
        )
        .join("")
    : `<span class="presence-empty">접속자 없음</span>`;
}

function updateStatusLine() {
  if (!wsProvider) return;
  const count = plainRows().length;
  const peers = Math.max(0, (wsProvider.awareness?.getStates().size || 1) - 1);
  if (!wsProvider.wsconnected) {
    setStatus("연결 끊김 · 재연결 중…", "error");
    return;
  }
  if (!wsProvider.synced) {
    setStatus("동기화 중…");
    return;
  }
  const peerLabel = peers > 0 ? ` · ${peers + 1}명 편집 중` : "";
  setStatus(`실시간 동기화 · ${count}행${peerLabel}`, "ok");
}

function destroyCollab() {
  if (wsProvider) {
    wsProvider.destroy();
    wsProvider = null;
  }
  if (ydoc) {
    ydoc.destroy();
    ydoc = null;
    yRows = null;
    yTitle = null;
  }
}

function connectCollab() {
  destroyCollab();

  const user = getUserProfile();
  ydoc = new Y.Doc();
  yRows = ydoc.getArray("rows");
  yTitle = ydoc.getText("title");

  wsProvider = new WebsocketProvider(api.collabWsUrl(), api.collabRoom(project), ydoc, {
    connect: true,
  });

  wsProvider.awareness.setLocalStateField("user", user);

  yRows.observeDeep(() => scheduleRender());
  yTitle.observe(() => scheduleRender());

  wsProvider.awareness.on("change", () => {
    renderPresence();
    updateStatusLine();
  });

  wsProvider.on("status", () => updateStatusLine());
  wsProvider.on("sync", (isSynced) => {
    if (!isSynced) {
      updateStatusLine();
      return;
    }

    suppressRender = true;
    ensureAtLeastOneRow();
    if (!yTitle.length && initialTitle) {
      ydoc.transact(() => yTitle.insert(0, initialTitle));
    }
    suppressRender = false;
    renderTable();
    renderPresence();
    updateStatusLine();
  });
}

async function renderPicker(projects) {
  if (!projects.length) {
    projectList.innerHTML =
      '<p style="color:#64748b;font-size:0.88rem;">아직 콘티가 없습니다. 아래에서 새 프로젝트를 만드세요.</p>';
    return;
  }

  projectList.innerHTML = projects
    .map(
      (item) => `
      <a class="picker-card" href="?project=${encodeURIComponent(item.project)}">
        <h2>${esc(item.title || item.project)}</h2>
        <p>${esc(item.project)}</p>
        <div class="meta">${item.rowCount || 0}행 · ${formatUpdatedAt(item.updatedAt)}</div>
      </a>
    `
    )
    .join("");
}

async function loadPicker() {
  pickerView.hidden = false;
  editorView.hidden = true;
  try {
    renderPicker(await api.listProjects());
  } catch {
    projectList.innerHTML =
      '<p style="color:#dc2626;font-size:0.88rem;">프로젝트 목록을 불러오지 못했습니다.</p>';
  }
}

function loadEditor() {
  pickerView.hidden = true;
  editorView.hidden = false;
  editorTitle.textContent = `콘티 · ${project}`;
  editorSubtitle.textContent = `프로젝트 ${project} · 실시간 동기화`;
  shareUrlInput.value = api.shareUrl(project);
  setStatus("동기화 연결 중…");
  setupColumnResize();
  connectCollab();
}

btnCreate.addEventListener("click", () => {
  const slug = newSlugInput.value.trim().toLowerCase();
  if (!/^[a-z0-9-]+$/.test(slug)) {
    alert("slug는 영문 소문자, 숫자, 하이픈만 사용할 수 있습니다.");
    return;
  }
  const url = new URL(location.href);
  url.searchParams.set("project", slug);
  if (newTitleInput.value.trim()) {
    url.searchParams.set("title", newTitleInput.value.trim());
  }
  location.href = url.toString();
});

btnBack.addEventListener("click", () => {
  destroyCollab();
  navigateToProject("");
});

btnAddRow.addEventListener("click", () => {
  ydoc.transact(() => {
    const yMap = new Y.Map();
    HEADERS.forEach((key) => yMap.set(key, ""));
    yRows.push([yMap]);
  });
});

btnDeleteRow.addEventListener("click", () => {
  if (selectedRow < 0 || selectedRow >= yRows.length) {
    alert("삭제할 행을 선택하세요.");
    return;
  }
  ydoc.transact(() => {
    yRows.delete(selectedRow, 1);
  });
  selectedRow = -1;
  ensureAtLeastOneRow();
});

btnReload.addEventListener("click", () => {
  if (!confirm("페이지를 새로고침해 최신 상태로 맞출까요?")) return;
  location.reload();
});

btnCopyShare.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(shareUrlInput.value);
    setStatus("공유 링크 복사됨", "ok");
  } catch {
    shareUrlInput.select();
    document.execCommand("copy");
    setStatus("공유 링크 복사됨", "ok");
  }
});

titleInput.addEventListener("compositionstart", () => {
  composing = true;
});
titleInput.addEventListener("compositionend", () => {
  composing = false;
  commitTitle();
  flushPendingRender();
});
titleInput.addEventListener("blur", () => {
  commitTitle();
  queueMicrotask(flushPendingRender);
});

async function init() {
  try {
    if (!api) throw new Error("conti-api not loaded");
    if (!project) {
      await loadPicker();
      return;
    }
    loadEditor();
  } catch (err) {
    console.error(err);
    pickerView.hidden = false;
    editorView.hidden = true;
    projectList.innerHTML = `<p style="color:#dc2626;font-size:0.88rem;">페이지를 불러오지 못했습니다. ${esc(err.message || err)}</p>`;
  }
}

init();

window.addEventListener("beforeunload", () => destroyCollab());
