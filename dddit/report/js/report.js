(function () {
  const IS_WEB_HOSTED =
    location.protocol === "https:" && /^works\.mansejin\.com$/i.test(location.hostname);
  const API_BASE = IS_WEB_HOSTED ? "https://works-api.mansejin.com" : "http://localhost:8788";
  const REFRESH_CACHE_KEY = "works/dddit/report/lastApiRefresh";
  const REFRESH_TTL_MS = 24 * 60 * 60 * 1000;
  const SUBSCRIBER_POLL_MS = 90_000;
  const PROMO_PAGE_SIZE = 5;
  const API_TIMEOUT_MS = 90_000;
  const CAPTURE_TIMEOUT_MS = 45_000;

  const els = {
    root: document.getElementById("report-root"),
    loading: document.getElementById("loading"),
    status: document.getElementById("report-status"),
    error: document.getElementById("error-banner"),
    title: document.getElementById("report-title"),
    subtitle: document.getElementById("report-subtitle"),
    kpiGrid: document.getElementById("kpi-grid"),
    insights: document.getElementById("insights-list"),
    memoDisplay: document.getElementById("memo-display"),
    memoEditor: document.getElementById("memo-editor"),
    promoBody: document.getElementById("promo-table-body"),
    videoGrid: document.getElementById("video-grid"),
    channelLink: document.getElementById("channel-link"),
    subscriberNote: document.getElementById("subscriber-trend-note"),
    viewsTrendNote: document.getElementById("views-trend-note"),
    limitations: document.getElementById("limitations-list"),
    analyticsBanner: document.getElementById("analytics-banner"),
    analyticsKpiGrid: document.getElementById("analytics-kpi-grid"),
    analyticsStatus: document.getElementById("analytics-status"),
    adsSyncStatus: document.getElementById("ads-sync-status"),
    studioSyncStatus: document.getElementById("studio-sync-status"),
    issuesEditor: document.getElementById("issues-editor"),
    promotionsEditor: document.getElementById("promotions-editor"),
    snapshotsEditor: document.getElementById("snapshots-editor"),
    promoPagination: document.getElementById("promo-pagination"),
    saveStatus: document.getElementById("save-status"),
  };

  let charts = {
    recent: null,
    views7d: null,
    subs: null,
    traffic: null,
    retention: null,
    age: null,
    gender: null,
  };
  let retentionData = null;
  let retentionVideos = [];
  let activeRetentionFormat = "longform";
  let subscriberPollTimer = null;

  const TRAFFIC_LABELS = {
    ADVERTISING: "광고",
    ANNOTATION: "주석",
    CAMPAIGN_CARD: "캠페인 카드",
    END_SCREEN: "종료 화면",
    EXT_URL: "외부",
    HASHTAGS: "해시태그",
    LIVE_REDIRECT: "라이브",
    NO_LINK_EMBEDDED: "임베드",
    NOTIFICATION: "알림",
    PLAYLIST: "재생목록",
    PRODUCT_PAGE: "상품",
    PROMOTED: "프로모션",
    RELATED_VIDEO: "관련 영상",
    SHORTS: "Shorts",
    SOUND_PAGE: "사운드",
    SUBSCRIBER: "구독자",
    YT_CHANNEL: "채널",
    YT_OTHER_PAGE: "기타 YouTube",
    YT_PLAYLIST_PAGE: "재생목록 페이지",
    YT_SEARCH: "검색",
    VIDEO_REMIXES: "리믹스",
    YT_REDIRECT: "리다이렉트",
  };

  const GENDER_LABELS = { female: "여성", male: "남성", user_specified: "기타" };
  const AGE_LABELS = {
    age13_17: "13–17",
    "age13-17": "13–17",
    age18_24: "18–24",
    "age18-24": "18–24",
    age25_34: "25–34",
    "age25-34": "25–34",
    age35_44: "35–44",
    "age35-44": "35–44",
    age45_54: "45–54",
    "age45-54": "45–54",
    age55_64: "55–64",
    "age55-64": "55–64",
    age65_: "65+",
    age65: "65+",
  };

  let loadSeq = 0;
  let allPromotions = [];
  let promoPage = 0;

  function readLastApiRefresh() {
    try {
      const ts = Number(localStorage.getItem(REFRESH_CACHE_KEY));
      return Number.isFinite(ts) && ts > 0 ? ts : null;
    } catch {
      return null;
    }
  }

  function shouldAutoRefresh() {
    const last = readLastApiRefresh();
    if (!last) return true;
    return Date.now() - last >= REFRESH_TTL_MS;
  }

  function markApiRefreshed() {
    try {
      localStorage.setItem(REFRESH_CACHE_KEY, String(Date.now()));
    } catch {
      /* ignore */
    }
  }

  function formatCacheAge(ms) {
    const hours = Math.floor(ms / (60 * 60 * 1000));
    if (hours >= 24) return `${Math.floor(hours / 24)}일 전`;
    if (hours >= 1) return `${hours}시간 전`;
    const minutes = Math.max(1, Math.floor(ms / (60 * 1000)));
    return `${minutes}분 전`;
  }

  function cacheStatusText() {
    const last = readLastApiRefresh();
    if (!last) return "캐시 없음 · 데이터 갱신으로 API 요청";
    const age = formatCacheAge(Date.now() - last);
    return `캐시 (${age} 갱신) · 데이터 갱신 시 API 재요청`;
  }

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
    els.error.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function hideError() {
    els.error?.classList.add("hidden");
  }

  async function fetchJson(url, options = {}) {
    const timeoutMs = options.timeoutMs ?? API_TIMEOUT_MS;
    const { timeoutMs: _t, ...fetchOpts } = options;
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...fetchOpts, signal: controller.signal });
      const body = await res.json().catch(() => ({}));
      return { res, body };
    } catch (err) {
      if (err.name === "AbortError") {
        throw new Error("요청 시간이 초과되었습니다. 잠시 후 다시 시도하세요.");
      }
      const msg = String(err.message || err);
      if (/failed to fetch|networkerror|load failed/i.test(msg)) {
        throw new Error(
          "works-api 서버에 연결하지 못했습니다. NAS 배포 직후 1~2분 정도 502가 날 수 있습니다. 잠시 후 새로고침하세요."
        );
      }
      throw err;
    } finally {
      window.clearTimeout(timer);
    }
  }

  async function apiPost(path, options = {}) {
    const { res, body } = await fetchJson(`${API_BASE}${path}`, { method: "POST", ...options });
    if (!res.ok) {
      throw new Error(body.detail || body.message || `HTTP ${res.status}`);
    }
    if (body && body.ok === false) {
      throw new Error(body.message || body.detail || "요청 실패");
    }
    return body;
  }

  async function apiGet(path, options = {}) {
    const { res, body } = await fetchJson(`${API_BASE}${path}`, options);
    if (!res.ok) {
      throw new Error(body.detail || body.message || `HTTP ${res.status}`);
    }
    return body;
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

  function destroyCanvasChart(canvasOrId) {
    const canvas =
      typeof canvasOrId === "string" ? document.getElementById(canvasOrId) : canvasOrId;
    if (!canvas || typeof Chart === "undefined" || typeof Chart.getChart !== "function") {
      return;
    }
    const existing = Chart.getChart(canvas);
    if (existing) existing.destroy();
  }

  function destroyCharts() {
    Object.keys(charts).forEach((key) => {
      if (charts[key]) {
        try {
          charts[key].destroy();
        } catch {
          /* ignore stale chart */
        }
        charts[key] = null;
      }
    });
    [
      "chart-traffic-sources",
      "chart-retention",
      "chart-age",
      "chart-gender",
      "chart-recent-videos",
      "chart-views-7d",
      "chart-subscribers",
    ].forEach(destroyCanvasChart);
  }

  function resizeCharts() {
    Object.values(charts).forEach((chart) => {
      try {
        chart?.resize?.();
      } catch {
        /* ignore */
      }
    });
  }

  async function loadAnalyticsExtras(refresh) {
    const q = refresh ? "?refresh=1" : "";
    const [traffic, retention, demographics] = await Promise.all([
      apiGet(`/api/dddit/youtube/report/traffic-sources${q}`).catch(() => null),
      apiGet(`/api/dddit/youtube/report/retention${q}`).catch(() => null),
      apiGet(`/api/dddit/youtube/report/demographics${q}`).catch(() => null),
    ]);
    return { traffic, retention, demographics };
  }

  function renderKpis(kpis, subscriberRaw) {
    const items = [
      { label: "구독자 수", value: kpis.subscribers, id: "kpi-subscribers", live: true },
      { label: "총 영상 수", value: kpis.videoCount },
      { label: "최고 조회수 (최근)", value: kpis.topViews },
      { label: "최근 평균 조회수", value: kpis.recentAvgViews },
    ];
    els.kpiGrid.innerHTML = items
      .map(
        (item) => `
      <div class="kpi"${item.id ? ` id="${esc(item.id)}"` : ""}>
        <div class="kpi-label">${esc(item.label)}</div>
        <div class="kpi-value">${esc(item.value)}</div>
        ${item.live ? '<div class="kpi-live-delta">실시간 갱신 중</div>' : ""}
      </div>`
      )
      .join("");
    if (Number.isFinite(subscriberRaw)) {
      startSubscriberLivePoll(subscriberRaw);
    }
  }

  function stopSubscriberLivePoll() {
    if (subscriberPollTimer) {
      clearInterval(subscriberPollTimer);
      subscriberPollTimer = null;
    }
  }

  function updateSubscriberKpi(countText, rawCount, deltaSinceLoad) {
    const card = document.getElementById("kpi-subscribers");
    if (!card) return;
    const valueEl = card.querySelector(".kpi-value");
    const deltaEl = card.querySelector(".kpi-live-delta");
    if (valueEl && countText && valueEl.textContent !== countText) {
      card.classList.add("pulse-update");
      window.setTimeout(() => card.classList.remove("pulse-update"), 700);
      valueEl.textContent = countText;
    }
    if (!deltaEl) return;
    if (deltaSinceLoad > 0) {
      deltaEl.textContent = `+${formatNum(deltaSinceLoad)} (페이지 로드 이후)`;
      deltaEl.className = "kpi-live-delta";
    } else if (deltaSinceLoad < 0) {
      deltaEl.textContent = `${formatNum(deltaSinceLoad)} (페이지 로드 이후)`;
      deltaEl.className = "kpi-live-delta down";
    } else {
      deltaEl.textContent = "실시간 갱신 중";
      deltaEl.className = "kpi-live-delta";
    }
  }

  function startSubscriberLivePoll(initialRaw) {
    stopSubscriberLivePoll();
    const baseline = initialRaw;
    async function tick() {
      if (document.hidden) return;
      try {
        const ch = await apiGet("/api/dddit/youtube/channel?refresh=1");
        const raw = Number(ch.subscriberCount);
        if (!Number.isFinite(raw)) return;
        updateSubscriberKpi(ch.subscriberCountText || formatNum(raw), raw, raw - baseline);
      } catch {
        /* ignore */
      }
    }
    subscriberPollTimer = window.setInterval(tick, SUBSCRIBER_POLL_MS);
  }

  function renderRecentVideosChart(rows) {
    const ctx = document.getElementById("chart-recent-videos");
    if (!ctx) return;
    destroyCanvasChart(ctx);
    charts.recent = null;
    if (!rows?.length) return;
    charts.recent = new Chart(ctx, {
      type: "bar",
      data: {
        labels: rows.map((row) => row.shortLabel || row.title),
        datasets: [
          {
            label: "자연 조회",
            data: rows.map((row) => row.organicViews ?? row.views ?? 0),
            backgroundColor: "rgba(148, 163, 184, 0.88)",
            borderRadius: { topLeft: 0, topRight: 0, bottomLeft: 6, bottomRight: 6 },
            stack: "views",
          },
          {
            label: "광고 조회",
            data: rows.map((row) => row.adViews ?? 0),
            backgroundColor: "rgba(220, 38, 38, 0.88)",
            borderRadius: { topLeft: 6, topRight: 6, bottomLeft: 0, bottomRight: 0 },
            stack: "views",
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "bottom", labels: { boxWidth: 10, font: { size: 10 } } },
          tooltip: {
            callbacks: {
              title(items) {
                const row = rows[items[0]?.dataIndex];
                return row?.title || items[0]?.label || "";
              },
              footer(items) {
                const row = rows[items[0]?.dataIndex];
                return row ? `합계 ${formatNum(row.views)}` : "";
              },
            },
          },
        },
        scales: {
          x: {
            stacked: true,
            ticks: { maxRotation: 35, minRotation: 0, font: { size: 10 } },
          },
          y: {
            stacked: true,
            beginAtZero: true,
            ticks: { callback: (value) => formatNum(value) },
          },
        },
      },
    });
  }

  function renderViews7dChart(values, note) {
    const ctx = document.getElementById("chart-views-7d");
    if (!ctx) return;
    destroyCanvasChart(ctx);
    charts.views7d = null;
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
    if (!ctx) return;
    destroyCanvasChart(ctx);
    charts.subs = null;
    if (!trend?.points?.length) return;
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
    if (els.subscriberNote && trend.note) {
      els.subscriberNote.textContent = `${trend.note} 구독자 수 KPI는 90초마다 YouTube API로 갱신됩니다 (완전 실시간 아님).`;
    } else if (els.subscriberNote) {
      els.subscriberNote.textContent =
        "구독자 수 KPI는 90초마다 YouTube API로 갱신됩니다 (완전 실시간 아님).";
    }
  }

  function renderInsights(items) {
    if (els.insights) {
      els.insights.innerHTML = (items || [])
        .map((line) => `<li>${esc(line)}</li>`)
        .join("");
    }
  }

  function renderMemo(text) {
    if (!els.memoDisplay) return;
    els.memoDisplay.textContent = String(text || "").trim();
  }

  function sourceBadge(source) {
    if (!source || source === "manual") return "";
    const cls = source === "google-ads" ? "ads" : source === "merged" ? "merged" : "";
    const label = source === "google-ads" ? "Ads" : source === "merged" ? "병합" : source;
    return `<span class="source-badge ${cls}">${esc(label)}</span>`;
  }

  function renderAnalyticsOverview(analytics) {
    const banner = els.analyticsBanner;
    const status = els.analyticsStatus;
    if (!analytics) {
      if (banner) {
        banner.classList.remove("hidden");
        banner.classList.add("warn");
        banner.textContent = "Analytics 데이터를 불러오지 못했습니다.";
      }
      return;
    }

    if (status) {
      status.textContent = analytics.configured
        ? analytics.ok
          ? "연동됨"
          : "오류"
        : "미설정";
      status.className = `status-pill ${analytics.ok ? "ok" : analytics.configured ? "error" : ""}`;
    }

    if (banner) {
      if (analytics.impressionsNote && analytics.ok) {
        banner.classList.remove("hidden");
        const waiting = analytics.impressions == null;
        banner.classList.toggle("warn", waiting);
        banner.textContent = analytics.impressionsNote;
      } else if (analytics.message && !analytics.ok) {
        banner.classList.remove("hidden");
        banner.classList.add("warn");
        banner.textContent = analytics.message;
      } else {
        banner.classList.add("hidden");
        banner.textContent = "";
      }
    }

    if (!els.analyticsKpiGrid) return;
    if (!analytics.ok) {
      els.analyticsKpiGrid.innerHTML = "";
      return;
    }

    const items = [
      { label: "조회수 (28일)", value: formatNum(analytics.views) },
      {
        label:
          analytics.impressionsSource === "reporting-api" ? "썸네일 노출 (28일)" : "노출수",
        value: analytics.impressions != null ? formatNum(analytics.impressions) : "—",
      },
      { label: "CTR", value: analytics.impressions != null && analytics.ctr != null ? `${analytics.ctr}%` : "—" },
      {
        label: "평균 시청률",
        value:
          analytics.averageViewPercentage != null
            ? `${Number(analytics.averageViewPercentage).toFixed(1)}%`
            : "—",
      },
    ];
    els.analyticsKpiGrid.innerHTML = items
      .map(
        (item) => `
      <div class="analytics-kpi">
        <div class="label">${esc(item.label)}</div>
        <div class="value">${esc(item.value)}</div>
      </div>`
      )
      .join("");
  }

  function renderTrafficChart(data) {
    const ctx = document.getElementById("chart-traffic-sources");
    if (!ctx) return;
    destroyCanvasChart(ctx);
    charts.traffic = null;
    const sources = (data?.sources || []).slice(0, 8);
    if (!sources.length) return;
    charts.traffic = new Chart(ctx, {
      type: "doughnut",
      data: {
        labels: sources.map((s) => TRAFFIC_LABELS[s.source] || s.source),
        datasets: [
          {
            data: sources.map((s) => s.views),
            backgroundColor: [
              "#2563eb",
              "#dc2626",
              "#16a34a",
              "#d97706",
              "#7c3aed",
              "#0891b2",
              "#be185d",
              "#64748b",
            ],
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: "right", labels: { boxWidth: 10, font: { size: 10 } } } },
      },
    });
  }

  function retentionVideoTitle(videos, videoId, fallbackTitle = "") {
    const fromSeries = String(fallbackTitle || "").trim();
    if (fromSeries) {
      return fromSeries.length > 26 ? `${fromSeries.slice(0, 26)}…` : fromSeries;
    }
    const match = (videos || []).find((video) => video.id === videoId);
    const title = match?.title || videoId || "영상";
    return title.length > 26 ? `${title.slice(0, 26)}…` : title;
  }

  function formatShortDate(value) {
    if (!value) return "";
    const parts = String(value).split("-");
    if (parts.length !== 3) return value;
    return `${parts[1]}/${parts[2]}`;
  }

  function retentionBlock(data, format) {
    if (data?.formats?.[format]) return data.formats[format];
    return data;
  }

  function formatHasRetentionData(block) {
    if (!block) return false;
    return Boolean(
      (block.series || []).some((item) => (item.points || []).length) ||
        (block.trend || []).length ||
        (block.points || []).length ||
        block.averageViewPercentage != null
    );
  }

  function bindRetentionTabs(data, videos) {
    retentionData = data;
    retentionVideos = videos || [];
    const tabs = document.getElementById("retention-tabs");
    if (!tabs) return;

    tabs.querySelectorAll(".retention-tab").forEach((btn) => {
      const format = btn.dataset.format || "longform";
      const block = retentionBlock(data, format);
      btn.disabled = !!data?.formats && !formatHasRetentionData(block);
      btn.classList.toggle("active", format === activeRetentionFormat);
      btn.onclick = () => {
        if (btn.disabled) return;
        activeRetentionFormat = format;
        tabs.querySelectorAll(".retention-tab").forEach((tabBtn) => {
          tabBtn.classList.toggle("active", tabBtn === btn);
        });
        renderRetentionChart(retentionData, retentionVideos, format);
      };
    });

    if (data?.formats) {
      const activeBlock = retentionBlock(data, activeRetentionFormat);
      if (!formatHasRetentionData(activeBlock)) {
        const fallback = formatHasRetentionData(retentionBlock(data, "longform"))
          ? "longform"
          : formatHasRetentionData(retentionBlock(data, "shorts"))
            ? "shorts"
            : activeRetentionFormat;
        activeRetentionFormat = fallback;
        tabs.querySelectorAll(".retention-tab").forEach((tabBtn) => {
          tabBtn.classList.toggle("active", tabBtn.dataset.format === fallback);
        });
      }
    }
  }

  function renderRetentionChart(data, videos, format = activeRetentionFormat) {
    const ctx = document.getElementById("chart-retention");
    const labelEl = document.getElementById("retention-chart-label");
    if (!ctx) return;

    if (!data?.ok) {
      if (charts.retention) {
        try {
          charts.retention.destroy();
        } catch {
          /* ignore */
        }
        charts.retention = null;
      }
      destroyCanvasChart(ctx);
      if (labelEl) labelEl.textContent = data?.message || "시청 유지 조회 실패";
      return;
    }

    const block = retentionBlock(data, format);
    const formatLabel = format === "shorts" ? "쇼츠" : "롱폼";
    const series = (block?.series || []).filter((item) => (item.points || []).length);
    let trend = block?.trend || [];
    if (!trend.length && format === "longform" && (data?.trend || []).length) {
      trend = data.trend;
    }
    const points = block?.points || data?.points || [];
    const colors = ["#dc2626", "#2563eb", "#16a34a"];
    // Shorts can exceed 100% (rewatches); longform stays 0–100%.
    const watchYMax = format === "shorts" ? 200 : 100;

    if (charts.retention) {
      try {
        charts.retention.destroy();
      } catch {
        /* ignore */
      }
      charts.retention = null;
    }
    destroyCanvasChart(ctx);

    if (series.length) {
      const labels = series[0].points.map((point) => `${Math.round(point.ratio * 100)}%`);
      if (labelEl) {
        labelEl.textContent =
          series.length === 1
            ? `시청 유지 (${formatLabel}) — ${retentionVideoTitle(videos, series[0].videoId, series[0].title)}`
            : `시청 유지 (${formatLabel}) — 조회 상위 ${series.length}개`;
      }
      charts.retention = new Chart(ctx, {
        type: "line",
        data: {
          labels,
          datasets: series.map((item, index) => ({
            label: retentionVideoTitle(videos, item.videoId, item.title),
            data: item.points.map((point) => (point.watchRatio || 0) * 100),
            borderColor: colors[index % colors.length],
            backgroundColor: `${colors[index % colors.length]}1a`,
            fill: false,
            tension: 0.3,
            pointRadius: 0,
            borderWidth: 2,
          })),
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              display: series.length > 1,
              position: "bottom",
              labels: { boxWidth: 10, font: { size: 10 } },
            },
            tooltip: {
              callbacks: {
                label(context) {
                  return `${context.dataset.label}: ${Number(context.parsed.y).toFixed(1)}%`;
                },
              },
            },
          },
          scales: {
            x: {
              title: { display: true, text: "영상 진행률", font: { size: 11 } },
              ticks: { maxTicksLimit: 8 },
            },
            y: {
              min: 0,
              max: watchYMax,
              title: { display: true, text: "시청 유지", font: { size: 11 } },
              ticks: { callback: (value) => `${value}%` },
            },
          },
        },
      });
      return;
    }

    if (trend.length) {
      if (labelEl) labelEl.textContent = `일별 평균 시청률 (${formatLabel}, 28일)`;
      charts.retention = new Chart(ctx, {
        type: "line",
        data: {
          labels: trend.map((point) => formatShortDate(point.date)),
          datasets: [
            {
              label: "평균 시청률",
              data: trend.map((point) => point.averageViewPercentage),
              borderColor: "#dc2626",
              backgroundColor: "rgba(220,38,38,0.12)",
              fill: true,
              tension: 0.3,
              pointRadius: 3,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            y: {
              min: 0,
              max: 100,
              ticks: { callback: (value) => `${value}%` },
            },
          },
        },
      });
      return;
    }

    if (points.length) {
      if (labelEl) {
        labelEl.textContent = data?.videoId
          ? `시청 유지 (${formatLabel}) — ${retentionVideoTitle(videos, data.videoId, data.title)}`
          : `시청 유지 (${formatLabel})`;
      }
      charts.retention = new Chart(ctx, {
        type: "line",
        data: {
          labels: points.map((point) => `${Math.round(point.ratio * 100)}%`),
          datasets: [
            {
              label: "시청 유지",
              data: points.map((point) => (point.watchRatio || 0) * 100),
              borderColor: "#dc2626",
              backgroundColor: "rgba(220,38,38,0.1)",
              fill: true,
              tension: 0.3,
              pointRadius: 0,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: {
              title: { display: true, text: "영상 진행률", font: { size: 11 } },
              ticks: { maxTicksLimit: 8 },
            },
            y: { min: 0, max: watchYMax, ticks: { callback: (value) => `${value}%` } },
          },
        },
      });
      return;
    }

    const avg = block?.averageViewPercentage ?? (format === "longform" ? data?.averageViewPercentage : null);
    if (avg == null) {
      if (labelEl) labelEl.textContent = `시청 유지 (${formatLabel}) — 데이터 없음`;
      return;
    }
    if (labelEl) labelEl.textContent = `평균 시청률 (${formatLabel}, 28일)`;
    charts.retention = new Chart(ctx, {
      type: "bar",
      data: {
        labels: ["평균 시청률"],
        datasets: [{ data: [avg], backgroundColor: "#dc2626", borderRadius: 6 }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { y: { min: 0, max: 100, ticks: { callback: (value) => `${value}%` } } },
      },
    });
  }

  function setDemographicsEmpty(canvasId, message) {
    const canvas = document.getElementById(canvasId);
    const wrap = canvas?.parentElement;
    if (!wrap) return;
    wrap.querySelectorAll(".demo-empty").forEach((el) => el.remove());
    const note = document.createElement("p");
    note.className = "video-note demo-empty";
    note.style.margin = "12px 0 0";
    note.textContent = message;
    wrap.appendChild(note);
  }

  function clearDemographicsEmpty(canvasId) {
    const canvas = document.getElementById(canvasId);
    canvas?.parentElement?.querySelectorAll(".demo-empty").forEach((el) => el.remove());
  }

  function formatAgeLabel(ageGroup) {
    const key = String(ageGroup || "");
    if (AGE_LABELS[key]) return AGE_LABELS[key];
    const m = key.match(/age(\d+)(?:[_-](\d+|))?/i);
    if (!m) return key || "—";
    if (!m[2]) return `${m[1]}+`;
    return `${m[1]}–${m[2]}`;
  }

  function renderDemographicsCharts(data) {
    const ageCtx = document.getElementById("chart-age");
    const genderCtx = document.getElementById("chart-gender");
    const ages = data?.ageGroups || [];
    const genders = data?.gender || [];

    destroyCanvasChart(ageCtx);
    destroyCanvasChart(genderCtx);
    charts.age = null;
    charts.gender = null;
    clearDemographicsEmpty("chart-age");
    clearDemographicsEmpty("chart-gender");

    if (!data?.ok && data?.message) {
      setDemographicsEmpty("chart-age", data.message);
      setDemographicsEmpty("chart-gender", data.message);
      return;
    }

    if (ageCtx && ages.length) {
      charts.age = new Chart(ageCtx, {
        type: "bar",
        data: {
          labels: ages.map((a) => formatAgeLabel(a.ageGroup)),
          datasets: [
            {
              label: "시청 비율 %",
              data: ages.map((a) => a.viewerPercentage),
              backgroundColor: "rgba(37,99,235,0.75)",
              borderRadius: 4,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: { y: { ticks: { callback: (v) => `${v}%` } } },
        },
      });
    } else {
      setDemographicsEmpty("chart-age", "연령대 데이터 없음");
    }

    if (genderCtx && genders.length) {
      charts.gender = new Chart(genderCtx, {
        type: "pie",
        data: {
          labels: genders.map((g) => GENDER_LABELS[g.gender] || g.gender),
          datasets: [
            {
              data: genders.map((g) => g.viewerPercentage),
              backgroundColor: ["#3b82f6", "#ec4899", "#94a3b8"],
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { position: "bottom" } },
        },
      });
    } else {
      setDemographicsEmpty("chart-gender", "성별 데이터 없음");
    }
  }

  function renderAdsSyncStatus(adsSync) {
    const btn = document.getElementById("btn-ads-sync");
    if (!els.adsSyncStatus || !adsSync) return;
    if (adsSync.enabled === false) {
      if (btn) btn.style.display = "none";
      els.adsSyncStatus.textContent = "Ads 끔";
      els.adsSyncStatus.className = "status-pill";
      els.adsSyncStatus.title =
        adsSync.message || "Google Ads 동기화 꺼짐 — Studio 동기화/수동 입력 사용";
      return;
    }
    if (btn) btn.style.display = "";
    if (!adsSync.configured) {
      els.adsSyncStatus.textContent = "Ads 미설정";
      els.adsSyncStatus.className = "status-pill";
      els.adsSyncStatus.title = adsSync.message || "";
      return;
    }
    if (adsSync.lastSync) {
      const when = new Date(adsSync.lastSync).toLocaleString("ko-KR");
      els.adsSyncStatus.textContent = `Ads · ${when}`;
      els.adsSyncStatus.className = "status-pill ok";
      els.adsSyncStatus.title = adsSync.message || "";
      return;
    }
    els.adsSyncStatus.textContent = "Ads 미동기화";
    els.adsSyncStatus.className = "status-pill";
    els.adsSyncStatus.title = adsSync.message || "Ads 동기화 버튼을 눌러 연동하세요";
  }

  function renderStudioSyncStatus(studio) {
    if (!els.studioSyncStatus) return;
    if (!studio) {
      els.studioSyncStatus.textContent = "Studio —";
      return;
    }
    if (studio.lastSync) {
      const when = new Date(studio.lastSync).toLocaleString("ko-KR");
      els.studioSyncStatus.textContent = `Studio · ${when}`;
      els.studioSyncStatus.className = "status-pill ok";
      els.studioSyncStatus.title = studio.message || "";
      return;
    }
    if (studio.ready) {
      els.studioSyncStatus.textContent = "Studio 준비됨";
      els.studioSyncStatus.className = "status-pill ok";
      els.studioSyncStatus.title =
        studio.message ||
        `캡처·쿠키 설정됨${studio.cookieCount ? ` (${studio.cookieCount}개)` : ""}${
          studio.authUser != null ? ` · authuser=${studio.authUser}` : ""
        }`;
      return;
    }
    if (studio.captureConfigured || studio.cookiesConfigured) {
      els.studioSyncStatus.textContent = studio.cookiesConfigured ? "Studio 부분설정" : "쿠키 없음";
      els.studioSyncStatus.className = studio.cookiesConfigured ? "status-pill" : "status-pill error";
      els.studioSyncStatus.title =
        studio.message ||
        (studio.cookiesConfigured
          ? "캡처 또는 쿠키가 부족합니다"
          : "캡처 저장을 다시 하세요 (cURL에 -b 쿠키 필요)");
      return;
    }
    els.studioSyncStatus.textContent = "Studio 캡처 필요";
    els.studioSyncStatus.className = "status-pill";
    els.studioSyncStatus.title = "프로모션 목록 cURL을 아래 편집란에 저장하세요";
  }

  async function refreshStudioPromoStatus() {
    const studio = await apiGet("/api/dddit/youtube/report/studio-promotions/status", {
      timeoutMs: 15_000,
    });
    renderStudioSyncStatus(studio);
    return studio;
  }

  async function refreshPromotionsTable() {
    const data = await apiGet("/api/dddit/youtube/report/promotions", { timeoutMs: 15_000 });
    promoPage = 0;
    renderPromotions(data.promotions || []);
    return data;
  }
  function sortPromotionsForDisplay(promotions) {
    const rank = (status) => {
      if (status === "진행중") return 0;
      if (status === "일시중지") return 1;
      return 2;
    };
    return [...(promotions || [])].sort((a, b) => {
      const byStatus = rank(a.status) - rank(b.status);
      if (byStatus) return byStatus;
      return (Number(b.cost) || 0) - (Number(a.cost) || 0);
    });
  }

  function renderPromoPagination(total, page) {
    if (!els.promoPagination) return;
    const pages = Math.max(1, Math.ceil(total / PROMO_PAGE_SIZE));
    if (total <= PROMO_PAGE_SIZE) {
      els.promoPagination.innerHTML = "";
      els.promoPagination.classList.add("hidden");
      return;
    }
    els.promoPagination.classList.remove("hidden");
    const start = page * PROMO_PAGE_SIZE + 1;
    const end = Math.min(total, (page + 1) * PROMO_PAGE_SIZE);
    els.promoPagination.innerHTML = `
      <button type="button" class="btn btn-ghost promo-page-btn" data-dir="prev" ${page <= 0 ? "disabled" : ""}>이전</button>
      <span class="promo-page-info">${start}–${end} / ${total} · ${page + 1}/${pages}</span>
      <button type="button" class="btn btn-ghost promo-page-btn" data-dir="next" ${page >= pages - 1 ? "disabled" : ""}>다음</button>`;
    els.promoPagination.querySelectorAll(".promo-page-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const dir = btn.getAttribute("data-dir");
        if (dir === "prev" && promoPage > 0) promoPage -= 1;
        if (dir === "next" && promoPage < pages - 1) promoPage += 1;
        renderPromotions(allPromotions);
      });
    });
  }

  function renderPromotions(promotions) {
    if (promotions) allPromotions = promotions;
    const sorted = sortPromotionsForDisplay(allPromotions);
    if (!sorted.length) {
      els.promoBody.innerHTML = `<tr><td colspan="8">등록된 프로모션이 없습니다. 아래 JSON 편집으로 추가하세요.</td></tr>`;
      renderPromoPagination(0, 0);
      return;
    }
    const pages = Math.max(1, Math.ceil(sorted.length / PROMO_PAGE_SIZE));
    if (promoPage >= pages) promoPage = pages - 1;
    if (promoPage < 0) promoPage = 0;
    const start = promoPage * PROMO_PAGE_SIZE;
    const visible = sorted.slice(start, start + PROMO_PAGE_SIZE);
    els.promoBody.innerHTML = visible
      .map((p) => {
        const m = p.metrics || {};
        const effClass = m.cpv && m.cpv <= 30 ? "metric-good" : m.cps && m.cps <= 400 ? "metric-good" : "";
        return `
        <tr>
          <td>
            <strong>${esc(p.title)}</strong>${sourceBadge(p.source)}
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
    renderPromoPagination(sorted.length, promoPage);
    const list = document.getElementById("promo-title-list");
    if (list) {
      list.innerHTML = sorted
        .map((p) => `<option value="${esc(p.title || "")}"></option>`)
        .join("");
    }
  }

  function renderVideos(videos) {
    if (!videos?.length) {
      els.videoGrid.innerHTML = `<p class="video-note">영상 데이터가 없습니다. YOUTUBE_API_KEY를 확인하세요.</p>`;
      return;
    }
    els.videoGrid.innerHTML = (videos || [])
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
    const memo =
      promo.memo ||
      (Array.isArray(promo.issues) ? promo.issues.join("\n") : "") ||
      "";
    if (els.memoEditor) els.memoEditor.value = memo;
    if (els.issuesEditor) els.issuesEditor.value = memo;
    els.promotionsEditor.value = JSON.stringify(promo.promotions || [], null, 2);
    els.snapshotsEditor.value = JSON.stringify(
      { snapshots: snaps.snapshots || [], viewsTrend7d: snaps.viewsTrend7d || [] },
      null,
      2
    );
  }

  async function saveEditors() {
    const memo = (els.memoEditor || els.issuesEditor)?.value || "";
    const issues = [];
    let promotions;
    let snapshotsPayload;
    try {
      promotions = JSON.parse(els.promotionsEditor.value || "[]");
      snapshotsPayload = JSON.parse(els.snapshotsEditor.value || "{}");
    } catch {
      throw new Error("JSON 형식이 올바르지 않습니다.");
    }
    if (!Array.isArray(promotions)) throw new Error("promotions는 배열이어야 합니다.");

    await apiPut("/api/dddit/youtube/report/promotions", { promotions, memo, issues });
    await apiPut("/api/dddit/youtube/report/snapshots", {
      snapshots: snapshotsPayload.snapshots || [],
      viewsTrend7d: snapshotsPayload.viewsTrend7d || [],
    });
    els.saveStatus.textContent = "저장됨 · 데이터 갱신 권장";
    els.saveStatus.className = "status-pill ok";
  }

  async function loadReport(refresh, options = {}) {
    const quiet = Boolean(options.quiet);
    const seq = ++loadSeq;
    if (!quiet) {
      els.loading.classList.remove("hidden");
      els.root.classList.add("hidden");
      els.error?.classList.add("hidden");
      setStatus(refresh ? "API 요청 중…" : "불러오는 중…");
      stopSubscriberLivePoll();
      destroyCharts();
    } else {
      setStatus("백그라운드 갱신 중…");
    }

    try {
      const overview = await apiGet(`/api/dddit/youtube/report/overview${refresh ? "?refresh=1" : ""}`);
      if (seq !== loadSeq) return;
      // Overview already warms the videos cache — do not request videos?refresh=1
      // (that previously forced a second full rebuild and hung the first paint).
      const videosData = await apiGet("/api/dddit/youtube/report/videos");
      if (seq !== loadSeq) return;
      const { traffic, retention, demographics } = await loadAnalyticsExtras(refresh);
      if (seq !== loadSeq) return;

      const ch = overview.channel || {};
      els.title.textContent = `${ch.title || "디디딧"} · 채널 현황 분석`;
      els.subtitle.textContent = `생성: ${new Date(overview.generatedAt).toLocaleString("ko-KR")} · ${ch.source || "api"}`;
      if (els.channelLink && ch.channelUrl) {
        els.channelLink.href = ch.channelUrl;
      }

      renderKpis(overview.kpis || {}, overview.channel?.subscriberCount);
      renderAnalyticsOverview(overview.analytics);
      renderAdsSyncStatus(overview.adsSync);
      renderStudioSyncStatus(overview.studioPromoSync);
      renderInsights(overview.insights || []);
      renderMemo(overview.memo || (overview.issues || []).join("\n") || "");
      promoPage = 0;
      renderPromotions(overview.promotions || []);
      renderVideos(videosData.videos || []);
      els.limitations.innerHTML = (overview.limitations || [])
        .map((line) => `<li>${esc(line)}</li>`)
        .join("");

      await loadEditors();
      if (seq !== loadSeq) return;

      // Chart.js needs visible parent to measure canvas size.
      els.loading.classList.add("hidden");
      els.root.classList.remove("hidden");
      hideError();

      destroyCharts();
      renderTrafficChart(traffic);
      bindRetentionTabs(retention, videosData.videos || []);
      renderRetentionChart(retention, videosData.videos || [], activeRetentionFormat);
      renderDemographicsCharts(demographics);
      renderRecentVideosChart(overview.recentVideosBar || []);
      renderViews7dChart(overview.viewsTrend7d || [], overview.viewsTrendNote);
      renderSubscriberChart(overview.subscriberTrend);
      requestAnimationFrame(resizeCharts);

      if (refresh) {
        markApiRefreshed();
        setStatus(quiet ? "백그라운드 갱신됨" : "API 갱신됨", "ok");
      } else {
        setStatus(cacheStatusText(), "");
      }
    } catch (err) {
      if (seq !== loadSeq) return;
      if (quiet && !els.root.classList.contains("hidden")) {
        setStatus("갱신 실패 · 캐시 표시 중", "error");
        return;
      }
      showError(err.message || String(err));
    } finally {
      if (seq === loadSeq && !quiet) {
        els.loading.classList.add("hidden");
        if (!els.error || els.error.classList.contains("hidden")) {
          els.root.classList.remove("hidden");
        }
      }
    }
  }

  async function bootReport() {
    await loadReport(false);
    const softOk =
      Boolean(els.root) &&
      !els.root.classList.contains("hidden") &&
      (!els.error || els.error.classList.contains("hidden"));
    if (shouldAutoRefresh()) {
      // Soft paint succeeded → refresh quietly. Soft failed → full refresh UI.
      await loadReport(true, { quiet: softOk });
    } else if (!softOk) {
      await loadReport(true);
    }
  }

  document.getElementById("btn-refresh")?.addEventListener("click", () => {
    setStatus("API 요청 중…");
    loadReport(true);
  });
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

  document.getElementById("btn-copy-bookmarklet")?.addEventListener("click", async () => {
    try {
      const snippetUrl = new URL("js/studio-promo-sync-snippet.js", location.href).href + "?v=4";
      const res = await fetch(snippetUrl, { cache: "no-store" });
      if (!res.ok) throw new Error("동기화 코드를 불러오지 못했습니다");
      let code = (await res.text()).trim();
      // Strip leading block comment so paste runs immediately in Console.
      code = code.replace(/^\/\*[\s\S]*?\*\/\s*/, "");
      await navigator.clipboard.writeText(code);
      setStatus("동기화 코드 복사됨 — Studio Console에 붙여넣기", "ok");
      alert(
        "동기화 코드가 복사되었습니다.\n\n" +
          "1) Studio → 프로모션 탭\n" +
          "2) F12 → Console\n" +
          "3) 붙여넣기 → Enter\n" +
          "4) 우측 상단 토스트/알림 확인 후 이 페이지 새로고침"
      );
    } catch (err) {
      showError(err.message || "동기화 코드 복사 실패");
    }
  });

  document.getElementById("btn-promo-quick-save")?.addEventListener("click", async () => {
    const msg = document.getElementById("promo-form-status-msg");
    try {
      const title = document.getElementById("promo-form-title")?.value?.trim() || "";
      if (!title) throw new Error("캠페인 이름을 입력하세요");
      const cost = Number(document.getElementById("promo-form-cost")?.value || 0);
      const impressions = Number(document.getElementById("promo-form-impressions")?.value || 0);
      const views = Number(document.getElementById("promo-form-views")?.value || 0);
      const subscribers = Number(document.getElementById("promo-form-subscribers")?.value || 0);
      const status = document.getElementById("promo-form-status")?.value || "진행중";
      if (!(cost || impressions || views || subscribers)) {
        throw new Error("비용·노출·조회·구독 중 하나 이상 입력하세요");
      }

      const data = await apiGet("/api/dddit/youtube/report/promotions", { timeoutMs: 15_000 });
      const promotions = Array.isArray(data.promotions) ? [...data.promotions] : [];
      const memo =
        data.memo ||
        (Array.isArray(data.issues) ? data.issues.join("\n") : "") ||
        "";
      const idx = promotions.findIndex((p) => String(p.title || "").trim() === title);
      const patch = {
        title,
        cost,
        impressions,
        views,
        subscribers,
        status,
        source: "manual",
        syncedAt: new Date().toISOString(),
        notes: [`수동 입력 ${new Date().toLocaleDateString("ko-KR")}`],
      };
      if (idx >= 0) {
        promotions[idx] = {
          ...promotions[idx],
          ...patch,
          notes: listUnique([...(promotions[idx].notes || []), ...patch.notes]),
        };
      } else {
        promotions.unshift({
          id: `manual-${Date.now()}`,
          videoTitle: title,
          videoId: "",
          goal: null,
          followOnViews: 0,
          ...patch,
        });
      }
      await apiPut("/api/dddit/youtube/report/promotions", { promotions, memo, issues });
      promoPage = 0;
      await refreshPromotionsTable();
      if (msg) msg.textContent = `"${title}" 저장됨`;
      setStatus("프로모션 숫자 저장됨", "ok");
    } catch (err) {
      if (msg) msg.textContent = err.message || "저장 실패";
      showError(err.message || "프로모션 저장 실패");
    }
  });

  function listUnique(items) {
    return [...new Set(items.filter(Boolean))];
  }

  void bootReport();
})();
