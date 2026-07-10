(function () {
  const STORAGE_KEY = "works/dddit/hub";
  const IS_WEB_HOSTED =
    location.protocol === "https:" && /^works\.mansejin\.com$/i.test(location.hostname);
  const API_BASE = IS_WEB_HOSTED ? "https://works-api.mansejin.com" : "http://localhost:8788";

  const PROJECTS = [
    {
      id: "xenics",
      name: "Xenics 데스크테리어 협찬",
      path: "xenics/",
      brand: "제닉스",
      status: "진행 중",
      summary: "데스크 세팅 콘텐츠 · 협찬 제품 리스트",
      scriptPath: "script/?project=xenics",
      sheetTab: "Xenics",
    },
  ];

  const CHANNEL_TOOLS = [
    {
      name: "시나리오 머신",
      path: "script/",
      summary: "서치 · 브리프 · 파트 대본 · 콘티 TSV",
      status: "사용 가능",
      ready: true,
    },
  ];

  const SCHEDULE_TYPES = ["기획", "촬영", "편집", "업로드"];
  const STATUS_OPTIONS = ["예정", "진행 중", "완료", "보류"];

  const DEFAULT_STATE = {
    overview: "디디딧 채널 운영·협업을 위한 워크스페이스입니다. 프로젝트 현황, 일정, 협찬·광고, 노티스를 한곳에서 관리합니다.",
    schedule: [
      {
        id: uid(),
        title: "Xenics 협찬 콘텐츠 기획",
        type: "기획",
        date: "",
        assignee: "",
        project: "xenics",
        status: "진행 중",
        note: "",
      },
    ],
    sponsorships: [
      {
        id: uid(),
        brand: "제닉스 (Xenics)",
        kind: "협찬",
        status: "진행 중",
        contact: "",
        deadline: "",
        project: "xenics",
        note: "데스크테리어 협찬",
      },
    ],
    notices: [
      {
        id: uid(),
        title: "디디딧 워크스페이스 오픈",
        date: todayStr(),
        pinned: true,
        body: "채널 전반 현황은 상단에서, 팀 업무는 하단 블록에서 관리합니다.",
      },
    ],
  };

  let state = structuredClone(DEFAULT_STATE);
  let saveTimer = null;

  const els = {
    saveDot: document.getElementById("save-dot"),
    saveMessage: document.getElementById("save-message"),
    overviewText: document.getElementById("overview-text"),
    projectGrid: document.getElementById("project-grid"),
    toolGrid: document.getElementById("tool-grid"),
    timeline: document.getElementById("timeline"),
    scheduleBody: document.getElementById("schedule-body"),
    sponsorshipBody: document.getElementById("sponsorship-body"),
    noticeList: document.getElementById("notice-list"),
    btnExport: document.getElementById("btn-export"),
    btnImport: document.getElementById("btn-import"),
    importFile: document.getElementById("import-file"),
    ytSubs: document.getElementById("yt-subs"),
    ytViews: document.getElementById("yt-views"),
    ytVideosCount: document.getElementById("yt-videos-count"),
    ytVideos: document.getElementById("yt-videos"),
    ytChannelTitle: document.getElementById("yt-channel-title"),
    ytChannelLink: document.getElementById("yt-channel-link"),
    ytError: document.getElementById("yt-error"),
  };

  function uid() {
    return Math.random().toString(36).slice(2, 10);
  }

  function todayStr() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function projectById(id) {
    return PROJECTS.find((p) => p.id === id);
  }

  function setStatus(kind, message) {
    els.saveDot.className = "save-dot" + (kind === "saved" ? " saved" : kind === "pending" ? " pending" : "");
    els.saveMessage.textContent = message;
  }

  function scheduleSave() {
    setStatus("pending", "저장 예정...");
    clearTimeout(saveTimer);
    saveTimer = setTimeout(persist, 400);
  }

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ updatedAt: Date.now(), data: state }));
      setStatus("saved", IS_WEB_HOSTED ? "저장됨" : "브라우저에 저장됨");
    } catch {
      setStatus("pending", "저장 실패");
    }
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed?.data) state = mergeState(DEFAULT_STATE, parsed.data);
    } catch {
      /* keep defaults */
    }
  }

  function mergeState(base, saved) {
    return {
      overview: saved.overview ?? base.overview,
      schedule: Array.isArray(saved.schedule) ? saved.schedule : base.schedule,
      sponsorships: Array.isArray(saved.sponsorships) ? saved.sponsorships : base.sponsorships,
      notices: Array.isArray(saved.notices) ? saved.notices : base.notices,
    };
  }

  function bindOverview() {
    els.overviewText.textContent = state.overview;
    els.overviewText.addEventListener("input", () => {
      state.overview = els.overviewText.textContent.trim();
      scheduleSave();
      renderTimeline();
    });
  }

  function renderProjects() {
    els.projectGrid.innerHTML = PROJECTS.map((project) => {
      const scheduleCount = state.schedule.filter((s) => s.project === project.id).length;
      const sponsorCount = state.sponsorships.filter((s) => s.project === project.id).length;
      const scriptHref = project.scriptPath || `script/?project=${project.id}`;
      return `
        <div>
          <a class="mini-card" href="${escapeHtml(project.path)}">
            <h3>${escapeHtml(project.name)}</h3>
            <p>${escapeHtml(project.summary)}</p>
            <span class="tag">${escapeHtml(project.status)} · 일정 ${scheduleCount} · 협업 ${sponsorCount}</span>
          </a>
          <a class="project-pill" href="${escapeHtml(scriptHref)}">콘티 · 시나리오 →</a>
        </div>
      `;
    }).join("");
  }

  function renderTools() {
    if (!els.toolGrid) return;
    els.toolGrid.innerHTML = CHANNEL_TOOLS.map((tool) => `
      <a class="mini-card ${tool.ready ? "is-ready" : ""}" href="${escapeHtml(tool.path)}">
        <h3>${escapeHtml(tool.name)}</h3>
        <p>${escapeHtml(tool.summary)}</p>
        <span class="tag">${tool.ready ? `${escapeHtml(tool.status)} →` : "준비 중"}</span>
      </a>
    `).join("");
  }

  function parseDate(value) {
    if (!value) return null;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function formatDateLabel(value) {
    const d = parseDate(value);
    if (!d) return "날짜 미정";
    return `${d.getMonth() + 1}/${d.getDate()}`;
  }

  function renderTimeline() {
    const items = state.schedule
      .filter((row) => row.title?.trim())
      .slice()
      .sort((a, b) => {
        const da = parseDate(a.date);
        const db = parseDate(b.date);
        if (!da && !db) return 0;
        if (!da) return 1;
        if (!db) return -1;
        return da - db;
      })
      .slice(0, 4);

    if (!items.length) {
      els.timeline.innerHTML = `<div class="empty-hint">등록된 일정이 없습니다.</div>`;
      return;
    }

    els.timeline.innerHTML = items
      .map((row) => {
        const project = projectById(row.project);
        return `
          <div class="timeline-item">
            <div class="timeline-date">${escapeHtml(formatDateLabel(row.date))}</div>
            <div class="timeline-body">
              <div class="timeline-type">${escapeHtml(row.type || "일정")}</div>
              <div class="timeline-title">${escapeHtml(row.title)}</div>
              <div class="timeline-sub">
                ${project ? escapeHtml(project.name) : "프로젝트 없음"}
                ${row.assignee ? ` · ${escapeHtml(row.assignee)}` : ""}
              </div>
            </div>
            <span class="pill pill-${pillClass(row.status)}">${escapeHtml(row.status || "예정")}</span>
          </div>
        `;
      })
      .join("");
  }

  function pillClass(status) {
    if (status === "완료") return "done";
    if (status === "진행 중") return "active";
    if (status === "보류") return "hold";
    return "todo";
  }

  function selectOptions(values, selected) {
    return values
      .map((v) => `<option value="${escapeHtml(v)}"${v === selected ? " selected" : ""}>${escapeHtml(v)}</option>`)
      .join("");
  }

  function projectOptions(selected) {
    const opts = [`<option value="">—</option>`].concat(
      PROJECTS.map(
        (p) =>
          `<option value="${escapeHtml(p.id)}"${p.id === selected ? " selected" : ""}>${escapeHtml(p.name)}</option>`
      )
    );
    return opts.join("");
  }

  function renderSchedule() {
    els.scheduleBody.innerHTML = state.schedule
      .map(
        (row) => `
      <tr data-id="${row.id}" data-block="schedule">
        <td><input type="date" data-field="date" value="${escapeHtml(row.date)}"></td>
        <td>
          <select data-field="type">${selectOptions(SCHEDULE_TYPES, row.type)}</select>
        </td>
        <td><input type="text" data-field="title" value="${escapeHtml(row.title)}" placeholder="작업명"></td>
        <td>
          <select data-field="project">${projectOptions(row.project)}</select>
        </td>
        <td><input type="text" data-field="assignee" value="${escapeHtml(row.assignee)}" placeholder="담당"></td>
        <td>
          <select data-field="status">${selectOptions(STATUS_OPTIONS, row.status)}</select>
        </td>
        <td><input type="text" data-field="note" value="${escapeHtml(row.note)}" placeholder="메모"></td>
        <td class="row-actions"><button type="button" class="btn-icon" data-action="delete" title="삭제">×</button></td>
      </tr>
    `
      )
      .join("");
  }

  function renderSponsorships() {
    els.sponsorshipBody.innerHTML = state.sponsorships
      .map(
        (row) => `
      <tr data-id="${row.id}" data-block="sponsorships">
        <td><input type="text" data-field="brand" value="${escapeHtml(row.brand)}" placeholder="브랜드"></td>
        <td>
          <select data-field="kind">
            <option value="협찬"${row.kind === "협찬" ? " selected" : ""}>협찬</option>
            <option value="광고"${row.kind === "광고" ? " selected" : ""}>광고</option>
            <option value="PPL"${row.kind === "PPL" ? " selected" : ""}>PPL</option>
          </select>
        </td>
        <td>
          <select data-field="status">${selectOptions(STATUS_OPTIONS, row.status)}</select>
        </td>
        <td><input type="text" data-field="contact" value="${escapeHtml(row.contact)}" placeholder="담당자·연락처"></td>
        <td><input type="date" data-field="deadline" value="${escapeHtml(row.deadline)}"></td>
        <td>
          <select data-field="project">${projectOptions(row.project)}</select>
        </td>
        <td><input type="text" data-field="note" value="${escapeHtml(row.note)}" placeholder="메모"></td>
        <td class="row-actions"><button type="button" class="btn-icon" data-action="delete" title="삭제">×</button></td>
      </tr>
    `
      )
      .join("");
  }

  function renderNotices() {
    const sorted = state.notices.slice().sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return (b.date || "").localeCompare(a.date || "");
    });

    els.noticeList.innerHTML = sorted
      .map(
        (row) => `
      <article class="notice-card" data-id="${row.id}" data-block="notices">
        <div class="notice-head">
          <label class="pin-check">
            <input type="checkbox" data-field="pinned"${row.pinned ? " checked" : ""}>
            <span>고정</span>
          </label>
          <input type="date" class="notice-date" data-field="date" value="${escapeHtml(row.date)}">
          <button type="button" class="btn-icon" data-action="delete" title="삭제">×</button>
        </div>
        <input type="text" class="notice-title" data-field="title" value="${escapeHtml(row.title)}" placeholder="제목">
        <textarea data-field="body" rows="3" placeholder="내용">${escapeHtml(row.body)}</textarea>
      </article>
    `
      )
      .join("");
  }

  function renderAll() {
    renderProjects();
    renderTools();
    renderTimeline();
    renderSchedule();
    renderSponsorships();
    renderNotices();
  }

  function updateRow(block, id, field, value) {
    const list = state[block];
    const row = list.find((r) => r.id === id);
    if (!row) return;
    if (field === "pinned") row.pinned = Boolean(value);
    else row[field] = value;
    scheduleSave();
    if (block === "schedule") renderTimeline();
    if (block === "sponsorships" || block === "schedule") renderProjects();
  }

  function deleteRow(block, id) {
    state[block] = state[block].filter((r) => r.id !== id);
    renderAll();
    scheduleSave();
  }

  function addRow(block) {
    if (block === "schedule") {
      state.schedule.push({
        id: uid(),
        title: "",
        type: "기획",
        date: "",
        assignee: "",
        project: "",
        status: "예정",
        note: "",
      });
    } else if (block === "sponsorships") {
      state.sponsorships.push({
        id: uid(),
        brand: "",
        kind: "협찬",
        status: "예정",
        contact: "",
        deadline: "",
        project: "",
        note: "",
      });
    } else if (block === "notices") {
      state.notices.push({
        id: uid(),
        title: "",
        date: todayStr(),
        pinned: false,
        body: "",
      });
    }
    renderAll();
    scheduleSave();
  }

  function bindTables() {
    document.body.addEventListener("input", (e) => {
      const target = e.target;
      const container = target.closest("[data-block]");
      if (!container) return;
      const block = container.dataset.block;
      const id = container.dataset.id;
      const field = target.dataset.field;
      if (!field) return;
      updateRow(block, id, field, target.type === "checkbox" ? target.checked : target.value);
    });

    document.body.addEventListener("change", (e) => {
      const target = e.target;
      const container = target.closest("[data-block]");
      if (!container) return;
      const block = container.dataset.block;
      const id = container.dataset.id;
      const field = target.dataset.field;
      if (!field) return;
      updateRow(block, id, field, target.type === "checkbox" ? target.checked : target.value);
    });

    document.body.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-action]");
      if (!btn) return;
      const action = btn.dataset.action;
      const container = btn.closest("[data-block]");
      if (action === "delete" && container) {
        deleteRow(container.dataset.block, container.dataset.id);
      }
      if (action === "add") {
        addRow(btn.dataset.block);
      }
    });
  }

  function exportData() {
    const blob = new Blob([JSON.stringify({ exportedAt: Date.now(), data: state }, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `dddit-workspace-${todayStr()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setStatus("saved", "데이터보내기 완료");
  }

  function importData(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (!parsed?.data) throw new Error("invalid");
        state = mergeState(DEFAULT_STATE, parsed.data);
        els.overviewText.textContent = state.overview;
        renderAll();
        persist();
        setStatus("saved", "데이터 가져오기 완료");
      } catch {
        alert("올바른 JSON 파일이 아닙니다.");
      }
    };
    reader.readAsText(file);
  }

  function setYtStat(el, value) {
    if (!el) return;
    el.textContent = value ?? "—";
    el.classList.remove("loading");
  }

  function renderYoutubeVideos(videos) {
    if (!els.ytVideos) return;
    const list = (videos || []).slice(0, 4);
    while (list.length < 4) list.push(null);

    els.ytVideos.innerHTML = list
      .map((video) => {
        if (!video?.id) {
          return `<div class="yt-video"><div class="yt-video-placeholder">영상 없음</div></div>`;
        }
        const title = escapeHtml(video.title || "YouTube");
        return `
          <div class="yt-video" title="${title}">
            <iframe
              src="https://www.youtube-nocookie.com/embed/${escapeHtml(video.id)}"
              title="${title}"
              loading="lazy"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowfullscreen
            ></iframe>
          </div>
        `;
      })
      .join("");
  }

  function showYtError(message) {
    if (!els.ytError) return;
    if (!message) {
      els.ytError.hidden = true;
      els.ytError.textContent = "";
      return;
    }
    els.ytError.hidden = false;
    els.ytError.textContent = message;
  }

  async function loadYoutube() {
    if (!els.ytSubs) return;

    try {
      const res = await fetch(`${API_BASE}/api/dddit/youtube/channel`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      if (els.ytChannelTitle && data.title) els.ytChannelTitle.textContent = data.title;
      if (els.ytChannelLink && data.channelUrl) {
        els.ytChannelLink.href = data.channelUrl;
        els.ytChannelLink.textContent = `@${data.handle || "DD-DIT"} 열기 →`;
      }

      setYtStat(els.ytSubs, data.subscriberCountText);
      setYtStat(els.ytViews, data.viewCountText);
      setYtStat(els.ytVideosCount, data.videoCountText);
      renderYoutubeVideos(data.videos);

      if (data.source === "scrape" && data.subscriberCountText === "—") {
        showYtError("구독자·총 조회수는 NAS .env에 YOUTUBE_API_KEY를 넣으면 표시됩니다. 최근 영상은 채널 페이지에서 불러왔습니다.");
      } else {
        showYtError("");
      }
    } catch {
      setYtStat(els.ytSubs, "—");
      setYtStat(els.ytViews, "—");
      setYtStat(els.ytVideosCount, "—");
      renderYoutubeVideos([]);
      showYtError("YouTube 정보를 불러오지 못했습니다. NAS API(works-api)가 실행 중인지 확인하세요.");
    }
  }

  function initTabs() {
    document.querySelectorAll(".tab-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const tab = btn.dataset.tab;
        document.querySelectorAll(".tab-btn").forEach((b) => {
          b.classList.toggle("active", b.dataset.tab === tab);
        });
        document.querySelectorAll(".tab-pane").forEach((pane) => {
          pane.classList.toggle("active", pane.dataset.tab === tab);
        });
      });
    });
  }

  function init() {
    load();
    bindOverview();
    bindTables();
    initTabs();
    renderAll();
    persist();
    loadYoutube();

    els.btnExport.addEventListener("click", exportData);
    els.btnImport.addEventListener("click", () => els.importFile.click());
    els.importFile.addEventListener("change", () => {
      const file = els.importFile.files?.[0];
      if (file) importData(file);
      els.importFile.value = "";
    });
  }

  init();
})();
