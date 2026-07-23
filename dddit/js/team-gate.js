/**
 * works.mansejin.com 팀 게이트
 * 보호: `/`, `/logitechG`, `/project`, `/api`, `/script`, `/dddit` 내부 등
 * 공개: 브랜드 공유(xenics/vendict/inic/galaxy 홈·plan/conti/productlist)
 * NAS DDDIT_TEAM_GATE_PASSCODE 설정 시에만 활성화.
 * 상태 조회 실패 시 실패-폐쇄(로그인 화면으로 이동).
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
    return `/dddit/gate.html?return=${encodeURIComponent(returnTo)}`;
  }

  function isGatePage() {
    return /\/dddit\/gate\.html$/i.test(location.pathname);
  }

  /** 브랜드 공유 페이지만 공개 (Access Bypass와 맞춤). storyboard 등은 게이트 유지. */
  function isPublicBrandSharePath() {
    const path = location.pathname.replace(/\/+$/, "") || "/";

    // /dddit/{brand} — 브랜드 홈
    const brandRoot = path.match(/^\/dddit\/([^/]+)$/);
    if (brandRoot) {
      const brand = brandRoot[1];
      if (INTERNAL_DDDIT_TOP.has(brand)) return false;
      return PUBLIC_BRANDS.has(brand);
    }

    // /dddit/{brand}/(productlist|plan|conti)[/...]
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

  async function bootProtectedPage() {
    if (!IS_PROD || isGatePage() || isPublicBrandSharePath()) return;
    if (sessionStorage.getItem(BYPASS_KEY) === "1") return;

    blockPage();
    try {
      const status = await fetchGateStatus();
      if (!status.enabled) {
        revealPage();
        return;
      }

      const token = sessionStorage.getItem(TOKEN_KEY);
      if (!token) {
        location.replace(gateUrl());
        return;
      }

      const ok = await verifyToken(token);
      if (!ok) {
        sessionStorage.removeItem(TOKEN_KEY);
        location.replace(gateUrl());
        return;
      }
      revealPage();
    } catch {
      // Fail closed — do not reveal internal pages when status/API is unreachable.
      location.replace(gateUrl());
    }
  }

  bootProtectedPage();
})();
