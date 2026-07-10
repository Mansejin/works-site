/**
 * NAS works-api 콘티 저장소 (프로젝트별 JSON)
 */
window.DdditContiApi = (function () {
  const HEADERS = ["대본", "장면", "사이즈", "자막", "코멘트"];
  const IS_WEB_HOSTED =
    location.protocol === "https:" && /^works\.mansejin\.com$/i.test(location.hostname);
  const API_BASE = IS_WEB_HOSTED ? "https://works-api.mansejin.com" : "http://localhost:8788";

  const BRAND_VIEW_PATHS = {
    xenics: "/dddit/xenics/conti/",
    vendict: "/dddit/vendict/conti/",
  };

  function baseUrl() {
    return API_BASE;
  }

  function emptyRow() {
    return { 대본: "", 장면: "", 사이즈: "", 자막: "", 코멘트: "" };
  }

  function normalizeRow(row) {
    const source = row && typeof row === "object" ? row : {};
    return {
      대본: String(source.대본 || source.script || "").trim(),
      장면: String(source.장면 || source.scene || "").trim(),
      사이즈: String(source.사이즈 || source.size || "").trim(),
      자막: String(source.자막 || source.caption || "").trim(),
      코멘트: String(source.코멘트 || source.note || "").trim(),
    };
  }

  function normalizeRows(rows) {
    return (rows || [])
      .map(normalizeRow)
      .filter((row) => HEADERS.some((key) => row[key]));
  }

  function shareUrl(project) {
    const slug = String(project || "").trim().toLowerCase();
    const brandPath = BRAND_VIEW_PATHS[slug];
    if (brandPath) {
      return `${location.origin}${brandPath}`;
    }
    return `${location.origin}/dddit/conti/view.html?project=${encodeURIComponent(slug)}`;
  }

  function collabWsUrl() {
    if (IS_WEB_HOSTED) {
      // Cloudflare Tunnel 서브도메인 (api/README.md 와 동일 방식)
      return "wss://conti-ws.mansejin.com";
    }
    return "ws://localhost:8789";
  }

  function collabRoom(project) {
    return `conti-${String(project || "").trim().toLowerCase()}`;
  }

  async function request(path, options) {
    const res = await fetch(`${API_BASE}${path}`, options);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const detail = body?.detail;
      const message =
        typeof detail === "string"
          ? detail
          : Array.isArray(detail)
            ? detail.map((item) => item.msg || item).join(", ")
            : `HTTP ${res.status}`;
      throw new Error(message);
    }
    return res.json();
  }

  async function listProjects() {
    const data = await request("/api/dddit/conti/projects");
    return data.projects || [];
  }

  async function load(project) {
    const data = await request(`/api/dddit/conti?project=${encodeURIComponent(project)}`);
    return {
      project: data.project,
      title: data.title || "",
      updatedAt: data.updatedAt || 0,
      rows: normalizeRows(data.rows),
    };
  }

  async function save(project, payload) {
    const data = await request("/api/dddit/conti", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        project,
        title: payload.title || "",
        rows: normalizeRows(payload.rows),
        updatedAt: payload.updatedAt,
      }),
    });
    return {
      project: data.project,
      title: data.title || "",
      updatedAt: data.updatedAt || 0,
      rows: normalizeRows(data.rows),
    };
  }

  return {
    HEADERS,
    IS_WEB_HOSTED,
    baseUrl,
    emptyRow,
    normalizeRow,
    normalizeRows,
    shareUrl,
    collabWsUrl,
    collabRoom,
    listProjects,
    load,
    save,
  };
})();
