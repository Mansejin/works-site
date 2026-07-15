/**
 * Brand productlist ↔ works-api persistence
 * Pages seed is fallback only; server JSON survives deploys.
 */
(function (global) {
  "use strict";

  const IS_WEB_HOSTED =
    location.protocol === "https:" && /^works\.mansejin\.com$/i.test(location.hostname);
  const API_BASE = IS_WEB_HOSTED ? "https://works-api.mansejin.com" : "http://localhost:8788";

  function authHeaders(extra) {
    if (global.DdditApiAuth?.authHeaders) {
      return global.DdditApiAuth.authHeaders(extra || {});
    }
    return Object.assign({}, extra || {});
  }

  function hasContent(rows) {
    return (rows || []).some(
      (row) => String(row?.name || "").trim() || String(row?.link || "").trim()
    );
  }

  async function load(project) {
    const res = await fetch(
      `${API_BASE}/api/dddit/productlist?project=${encodeURIComponent(project)}`,
      { headers: authHeaders() }
    );
    if (!res.ok) {
      throw new Error(`productlist load HTTP ${res.status}`);
    }
    const data = await res.json();
    if (!Array.isArray(data.rows)) return null;
    return {
      rows: data.rows,
      updatedAt: data.updatedAt || 0,
    };
  }

  async function save(project, rows) {
    const res = await fetch(`${API_BASE}/api/dddit/productlist`, {
      method: "PUT",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        project,
        rows,
        updatedAt: Date.now(),
      }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.detail || `productlist save HTTP ${res.status}`);
    }
    return res.json();
  }

  global.DdditProductlistSync = {
    isHosted: IS_WEB_HOSTED,
    hasContent,
    load,
    save,
  };
})(window);
