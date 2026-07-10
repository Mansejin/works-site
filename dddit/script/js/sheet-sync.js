/**
 * 디디딧 콘티 ↔ Google 시트
 * works.mansejin.com 에서는 NAS works-api 경유
 */
window.DdditSheetSync = (function () {
  const HEADERS = ["대본", "장면", "사이즈", "자막", "코멘트"];

  const PROJECT_TABS = {
    xenics: "Xenics",
    default: "콘티",
  };

  function normalizeApiUrl(url) {
    return String(url || "").trim().replace(/\/$/, "");
  }

  function projectSlug() {
    return new URLSearchParams(location.search).get("project") || "default";
  }

  function tabLabel(project) {
    return PROJECT_TABS[project] || project;
  }

  function useBackend() {
    return window.DdditWorksApi?.isBackendMode?.() === true;
  }

  function backendBase() {
    return window.DdditWorksApi.baseUrl();
  }

  function buildUrl(base, params) {
    const u = new URL(base);
    Object.entries(params).forEach(([k, v]) => {
      if (v != null && v !== "") u.searchParams.set(k, v);
    });
    return u.toString();
  }

  async function directRequest(config, method, params, body) {
    const base = normalizeApiUrl(config.apiUrl);
    const token = String(config.token || "").trim();
    if (!base || !token) {
      throw new Error("시트 API URL과 토큰을 API 설정에서 입력해 주세요.");
    }

    const url = method === "GET" ? buildUrl(base, { ...params, token }) : base;

    const res = await fetch(url, {
      method,
      headers: method === "POST" ? { "Content-Type": "text/plain;charset=utf-8" } : undefined,
      body:
        method === "POST"
          ? JSON.stringify({ ...body, token, action: params.action })
          : undefined,
    });

    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error("시트 API 응답을 읽을 수 없습니다.");
    }
    if (!res.ok || data.ok === false) {
      throw new Error(data.error || `시트 API 오류 (${res.status})`);
    }
    return data;
  }

  async function backendRequest(method, path, params, body) {
    const base = `${backendBase()}/api/dddit/sheet`;
    let url = `${base}${path}`;
    if (method === "GET" && params) {
      url = buildUrl(url, params);
    }

    const res = await fetch(url, {
      method,
      headers: method === "POST" ? { "Content-Type": "application/json" } : undefined,
      body: method === "POST" ? JSON.stringify(body || {}) : undefined,
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const detail = data.detail || data.error || `works-api 오류 (${res.status})`;
      throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
    }
    return data;
  }

  async function request(config, method, action, extraParams, body) {
    if (useBackend()) {
      if (action === "meta") return backendRequest("GET", "/meta");
      if (action === "get") {
        return backendRequest("GET", "/get", { project: extraParams.project });
      }
      if (action === "replace") {
        return backendRequest("POST", "/replace", null, {
          project: body.project,
          rows: body.rows,
        });
      }
      if (action === "append") {
        return backendRequest("POST", "/append", null, {
          project: body.project,
          rows: body.rows,
        });
      }
    }
    return directRequest(config, method, { action, ...extraParams }, body);
  }

  function rowsFromState(allRows) {
    return (allRows || []).map((r) => ({
      대본: r.대본 || "",
      장면: r.장면 || "",
      사이즈: r.사이즈 || "",
      자막: r.자막 || "",
      코멘트: r.코멘트 || "",
    }));
  }

  return {
    HEADERS,
    PROJECT_TABS,
    projectSlug,
    tabLabel,
    useBackend,

    async fetchMeta(config) {
      return request(config, "GET", "meta", {}, null);
    },

    async pull(config, project) {
      const slug = project || projectSlug();
      const data = await request(config, "GET", "get", { project: slug }, null);
      return { project: slug, tab: data.tab || tabLabel(slug), rows: data.rows || [] };
    },

    async pushReplace(config, allRows, project) {
      const slug = project || projectSlug();
      const rows = rowsFromState(allRows);
      const data = await request(
        config,
        "POST",
        "replace",
        {},
        { project: slug, rows }
      );
      return data;
    },

    async pushAppend(config, allRows, project) {
      const slug = project || projectSlug();
      const rows = rowsFromState(allRows);
      return request(config, "POST", "append", {}, { project: slug, rows });
    },
  };
})();
