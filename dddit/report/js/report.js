(function () {
  const IS_WEB_HOSTED =
    location.protocol === "https:" && /^works\.mansejin\.com$/i.test(location.hostname);
  const API_BASE = IS_WEB_HOSTED ? "https://works-api.mansejin.com" : "http://localhost:8788";
  const REFRESH_CACHE_KEY = "works/dddit/report/lastApiRefresh";
  const REFRESH_TTL_MS = 24 * 60 * 60 * 1000;
  const SUBSCRIBER_POLL_MS = 90_000;

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
    analyticsBanner: document.getElementById("analytics-banner"),
    analyticsKpiGrid: document.getElementById("analytics-kpi-grid"),
    analyticsStatus: document.getElementById("analytics-status"),
    adsSyncStatus: document.getElementById("ads-sync-status"),
    issuesEditor: document.getElementById("issues-editor"),
    promotionsEditor: document.getElementById("promotions-editor"),
    snapshotsEditor: document.getElementById("snapshots-editor"),
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
  }

  async function apiPost(path) {
    const res = await fetch(`${API_BASE}${path}`, { method: "POST" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.detail || body.message || `HTTP ${res.status}`);
    }
    return res.json();
  }

  async function apiGet(path, options = {}) {
    const res = await fetch(`${API_BASE}${path}`, options);
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
    if (!ctx || !rows?.length) return;
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
    if (els.subscriberNote && trend.note) {
      els.subscriberNote.textContent = `${trend.note} 구독자 수 KPI는 90초마다 YouTube API로 갱신됩니다 (완전 실시간 아님).`;
    } else if (els.subscriberNote) {
      els.subscriberNote.textContent =
        "구독자 수 KPI는 90초마다 YouTube API로 갱신됩니다 (완전 실시간 아님).";
    }
  }

  function renderInsights(items) {
    els.insights.innerHTML = (items || [])
      .map((line) => `<li>${esc(line)}</li>`)
      .join("");
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

  function retentionVideoTitle(videos, videoId) {
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
        charts.retention.destroy();
        charts.retention = null;
      }
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

    if (charts.retention) {
      charts.retention.destroy();
      charts.retention = null;
    }

    if (series.length) {
      const labels = series[0].points.map((point) => `${Math.round(point.ratio * 100)}%`);
      if (labelEl) {
        labelEl.textContent =
          series.length === 1
            ? `시청 유지 (${formatLabel}) — ${retentionVideoTitle(videos, series[0].videoId)}`
            : `시청 유지 (${formatLabel}) — 조회 상위 ${series.length}개`;
      }
      charts.retention = new Chart(ctx, {
        type: "line",
        data: {
          labels,
          datasets: series.map((item, index) => ({
            label: retentionVideoTitle(videos, item.videoId),
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
              max: 100,
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
          ? `시청 유지 (${formatLabel}) — ${retentionVideoTitle(videos, data.videoId)}`
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
            y: { min: 0, max: 100, ticks: { callback: (value) => `${value}%` } },
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

  function renderDemographicsCharts(data) {
    const ageCtx = document.getElementById("chart-age");
    const genderCtx = document.getElementById("chart-gender");
    const ages = data?.ageGroups || [];
    const genders = data?.gender || [];

    if (ageCtx && ages.length) {
      charts.age = new Chart(ageCtx, {
        type: "bar",
        data: {
          labels: ages.map((a) => a.ageGroup),
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
    }

    if (genderCtx && genders.length) {
      charts.gender = new Chart(genderCtx, {
        type: "pie",
        data: {
          labels: genders.map((g) => GENDER_LABELS[g.gender] || g.gender),
          datasets: [
            {
              data: genders.map((g) => g.viewerPercentage),
              backgroundColor: ["#ec4899", "#3b82f6", "#94a3b8"],
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { position: "bottom" } },
        },
      });
    }
  }

  function renderAdsSyncStatus(adsSync) {
    if (!els.adsSyncStatus || !adsSync) return;
    if (!adsSync.configured) {
      els.adsSyncStatus.textContent = "Ads 미설정";
      return;
    }
    const when = adsSync.lastSync
      ? new Date(adsSync.lastSync).toLocaleString("ko-KR")
      : "미동기화";
    els.adsSyncStatus.textContent = `Ads · ${when}`;
    els.adsSyncStatus.className = `status-pill ${adsSync.lastSync ? "ok" : ""}`;
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
    els.saveStatus.textContent = "저장됨 · 데이터 갱신 권장";
    els.saveStatus.className = "status-pill ok";
  }

  async function loadReport(refresh) {
    els.loading.classList.remove("hidden");
    els.root.classList.add("hidden");
    els.error?.classList.add("hidden");
    setStatus("불러오는 중…");
    stopSubscriberLivePoll();
    destroyCharts();

    try {
      const overview = await apiGet(`/api/dddit/youtube/report/overview${refresh ? "?refresh=1" : ""}`);
      const videosData = await apiGet(`/api/dddit/youtube/report/videos${refresh ? "?refresh=1" : ""}`);
      const { traffic, retention, demographics } = await loadAnalyticsExtras(refresh);

      if (overview.adsSync?.configured && refresh) {
        apiPost("/api/dddit/youtube/report/ads/sync?force=1").catch(() => null);
      }

      const ch = overview.channel || {};
      els.title.textContent = `${ch.title || "디디딧"} · 채널 현황 분석`;
      els.subtitle.textContent = `생성: ${new Date(overview.generatedAt).toLocaleString("ko-KR")} · ${ch.source || "api"}`;
      if (els.channelLink && ch.channelUrl) {
        els.channelLink.href = ch.channelUrl;
      }

      renderKpis(overview.kpis || {}, overview.channel?.subscriberCount);
      renderAnalyticsOverview(overview.analytics);
      renderTrafficChart(traffic);
      bindRetentionTabs(retention, videosData.videos || []);
      renderRetentionChart(retention, videosData.videos || [], activeRetentionFormat);
      renderDemographicsCharts(demographics);
      renderAdsSyncStatus(overview.adsSync);
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
      if (refresh) {
        markApiRefreshed();
        setStatus("API 갱신됨", "ok");
      } else {
        setStatus(cacheStatusText(), "");
      }
    } catch (err) {
      els.loading.classList.add("hidden");
      showError(err.message || String(err));
    }
  }

  document.getElementById("btn-refresh")?.addEventListener("click", () => {
    setStatus("API 요청 중…");
    loadReport(true);
  });
  document.getElementById("btn-ads-sync")?.addEventListener("click", async () => {
    try {
      setStatus("Ads 동기화 중…");
      await apiPost("/api/dddit/youtube/report/ads/sync?force=1");
      await loadReport(true);
    } catch (err) {
      showError(err.message || "Ads 동기화 실패");
    }
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

  loadReport(shouldAutoRefresh());
})();
