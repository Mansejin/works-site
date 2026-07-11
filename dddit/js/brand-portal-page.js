/**
 * 브랜드 포털 외부 공유 격리
 * - plan / conti / productlist: 상위(프로젝트·워크스페이스) 링크 제거
 * - 브랜드 index: 워크스페이스 링크 제거 (팀은 ?team=1 또는 허브에서 진입)
 */
(function () {
  "use strict";

  const INTERNAL_TOP_DIRS = new Set([
    "script",
    "conti",
    "report",
    "productlist",
    "js",
    "_template",
    "docs",
    "scripts",
  ]);

  const params = new URLSearchParams(location.search);
  const teamMode = params.get("team") === "1";

  const segments = location.pathname.replace(/\/+$/, "").split("/").filter(Boolean);
  const ddditIdx = segments.indexOf("dddit");
  if (ddditIdx < 0) return;

  const slug = segments[ddditIdx + 1] || "";
  const section = segments[ddditIdx + 2] || "";
  if (!slug || INTERNAL_TOP_DIRS.has(slug)) return;

  const isSubpage = ["plan", "conti", "productlist"].includes(section);
  const isBrandIndex = segments.length === ddditIdx + 2;

  function isParentHref(href) {
    const value = String(href || "").trim();
    if (!value) return false;
    if (value === ".." || value === "../") return true;
    if (value.startsWith("../") && !value.startsWith("../js/")) return true;
    if (value.startsWith("../../") && !value.startsWith("../../js/")) return true;
    if (/^\/dddit\/?$/i.test(value)) return true;
    return false;
  }

  function stripEscapeLinks() {
    document.querySelectorAll(".hub-nav").forEach((el) => el.remove());
    document.querySelectorAll('a[href]').forEach((anchor) => {
      if (isParentHref(anchor.getAttribute("href"))) anchor.remove();
    });
  }

  if (isSubpage) {
    stripEscapeLinks();
    document.documentElement.classList.add("brand-external-view");
    return;
  }

  if (isBrandIndex && !teamMode) {
    stripEscapeLinks();
    document.documentElement.classList.add("brand-external-view");
  }
})();
