/**
 * works.mansejin.com → NAS works-api 프록시 (Gemini · 시트 비밀 서버 보관)
 */
window.DdditWorksApi = (function () {
  const HOSTED = /^works\.mansejin\.com$/i.test(location.hostname);
  const BASE = "https://works-api.mansejin.com";

  let configCache = null;
  let configPromise = null;

  function isLocalDevBackend() {
    const host = location.hostname;
    if (!/^localhost$|^127\.0\.0\.1$/i.test(host)) return false;
    return new URLSearchParams(location.search).get("api") !== "direct";
  }

  function isBackendMode() {
    return HOSTED || isLocalDevBackend();
  }

  function baseUrl() {
    return BASE;
  }

  async function loadConfig(force) {
    if (!isBackendMode()) return null;
    if (configCache && !force) return configCache;
    if (configPromise && !force) return configPromise;

    configPromise = fetch(`${BASE}/api/dddit/config`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`works-api ${res.status}`);
        const data = await res.json();
        configCache = data;
        return data;
      })
      .catch((err) => {
        configPromise = null;
        throw err;
      });

    return configPromise;
  }

  function isApiReady(localApiKey) {
    if (!isBackendMode()) return Boolean(String(localApiKey || "").trim());
    return Boolean(configCache?.ok);
  }

  function geminiUrl(model) {
    if (isBackendMode()) {
      return `${BASE}/api/dddit/gemini/v1beta/models/${encodeURIComponent(model)}:generateContent`;
    }
    return null;
  }

  async function postGemini(model, body, apiKey, options = {}) {
    const url = isBackendMode()
      ? geminiUrl(model)
      : `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey || "")}`;

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: options.signal,
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      let msg = errBody?.detail || errBody?.error?.message || errBody?.message || `API 오류 (${res.status})`;
      if (Array.isArray(msg)) {
        msg = msg
          .map((x) => (typeof x === "string" ? x : x?.msg || JSON.stringify(x)))
          .join("; ");
      } else if (msg && typeof msg === "object") {
        msg = msg.message || JSON.stringify(msg);
      }
      const e = new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
      e.apiStatus = res.status;
      e.apiModel = model;
      e.apiBody = errBody;
      throw e;
    }

    return res.json();
  }

  function sheetOpenUrl() {
    return configCache?.sheetOpenUrl || "";
  }

  return {
    isBackendMode,
    baseUrl,
    loadConfig,
    isApiReady,
    geminiUrl,
    postGemini,
    sheetOpenUrl,
    get config() {
      return configCache;
    },
  };
})();
