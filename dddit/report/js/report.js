(function () {
  const IS_WEB_HOSTED =
    location.protocol === "https:" && /^works\.mansejin\.com$/i.test(location.hostname);
  const API_BASE = IS_WEB_HOSTED ? "https://works-api.mansejin.com" : "http://localhost:8788";
  const REFRESH_CACHE_KEY = "works/dddit/report/lastApiRefresh";
  const REFRESH_TTL_MS = 24 * 60 * 60 * 1000;
  const SUBSCRIBER_POLL_MS = 90_000;
  const PROMO_PAGE_SIZE = 12;
  const VIDEO_PAGE_SIZE = 8;
  const API_TIMEOUT_MS = 90_000;
  const CAPTURE_TIMEOUT_MS = 45_000;
  const RETENTION_COMPARE_COLORS = ["#dc2626", "#2563eb", "#16a34a", "#d97706", "#7c3aed", "#0891b2"];

  const els = {
    root: document.getElementById("report-root"),
    loading: document.getElementById("loading"),
    pageLoading: document.getElementById("page-loading"),
    pageLoadingText: document.getElementById("page-loading-text"),
    pageLoadingSub: document.getElementById("page-loading-sub"),
    status: document.getElementById("report-status"),
    error: document.getElementById("error-banner"),
    title: document.getElementById("report-title"),
    subtitle: document.getElementById("report-subtitle"),
    kpiGrid: document.getElementById("kpi-grid"),
    insights: document.getElementById("insights-list"),
    memoEditor: document.getElementById("memo-editor"),
    promoBody: document.getElementById("promo-table-body"),
    videoGrid: document.getElementById("video-grid"),
    contentPagination: document.getElementById("content-pagination"),
    channelLink: document.getElementById("channel-link"),
    subscriberNote: document.getElementById("subscriber-trend-note"),
    viewsTrendNote: document.getElementById("views-trend-note"),
    limitations: document.getElementById("limitations-list"),
    analyticsBanner: document.getElementById("analytics-banner"),
    analyticsKpiGrid: document.getElementById("analytics-kpi-grid"),
    analyticsStatus: document.getElementById("analytics-status"),
    promoPagination: document.getElementById("promo-pagination"),
    promoFoot: document.getElementById("promo-table-foot"),
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
  let retentionSelectedIds = { longform: null, shorts: null };
  let allReportVideos = [];
  let videoPage = 0;
  let videoFormatFilter = "all";
  let retentionCompareLoading = false;
  let retentionDraftIds = { longform: null, shorts: null };
  let retentionPickerFormat = null;
  let retentionPickerOutsideHandler = null;
  let subscriberPollTimer = null;
  let videoModalRetentionChart = null;
  let apiConnections = [];
  const modalCharts = {};
  const MODAL_LOADING_HTML =
    '<div class="modal-loading" aria-busy="true"><div class="modal-loading-bar"></div><div class="modal-loading-bar" style="width:78%"></div><div class="modal-loading-bar" style="width:52%"></div><p class="video-note modal-loading-label" style="margin:0;">Analytics API 호출 중…</p></div>';
  const REACH_FUNNEL_TITLE = "노출수 및 노출수가 시청 시간에 미치는 영향";
  const BLOCK_HELP = {
    traffic:
      "채널 전체 조회가 어디서 유입됐는지 보여줍니다. 검색·추천·광고·Shorts 피드 비중을 보고 다음 콘텐츠 배포 전략을 정합니다.",
    retention:
      "영상 시청 유지 곡선입니다. 초반 이탈이 큰지, 중후반까지 몰입이 유지되는지 비교해 편집·챕터 구성을 점검합니다.",
    age: "28일 기준 시청자 연령 분포입니다. 타깃 연령과 실제 시청층이 맞는지 확인합니다.",
    gender: "28일 기준 시청자 성별 비율입니다. 썸네일·톤이 주 시청층과 맞는지 참고합니다.",
    "recent-videos":
      "최근 업로드 롱폼 4개의 조회 구성입니다(쇼츠 제외). 빨강은 YouTube Analytics 광고 유입(또는 프로모션 수치), 회색은 자연 조회입니다.",
    subscribers:
      "주간 스냅샷 기준 총 구독자(빨강)와 자연 증가 추정치(회색)입니다. 프로모션 구독 기여는 스냅샷·프로모션 데이터로 분리됩니다.",
  };

  const TRAFFIC_LABELS = {
    ADVERTISING: "광고",
    ANNOTATION: "주석",
    CAMPAIGN_CARD: "캠페인 카드",
    END_SCREEN: "종료 화면",
    EXT_URL: "외부",
    HASHTAGS: "해시태그",
    LIVE_REDIRECT: "라이브",
    NO_LINK_EMBEDDED: "임베드",
    NO_LINK_OTHER: "기타",
    NOTIFICATION: "알림",
    PLAYLIST: "재생목록",
    PRODUCT_PAGE: "상품",
    PROMOTED: "프로모션",
    RELATED_VIDEO: "관련 영상",
    SHORTS: "Shorts 피드",
    SHORTS_CONTENT_LINKS: "쇼츠 링크",
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

  const DEVICE_LABELS = {
    DESKTOP: "데스크톱",
    MOBILE: "모바일",
    TABLET: "태블릿",
    TV: "TV",
    GAME_CONSOLE: "게임 콘솔",
    UNKNOWN: "기타",
  };

  function setPageLoading(active, text, sub) {
    if (!els.pageLoading) return;
    els.pageLoading.hidden = !active;
    if (els.pageLoadingText && text) els.pageLoadingText.textContent = text;
    if (els.pageLoadingSub && sub) els.pageLoadingSub.textContent = sub;
  }

  function trafficLabel(source, fallbackLabel) {
    if (fallbackLabel) return fallbackLabel;
    return TRAFFIC_LABELS[source] || String(source || "기타").replace(/_/g, " ");
  }

  let loadSeq = 0;
  let allPromotions = [];
  let promoPage = 0;
  let chartSnapshot = null;

  function applyChartTheme() {
    if (typeof Chart === "undefined") return;
    const dark = document.documentElement.getAttribute("data-theme") === "dark";
    Chart.defaults.color = dark ? "#9aa8bc" : "#64748b";
    Chart.defaults.borderColor = dark ? "#2a3648" : "#e2e8f0";
  }

  function redrawChartsFromSnapshot() {
    if (!chartSnapshot) return;
    applyChartTheme();
    destroyCharts();
    const {
      traffic,
      retention,
      demographics,
      recentVideosBar,
      viewsTrend7d,
      viewsTrendNote,
      subscriberTrend,
      videos,
    } = chartSnapshot;
    renderTrafficChart(traffic);
    bindRetentionTabs(retention, videos || []);
    renderRetentionChart(retention, videos || [], activeRetentionFormat);
    renderDemographicsCharts(demographics);
    renderRecentVideosChart(recentVideosBar || []);
    renderViews7dChart(viewsTrend7d || [], viewsTrendNote);
    renderSubscriberChart(subscriberTrend);
    requestAnimationFrame(resizeCharts);
  }

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
    els.status.className = "report-status-line" + (kind ? ` ${kind}` : "");
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
    const { timeoutMs: _t, headers: extraHeaders, ...fetchOpts } = options;
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeoutMs);
    const headers = window.DdditApiAuth?.authHeaders?.(extraHeaders) || { ...(extraHeaders || {}) };
    try {
      const res = await fetch(url, { ...fetchOpts, headers, signal: controller.signal });
      if (window.DdditApiAuth?.handleUnauthorized?.(res)) {
        throw new Error("Team authentication required");
      }
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
    const { headers, body, ...rest } = options;
    const { res, body: resBody } = await fetchJson(`${API_BASE}${path}`, {
      method: "POST",
      headers: window.DdditApiAuth?.authHeaders?.(
        Object.assign({ "Content-Type": "application/json" }, headers || {})
      ),
      body: body != null && typeof body !== "string" ? JSON.stringify(body) : body,
      ...rest,
    });
    if (!res.ok) {
      throw new Error(resBody.detail || resBody.message || `HTTP ${res.status}`);
    }
    if (resBody && resBody.ok === false) {
      throw new Error(resBody.message || resBody.detail || "요청 실패");
    }
    return resBody;
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
      headers: window.DdditApiAuth?.authHeaders?.({ "Content-Type": "application/json" }) || {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    if (window.DdditApiAuth?.handleUnauthorized?.(res)) {
      throw new Error("Team authentication required");
    }
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

  async function loadAnalyticsExtras(refresh, onStep) {
    const q = refresh ? "?refresh=1" : "";
    onStep?.("유입 경로 (Analytics API)");
    const traffic = await apiGet(`/api/dddit/youtube/report/traffic-sources${q}`).catch(() => null);
    onStep?.("시청 유지 (Analytics API)");
    const retention = await apiGet(`/api/dddit/youtube/report/retention${q}`).catch(() => null);
    onStep?.("연령·성별 (Analytics API)");
    const demographics = await apiGet(`/api/dddit/youtube/report/demographics${q}`).catch(() => null);
    return { traffic, retention, demographics };
  }

  function renderKpis(kpis, subscriberRaw) {
    const items = [
      { label: "구독자 수", value: kpis.subscribers, id: "kpi-subscribers" },
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
    if (valueEl && countText && valueEl.textContent !== countText) {
      card.classList.add("pulse-update");
      window.setTimeout(() => card.classList.remove("pulse-update"), 700);
      valueEl.textContent = countText;
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
    const longformRows = (rows || []).filter((row) => row.isShorts !== true);
    if (!longformRows.length) return;
    charts.recent = new Chart(ctx, {
      type: "bar",
      data: {
        labels: longformRows.map((row) => row.shortLabel || row.title),
        datasets: [
          {
            label: "자연 조회",
            data: longformRows.map((row) => row.organicViews ?? row.views ?? 0),
            backgroundColor: "rgba(148, 163, 184, 0.88)",
            borderRadius: { topLeft: 0, topRight: 0, bottomLeft: 6, bottomRight: 6 },
            stack: "views",
          },
          {
            label: "광고 조회",
            data: longformRows.map((row) => row.adViews ?? 0),
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
                const row = longformRows[items[0]?.dataIndex];
                return row?.title || items[0]?.label || "";
              },
              footer(items) {
                const row = longformRows[items[0]?.dataIndex];
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
    if (els.subscriberNote) {
      els.subscriberNote.textContent = trend?.note || "";
    }
  }

  function renderInsights(items) {
    if (els.insights) {
      els.insights.innerHTML = (items || [])
        .map((line) => `<li>${esc(line)}</li>`)
        .join("");
    }
  }

  function renderMemo() {
    /* 메모 카드 제거됨 */
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

    const evals = evaluateAnalyticsKpis(analytics);
    const items = [
      {
        label: "조회수 (28일)",
        value: formatNum(analytics.views),
        eval: evals.views,
      },
      {
        label:
          analytics.impressionsSource === "reporting-api" ? "썸네일 노출 (28일)" : "노출수",
        value: analytics.impressions != null ? formatNum(analytics.impressions) : "—",
        eval: evals.impressions,
      },
      {
        label: "CTR",
        value: analytics.impressions != null && analytics.ctr != null ? `${analytics.ctr}%` : "—",
        eval: evals.ctr,
      },
      {
        label: "평균 시청률",
        value:
          analytics.averageViewPercentage != null
            ? `${Number(analytics.averageViewPercentage).toFixed(1)}%`
            : "—",
        eval: evals.avgWatch,
      },
    ];
    els.analyticsKpiGrid.innerHTML = items
      .map(
        (item) => `
      <div class="analytics-kpi">
        <div class="label">${esc(item.label)}</div>
        <div class="value">${esc(item.value)}</div>
        ${
          item.eval
            ? `<div class="eval ${esc(item.eval.tone)}">${esc(item.eval.text)}</div>`
            : ""
        }
      </div>`
      )
      .join("");
  }

  function evaluateAnalyticsKpis(analytics) {
    const views = Number(analytics.views);
    const impressions = analytics.impressions != null ? Number(analytics.impressions) : null;
    const ctr = analytics.ctr != null ? Number(analytics.ctr) : null;
    const avgWatch =
      analytics.averageViewPercentage != null ? Number(analytics.averageViewPercentage) : null;

    const result = { views: null, impressions: null, ctr: null, avgWatch: null };

    if (Number.isFinite(ctr)) {
      if (ctr >= 5) result.ctr = { tone: "good", text: "우수 · 썸네일/제목 클릭 반응이 강함" };
      else if (ctr >= 3) result.ctr = { tone: "ok", text: "양호 · 평균 이상 클릭률" };
      else if (ctr >= 2) result.ctr = { tone: "warn", text: "보통 · 훅·비주얼 개선 여지" };
      else result.ctr = { tone: "bad", text: "낮음 · 썸네일·제목 점검 권장" };
    } else {
      result.ctr = { tone: "muted", text: "노출 데이터 대기 중" };
    }

    if (Number.isFinite(avgWatch)) {
      if (avgWatch >= 50) result.avgWatch = { tone: "good", text: "우수 · 시청 몰입도 높음" };
      else if (avgWatch >= 35) result.avgWatch = { tone: "ok", text: "양호 · 전반 유지력 안정" };
      else if (avgWatch >= 25) result.avgWatch = { tone: "warn", text: "보통 · 초반 이탈 점검" };
      else result.avgWatch = { tone: "bad", text: "낮음 · 오프닝·전개 구조 개선 필요" };
    } else {
      result.avgWatch = { tone: "muted", text: "데이터 없음" };
    }

    if (Number.isFinite(views)) {
      if (views >= 80000) result.views = { tone: "good", text: "강세 · 최근 28일 수요 큼" };
      else if (views >= 30000) result.views = { tone: "ok", text: "양호 · 안정적인 수요 구간" };
      else if (views >= 10000) result.views = { tone: "warn", text: "보통 · 프로모·검색 유입 보강" };
      else result.views = { tone: "bad", text: "약세 · 신규 노출 파이프라인 필요" };
    }

    if (impressions != null && Number.isFinite(impressions) && Number.isFinite(views) && impressions > 0) {
      const convert = (views / impressions) * 100;
      if (convert >= 8) result.impressions = { tone: "good", text: `전환 ${convert.toFixed(1)}% · 노출 대비 반응 좋음` };
      else if (convert >= 4) result.impressions = { tone: "ok", text: `전환 ${convert.toFixed(1)}% · 무난한 클릭 전환` };
      else if (convert >= 2) result.impressions = { tone: "warn", text: `전환 ${convert.toFixed(1)}% · 클릭 유도 보강` };
      else result.impressions = { tone: "bad", text: `전환 ${convert.toFixed(1)}% · 노출은 되나 유입 약함` };
    } else if (impressions != null && Number.isFinite(impressions)) {
      if (impressions >= 500000) result.impressions = { tone: "ok", text: "노출 규모 큼 · CTR과 함께 해석" };
      else if (impressions >= 100000) result.impressions = { tone: "warn", text: "중간 노출 · 도달 확장 여지" };
      else result.impressions = { tone: "warn", text: "노출 제한적 · 배포·프로모 검토" };
    } else {
      result.impressions = { tone: "muted", text: "Reporting API 수집 대기" };
    }

    return result;
  }

  function renderTrafficChart(data) {
    const ctx = document.getElementById("chart-traffic-sources");
    if (!ctx) return;
    destroyCanvasChart(ctx);
    charts.traffic = null;
    const sources = (data?.sources || []).slice(0, 8);
    if (!sources.length) return;
    const total = sources.reduce((sum, s) => sum + (Number(s.views) || 0), 0) || 1;
    charts.traffic = new Chart(ctx, {
      type: "doughnut",
      data: {
        labels: sources.map((s) => {
          const name = trafficLabel(s.source, s.label);
          const share =
            s.share != null
              ? Number(s.share)
              : ((Number(s.views) || 0) / total) * 100;
          return `${name} ${share.toFixed(1)}%`;
        }),
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
        plugins: {
          legend: { position: "right", labels: { boxWidth: 10, font: { size: 10 } } },
          tooltip: {
            callbacks: {
              label(context) {
                const views = Number(context.raw) || 0;
                const pct = (views / total) * 100;
                return `${context.label.split(" ").slice(0, -1).join(" ") || context.label}: ${formatNum(views)}회 (${pct.toFixed(1)}%)`;
              },
            },
          },
        },
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
    retentionSelectedIds = { longform: null, shorts: null };
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
        retentionPickerFormat = null;
        retentionDraftIds[format] = null;
        tabs.querySelectorAll(".retention-tab").forEach((tabBtn) => {
          tabBtn.classList.toggle("active", tabBtn === btn);
        });
        renderRetentionChart(retentionData, retentionVideos, format);
      };
    });

    mountRetentionComparePicker([], activeRetentionFormat);

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

  function defaultRetentionIds(format) {
    const catalog = retentionCatalog(format);
    if (!catalog.length) return [];
    const topId = [...catalog].sort((a, b) => (Number(b.views) || 0) - (Number(a.views) || 0))[0]?.id;
    const recentIds = [...catalog]
      .sort((a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0))
      .slice(0, 2)
      .map((video) => video.id);
    return [...new Set([topId, ...recentIds].filter(Boolean))].slice(0, 3);
  }

  function retentionSelectedFor(format, series) {
    let available = (series || []).map((item) => item.videoId).filter(Boolean);
    if (!available.length && allReportVideos.length) {
      available = retentionCatalog(format).map((video) => video.id);
    }
    let selected = retentionSelectedIds[format];
    if (!selected || !selected.length) {
      selected = defaultRetentionIds(format);
      if (!selected.length) {
        selected = available.slice(0, Math.min(3, available.length));
      }
      retentionSelectedIds[format] = selected;
    }
    const filtered = selected.filter((id) => available.includes(id) || allReportVideos.some((v) => v.id === id));
    if (!filtered.length && available.length) {
      retentionSelectedIds[format] = available.slice(0, Math.min(2, available.length));
      return retentionSelectedIds[format];
    }
    retentionSelectedIds[format] = filtered;
    return filtered;
  }

  function retentionCatalog(format) {
    return (allReportVideos || []).filter((video) => {
      if (format === "shorts") return isShortsVideo(video);
      if (format === "longform") return !isShortsVideo(video);
      return true;
    });
  }

  function retentionIdsEqual(a, b) {
    const left = [...(a || [])].sort().join(",");
    const right = [...(b || [])].sort().join(",");
    return left === right;
  }

  function ensureRetentionDraft(format, series) {
    if (!retentionDraftIds[format]?.length) {
      retentionDraftIds[format] = [...retentionSelectedFor(format, series)];
    }
    return retentionDraftIds[format];
  }

  function updateRetentionPickerChrome(format) {
    const host = document.getElementById("retention-compare");
    if (!host) return;
    const draft = ensureRetentionDraft(format, []);
    const applied = retentionSelectedIds[format] || [];
    const countEl = host.querySelector(".retention-combo-count");
    const applyBtn = host.querySelector(".retention-apply-btn");
    const dirty = !retentionIdsEqual(draft, applied);
    if (countEl) {
      countEl.textContent = `${draft.length}개`;
      countEl.classList.toggle("pending", dirty);
      countEl.title = dirty ? "선택 변경됨 · 비교 적용을 눌러 반영" : "현재 비교 중";
    }
    if (applyBtn) {
      const canApply = draft.length >= 2 && dirty && !retentionCompareLoading;
      applyBtn.disabled = !canApply;
      applyBtn.textContent = retentionCompareLoading ? "불러오는 중…" : "비교 적용";
      applyBtn.classList.toggle("is-loading", retentionCompareLoading);
    }
  }

  function closeRetentionComboMenu() {
    const menu = document.getElementById("retention-combo-menu");
    const input = document.getElementById("retention-combo-input");
    if (menu) menu.hidden = true;
    if (input) input.setAttribute("aria-expanded", "false");
  }

  function renderRetentionComboMenu(format, query = "") {
    const menu = document.getElementById("retention-combo-menu");
    if (!menu) return;
    const catalog = retentionCatalog(format);
    const draft = new Set(ensureRetentionDraft(format, []));
    const q = String(query || "").trim().toLowerCase();
    const items = catalog.filter((video) => !q || String(video.title || "").toLowerCase().includes(q));
    if (!items.length) {
      menu.innerHTML = `<p class="video-note" style="margin:0;">검색 결과 없음</p>`;
      return;
    }
    menu.innerHTML = items
      .map((video) => {
        const checked = draft.has(video.id);
        return `<label class="retention-option">
          <input type="checkbox" data-video-id="${esc(video.id)}" ${checked ? "checked" : ""} />
          <span title="${esc(video.title)}">${esc(video.title)}</span>
        </label>`;
      })
      .join("");
    menu.querySelectorAll("input[type='checkbox']").forEach((input) => {
      input.addEventListener("change", () => {
        const id = input.getAttribute("data-video-id");
        if (!id) return;
        const next = new Set(ensureRetentionDraft(format, []));
        if (input.checked) next.add(id);
        else next.delete(id);
        if (!next.size) {
          input.checked = true;
          next.add(id);
        }
        retentionDraftIds[format] = Array.from(next);
        updateRetentionPickerChrome(format);
      });
    });
  }

  function mountRetentionComparePicker(series, format) {
    const host = document.getElementById("retention-compare");
    if (!host) return;

    if (retentionPickerFormat !== format || !host.querySelector(".retention-combo")) {
      retentionPickerFormat = format;
      retentionDraftIds[format] = [...retentionSelectedFor(format, series)];

      if (retentionPickerOutsideHandler) {
        document.removeEventListener("click", retentionPickerOutsideHandler);
        retentionPickerOutsideHandler = null;
      }

      host.innerHTML = `
        <div class="retention-picker">
          <div class="retention-combo-row">
            <div class="retention-combo">
              <div class="retention-combo-input-wrap">
                <input
                  type="search"
                  class="retention-combo-input"
                  id="retention-combo-input"
                  placeholder="영상 검색·선택"
                  autocomplete="off"
                  aria-expanded="false"
                  aria-controls="retention-combo-menu"
                />
                <span class="retention-combo-count" title="선택 개수">0개</span>
              </div>
              <div class="retention-combo-menu" id="retention-combo-menu" hidden></div>
            </div>
            <button type="button" class="btn retention-apply-btn" id="retention-apply-btn" disabled>비교 적용</button>
          </div>
          <p class="retention-compare-hint">목록에서 체크 후 「비교 적용」 — 2개 이상 선택 시 곡선을 갱신합니다.</p>
        </div>`;

      const input = host.querySelector("#retention-combo-input");
      const menu = host.querySelector("#retention-combo-menu");
      const applyBtn = host.querySelector("#retention-apply-btn");

      input?.addEventListener("focus", () => {
        menu.hidden = false;
        input.setAttribute("aria-expanded", "true");
        renderRetentionComboMenu(format, input.value);
      });
      input?.addEventListener("input", () => {
        menu.hidden = false;
        input.setAttribute("aria-expanded", "true");
        renderRetentionComboMenu(format, input.value);
      });
      input?.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          closeRetentionComboMenu();
          input.blur();
        }
      });

      applyBtn?.addEventListener("click", () => {
        void applyRetentionCompare(format);
      });

      retentionPickerOutsideHandler = (event) => {
        if (!host.contains(event.target)) closeRetentionComboMenu();
      };
      document.addEventListener("click", retentionPickerOutsideHandler);
    }

    updateRetentionPickerChrome(format);
    renderRetentionComboMenu(format, host.querySelector("#retention-combo-input")?.value || "");
  }

  async function applyRetentionCompare(format = activeRetentionFormat) {
    const draft = ensureRetentionDraft(format, []);
    if (draft.length < 2 || retentionCompareLoading) return;
    retentionSelectedIds[format] = [...draft];
    await refreshRetentionCompare(format, { fromApply: true });
    updateRetentionPickerChrome(format);
    closeRetentionComboMenu();
  }

  async function refreshRetentionCompare(format = activeRetentionFormat, options = {}) {
    const ids = retentionSelectedFor(format, []);
    if (retentionCompareLoading) return;
    if (ids.length < 2) {
      renderRetentionChart(retentionData, retentionVideos, format, { skipPicker: true });
      return;
    }
    retentionCompareLoading = true;
    updateRetentionPickerChrome(format);
    if (!options.fromApply) {
      setPageLoading(true, "시청 유지 비교 불러오는 중…", `${ids.length}개 영상`);
    }
    try {
      const retention = await apiGet(
        `/api/dddit/youtube/report/retention?video_ids=${encodeURIComponent(ids.join(","))}`,
        { timeoutMs: 60_000 }
      );
      retentionData = retention;
      renderRetentionChart(retention, allReportVideos, format, { skipPicker: true });
    } catch (err) {
      const labelEl = document.getElementById("retention-chart-label");
      if (labelEl) labelEl.textContent = err.message || "시청 유지 비교 실패";
    } finally {
      retentionCompareLoading = false;
      updateRetentionPickerChrome(format);
      setPageLoading(false);
    }
  }

  function renderRetentionChart(data, videos, format = activeRetentionFormat, options = {}) {
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
      const compareHost = document.getElementById("retention-compare");
      if (compareHost) compareHost.innerHTML = "";
      retentionPickerFormat = null;
      return;
    }

    const block = retentionBlock(data, format);
    const formatLabel = format === "shorts" ? "쇼츠" : "롱폼";
    let series = (block?.series || []).filter((item) => (item.points || []).length);
    if (!options.skipPicker) {
      mountRetentionComparePicker(series, format);
    } else {
      updateRetentionPickerChrome(format);
    }
    if (series.length > 1 || retentionSelectedIds[format]) {
      const selected = new Set(retentionSelectedFor(format, series));
      series = series.filter((item) => selected.has(item.videoId));
    }
    let trend = block?.trend || [];
    if (!trend.length && format === "longform" && (data?.trend || []).length) {
      trend = data.trend;
    }
    const points = block?.points || data?.points || [];
    const colors = RETENTION_COMPARE_COLORS;
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
            : `시청 유지 (${formatLabel}) — ${series.length}개 비교`;
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

  async function refreshPromotionsTable() {
    const data = await apiGet("/api/dddit/youtube/report/promotions", { timeoutMs: 15_000 });
    promoPage = 0;
    renderPromotions(data.promotions || []);
    return data;
  }
  function sortPromotionsForDisplay(promotions) {
    const groupRank = (p) => {
      const g = promoGoalGroup(p);
      if (g === "subscribe") return 0;
      if (g === "views") return 1;
      return 2;
    };
    const rank = (status) => {
      const s = String(status || "");
      if (s === "진행중" || /ACTIVE/i.test(s)) return 0;
      if (s === "일시중지" || /PAUSED/i.test(s)) return 1;
      return 2;
    };
    const dateKey = (p) => {
      const blob = [p.startDate, p.syncedAt, p.rawTitle, p.title, ...(p.notes || [])]
        .filter(Boolean)
        .join(" ");
      const m = String(blob).match(/(20\d{2}-\d{2}-\d{2})/);
      return m ? m[1].replace(/-/g, "") : "0";
    };
    return [...(promotions || [])].sort((a, b) => {
      const byGroup = groupRank(a) - groupRank(b);
      if (byGroup) return byGroup;
      const byStatus = rank(a.status) - rank(b.status);
      if (byStatus) return byStatus;
      const byDate = Number(dateKey(b)) - Number(dateKey(a));
      if (byDate) return byDate;
      return (Number(b.cost) || 0) - (Number(a.cost) || 0);
    });
  }

  function renderPageControls(container, page, pages, onChange) {
    if (!container) return;
    if (pages <= 1) {
      container.innerHTML = "";
      container.classList.add("hidden");
      return;
    }
    container.classList.remove("hidden");
    container.innerHTML = `
      <button type="button" class="btn btn-ghost promo-page-btn" data-dir="prev" ${page <= 0 ? "disabled" : ""}>이전</button>
      <span class="promo-page-info">${page + 1}/${pages}</span>
      <button type="button" class="btn btn-ghost promo-page-btn" data-dir="next" ${page >= pages - 1 ? "disabled" : ""}>다음</button>`;
    container.querySelectorAll(".promo-page-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const dir = btn.getAttribute("data-dir");
        let next = page;
        if (dir === "prev" && page > 0) next = page - 1;
        if (dir === "next" && page < pages - 1) next = page + 1;
        onChange(next);
      });
    });
  }

  function renderPromoPagination(total, page) {
    const pages = Math.max(1, Math.ceil(total / PROMO_PAGE_SIZE));
    renderPageControls(els.promoPagination, page, pages, (next) => {
      promoPage = next;
      renderPromotions(allPromotions);
    });
  }

  function promoGoalGroup(promo) {
    const fromMetrics = promo?.metrics?.goalGroup;
    if (fromMetrics === "subscribe" || fromMetrics === "views" || fromMetrics === "other") {
      return fromMetrics;
    }
    const goal = String(promo?.goal || "");
    const title = String(promo?.title || "");
    if (/시청자층|구독/.test(goal) || /\(구독\)|구독\s*$/.test(title)) return "subscribe";
    if (/조회/.test(goal) || /\(조회|조회수/.test(title)) return "views";
    return "other";
  }

  function promoGroupLabel(group) {
    if (group === "subscribe") return "구독 캠페인";
    if (group === "views") return "조회수 캠페인";
    return "기타 캠페인";
  }

  function renderPromoRow(p) {
    const m = p.metrics || {};
    const group = promoGoalGroup(p);
    const effClass =
      group === "subscribe"
        ? m.cps && m.cps <= 400
          ? "metric-good"
          : ""
        : m.cpv && m.cpv <= 30
          ? "metric-good"
          : m.cps && m.cps <= 400
            ? "metric-good"
            : "";
    const statusLabel = String(p.status || "—");
    const statusClass =
      statusLabel === "완료" || /ENDED|COMPLETED|FINISHED/i.test(statusLabel)
        ? " done"
        : statusLabel === "진행중" || /ACTIVE/i.test(statusLabel)
          ? " active"
          : "";
    const budgetRaw = p.budget != null && p.budget !== "" ? Number(p.budget) : Number(m.budget) || "";
    const cpvCell = group === "subscribe" ? "—" : m.cpv != null ? `${formatNum(m.cpv)}원` : "—";
    const cpsCell = m.cps != null ? `${formatNum(m.cps)}원` : "—";
    return `
      <tr data-promo-id="${esc(p.id)}">
        <td class="promo-name-cell">
          <strong>${esc(p.title)}</strong><span class="badge${statusClass}">${esc(statusLabel)}</span>${sourceBadge(p.source)}
        </td>
        <td>
          <input
            type="number"
            class="budget-input"
            data-promo-id="${esc(p.id)}"
            value="${Number.isFinite(budgetRaw) && budgetRaw !== "" ? budgetRaw : ""}"
            min="0"
            step="1000"
            aria-label="예산"
          />
        </td>
        <td>${formatWon(p.cost)}</td>
        <td>${formatNum(p.impressions)}</td>
        <td>${formatNum(p.views)}</td>
        <td>${formatNum(p.subscribers)}</td>
        <td>${cpvCell}</td>
        <td>${cpsCell}</td>
        <td class="${effClass}">${esc(m.efficiencyRating || m.efficiencyText || "—")}</td>
      </tr>`;
  }

  async function savePromoBudget(promoId, budgetValue) {
    const budget = Math.max(0, Math.round(Number(budgetValue) || 0));
    const current = await apiGet("/api/dddit/youtube/report/promotions", { timeoutMs: 15_000 });
    const promotions = (current.promotions || []).map((promo) =>
      promo.id === promoId ? { ...promo, budget } : promo
    );
    await apiPut("/api/dddit/youtube/report/promotions", {
      promotions,
      memo: current.memo || "",
      issues: [],
    });
    allPromotions = promotions;
  }

  function bindPromoBudgetEditors() {
    els.promoBody?.querySelectorAll(".budget-input").forEach((input) => {
      const commit = async () => {
        const promoId = input.getAttribute("data-promo-id");
        if (!promoId) return;
        try {
          await savePromoBudget(promoId, input.value);
        } catch (err) {
          alert(err.message || "예산 저장 실패");
        }
      };
      input.addEventListener("change", commit);
      input.addEventListener("blur", commit);
    });
  }

  function promoCostTotals(promotions) {
    const totals = { subscribe: 0, views: 0, other: 0 };
    (promotions || []).forEach((promo) => {
      const group = promoGoalGroup(promo);
      totals[group] = (totals[group] || 0) + (Number(promo.cost) || 0);
    });
    return totals;
  }

  function renderPromoCostSummary(promotions) {
    if (!els.promoFoot) return;
    const totals = promoCostTotals(promotions);
    const grandTotal = totals.subscribe + totals.views + totals.other;
    els.promoFoot.innerHTML = `
      <tr class="promo-summary-row subscribe">
        <td colspan="2">구독 캠페인 합계</td>
        <td>${formatWon(totals.subscribe)}</td>
        <td colspan="6"></td>
      </tr>
      <tr class="promo-summary-row views">
        <td colspan="2">조회수 캠페인 합계</td>
        <td>${formatWon(totals.views)}</td>
        <td colspan="6"></td>
      </tr>
      <tr class="promo-summary-row total">
        <td colspan="2">총 합계</td>
        <td>${formatWon(grandTotal)}</td>
        <td colspan="6"></td>
      </tr>`;
  }

  function renderPromotions(promotions) {
    if (promotions) allPromotions = promotions;
    const sorted = sortPromotionsForDisplay(allPromotions);
    if (!sorted.length) {
      els.promoBody.innerHTML = `<tr><td colspan="9">등록된 프로모션이 없습니다. 아래 JSON 편집으로 추가하세요.</td></tr>`;
      if (els.promoFoot) els.promoFoot.innerHTML = "";
      renderPromoPagination(0, 0);
      return;
    }

    const groups = { subscribe: [], views: [], other: [] };
    sorted.forEach((p) => {
      groups[promoGoalGroup(p)].push(p);
    });
    const orderedGroups = ["subscribe", "views", "other"].filter((key) => groups[key].length);

    // Flat list for pagination, but keep group headers by rendering selected slice with section headers as needed.
    const flat = orderedGroups.flatMap((key) => groups[key]);
    const pages = Math.max(1, Math.ceil(flat.length / PROMO_PAGE_SIZE));
    if (promoPage >= pages) promoPage = pages - 1;
    if (promoPage < 0) promoPage = 0;
    const start = promoPage * PROMO_PAGE_SIZE;
    const visible = flat.slice(start, start + PROMO_PAGE_SIZE);

    const rows = [];
    let lastGroup = null;
    visible.forEach((p) => {
      const group = promoGoalGroup(p);
      if (group !== lastGroup) {
        rows.push(
          `<tr class="promo-group-row ${esc(group)}"><td colspan="9">${esc(promoGroupLabel(group))}</td></tr>`
        );
        lastGroup = group;
      }
      rows.push(renderPromoRow(p));
    });
    els.promoBody.innerHTML = rows.join("");
    renderPromoCostSummary(allPromotions);
    renderPromoPagination(flat.length, promoPage);
    bindPromoBudgetEditors();
  }

  function isShortsVideo(video) {
    if (video?.isShorts === true) return true;
    if (video?.isShorts === false) return false;
    const sec = Number(video?.durationSec);
    return Number.isFinite(sec) && sec > 0 && sec <= 60;
  }

  function buildVideoAssessment(video) {
    const lines = [];
    const views = Number(video.views) || 0;
    const likes = Number(video.likes) || 0;
    const comments = Number(video.comments) || 0;
    const duration = Number(video.durationSec) || 0;
    const ctr = video.ctr != null ? Number(video.ctr) : null;
    const likeRate = views > 0 ? (likes / views) * 100 : null;
    const commentRate = views > 0 ? (comments / views) * 100 : null;

    if (views >= 50000) lines.push("조회수 규모가 큰 콘텐츠입니다. 후속 시리즈·프로모 확장에 유리합니다.");
    else if (views >= 10000) lines.push("조회수는 중간 규모입니다. 관련 주제·썸네일 변형으로 확장 여지가 있습니다.");
    else lines.push("조회수가 아직 성장 구간입니다. 유입 경로·훅을 우선 점검하세요.");

    if (likeRate != null) {
      if (likeRate >= 4) lines.push(`좋아요 반응 ${likeRate.toFixed(1)}% · 반응이 강한 편입니다.`);
      else if (likeRate >= 2) lines.push(`좋아요 반응 ${likeRate.toFixed(1)}% · 평균적인 반응입니다.`);
      else lines.push(`좋아요 반응 ${likeRate.toFixed(1)}% · 후반 CTA·템포 개선 여지가 있습니다.`);
    }

    if (commentRate != null && commentRate >= 0.3) {
      lines.push(`댓글 참여 ${commentRate.toFixed(2)}% · 토론·질문 유도가 잘 되어 있습니다.`);
    } else if (commentRate != null) {
      lines.push(`댓글 참여 ${commentRate.toFixed(2)}% · 질문 훅이나 선택지를 넣으면 참여가 늘 수 있습니다.`);
    }

    if (ctr != null) {
      if (ctr >= 5) lines.push(`CTR ${ctr}% · 썸네일/제목 클릭력이 우수합니다.`);
      else if (ctr >= 3) lines.push(`CTR ${ctr}% · 클릭률은 양호합니다.`);
      else lines.push(`CTR ${ctr}% · 썸네일·제목 재작업 우선순위를 높여보세요.`);
    }

    if (duration > 0) {
      if (duration <= 60) lines.push("쇼츠 포맷입니다. 초반 1–2초 훅과 루프 구조를 중심으로 보세요.");
      else if (duration <= 480) lines.push("미드폼 길이입니다. 초반 20% 이탈과 챕터 구성이 핵심입니다.");
      else lines.push("롱폼입니다. 챕터·중간 전환 리듬이 시청 유지에 큰 영향을 줍니다.");
    }

    if ((video.chapters || []).length) {
      lines.push(`챕터 ${video.chapters.length}개가 인식됩니다. 챕터 카드 제목 품질을 유지하세요.`);
    }

    return lines;
  }

  function closeVideoAnalysisModal() {
    const modal = document.getElementById("video-analysis-modal");
    if (!modal) return;
    modal.hidden = true;
    document.body.classList.remove("video-modal-open");
    Object.keys(modalCharts).forEach((key) => destroyModalChart(key));
    if (videoModalRetentionChart) {
      try {
        videoModalRetentionChart.destroy();
      } catch {
        /* ignore */
      }
      videoModalRetentionChart = null;
    }
  }

  function formatMinutes(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return "—";
    if (n >= 60) return `${Math.floor(n / 60)}시간 ${Math.round(n % 60)}분`;
    return `${Math.round(n)}분`;
  }

  function formatCompactNum(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return "—";
    if (n >= 10000) {
      const v = n / 10000;
      const text = v >= 10 ? String(Math.round(v)) : v.toFixed(1).replace(/\.0$/, "");
      return `${text}만`;
    }
    if (n >= 1000) {
      const v = n / 1000;
      const text = v >= 10 ? v.toFixed(1).replace(/\.0$/, "") : v.toFixed(1).replace(/\.0$/, "");
      return `${text}천`;
    }
    return formatNum(n);
  }

  function formatWatchHours(minutes) {
    const n = Number(minutes);
    if (!Number.isFinite(n) || n <= 0) return "—";
    return (n / 60).toFixed(2);
  }

  function formatDurationSec(sec) {
    const n = Number(sec);
    if (!Number.isFinite(n) || n <= 0) return "—";
    const m = Math.floor(n / 60);
    const s = Math.round(n % 60);
    return m > 0 ? `${m}:${String(s).padStart(2, "0")}` : `0:${String(s).padStart(2, "0")}`;
  }

  function renderModalTableRows(rows, cols) {
    if (!rows?.length) return `<p class="video-note">데이터 없음</p>`;
    return `<table class="video-modal-table"><thead><tr>${cols
      .map((col) => `<th>${esc(col.label)}</th>`)
      .join("")}</tr></thead><tbody>${rows
      .map(
        (row) =>
          `<tr>${cols.map((col) => `<td>${esc(col.render(row))}</td>`).join("")}</tr>`
      )
      .join("")}</tbody></table>`;
  }

  function renderReachFunnel(funnel) {
    if (!funnel) return `<p class="video-note">노출 데이터 없음</p>`;
    const impressions = funnel.impressions;
    const views = funnel.views;
    const watch = funnel.watchMinutes;
    if (!impressions && !views && !watch) return `<p class="video-note">노출·시청 데이터 없음</p>`;
    const impressionsText =
      impressions != null && impressions > 0 ? formatCompactNum(impressions) : "집계 중";
    const ctr =
      impressions != null && impressions > 0 && views != null && views >= 0
        ? ((views / impressions) * 100).toFixed(1)
        : null;
    const avdSec = funnel.averageViewDurationSec;
    const avdText =
      avdSec != null && Number(avdSec) > 0
        ? `${formatDurationSec(avdSec)} 평균 시청 지속 시간`
        : null;
    return `<div class="yta-funnel">
      <div class="yta-funnel-segment impressions">
        <div class="yta-funnel-title">노출수</div>
        <div class="yta-funnel-value">${esc(impressionsText)}</div>
      </div>
      ${ctr != null ? `<div class="yta-funnel-bridge ctr">클릭률: ${ctr}%</div>` : ""}
      <div class="yta-funnel-segment views">
        <div class="yta-funnel-title">노출 조회수</div>
        <div class="yta-funnel-value">${formatNum(views)}</div>
      </div>
      ${avdText ? `<div class="yta-funnel-bridge avd">${esc(avdText)}</div>` : ""}
      <div class="yta-funnel-segment watch-time">
        <div class="yta-funnel-title">시청 시간(시간)</div>
        <div class="yta-funnel-value">${formatWatchHours(watch)}</div>
      </div>
    </div>`;
  }

  function destroyModalChart(key) {
    if (modalCharts[key]) {
      try {
        modalCharts[key].destroy();
      } catch {
        /* ignore */
      }
      modalCharts[key] = null;
    }
  }

  function modalChartHeight(labelCount, chartType) {
    if (chartType === "doughnut" || chartType === "pie") return Math.min(128, Math.max(108, labelCount * 12 + 68));
    return Math.min(160, Math.max(52, labelCount * 28 + 16));
  }

  function renderModalChartSection(host, key, chartType, labels, values, options = {}) {
    if (!host) return;
    destroyModalChart(key);
    const horizontal = options.horizontal || (chartType === "bar" && labels.length <= 6);
    const isCircular = chartType === "doughnut" || chartType === "pie";
    const height = modalChartHeight(labels.length, chartType);
    const chartClass = isCircular
      ? "video-modal-chart short pie-chart"
      : height <= 72
        ? "video-modal-chart compact"
        : "video-modal-chart short";
    host.innerHTML = `<div class="${chartClass}" style="height:${height}px"><canvas id="modal-chart-${key}"></canvas></div>
      <button type="button" class="modal-data-toggle" data-modal-table="${key}">표 보기</button>
      <div class="modal-table-host hidden" id="modal-table-${key}"></div>`;
    const canvas = host.querySelector(`#modal-chart-${key}`);
    if (!canvas || typeof Chart === "undefined") return;
    const colors = ["#2563eb", "#dc2626", "#16a34a", "#d97706", "#7c3aed", "#0891b2", "#64748b"];
    const dataset = {
      data: values,
      backgroundColor: chartType === "line" ? "rgba(37,99,235,0.15)" : colors,
      borderColor: chartType === "line" ? "#2563eb" : horizontal ? "#2563eb" : undefined,
      fill: chartType === "line",
      tension: 0.3,
      borderWidth: horizontal ? 1 : undefined,
      barThickness: horizontal ? Math.min(18, Math.max(10, Math.floor(height / Math.max(labels.length, 1)) - 6)) : undefined,
    };
    modalCharts[key] = new Chart(canvas, {
      type: chartType,
      data: { labels, datasets: [dataset] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: horizontal ? "y" : "x",
        radius: isCircular ? "58%" : undefined,
        layout: isCircular ? { padding: { top: 2, bottom: 0, left: 2, right: 2 } } : undefined,
        plugins: {
          legend: isCircular
            ? {
                display: true,
                position: "bottom",
                labels: { boxWidth: 8, padding: 4, font: { size: 9 } },
              }
            : { display: false },
        },
        scales:
          chartType === "bar" && horizontal
            ? {
                x: { beginAtZero: true, ticks: { font: { size: 10 } } },
                y: { ticks: { font: { size: 10 }, autoSkip: false } },
              }
            : chartType === "bar"
              ? { y: { beginAtZero: true } }
              : {},
      },
    });
    const tableHost = host.querySelector(`#modal-table-${key}`);
    const toggle = host.querySelector(`[data-modal-table="${key}"]`);
    toggle?.addEventListener("click", () => {
      const showTable = tableHost?.classList.toggle("hidden") === false;
      host.querySelector(".video-modal-chart")?.classList.toggle("hidden", showTable);
      toggle.textContent = showTable ? "차트 보기" : "표 보기";
    });
    return tableHost;
  }

  async function openVideoAnalysisModal(video) {
    const modal = document.getElementById("video-analysis-modal");
    const titleEl = document.getElementById("video-analysis-title");
    const body = document.getElementById("video-analysis-body");
    if (!modal || !body || !video) return;

    const date = video.publishedAt ? new Date(video.publishedAt).toLocaleDateString("ko-KR") : "—";
    const assessment = buildVideoAssessment(video);
    titleEl.textContent = video.title || "영상 분석";
    body.innerHTML = `
      <div class="video-modal-hero">
        <img src="${esc(video.thumbnail)}" alt="" />
        <div class="video-modal-kpis">
          <div class="item"><span>조회수</span><strong>${esc(video.viewsText || formatNum(video.views))}</strong></div>
          <div class="item"><span>좋아요</span><strong>${formatNum(video.likes)}</strong></div>
          <div class="item"><span>댓글</span><strong>${formatNum(video.comments)}</strong></div>
          <div class="item"><span>길이</span><strong>${esc(video.durationText || "—")}</strong></div>
          <div class="item"><span>시청 시간</span><strong id="modal-watch-minutes">불러오는 중…</strong></div>
          <div class="item"><span>구독자</span><strong id="modal-subs-gained">불러오는 중…</strong></div>
          <div class="item"><span>게시</span><strong>${esc(date)}</strong></div>
          <div class="item"><span>CTR</span><strong>${video.ctr != null ? `${esc(String(video.ctr))}%` : "—"}</strong></div>
          <div class="item"><span>평균 시청</span><strong id="modal-avg-watch">불러오는 중…</strong></div>
        </div>
      </div>
      <div class="video-modal-top">
        <div class="video-modal-panel">
          <h4>빠른 진단</h4>
          <ul>${assessment.map((line) => `<li>${esc(line)}</li>`).join("")}</ul>
        </div>
        ${
          (video.chapters || []).length
            ? `<div class="video-modal-panel"><h4>챕터</h4><ul>${video.chapters
                .slice(0, 8)
                .map((ch) => `<li><strong>${esc(ch.timestamp)}</strong> ${esc(ch.title)}</li>`)
                .join("")}</ul></div>`
            : `<div class="video-modal-panel"><h4>챕터</h4><p class="video-note" style="margin:0;">챕터 없음</p></div>`
        }
      </div>
      <div class="video-modal-grid">
        <div class="video-modal-panel">
          <h4>시청 트래픽 소스</h4>
          <div id="modal-traffic">${MODAL_LOADING_HTML}</div>
        </div>
        <div class="video-modal-panel">
          <h4>${REACH_FUNNEL_TITLE}</h4>
          <div id="modal-funnel">${MODAL_LOADING_HTML}</div>
        </div>
        <div class="video-modal-panel">
          <h4>검색어</h4>
          <div id="modal-search">${MODAL_LOADING_HTML}</div>
        </div>
        <div class="video-modal-panel">
          <h4>시청자 구분 (구독 여부)</h4>
          <div id="modal-audience">${MODAL_LOADING_HTML}</div>
        </div>
        <div class="video-modal-panel">
          <h4>기기 유형</h4>
          <div id="modal-devices">${MODAL_LOADING_HTML}</div>
        </div>
        <div class="video-modal-panel">
          <h4>연령 · 성별</h4>
          <div class="modal-demographics-grid">
            <div id="modal-age">${MODAL_LOADING_HTML}</div>
            <div id="modal-gender">${MODAL_LOADING_HTML}</div>
          </div>
        </div>
        <div class="video-modal-panel span-3">
          <h4>시청 유지</h4>
          <div class="video-modal-chart"><canvas id="chart-video-retention"></canvas></div>
          <p class="video-note" id="video-retention-note" style="margin-top:8px;">Analytics API에서 시청 유지 곡선 불러오는 중…</p>
        </div>
      </div>
      <div class="video-modal-links">
        <a class="icon-link-btn yt" href="${esc(video.url)}" target="_blank" rel="noopener" title="YouTube">YT</a>
        ${
          video.studioUrl
            ? `<a class="icon-link-btn studio" href="${esc(video.studioUrl)}" target="_blank" rel="noopener" title="Studio 분석">S</a>`
            : ""
        }
      </div>`;

    modal.hidden = false;
    document.body.classList.add("video-modal-open");

    const note = document.getElementById("video-retention-note");
    const canvas = document.getElementById("chart-video-retention");
    const setModalStep = (label) => {
      document.querySelectorAll(".modal-loading-label").forEach((el) => {
        el.textContent = label;
      });
    };

    try {
      setModalStep("시청 유지 API 호출 중…");
      const retentionPromise = apiGet(`/api/dddit/youtube/report/retention?video_id=${encodeURIComponent(video.id)}`, {
        timeoutMs: 45_000,
      });
      setModalStep("영상 Analytics API 호출 중…");
      const analyticsPromise = apiGet(
        `/api/dddit/youtube/report/video-analytics?video_id=${encodeURIComponent(video.id)}`,
        { timeoutMs: 45_000 }
      ).catch(() => null);
      const [retention, analytics] = await Promise.all([retentionPromise, analyticsPromise]);

      const dash = analytics?.dashboard || {};
      const watchEl = document.getElementById("modal-watch-minutes");
      const subsEl = document.getElementById("modal-subs-gained");
      const avgEl = document.getElementById("modal-avg-watch");
      if (watchEl) {
        watchEl.textContent =
          dash.watchMinutes != null ? formatMinutes(dash.watchMinutes) : "—";
      }
      if (subsEl) {
        subsEl.textContent =
          dash.subscribersGained != null ? `+${formatNum(dash.subscribersGained)}` : "—";
      }
      if (avgEl) {
        avgEl.textContent = dash.averageViewDurationSec
          ? formatDurationSec(dash.averageViewDurationSec)
          : dash.averageViewPercentage != null
            ? `${Number(dash.averageViewPercentage).toFixed(1)}%`
            : "—";
      }

      const trafficHost = document.getElementById("modal-traffic");
      const trafficRows = analytics?.trafficSources || [];
      if (trafficHost) {
        if (!trafficRows.length) {
          trafficHost.innerHTML = `<p class="video-note">데이터 없음</p>`;
        } else {
          const tableHost = renderModalChartSection(
            trafficHost,
            "traffic",
            "doughnut",
            trafficRows.map((row) => trafficLabel(row.source, row.label)),
            trafficRows.map((row) => Number(row.views) || 0)
          );
          if (tableHost) {
            tableHost.innerHTML = renderModalTableRows(trafficRows, [
              { label: "소스", render: (row) => trafficLabel(row.source, row.label) },
              { label: "조회", render: (row) => formatNum(row.views) },
              { label: "비율", render: (row) => (row.share != null ? `${row.share}%` : "—") },
            ]);
          }
        }
      }
      const funnelHost = document.getElementById("modal-funnel");
      if (funnelHost) funnelHost.innerHTML = renderReachFunnel(analytics?.reachFunnel);
      const searchHost = document.getElementById("modal-search");
      const searchRows = analytics?.searchTerms || [];
      if (searchHost) {
        if (!searchRows.length) {
          searchHost.innerHTML = `<p class="video-note">데이터 없음</p>`;
        } else {
          const tableHost = renderModalChartSection(
            searchHost,
            "search",
            "bar",
            searchRows.slice(0, 8).map((row) => row.term || "—"),
            searchRows.slice(0, 8).map((row) => Number(row.views) || 0),
            { horizontal: true }
          );
          if (tableHost) {
            tableHost.innerHTML = renderModalTableRows(searchRows, [
              { label: "검색어", render: (row) => row.term || "—" },
              { label: "조회", render: (row) => formatNum(row.views) },
            ]);
          }
        }
      }
      const audienceHost = document.getElementById("modal-audience");
      const audienceRows = analytics?.audienceBySubscription || [];
      if (audienceHost) {
        if (!audienceRows.length) {
          audienceHost.innerHTML = `<p class="video-note">데이터 없음</p>`;
        } else {
          const tableHost = renderModalChartSection(
            audienceHost,
            "audience",
            "doughnut",
            audienceRows.map((row) => row.label || row.status || "—"),
            audienceRows.map((row) => Number(row.views) || 0)
          );
          if (tableHost) {
            tableHost.innerHTML = renderModalTableRows(audienceRows, [
              { label: "시청자", render: (row) => row.label || row.status || "—" },
              { label: "조회", render: (row) => formatNum(row.views) },
              { label: "시청 시간", render: (row) => formatMinutes(row.watchMinutes) },
              { label: "비율", render: (row) => (row.share != null ? `${row.share}%` : "—") },
            ]);
          }
        }
      }
      const devicesHost = document.getElementById("modal-devices");
      const deviceRows = analytics?.deviceTypes || [];
      if (devicesHost) {
        if (!deviceRows.length) {
          devicesHost.innerHTML = `<p class="video-note">데이터 없음</p>`;
        } else {
          const tableHost = renderModalChartSection(
            devicesHost,
            "devices",
            "bar",
            deviceRows.map((row) => DEVICE_LABELS[row.device] || row.device || "—"),
            deviceRows.map((row) => Number(row.views) || 0),
            { horizontal: true }
          );
          if (tableHost) {
            tableHost.innerHTML = renderModalTableRows(deviceRows, [
              { label: "기기", render: (row) => DEVICE_LABELS[row.device] || row.device || "—" },
              { label: "조회", render: (row) => formatNum(row.views) },
              { label: "시청 시간", render: (row) => formatMinutes(row.watchMinutes) },
              { label: "비율", render: (row) => (row.share != null ? `${row.share}%` : "—") },
            ]);
          }
        }
      }
      const ageHost = document.getElementById("modal-age");
      const ageRows = analytics?.ageGroups || [];
      if (ageHost) {
        if (!ageRows.length) {
          ageHost.innerHTML = `<p class="video-note">데이터 없음</p>`;
        } else {
          const tableHost = renderModalChartSection(
            ageHost,
            "age",
            "bar",
            ageRows.map((row) => formatAgeLabel(row.ageGroup)),
            ageRows.map((row) => Number(row.viewerPercentage) || 0)
          );
          if (tableHost) {
            tableHost.innerHTML = renderModalTableRows(ageRows, [
              { label: "연령", render: (row) => formatAgeLabel(row.ageGroup) },
              { label: "비율", render: (row) => `${Number(row.viewerPercentage || 0).toFixed(1)}%` },
            ]);
          }
        }
      }
      const genderHost = document.getElementById("modal-gender");
      const genderRows = analytics?.gender || [];
      if (genderHost) {
        if (!genderRows.length) {
          genderHost.innerHTML = `<p class="video-note">데이터 없음</p>`;
        } else {
          const tableHost = renderModalChartSection(
            genderHost,
            "gender",
            "pie",
            genderRows.map((row) => GENDER_LABELS[row.gender] || row.gender || "—"),
            genderRows.map((row) => Number(row.viewerPercentage) || 0)
          );
          if (tableHost) {
            tableHost.innerHTML = renderModalTableRows(genderRows, [
              { label: "성별", render: (row) => GENDER_LABELS[row.gender] || row.gender || "—" },
              { label: "비율", render: (row) => `${Number(row.viewerPercentage || 0).toFixed(1)}%` },
            ]);
          }
        }
      }

      if (videoModalRetentionChart) {
        try {
          videoModalRetentionChart.destroy();
        } catch {
          /* ignore */
        }
        videoModalRetentionChart = null;
      }
      const points =
        retention?.points?.length ? retention.points : retention?.series?.[0]?.points || [];
      if (!retention?.ok || !points.length || !canvas) {
        if (note) note.textContent = retention?.message || "시청 유지 곡선 없음";
        return;
      }
      if (note) note.textContent = "해당 영상 시청 유지 곡선 (28일)";
      videoModalRetentionChart = new Chart(canvas, {
        type: "line",
        data: {
          labels: points.map((point) => `${Math.round(point.ratio * 100)}%`),
          datasets: [
            {
              label: "시청 유지",
              data: points.map((point) => (point.watchRatio || 0) * 100),
              borderColor: "#2563eb",
              backgroundColor: "rgba(37,99,235,0.12)",
              fill: true,
              tension: 0.3,
              pointRadius: 0,
              borderWidth: 2,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { ticks: { maxTicksLimit: 6 } },
            y: {
              min: 0,
              max: isShortsVideo(video) ? 200 : 100,
              ticks: { callback: (value) => `${value}%` },
            },
          },
        },
      });
    } catch (err) {
      if (note) note.textContent = err.message || "분석 데이터 조회 실패";
      ["modal-traffic", "modal-funnel", "modal-search", "modal-audience", "modal-devices", "modal-age", "modal-gender"].forEach(
        (id) => {
          const el = document.getElementById(id);
          if (el) el.textContent = err.message || "조회 실패";
        }
      );
    }
  }

  function filteredReportVideos() {
    return (allReportVideos || []).filter((video) => {
      if (videoFormatFilter === "shorts") return isShortsVideo(video);
      if (videoFormatFilter === "longform") return !isShortsVideo(video);
      return true;
    });
  }

  function renderContentPagination(total, page) {
    const pages = Math.max(1, Math.ceil(total / VIDEO_PAGE_SIZE));
    renderPageControls(els.contentPagination, page, pages, (next) => {
      videoPage = next;
      renderVideos();
    });
  }

  function bindContentFormatTabs() {
    const tabs = document.getElementById("content-format-tabs");
    if (!tabs || tabs.dataset.bound) return;
    tabs.dataset.bound = "1";
    tabs.querySelectorAll(".content-format-tab").forEach((btn) => {
      btn.addEventListener("click", () => {
        videoFormatFilter = btn.dataset.format || "all";
        videoPage = 0;
        tabs.querySelectorAll(".content-format-tab").forEach((tabBtn) => {
          tabBtn.classList.toggle("active", tabBtn === btn);
        });
        renderVideos();
      });
    });
  }

  function renderVideos(videos) {
    if (videos) allReportVideos = videos;
    bindContentFormatTabs();
    const filtered = filteredReportVideos();
    if (!filtered.length) {
      els.videoGrid.innerHTML = `<p class="video-note">표시할 영상이 없습니다.</p>`;
      renderContentPagination(0, 0);
      return;
    }
    const pages = Math.max(1, Math.ceil(filtered.length / VIDEO_PAGE_SIZE));
    if (videoPage >= pages) videoPage = pages - 1;
    if (videoPage < 0) videoPage = 0;
    const visible = filtered.slice(videoPage * VIDEO_PAGE_SIZE, (videoPage + 1) * VIDEO_PAGE_SIZE);

    els.videoGrid.innerHTML = visible
      .map((v) => {
        const date = v.publishedAt ? new Date(v.publishedAt).toLocaleDateString("ko-KR") : "—";
        const shortBadge = isShortsVideo(v) ? '<span class="badge active">쇼츠</span>' : "";
        return `
        <article class="video-card" data-video-id="${esc(v.id)}">
          <img class="video-thumb" src="${esc(v.thumbnail)}" alt="" loading="lazy" role="button" tabindex="0" title="분석 보기" />
          <div class="video-body">
            <div class="video-title">${shortBadge}${esc(v.title)}</div>
            <div class="video-stats">
              <div><span>조회수</span><strong>${esc(v.viewsText || formatNum(v.views))}</strong></div>
              <div><span>길이</span><strong>${esc(v.durationText || "—")}</strong></div>
              <div><span>좋아요</span><strong>${formatNum(v.likes)}</strong></div>
              <div><span>게시</span><strong>${esc(date)}</strong></div>
            </div>
            <div class="video-links">
              <a class="icon-link-btn yt" href="${esc(v.url)}" target="_blank" rel="noopener" title="YouTube">YT</a>
              ${
                v.studioUrl
                  ? `<a class="icon-link-btn studio" href="${esc(v.studioUrl)}" target="_blank" rel="noopener" title="Studio 분석">S</a>`
                  : ""
              }
            </div>
          </div>
        </article>`;
      })
      .join("");

    renderContentPagination(filtered.length, videoPage);

    els.videoGrid.querySelectorAll(".video-card").forEach((card) => {
      const videoId = card.getAttribute("data-video-id");
      const video = allReportVideos.find((item) => item.id === videoId);
      if (!video) return;
      const open = () => openVideoAnalysisModal(video);
      card.querySelector(".video-thumb")?.addEventListener("click", open);
      card.querySelector(".video-thumb")?.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          open();
        }
      });
    });
  }

  async function loadEditors() {
    const promo = await apiGet("/api/dddit/youtube/report/promotions");
    const memo =
      promo.memo ||
      (Array.isArray(promo.issues) ? promo.issues.join("\n") : "") ||
      "";
    if (els.memoEditor) els.memoEditor.value = memo;
    if (els.issuesEditor) els.issuesEditor.value = memo;
  }

  async function saveEditors() {
    const memo = (els.memoEditor || els.issuesEditor)?.value || "";
    const current = await apiGet("/api/dddit/youtube/report/promotions", { timeoutMs: 15_000 });
    const promotions = Array.isArray(current.promotions) ? current.promotions : [];
    await apiPut("/api/dddit/youtube/report/promotions", { promotions, memo, issues: [] });
    els.saveStatus.textContent = "메모 저장됨";
    els.saveStatus.className = "status-pill ok";
  }

  async function loadReport(refresh, options = {}) {
    const quiet = Boolean(options.quiet);
    const seq = ++loadSeq;
    if (!quiet) {
      els.loading?.classList.add("hidden");
      els.root.classList.add("hidden");
      els.error?.classList.add("hidden");
      setPageLoading(true, refresh ? "데이터를 갱신하는 중…" : "보고 데이터를 불러오는 중…", "YouTube · Analytics · 프로모션");
      setStatus(refresh ? "API 요청 중…" : "불러오는 중…");
      stopSubscriberLivePoll();
      destroyCharts();
    } else {
      setStatus("백그라운드 갱신 중…");
    }

    try {
      const onStep = (step) => {
        setPageLoading(true, refresh ? "데이터를 갱신하는 중…" : "보고 데이터를 불러오는 중…", step);
        setStatus(step);
      };
      onStep("채널 개요 (YouTube Data API)");
      const overview = await apiGet(`/api/dddit/youtube/report/overview${refresh ? "?refresh=1" : ""}`);
      if (seq !== loadSeq) return;
      onStep("영상 목록 (YouTube Data API)");
      const videosData = await apiGet("/api/dddit/youtube/report/videos");
      if (seq !== loadSeq) return;
      const { traffic, retention, demographics } = await loadAnalyticsExtras(refresh, onStep);
      if (seq !== loadSeq) return;

      const ch = overview.channel || {};
      els.title.textContent = `${ch.title || "디디딧"} · 채널 현황 분석`;
      els.subtitle.textContent = `생성: ${new Date(overview.generatedAt).toLocaleString("ko-KR")} · ${ch.source || "api"}`;
      if (els.channelLink && ch.channelUrl) {
        els.channelLink.href = ch.channelUrl;
      }

      apiConnections = overview.apiConnections || [];
      renderKpis(overview.kpis || {}, overview.channel?.subscriberCount);
      renderAnalyticsOverview(overview.analytics);
      renderInsights(overview.insights || []);
      promoPage = 0;
      videoPage = 0;
      renderPromotions(overview.promotions || []);
      renderVideos(videosData.videos || []);

      await loadEditors();
      if (seq !== loadSeq) return;

      // Chart.js needs visible parent to measure canvas size.
      els.loading?.classList.add("hidden");
      els.root.classList.remove("hidden");
      setPageLoading(false);
      hideError();

      destroyCharts();
      applyChartTheme();
      chartSnapshot = {
        traffic,
        retention,
        demographics,
        recentVideosBar: overview.recentVideosBar || [],
        viewsTrend7d: overview.viewsTrend7d || [],
        viewsTrendNote: overview.viewsTrendNote,
        subscriberTrend: overview.subscriberTrend,
        videos: videosData.videos || [],
      };
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
        els.loading?.classList.add("hidden");
        setPageLoading(false);
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

  function openEfficiencyModal() {
    const modal = document.getElementById("efficiency-criteria-modal");
    if (modal) modal.hidden = false;
  }
  function closeEfficiencyModal() {
    const modal = document.getElementById("efficiency-criteria-modal");
    if (modal) modal.hidden = true;
  }
  function openBlockHelpModal(key) {
    const modal = document.getElementById("block-help-modal");
    const title = document.getElementById("block-help-title");
    const body = document.getElementById("block-help-body");
    if (!modal || !body) return;
    title.textContent = "지표 설명";
    body.textContent = BLOCK_HELP[key] || "설명이 준비되지 않았습니다.";
    modal.hidden = false;
  }

  function closeBlockHelpModal() {
    const modal = document.getElementById("block-help-modal");
    if (modal) modal.hidden = true;
  }

  function openApiInfoModal() {
    const modal = document.getElementById("api-info-modal");
    const list = document.getElementById("api-info-list");
    if (!modal || !list) return;
    list.innerHTML = (apiConnections || [])
      .map((item) => `<li><strong>${esc(item.name)}</strong> — ${esc(item.status)}</li>`)
      .join("") || "<li>연동 정보 없음</li>";
    modal.hidden = false;
  }

  function closeApiInfoModal() {
    const modal = document.getElementById("api-info-modal");
    if (modal) modal.hidden = true;
  }

  document.getElementById("btn-efficiency-help-th")?.addEventListener("click", openEfficiencyModal);
  document.querySelectorAll("[data-close-efficiency-modal]").forEach((el) => {
    el.addEventListener("click", closeEfficiencyModal);
  });
  document.querySelectorAll("[data-block-help]").forEach((btn) => {
    btn.addEventListener("click", () => openBlockHelpModal(btn.getAttribute("data-block-help")));
  });
  document.querySelectorAll("[data-close-block-help]").forEach((el) => {
    el.addEventListener("click", closeBlockHelpModal);
  });
  document.getElementById("btn-api-info")?.addEventListener("click", openApiInfoModal);
  document.querySelectorAll("[data-close-api-info]").forEach((el) => {
    el.addEventListener("click", closeApiInfoModal);
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

  document.querySelectorAll("[data-close-video-modal]").forEach((el) => {
    el.addEventListener("click", () => closeVideoAnalysisModal());
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeVideoAnalysisModal();
      closeEfficiencyModal();
      closeBlockHelpModal();
      closeApiInfoModal();
    }
  });
  document.addEventListener("dddit-theme", () => {
    redrawChartsFromSnapshot();
  });

  applyChartTheme();
  void bootReport();
})();
