(function () {
  "use strict";

  const STORAGE_KEY = "works/project/tinasinger/mv/ppm/slides/v1";
  const frame = document.getElementById("slideFrame");
  const counterEl = document.getElementById("slideCounter");
  const progressEl = document.getElementById("progressFill");
  const overviewPanel = document.getElementById("overviewPanel");
  const overviewGrid = document.getElementById("overviewGrid");
  const saveStatusEl = document.getElementById("saveStatus");

  let slides = loadSlides();
  let current = 0;
  let saveTimer = null;

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

  function resetSlides() {
    if (!confirm("편집 내용을 모두 지우고 기본 기획안으로 되돌릴까요?")) return;
    localStorage.removeItem(STORAGE_KEY);
    location.reload();
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

  function ed(path, text, className) {
    return `<span class="ppm-editable${className ? ` ${className}` : ""}" contenteditable="true" data-path="${path}" spellcheck="false">${escapeHtml(text)}</span>`;
  }

  function edBlock(path, text, className) {
    return `<div class="ppm-editable ppm-editable--block${className ? ` ${className}` : ""}" contenteditable="true" data-path="${path}" spellcheck="false">${escapeHtml(text)}</div>`;
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

    switch (slide.type) {
      case "cover":
        inner = `
          <div class="cover-title">${ed(`${p}.title`, slide.title)}</div>
          <div class="cover-subtitle">${ed(`${p}.subtitle`, slide.subtitle || "")}</div>
          <div class="cover-lines">${(slide.lines || [])
            .map((l, i) => `<span>${ed(`${p}.lines.${i}`, l)}</span>`)
            .join("")}</div>`;
        return `<section class="slide slide--cover" data-index="${index}">${inner}</section>`;

      case "toc":
        inner = renderToc(slide, p);
        return `<section class="slide slide--toc" data-index="${index}">${inner}</section>`;

      case "content":
        inner = `
          <h2 class="slide-title">${ed(`${p}.title`, slide.title)}</h2>
          <div class="content-body">${(slide.sections || [])
            .map((section, i) => renderSection(section, `${p}.sections.${i}`))
            .join("")}</div>`;
        return `<section class="slide" data-index="${index}">${inner}</section>`;

      case "two-col":
        inner = `
          <h2 class="slide-title">${ed(`${p}.title`, slide.title)}</h2>
          <div class="two-col">${renderColBlock(slide.left || {}, `${p}.left`)}${renderColBlock(slide.right || {}, `${p}.right`)}</div>`;
        return `<section class="slide" data-index="${index}">${inner}</section>`;

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
        return `<section class="slide" data-index="${index}">${inner}</section>`;

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
        return `<section class="slide" data-index="${index}">${inner}</section>`;

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
        return `<section class="slide" data-index="${index}">${inner}</section>`;

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
        return `<section class="slide" data-index="${index}">${inner}</section>`;

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
        return `<section class="slide" data-index="${index}">${inner}</section>`;

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
        return `<section class="slide" data-index="${index}">${inner}</section>`;

      case "closing":
        inner = `
          <div class="closing-title">${ed(`${p}.title`, slide.title)}</div>
          <div class="closing-lines">${(slide.lines || [])
            .map((l, i) => `<span>${ed(`${p}.lines.${i}`, l)}</span>`)
            .join("")}</div>`;
        return `<section class="slide slide--closing" data-index="${index}">${inner}</section>`;

      default:
        inner = `<h2 class="slide-title">${ed(`${p}.title`, slide.title || "Slide")}</h2>`;
        return `<section class="slide" data-index="${index}">${inner}</section>`;
    }
  }

  function updateOverviewTitle(slideIndex) {
    const thumb = overviewGrid.querySelector(`[data-goto="${slideIndex}"] .overview-thumb-title`);
    if (thumb) thumb.textContent = slideLabel(slides[slideIndex], slideIndex);
  }

  function bindEditables() {
    frame.querySelectorAll(".ppm-editable").forEach((el) => {
      el.addEventListener("input", () => {
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
  }

  function isEditingText() {
    const active = document.activeElement;
    return active && active.classList.contains("ppm-editable");
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

  buildSlides();
  initFromHash();
  goTo(current);
  persist();
  updateSlideScale();

  document.getElementById("navPrev").addEventListener("click", prev);
  document.getElementById("navNext").addEventListener("click", next);
  document.getElementById("btnOverview").addEventListener("click", () => toggleOverview(true));
  document.getElementById("btnFullscreen").addEventListener("click", toggleFullscreen);
  document.getElementById("btnReset").addEventListener("click", resetSlides);
  document.getElementById("btnExport").addEventListener("click", downloadSlidesJs);

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
        if (document.fullscreenElement) document.exitFullscreen();
        break;
    }
  });
})();
