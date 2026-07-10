(function () {
  const IS_WEB_HOSTED =
    location.protocol === "https:" && /^works\.mansejin\.com$/i.test(location.hostname);
  const API_BASE = IS_WEB_HOSTED ? "https://works-api.mansejin.com" : "http://localhost:8788";

  const els = {
    root: document.getElementById("report-root"),
    loading: document.getElementById("loading"),
    status: document.getElementById("report-status"),
    error: document.getElementById("error-banner"),
    title: document.getElementById("report-title"),
    subtitle: document.getElementById("report-subtitle"),
    kpiGrid: document.getElementById("kpi-grid"),
    insights: document.getElementById("insights-list"),
    promoBody: document.getElementById("promo-table-body"),
    videoGrid: document.getElementById("video-grid"),
    channelLink: document.getElementById("channel-link"),
    subscriberNote: document.getElementById("subscriber-trend-note"),
    viewsTrendNote: document.getElementById("views-trend-note"),
    limitations: document.getElementById("limitations-list"),
    issuesEditor: document.getElementById("issues-editor"),
    promotionsEditor: document.getElementById("promotions-editor"),
    snapshotsEditor: document.getElementById("snapshots-editor"),
    saveStatus: document.getElementById("save-status"),
  };

  let charts = { recent: null, views7d: null, subs: null };

  function esc(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formatWon(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return "—";
    return `₩${n.toLocaleString("ko-KR")}`;
  }

  function formatNum(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return "—";
    return n.toLocaleString("ko-KR");
  }

  function setStatus(text, kind) {
    if (!els.status) return;
    els.status.textContent = text;
    els.status.className = "status-pill" + (kind ? ` ${kind}` : "");
  }

  function showError(message) {
    if (!els.error) return;
    els.error.classList.remove("hidden");
    els.error.querySelector(".card-body").textContent = message;
    setStatus("오류", "error");
  }

  async function apiGet(path) {
    const res = await fetch(`${API_BASE}${path}`);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.detail || `HTTP ${res.status}`);
    }
    return res.json();
  }

  async function apiPut(path, payload) {
    const res = await fetch(`${API_BASE}${path}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.detail || `HTTP ${res.status}`);
    }
    return res.json();
  }

  function destroyCharts() {
    Object.keys(charts).forEach((key) => {
      if (charts[key]) {
        charts[key].destroy();
        charts[key] = null;
      }
    });
  }

  function renderKpis(kpis) {
    const items = [
      { label: "구독자 수", value: kpis.subscribers },
      { label: "총 영상 수", value: kpis.videoCount },
      { label: "최고 조회수 (최근)", value: kpis.topViews },
      { label: "최근 평균 조회수", value: kpis.recentAvgViews },
    ];
    els.kpiGrid.innerHTML = items
      .map(
        (item) => `
      <div class="kpi">
        <div class="kpi-label">${esc(item.label)}</div>
        <div class="kpi-value">${esc(item.value)}</div>
      </div>`
      )
      .join("");
  }

  function renderRecentVideosChart(rows) {
    const ctx = document.getElementById("chart-recent-videos");
    if (!ctx) return;
    charts.recent = new Chart(ctx, {
      type: "bar",
      data: {
        labels: rows.map((r) => r.title),
        datasets: [
          {
            label: "조회수",
            data: rows.map((r) => r.views),
            backgroundColor: "rgba(220, 38, 38, 0.75)",
            borderRadius: 6,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, ticks: { callback: (v) => formatNum(v) } },
        },
      },
    });
  }

  function renderViews7dChart(values, note) {
    const ctx = document.getElementById("chart-views-7d");
    if (!ctx) return;
    const labels = ["D-6", "D-5", "D-4", "D-3", "D-2", "D-1", "오늘"];
    charts.views7d = new Chart(ctx, {
      type: "line",
      data: {
        labels: labels.slice(-values.length),
        datasets: [
          {
            label: "일 조회",
            data: values,
            borderColor: "#2563eb",
            backgroundColor: "rgba(37, 99, 235, 0.12)",
            fill: true,
            tension: 0.3,
            pointRadius: 4,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: false } },
      },
    });
    if (els.viewsTrendNote) els.viewsTrendNote.textContent = note || "";
  }

  function renderSubscriberChart(trend) {
    const ctx = document.getElementById("chart-subscribers");
    if (!ctx || !trend?.points?.length) return;
    const labels = trend.points.map((p) => p.label);
    charts.subs = new Chart(ctx, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "총 구독자",
            data: trend.points.map((p) => p.total),
            borderColor: "#dc2626",
            backgroundColor: "#dc2626",
            pointBackgroundColor: "#fff",
            pointBorderColor: "#dc2626",
            pointBorderWidth: 2,
            tension: 0.25,
          },
          {
            label: "자연 증가 (추정)",
            data: trend.points.map((p) => p.organic),
            borderColor: "#94a3b8",
            backgroundColor: "#94a3b8",
            pointBackgroundColor: "#fff",
            pointBorderColor: "#94a3b8",
            pointBorderWidth: 2,
            tension: 0.15,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "bottom" },
          tooltip: {
            callbacks: {
              afterBody(items) {
                const idx = items[0]?.dataIndex;
                const p = trend.points[idx];
                if (!p) return "";
                return `광고 기여 추정: ${formatNum(p.adDriven)}명`;
              },
            },
          },
        },
        scales: {
          y: { beginAtZero: false, ticks: { callback: (v) => formatNum(v) } },
        },
      },
    });
    if (els.subscriberNote) els.subscriberNote.textContent = trend.note || "";
  }

  function renderInsights(items) {
    els.insights.innerHTML = (items || [])
      .map((line) => `<li>${esc(line)}</li>`)
      .join("");
  }

  function renderPromotions(promotions) {
    if (!promotions?.length) {
      els.promoBody.innerHTML = `<tr><td colspan="8">등록된 프로모션이 없습니다. 아래 JSON 편집으로 추가하세요.</td></tr>`;
      return;
    }
    els.promoBody.innerHTML = promotions
      .map((p) => {
        const m = p.metrics || {};
        const effClass = m.cpv && m.cpv <= 30 ? "metric-good" : m.cps && m.cps <= 400 ? "metric-good" : "";
        return `
        <tr>
          <td>
            <strong>${esc(p.title)}</strong>
            <div><span class="badge${p.status === "완료" ? " done" : ""}">${esc(p.status || "—")}</span></div>
          </td>
          <td>${formatWon(p.cost)}</td>
          <td>${formatNum(p.impressions)}</td>
          <td>${formatNum(p.views)}</td>
          <td>${formatNum(p.subscribers)}</td>
          <td>${m.cpv != null ? `${formatNum(m.cpv)}원` : "—"}</td>
          <td>${m.cps != null ? `${formatNum(m.cps)}원` : "—"}</td>
          <td class="${effClass}">${esc(m.efficiencyText || "—")}</td>
        </tr>`;
      })
      .join("");
  }

  function renderVideos(videos) {
    if (!videos?.length) {
      els.videoGrid.innerHTML = `<p class="video-note">영상 데이터가 없습니다. YOUTUBE_API_KEY를 확인하세요.</p>`;
      return;
    }
    els.videoGrid.innerHTML = videos
      .map((v) => {
        const date = v.publishedAt ? new Date(v.publishedAt).toLocaleDateString("ko-KR") : "—";
        return `
        <article class="video-card">
          <img class="video-thumb" src="${esc(v.thumbnail)}" alt="" loading="lazy" />
          <div class="video-body">
            <div class="video-title">${esc(v.title)}</div>
            <div class="video-stats">
              <div><span>조회수</span><strong>${esc(v.viewsText || formatNum(v.views))}</strong></div>
              <div><span>길이</span><strong>${esc(v.durationText || "—")}</strong></div>
              <div><span>좋아요</span><strong>${formatNum(v.likes)}</strong></div>
              <div><span>게시</span><strong>${esc(date)}</strong></div>
            </div>
            <div class="video-links">
              <a href="${esc(v.url)}" target="_blank" rel="noopener">YouTube</a>
              ${v.studioUrl ? `<a href="${esc(v.studioUrl)}" target="_blank" rel="noopener">Studio 분석</a>` : ""}
            </div>
            <div class="video-note">${esc(v.retentionNote || "")}</div>
          </div>
        </article>`;
      })
      .join("");
  }

  async function loadEditors() {
    const [promo, snaps] = await Promise.all([
      apiGet("/api/dddit/youtube/report/promotions"),
      apiGet("/api/dddit/youtube/report/snapshots"),
    ]);
    els.issuesEditor.value = (promo.issues || []).join("\n");
    els.promotionsEditor.value = JSON.stringify(promo.promotions || [], null, 2);
    els.snapshotsEditor.value = JSON.stringify(
      { snapshots: snaps.snapshots || [], viewsTrend7d: snaps.viewsTrend7d || [] },
      null,
      2
    );
  }

  async function saveEditors() {
    const issues = els.issuesEditor.value
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    let promotions;
    let snapshotsPayload;
    try {
      promotions = JSON.parse(els.promotionsEditor.value || "[]");
      snapshotsPayload = JSON.parse(els.snapshotsEditor.value || "{}");
    } catch {
      throw new Error("JSON 형식이 올바르지 않습니다.");
    }
    if (!Array.isArray(promotions)) throw new Error("promotions는 배열이어야 합니다.");

    await apiPut("/api/dddit/youtube/report/promotions", { promotions, issues });
    await apiPut("/api/dddit/youtube/report/snapshots", {
      snapshots: snapshotsPayload.snapshots || [],
      viewsTrend7d: snapshotsPayload.viewsTrend7d || [],
    });
    els.saveStatus.textContent = "저장됨 · 새로고침 권장";
    els.saveStatus.className = "status-pill ok";
  }

  async function loadReport(refresh) {
    els.loading.classList.remove("hidden");
    els.root.classList.add("hidden");
    els.error?.classList.add("hidden");
    setStatus("불러오는 중…");
    destroyCharts();

    try {
      const overview = await apiGet(`/api/dddit/youtube/report/overview${refresh ? "?refresh=1" : ""}`);
      const videosData = await apiGet(`/api/dddit/youtube/report/videos${refresh ? "?refresh=1" : ""}`);

      const ch = overview.channel || {};
      els.title.textContent = `${ch.title || "디디딧"} · 채널 현황 분석`;
      els.subtitle.textContent = `생성: ${new Date(overview.generatedAt).toLocaleString("ko-KR")} · ${ch.source || "api"}`;
      if (els.channelLink && ch.channelUrl) {
        els.channelLink.href = ch.channelUrl;
      }

      renderKpis(overview.kpis || {});
      renderRecentVideosChart(overview.recentVideosBar || []);
      renderViews7dChart(overview.viewsTrend7d || [], overview.viewsTrendNote);
      renderSubscriberChart(overview.subscriberTrend);
      renderInsights(overview.insights || []);
      renderPromotions(overview.promotions || []);
      renderVideos(videosData.videos || []);

      els.limitations.innerHTML = (overview.limitations || [])
        .map((line) => `<li>${esc(line)}</li>`)
        .join("");

      await loadEditors();

      els.loading.classList.add("hidden");
      els.root.classList.remove("hidden");
      setStatus("업데이트됨", "ok");
    } catch (err) {
      els.loading.classList.add("hidden");
      showError(err.message || String(err));
    }
  }

  document.getElementById("btn-refresh")?.addEventListener("click", () => loadReport(true));
  document.getElementById("btn-copy-link")?.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(location.href.split("?")[0]);
      setStatus("링크 복사됨", "ok");
    } catch {
      setStatus("복사 실패", "error");
    }
  });
  document.getElementById("btn-save-config")?.addEventListener("click", async () => {
    try {
      await saveEditors();
      await loadReport(true);
    } catch (err) {
      els.saveStatus.textContent = err.message || "저장 실패";
      els.saveStatus.className = "status-pill error";
    }
  });

  loadReport(false);
})();
