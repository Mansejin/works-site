/**
 * works.mansejin.com 팀 게이트
 * - Access로 막힌 페이지: CF 로그인만으로 통과 (팀 비번 생략, Access JWT → API 토큰 교환)
 * - Access Bypass인 /project/* 하위: 팀 비밀번호만 → /gate.html
 * - 브랜드 공유 plan/conti/productlist: 공개
 */
(function () {
  "use strict";

  const TOKEN_KEY = "works/dddit/team-gate-token";
  const BYPASS_KEY = "works/dddit/team-gate-bypass";
  const INTERNAL_DDDIT_TOP = new Set([
    "script",
    "conti",
    "report",
    "productlist",
    "js",
    "_template",
    "docs",
    "scripts",
    "gate.html",
  ]);
  const BRAND_SHARE_SECTIONS = new Set(["productlist", "plan", "conti"]);
  const PUBLIC_BRANDS = new Set(["xenics", "vendict", "inic", "galaxy"]);

  const IS_PROD =
    location.protocol === "https:" && /^works\.mansejin\.com$/i.test(location.hostname);

  const API_BASE = IS_PROD ? "https://works-api.mansejin.com" : "http://localhost:8788";

  function gateUrl() {
    const returnTo = location.pathname + location.search + location.hash;
    return `/gate.html?return=${encodeURIComponent(returnTo)}`;
  }

  function isGatePage() {
    return /(?:^|\/)gate\.html$/i.test(location.pathname);
  }

  /** /project 허브는 Access, /project/하위는 Access Bypass → 팀 비번만 */
  function isProjectChildPath() {
    const path = location.pathname.replace(/\/+$/, "") || "/";
    return /^\/project\/.+/i.test(path);
  }

  /** 브랜드 공유 페이지만 공개 (Access Bypass와 맞춤). */
  function isPublicBrandSharePath() {
    const path = location.pathname.replace(/\/+$/, "") || "/";
    const shareTool = path.match(/^\/dddit\/([^/]+)\/([^/]+)(?:\/.*)?$/);
    if (!shareTool) return false;
    const brand = shareTool[1];
    const section = shareTool[2];
    if (INTERNAL_DDDIT_TOP.has(brand)) return false;
    if (!PUBLIC_BRANDS.has(brand)) return false;
    return BRAND_SHARE_SECTIONS.has(section);
  }

  function revealPage() {
    document.documentElement.classList.remove("team-gate-pending");
  }

  function blockPage() {
    document.documentElement.classList.add("team-gate-pending");
  }

  function readCfAccessJwt() {
    try {
      const parts = document.cookie.split(";");
      for (const part of parts) {
        const [k, ...rest] = part.trim().split("=");
        if (k === "CF_Authorization") {
          return decodeURIComponent(rest.join("=") || "");
        }
      }
    } catch {
      /* ignore */
    }
    return "";
  }

  async function fetchGateStatus() {
    const res = await fetch(`${API_BASE}/api/dddit/team-gate/status`);
    if (!res.ok) {
      throw new Error(`team-gate status HTTP ${res.status}`);
    }
    return res.json();
  }

  async function verifyToken(token) {
    const res = await fetch(`${API_BASE}/api/dddit/team-gate/verify`, {
      headers: { "X-Dddit-Team-Token": token },
    });
    if (!res.ok) return false;
    const data = await res.json();
    return !!data.ok;
  }

  async function exchangeAccessJwt() {
    const accessJwt = readCfAccessJwt();
    if (!accessJwt) return null;
    const res = await fetch(`${API_BASE}/api/dddit/team-gate/access-login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accessJwt }),
    });
    if (!res.ok) return null;
    const data = await res.json().catch(() => ({}));
    if (data.token) {
      try {
        sessionStorage.setItem(TOKEN_KEY, data.token);
        sessionStorage.removeItem(BYPASS_KEY);
      } catch {
        /* ignore */
      }
      return data.token;
    }
    return null;
  }

  async function hasAccessIdentity() {
    try {
      const res = await fetch("/cdn-cgi/access/get-identity", {
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      });
      if (!res.ok) return false;
      const data = await res.json().catch(() => ({}));
      return !!(data && (data.email || data.user_uuid));
    } catch {
      return false;
    }
  }

  async function bootProtectedPage() {
    if (!IS_PROD || isGatePage() || isPublicBrandSharePath()) return;

    blockPage();
    try {
      const status = await fetchGateStatus();
      if (!status.enabled) {
        try {
          sessionStorage.setItem(BYPASS_KEY, "1");
        } catch {
          /* ignore */
        }
        revealPage();
        return;
      }
      try {
        sessionStorage.removeItem(BYPASS_KEY);
      } catch {
        /* ignore */
      }

      let token = sessionStorage.getItem(TOKEN_KEY);
      if (token && (await verifyToken(token))) {
        revealPage();
        return;
      }

      // Access로 이미 로그인한 경우 → 팀 비번 생략, API 토큰 교환
      // (/project/* 하위는 Access Bypass라 여기 안 탐 → 비번 게이트로)
      if (!isProjectChildPath()) {
        const accessOk = await hasAccessIdentity();
        if (accessOk) {
          token = await exchangeAccessJwt();
          if (token) {
            revealPage();
            return;
          }
        }
      }

      sessionStorage.removeItem(TOKEN_KEY);
      location.replace(gateUrl());
    } catch {
      location.replace(gateUrl());
    }
  }

  bootProtectedPage();
})();
