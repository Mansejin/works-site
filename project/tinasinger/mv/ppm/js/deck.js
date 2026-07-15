(function () {
  "use strict";

  const STORAGE_KEY = "works/project/tinasinger/mv/ppm/slides/v1";
  const COMMENTS_OPEN_KEY = "works/project/tinasinger/mv/ppm/comments/open/v1";
  const EDIT_AUTH_KEY = "works/project/tinasinger/mv/ppm/edit/v1";
  /** Edit password SHA-256 hash — update when changing password */
  const EDIT_PASS_SHA256 = "c74cead93d83c7317ad62515eec8333429048cc8e1ed5971eae50ae66f8d7fcb";

  const frame = document.getElementById("slideFrame");
  const counterEl = document.getElementById("slideCounter");
  const progressEl = document.getElementById("progressFill");
  const overviewPanel = document.getElementById("overviewPanel");
  const overviewGrid = document.getElementById("overviewGrid");
  const saveStatusEl = document.getElementById("saveStatus");
  const deckHintsEl = document.getElementById("deckHints");
  const editModal = document.getElementById("editModal");
  const editForm = document.getElementById("editForm");
  const editPasswordEl = document.getElementById("editPassword");
  const editErrorEl = document.getElementById("editError");
  const btnEdit = document.getElementById("btnEdit");
  const btnExport = document.getElementById("btnExport");

  let slides = loadSlides();
  let current = 0;
  let saveTimer = null;
  let editMode = sessionStorage.getItem(EDIT_AUTH_KEY) === "1";

  function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function loadSlides() {
    const defaults = deepClone(window.PPM_SLIDES || []);
    const fileVersion = window.PPM_SLIDES_UPDATED || "";
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaults;
      const parsed = JSON.parse(raw);
      if (parsed.sourceVersion !== fileVersion) return defaults;
      if (Array.isArray(parsed.slides) && parsed.slides.length > 0) {
        return parsed.slides;
      }
    } catch {
      /* keep defaults */
    }
    return defaults;
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    if (saveStatusEl) saveStatusEl.textContent = "저장 중…";
    saveTimer = setTimeout(persist, 400);
  }

  function persist() {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          updatedAt: Date.now(),
          sourceVersion: window.PPM_SLIDES_UPDATED || "",
          slides
        })
      );
      if (saveStatusEl) saveStatusEl.textContent = "저장됨";
    } catch {
      if (saveStatusEl) saveStatusEl.textContent = "저장 실패";
    }
  }

  function formatSlidesJs(data) {
    const stamp = window.PPM_SLIDES_UPDATED || new Date().toISOString().slice(0, 10);
    return `/**
 * 이겸비 (Tina Singer) — Right Here, Right Now MV PPM
 * 배포 기본값 — 편집 후 「slides.js 저장」 버튼 또는 scripts/export-slides.mjs
 */
window.PPM_SLIDES_UPDATED = "${stamp}";
window.PPM_SLIDES = ${JSON.stringify(data, null, 2)};
`;
  }

  function downloadSlidesJs() {
    const blob = new Blob([formatSlidesJs(slides)], { type: "text/javascript;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "slides.js";
    a.click();
    URL.revokeObjectURL(url);
    if (saveStatusEl) saveStatusEl.textContent = "slides.js 저장";
  }

  function setByPath(path, value) {
    const parts = path.split(".");
    let cur = slides;
    for (let i = 0; i < parts.length - 1; i++) {
      const key = /^\d+$/.test(parts[i]) ? Number(parts[i]) : parts[i];
      cur = cur[key];
    }
    const last = parts[parts.length - 1];
    cur[/^\d+$/.test(last) ? Number(last) : last] = value;
  }

  function escapeHtml(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
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

  function isEditable() {
    return editMode;
  }

  function ed(path, text, className) {
    const ce = isEditable() ? "true" : "false";
    return `<span class="ppm-editable${className ? ` ${className}` : ""}" contenteditable="${ce}" data-path="${path}" spellcheck="false">${escapeHtml(text)}</span>`;
  }

  function edBlock(path, text, className) {
    const ce = isEditable() ? "true" : "false";
    return `<div class="ppm-editable ppm-editable--block${className ? ` ${className}` : ""}" contenteditable="${ce}" data-path="${path}" spellcheck="false">${escapeHtml(text)}</div>`;
  }

  function renderCommentPanel(index) {
    const text = slides[index]?.comment || "";
    const hasComment = String(text).trim().length > 0;
    const isOpen = isCommentOpen(index);
    return `
      <div class="slide-comments${isOpen ? " is-open" : ""}" data-slide="${index}">
        <button type="button" class="slide-comments-toggle" aria-expanded="${isOpen}" aria-controls="slide-comments-panel-${index}">
          <span class="slide-comments-toggle-text">댓글</span>
          ${hasComment ? '<span class="slide-comments-dot" aria-label="댓글 있음"></span>' : ""}
          <span class="slide-comments-chevron" aria-hidden="true"></span>
        </button>
        <div class="slide-comments-panel" id="slide-comments-panel-${index}"${isOpen ? "" : " hidden"}>
          <div class="ppm-comment-input" contenteditable="true" data-path="${index}.comment" data-placeholder="의견·피드백을 남겨주세요…" spellcheck="true">${escapeHtml(text)}</div>
        </div>
      </div>`;
  }

  function loadCommentOpenState() {
    try {
      return JSON.parse(localStorage.getItem(COMMENTS_OPEN_KEY) || "{}");
    } catch {
      return {};
    }
  }

  function isCommentOpen(index) {
    return !!loadCommentOpenState()[String(index)];
  }

  function setCommentOpen(index, open) {
    const state = loadCommentOpenState();
    const key = String(index);
    if (open) state[key] = true;
    else delete state[key];
    localStorage.setItem(COMMENTS_OPEN_KEY, JSON.stringify(state));
  }

  function syncCommentDot(wrap, hasText) {
    const toggle = wrap.querySelector(".slide-comments-toggle");
    if (!toggle) return;
    let dot = toggle.querySelector(".slide-comments-dot");
    if (hasText && !dot) {
      toggle.querySelector(".slide-comments-toggle-text")?.insertAdjacentHTML(
        "afterend",
        '<span class="slide-comments-dot" aria-label="댓글 있음"></span>'
      );
    } else if (!hasText && dot) {
      dot.remove();
    }
  }

  function wrapSlide(index, classNames, inner) {
    return `<section class="slide${classNames ? ` ${classNames}` : ""}" data-index="${index}">
      <div class="slide-inner">${inner}</div>
      ${renderCommentPanel(index)}
    </section>`;
  }

  function updateEditUI() {
    document.body.classList.toggle("is-edit-mode", editMode);
    if (btnEdit) {
      btnEdit.textContent = editMode ? "편집 종료" : "편집";
      btnEdit.classList.toggle("is-active", editMode);
    }
    if (btnExport) btnExport.hidden = !editMode;
    if (saveStatusEl) saveStatusEl.hidden = !editMode;
    if (deckHintsEl) {
      deckHintsEl.textContent = editMode
        ? "편집 모드 · Ctrl+Z · ← → Space · O 개요"
        : "← → Space · O 개요 · 슬라이드 하단 댓글";
    }
  }

  function setEditMode(on) {
    editMode = on;
    if (on) sessionStorage.setItem(EDIT_AUTH_KEY, "1");
    else sessionStorage.removeItem(EDIT_AUTH_KEY);
    updateEditUI();
    buildSlides();
    goTo(current);
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

  function renderBullets(items, pathPrefix, listKey) {
    const key = listKey || "bullets";
    if (!items || !items.length) return "";
    return `<ul class="bullet-list">${items
      .map((b, i) => `<li>${ed(`${pathPrefix}.${key}.${i}`, b)}</li>`)
      .join("")}</ul>`;
  }

  function renderSection(section, pathPrefix) {
    let html = `<div class="section"><div class="section-heading">${ed(`${pathPrefix}.heading`, section.heading || "")}</div>`;
    if (section.body !== undefined) {
      html += edBlock(`${pathPrefix}.body`, section.body || "", "section-body");
    }
    if (section.bullets) {
      html += renderBullets(section.bullets, pathPrefix);
    }
    if (section.tags) {
      html += `<div class="tag-row">${section.tags
        .map((t, i) => `<span class="tag">${ed(`${pathPrefix}.tags.${i}`, t)}</span>`)
        .join("")}</div>`;
    }
    html += "</div>";
    return html;
  }

  function renderColBlock(block, pathPrefix) {
    return `
      <div class="col-block">
        <div class="section-heading">${ed(`${pathPrefix}.heading`, block.heading || "")}</div>
        ${renderBullets(block.bullets, pathPrefix)}
      </div>`;
  }

  function parseTocItem(str) {
    const m = String(str).match(/^(\d+)\s*[·.\s]+\s*(.+)$/);
    return m ? { num: m[1], title: m[2].trim() } : { num: "", title: String(str) };
  }

  function normalizeTocGroups(slide) {
    if (slide.groups?.length) return slide.groups;
    const labels = ["기획", "비주얼 · 연출", "제작 · 실행"];
    const descs = ["Why & What", "Look & Feel", "How & When"];
    const items = slide.items || [];
    const groups = [];
    for (let i = 0; i < items.length; i += 4) {
      groups.push({
        label: labels[groups.length] || "기타",
        desc: descs[groups.length] || "",
        items: items.slice(i, i + 4).map(parseTocItem)
      });
    }
    return groups;
  }

  function renderToc(slide, path) {
    const groups = normalizeTocGroups(slide);
    return `
      <div class="toc-head">
        <h2 class="slide-title toc-head-title">${ed(`${path}.title`, slide.title)}</h2>
        <p class="toc-head-sub">${ed(`${path}.subtitle`, slide.subtitle || "")}</p>
      </div>
      <div class="toc-layout">${groups
        .map((group, gi) => {
          const groupPath = slide.groups ? `${path}.groups.${gi}` : `${path}.groups.${gi}`;
          const labelPath = slide.groups ? `${path}.groups.${gi}.label` : `${path}.groups.${gi}.label`;
          const descPath = slide.groups ? `${path}.groups.${gi}.desc` : `${path}.groups.${gi}.desc`;
          return `
        <div class="toc-group" data-phase="${gi + 1}">
          <div class="toc-group-head">
            <span class="toc-group-label">${ed(labelPath, group.label || "")}</span>
            <span class="toc-group-desc">${ed(descPath, group.desc || "")}</span>
          </div>
          <div class="toc-entries">${(group.items || [])
            .map((item, ii) => {
              const itemPath = slide.groups
                ? `${path}.groups.${gi}.items.${ii}`
                : `${path}.groups.${gi}.items.${ii}`;
              return `
            <div class="toc-entry">
              <span class="toc-entry-num">${ed(`${itemPath}.num`, item.num || "")}</span>
              <span class="toc-entry-title">${ed(`${itemPath}.title`, item.title || "")}</span>
            </div>`;
            })
            .join("")}</div>
        </div>`;
        })
        .join("")}</div>`;
  }

  function slideLabel(slide, index) {
    if (slide.title) return slide.title.replace(/^\d+\s*·\s*/, "");
    if (slide.type === "cover") return "Cover";
    if (slide.type === "closing") return "Closing";
    return `Slide ${index + 1}`;
  }

  function renderSlide(slide, index) {
    const p = String(index);
    let inner = "";
    let classNames = "";

    switch (slide.type) {
      case "cover":
        classNames = "slide--cover";
        inner = `
          <div class="cover-title">${ed(`${p}.title`, slide.title)}</div>
          <div class="cover-subtitle">${ed(`${p}.subtitle`, slide.subtitle || "")}</div>
          <div class="cover-lines">${(slide.lines || [])
            .map((l, i) => `<span>${ed(`${p}.lines.${i}`, l)}</span>`)
            .join("")}</div>`;
        break;

      case "toc":
        classNames = "slide--toc";
        inner = renderToc(slide, p);
        break;

      case "content":
        inner = `
          <h2 class="slide-title">${ed(`${p}.title`, slide.title)}</h2>
          <div class="content-body">${(slide.sections || [])
            .map((section, i) => renderSection(section, `${p}.sections.${i}`))
            .join("")}</div>`;
        break;

      case "two-col":
        inner = `
          <h2 class="slide-title">${ed(`${p}.title`, slide.title)}</h2>
          <div class="two-col">${renderColBlock(slide.left || {}, `${p}.left`)}${renderColBlock(slide.right || {}, `${p}.right`)}</div>`;
        break;

      case "lyrics":
        inner = `
          <h2 class="slide-title">${ed(`${p}.title`, slide.title)}</h2>
          <div class="lyrics-layout">
            <div class="col-block">
              <div class="section-heading">${ed(`${p}.analysis.heading`, slide.analysis?.heading || "곡 분석")}</div>
              ${renderBullets(slide.analysis?.bullets, `${p}.analysis`)}
              <div class="section-heading" style="margin-top:16px">${ed(`${p}.keyMessage.heading`, slide.keyMessage?.heading || "키 메시지")}</div>
              ${renderBullets(slide.keyMessage?.bullets, `${p}.keyMessage`)}
            </div>
            <div class="lyrics-scroll">${(slide.lyrics || [])
              .map(
                (block, i) => `
              <div class="lyrics-block">
                <div class="lyrics-block-label">${ed(`${p}.lyrics.${i}.label`, block.label)}</div>
                ${edBlock(`${p}.lyrics.${i}.lines`, block.lines, "lyrics-block-text")}
              </div>`
              )
              .join("")}</div>
          </div>`;
        break;

      case "story":
        inner = `
          <h2 class="slide-title">${ed(`${p}.title`, slide.title)}</h2>
          <div class="story-list">${(slide.acts || [])
            .map(
              (act, i) => `
            <div class="story-act">
              <div class="act-label">${ed(`${p}.acts.${i}.label`, act.label)}</div>
              <div class="act-time">${ed(`${p}.acts.${i}.time`, act.time)}</div>
              <div class="act-text">${ed(`${p}.acts.${i}.text`, act.text, "act-text-inner")}</div>
            </div>`
            )
            .join("")}</div>`;
        break;

      case "palette":
        inner = `
          <h2 class="slide-title">${ed(`${p}.title`, slide.title)}</h2>
          <div class="palette-row">${(slide.colors || [])
            .map(
              (c, i) => `
            <div class="swatch">
              <div class="swatch-color" style="background:${escapeHtml(c.hex)}"></div>
              <div class="swatch-name">${ed(`${p}.colors.${i}.name`, c.name)}</div>
              <div class="swatch-role">${ed(`${p}.colors.${i}.role`, c.role)}</div>
            </div>`
            )
            .join("")}</div>
          ${renderBullets(slide.notes, p, "notes")}`;
        break;

      case "refs":
        inner = `
          <h2 class="slide-title">${ed(`${p}.title`, slide.title)}</h2>
          <div class="ref-list">${(slide.refs || [])
            .map(
              (r, i) => `
            <div class="ref-item"><strong>${ed(`${p}.refs.${i}.label`, r.label)}</strong><span>${ed(`${p}.refs.${i}.desc`, r.desc, "ref-desc")}</span></div>`
            )
            .join("")}</div>
          ${slide.note !== undefined ? edBlock(`${p}.note`, slide.note || "", "ref-note") : ""}`;
        break;

      case "moodboard":
        classNames = "slide--moodboard";
        inner = `
          <div class="mood-head">
            <h2 class="slide-title mood-head-title">${ed(`${p}.title`, slide.title)}</h2>
            <p class="mood-head-sub">${ed(`${p}.subtitle`, slide.subtitle || "")}</p>
          </div>
          <div class="mood-scroll">${(slide.sections || [])
            .map(
              (section, si) => `
            <div class="mood-section">
              <div class="mood-section-label">${ed(`${p}.sections.${si}.label`, section.label || "")}</div>
              <div class="mood-grid" data-count="${(section.items || []).length}">${(section.items || [])
                .map(
                  (item, ii) => `
                <figure class="mood-item">
                  <img src="${escapeHtml(item.src)}" alt="" loading="lazy" />
                  <figcaption>${ed(`${p}.sections.${si}.items.${ii}.caption`, item.caption || "")}</figcaption>
                </figure>`
                )
                .join("")}</div>
            </div>`
            )
            .join("")}</div>`;
        break;

      case "scenes":
        inner = `
          <h2 class="slide-title">${ed(`${p}.title`, slide.title)}</h2>
          <table class="scene-table">
            <thead><tr><th>No.</th><th>씬</th><th>샷</th><th>비고</th></tr></thead>
            <tbody>${(slide.scenes || [])
              .map(
                (s, i) => `
              <tr>
                <td>${ed(`${p}.scenes.${i}.no`, s.no)}</td>
                <td>${ed(`${p}.scenes.${i}.name`, s.name)}</td>
                <td>${ed(`${p}.scenes.${i}.shot`, s.shot)}</td>
                <td>${ed(`${p}.scenes.${i}.note`, s.note)}</td>
              </tr>`
              )
              .join("")}</tbody>
          </table>`;
        break;

      case "timeline":
        inner = `
          <h2 class="slide-title">${ed(`${p}.title`, slide.title)}</h2>
          <div class="timeline-list">${(slide.milestones || [])
            .map(
              (m, i) => `
            <div class="timeline-item">
              <div class="phase">${ed(`${p}.milestones.${i}.phase`, m.phase)}</div>
              <div class="date">${ed(`${p}.milestones.${i}.date`, m.date)}</div>
              <div class="task">${ed(`${p}.milestones.${i}.task`, m.task, "task-inner")}</div>
            </div>`
            )
            .join("")}</div>
          <div class="checklist">${(slide.checklist || [])
            .map((c, i) => `<div>${ed(`${p}.checklist.${i}`, c)}</div>`)
            .join("")}</div>`;
        break;

      case "closing":
        classNames = "slide--closing";
        inner = `
          <div class="closing-title">${ed(`${p}.title`, slide.title)}</div>
          <div class="closing-lines">${(slide.lines || [])
            .map((l, i) => `<span>${ed(`${p}.lines.${i}`, l)}</span>`)
            .join("")}</div>`;
        break;

      default:
        inner = `<h2 class="slide-title">${ed(`${p}.title`, slide.title || "Slide")}</h2>`;
    }

    return wrapSlide(index, classNames, inner);
  }

  function updateOverviewTitle(slideIndex) {
    const thumb = overviewGrid.querySelector(`[data-goto="${slideIndex}"] .overview-thumb-title`);
    if (thumb) thumb.textContent = slideLabel(slides[slideIndex], slideIndex);
  }

  function bindEditables() {
    frame.querySelectorAll(".ppm-editable").forEach((el) => {
      el.addEventListener("input", () => {
        if (!isEditable()) return;
        const path = el.dataset.path;
        const value = el.classList.contains("ppm-editable--block")
          ? el.innerText.replace(/\r\n/g, "\n")
          : el.textContent.trim();
        setByPath(path, value);
        scheduleSave();
        if (path.endsWith(".title")) {
          updateOverviewTitle(Number(path.split(".")[0]));
        }
      });

      if (isEditable()) {
        el.addEventListener("click", (e) => e.stopPropagation());
        el.addEventListener("mousedown", (e) => e.stopPropagation());
        el.addEventListener("dblclick", (e) => e.stopPropagation());
      }
    });
  }

  function bindComments() {
    frame.querySelectorAll(".slide-comments-toggle").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const wrap = btn.closest(".slide-comments");
        if (!wrap) return;
        const index = Number(wrap.dataset.slide);
        const open = !wrap.classList.contains("is-open");
        setCommentOpen(index, open);
        wrap.classList.toggle("is-open", open);
        btn.setAttribute("aria-expanded", String(open));
        const panel = wrap.querySelector(".slide-comments-panel");
        if (panel) panel.hidden = !open;
        if (open) wrap.querySelector(".ppm-comment-input")?.focus();
      });
    });

    frame.querySelectorAll(".ppm-comment-input").forEach((el) => {
      el.addEventListener("input", () => {
        const path = el.dataset.path;
        const value = el.innerText.replace(/\r\n/g, "\n");
        setByPath(path, value);
        scheduleSave();
        syncCommentDot(el.closest(".slide-comments"), !!String(value).trim());
      });

      el.addEventListener("click", (e) => e.stopPropagation());
      el.addEventListener("mousedown", (e) => e.stopPropagation());
      el.addEventListener("dblclick", (e) => e.stopPropagation());
    });
  }

  function buildSlides() {
    frame.innerHTML = slides.map(renderSlide).join("");
    overviewGrid.innerHTML = slides
      .map(
        (slide, i) => `
      <button type="button" class="overview-thumb" data-goto="${i}">
        <span class="overview-thumb-num">${String(i + 1).padStart(2, "0")}</span>
        <span class="overview-thumb-title">${escapeHtml(slideLabel(slide, i))}</span>
      </button>`
      )
      .join("");
    bindEditables();
    bindComments();
  }

  function isEditingText() {
    const active = document.activeElement;
    if (!active) return false;
    if (active.classList.contains("ppm-comment-input")) return true;
    return active.classList.contains("ppm-editable") && isEditable();
  }

  function goTo(index) {
    if (index < 0 || index >= slides.length) return;
    current = index;
    frame.querySelectorAll(".slide").forEach((el, i) => {
      el.classList.toggle("active", i === current);
    });
    overviewGrid.querySelectorAll(".overview-thumb").forEach((el, i) => {
      el.classList.toggle("current", i === current);
    });
    counterEl.innerHTML = `<strong>${current + 1}</strong> / ${slides.length}`;
    progressEl.style.width = `${((current + 1) / slides.length) * 100}%`;
    history.replaceState(null, "", `#${current + 1}`);
  }

  function next() {
    goTo(current + 1);
  }

  function prev() {
    goTo(current - 1);
  }

  function toggleOverview(open) {
    const show = open !== undefined ? open : !overviewPanel.classList.contains("open");
    overviewPanel.classList.toggle("open", show);
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
  }

  function syncFullscreenClass() {
    document.documentElement.classList.toggle("is-fullscreen", !!document.fullscreenElement);
    requestAnimationFrame(updateSlideScale);
  }

  function updateSlideScale() {
    if (!frame) return;
    const w = frame.clientWidth;
    const h = frame.clientHeight;
    if (!w || !h) return;
    const scale = Math.min(w / 1280, h / 720);
    frame.style.setProperty("--slide-scale", String(scale));
  }

  const scaleObserver = new ResizeObserver(() => updateSlideScale());
  scaleObserver.observe(frame);
  window.addEventListener("resize", updateSlideScale);
  document.addEventListener("fullscreenchange", syncFullscreenClass);
  document.addEventListener("webkitfullscreenchange", syncFullscreenClass);

  function initFromHash() {
    const match = location.hash.match(/^#(\d+)$/);
    if (match) {
      const n = parseInt(match[1], 10) - 1;
      if (n >= 0 && n < slides.length) current = n;
    }
  }

  function initAudioProtection() {
    const audioWrap = document.querySelector(".deck-audio");
    const audio = document.getElementById("demoMix");
    if (!audio) return;

    audio.src = "assets/right-here-right-now-mix.mp3";
    audio.setAttribute("controlsList", "nodownload noplaybackrate");
    audio.disableRemotePlayback = true;

    const block = (e) => e.preventDefault();
    audio.addEventListener("contextmenu", block);
    audio.addEventListener("dragstart", block);
    audioWrap?.addEventListener("contextmenu", block);
  }

  updateEditUI();
  initAudioProtection();
  buildSlides();
  initFromHash();
  goTo(current);
  persist();
  updateSlideScale();

  document.getElementById("navPrev").addEventListener("click", prev);
  document.getElementById("navNext").addEventListener("click", next);
  document.getElementById("btnOverview").addEventListener("click", () => toggleOverview(true));
  document.getElementById("btnFullscreen").addEventListener("click", toggleFullscreen);
  btnEdit?.addEventListener("click", toggleEditMode);
  btnExport?.addEventListener("click", downloadSlidesJs);

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

  overviewPanel.addEventListener("click", (e) => {
    if (e.target === overviewPanel) toggleOverview(false);
  });

  overviewGrid.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-goto]");
    if (!btn || e.target.closest(".ppm-editable")) return;
    goTo(parseInt(btn.dataset.goto, 10));
    toggleOverview(false);
  });

  document.addEventListener("keydown", (e) => {
    if (overviewPanel.classList.contains("open")) {
      if (e.key === "Escape") {
        toggleOverview(false);
        e.preventDefault();
      }
      return;
    }

    if (isEditingText()) {
      if (e.key === " " || e.key.startsWith("Arrow")) return;
    }

    switch (e.key) {
      case "ArrowRight":
      case "ArrowDown":
      case " ":
      case "PageDown":
        e.preventDefault();
        next();
        break;
      case "ArrowLeft":
      case "ArrowUp":
      case "PageUp":
        e.preventDefault();
        prev();
        break;
      case "Home":
        e.preventDefault();
        goTo(0);
        break;
      case "End":
        e.preventDefault();
        goTo(slides.length - 1);
        break;
      case "o":
      case "O":
        if (!isEditingText()) toggleOverview();
        break;
      case "f":
      case "F":
        if (!isEditingText()) toggleFullscreen();
        break;
      case "Escape":
        if (!editModal?.hidden) {
          closeEditModal();
          e.preventDefault();
          break;
        }
        if (document.fullscreenElement) document.exitFullscreen();
        break;
    }
  });
})();
