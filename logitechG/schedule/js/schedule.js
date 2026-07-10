(function () {
  const STORAGE_KEY = "works/logitechg/schedule";
  const POLL_MS = 2000;
  const SAVE_DEBOUNCE_MS = 400;
  const IS_WEB_HOSTED =
    location.protocol === "https:" && /^works\.mansejin\.com$/i.test(location.hostname);
  const API_BASE = IS_WEB_HOSTED ? "https://works-api.mansejin.com" : "http://localhost:8788";

  let lastUpdatedAt = 0;
  let saveTimer = null;
  let useServer = IS_WEB_HOSTED;
  let isDragging = false;
  let pendingRemote = null;

  const syncStatus = document.getElementById("sync-status");

  function getCells() {
    return Array.from(document.querySelectorAll("td"));
  }

  function collectPositions() {
    const cells = getCells();
    const positions = {};
    document.querySelectorAll(".event").forEach((event) => {
      const index = cells.indexOf(event.parentElement);
      if (index >= 0) positions[event.id] = index;
    });
    return positions;
  }

  function applyPositions(positions) {
    if (!positions || typeof positions !== "object") return;
    const cells = getCells();
    Object.entries(positions).forEach(([id, index]) => {
      const event = document.getElementById(id);
      const cell = cells[index];
      if (!event || !cell || cell.classList.contains("empty")) return;
      cell.appendChild(event);
    });
  }

  function setSyncStatus(mode, text) {
    if (!syncStatus) return;
    syncStatus.textContent = text;
    syncStatus.classList.remove("is-live", "is-offline");
    if (mode) syncStatus.classList.add(mode);
  }

  function loadFromLocalStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function saveToLocalStorage(positions, updatedAt) {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ updatedAt, positions })
      );
    } catch {
      /* ignore */
    }
  }

  async function loadFromServer() {
    const res = await fetch(`${API_BASE}/api/logitechg/schedule`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  async function saveToServer(positions, updatedAt) {
    const res = await fetch(`${API_BASE}/api/logitechg/schedule`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ updatedAt, positions }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(persist, SAVE_DEBOUNCE_MS);
  }

  async function persist() {
    const positions = collectPositions();
    const updatedAt = Date.now();
    lastUpdatedAt = updatedAt;

    if (useServer) {
      try {
        await saveToServer(positions, updatedAt);
        setSyncStatus("is-live", "실시간 동기화 중");
        saveToLocalStorage(positions, updatedAt);
        return;
      } catch {
        useServer = false;
        setSyncStatus("is-offline", "오프라인 — 이 브라우저에만 저장");
      }
    }

    saveToLocalStorage(positions, updatedAt);
    setSyncStatus("is-offline", "오프라인 — 이 브라우저에만 저장");
  }

  async function applyRemoteIfNewer(payload) {
    const remoteAt = Number(payload?.updatedAt || 0);
    const positions = payload?.positions;
    if (!remoteAt || !positions || Object.keys(positions).length === 0) return;
    if (remoteAt <= lastUpdatedAt) return;

    if (isDragging) {
      pendingRemote = payload;
      return;
    }

    applyPositions(positions);
    lastUpdatedAt = remoteAt;
    saveToLocalStorage(positions, remoteAt);
  }

  async function poll() {
    if (!useServer) return;
    try {
      const payload = await loadFromServer();
      await applyRemoteIfNewer(payload);
      if (!isDragging) {
        setSyncStatus("is-live", "실시간 동기화 중");
      }
    } catch {
      useServer = false;
      setSyncStatus("is-offline", "서버 연결 끊김 — 로컬 저장");
    }
  }

  async function initialLoad() {
    if (IS_WEB_HOSTED) {
      try {
        const serverPayload = await loadFromServer();
        const remoteAt = Number(serverPayload?.updatedAt || 0);
        const remotePositions = serverPayload?.positions || {};

        if (remoteAt && Object.keys(remotePositions).length > 0) {
          applyPositions(remotePositions);
          lastUpdatedAt = remoteAt;
          saveToLocalStorage(remotePositions, remoteAt);
          setSyncStatus("is-live", "실시간 동기화 중");
          return;
        }

        const localPayload = loadFromLocalStorage();
        if (localPayload?.positions && Object.keys(localPayload.positions).length > 0) {
          applyPositions(localPayload.positions);
          lastUpdatedAt = Number(localPayload.updatedAt || Date.now());
          await persist();
          setSyncStatus("is-live", "실시간 동기화 중");
          return;
        }

        await persist();
        setSyncStatus("is-live", "실시간 동기화 중");
        return;
      } catch {
        useServer = false;
      }
    }

    const localPayload = loadFromLocalStorage();
    if (localPayload?.positions) {
      applyPositions(localPayload.positions);
      lastUpdatedAt = Number(localPayload.updatedAt || 0);
    }
    setSyncStatus("is-offline", IS_WEB_HOSTED ? "서버 연결 실패 — 로컬 저장" : "로컬 미리보기");
  }

  function findCell(target) {
    let node = target;
    while (node && node.tagName !== "TD") {
      node = node.parentNode;
    }
    return node;
  }

  function allowDrop(ev) {
    ev.preventDefault();
    const cell = findCell(ev.target);
    if (cell && !cell.classList.contains("empty")) {
      cell.classList.add("drop-target");
    }
  }

  function clearDropTargets() {
    document.querySelectorAll("td.drop-target").forEach((cell) => {
      cell.classList.remove("drop-target");
    });
  }

  function drag(ev) {
    isDragging = true;
    ev.dataTransfer.setData("text", ev.target.id);
  }

  function drop(ev) {
    ev.preventDefault();
    clearDropTargets();
    const data = ev.dataTransfer.getData("text");
    const cell = findCell(ev.target);
    if (!cell || cell.classList.contains("empty")) {
      isDragging = false;
      return;
    }
    const event = document.getElementById(data);
    if (event) {
      cell.appendChild(event);
      scheduleSave();
    }
    isDragging = false;
    if (pendingRemote) {
      const payload = pendingRemote;
      pendingRemote = null;
      applyRemoteIfNewer(payload);
    }
  }

  function bindDragDrop() {
    getCells().forEach((cell) => {
      cell.addEventListener("dragover", allowDrop);
      cell.addEventListener("dragleave", (ev) => {
        const left = findCell(ev.target);
        if (left) left.classList.remove("drop-target");
      });
      cell.addEventListener("drop", drop);
    });

    document.querySelectorAll(".event").forEach((event) => {
      event.addEventListener("dragstart", drag);
      event.addEventListener("dragend", () => {
        isDragging = false;
        clearDropTargets();
        if (pendingRemote) {
          const payload = pendingRemote;
          pendingRemote = null;
          applyRemoteIfNewer(payload);
        }
      });
    });
  }

  async function init() {
    bindDragDrop();
    await initialLoad();
    if (IS_WEB_HOSTED) {
      setInterval(poll, POLL_MS);
    }
  }

  init();
})();
