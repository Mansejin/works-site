/**
 * Shared works-api auth headers for dddit clients.
 * Token is issued by /dddit/gate.html → sessionStorage.
 */
(function (global) {
  "use strict";

  const TOKEN_KEY = "works/dddit/team-gate-token";
  const BYPASS_KEY = "works/dddit/team-gate-bypass";

  function getTeamToken() {
    try {
      return sessionStorage.getItem(TOKEN_KEY) || "";
    } catch {
      return "";
    }
  }

  function authHeaders(extra) {
    const headers = Object.assign({}, extra || {});
    const token = getTeamToken();
    if (token) headers["X-Dddit-Team-Token"] = token;
    return headers;
  }

  function handleUnauthorized(res) {
    if (!res || res.status !== 401) return false;
    try {
      sessionStorage.removeItem(TOKEN_KEY);
      sessionStorage.removeItem(BYPASS_KEY);
    } catch {
      /* ignore */
    }
    if (/^works\.mansejin\.com$/i.test(location.hostname)) {
      const returnTo = location.pathname + location.search + location.hash;
      if (!/\/dddit\/gate\.html$/i.test(location.pathname)) {
        location.replace(`/dddit/gate.html?return=${encodeURIComponent(returnTo)}`);
      }
    }
    return true;
  }

  global.DdditApiAuth = {
    TOKEN_KEY,
    BYPASS_KEY,
    getTeamToken,
    authHeaders,
    handleUnauthorized,
  };
})(window);
