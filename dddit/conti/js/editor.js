import * as Y from "https://esm.sh/yjs@13.6.27";
import { WebsocketProvider } from "https://esm.sh/y-websocket@2.1.0";

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
const USER_COLORS = ["#2563eb", "#16a34a", "#d97706", "#db2777", "#7c3aed", "#0891b2"];

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

function scheduleRender() {
  if (suppressRender) return;
  clearTimeout(renderTimer);
  renderTimer = setTimeout(() => renderTable(), 60);
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

  tbody.querySelectorAll(".cell-edit").forEach((el) => {
    el.addEventListener("input", onCellInput);
  });

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

function onCellInput(event) {
  const tr = event.target.closest("tr");
  const index = Number(tr.dataset.index);
  const field = event.target.dataset.field;
  if (!Number.isFinite(index) || !field) return;

  const yMap = yRows.get(index);
  if (!(yMap instanceof Y.Map)) return;
  const value = event.target.value;
  if ((yMap.get(field) || "") === value) return;

  ydoc.transact(() => {
    yMap.set(field, value);
  });
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

titleInput.addEventListener("input", () => {
  if (!yTitle || !ydoc) return;
  const value = titleInput.value;
  if (yTitle.toString() === value) return;
  ydoc.transact(() => {
    yTitle.delete(0, yTitle.length);
    yTitle.insert(0, value);
  });
});

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

async function init() {
  if (!project) {
    await loadPicker();
    return;
  }
  loadEditor();
}

init();

window.addEventListener("beforeunload", () => destroyCollab());
