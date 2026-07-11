/**
 * 브랜드 포털(dddit/{slug}/) 규칙 — 광고주·협력사 공유용 페이지.
 *
 * 콘티 작성기(script/)는 내부 제작 도구이므로 브랜드 포털에 링크하지 않습니다.
 * 팀은 디디딧 워크스페이스 허브(dddit/) → 채널 도구 → 콘티 작성기로 접근합니다.
 */
(function (global) {
  /** 브랜드 index.html 에 허용되는 자료 링크 (상대 경로) */
  const ALLOWED_LINK_PREFIXES = ["plan/", "conti/", "productlist/"];

  /** 브랜드 포털 HTML 에 포함되면 안 되는 패턴 */
  const FORBIDDEN_PATTERNS = [
    /href=["'][^"']*\/script\//i,
    /href=["'][^"']*script\/\?project=/i,
    /콘티\s*작성기|시나리오\s*머신/i,
  ];

  /** dddit/ 직하위 중 브랜드 포털이 아닌 디렉터리 */
  const SKIP_BRAND_DIRS = new Set([
    "script",
    "conti",
    "report",
    "productlist",
    "js",
    "_template",
    "docs",
  ]);

  function isAllowedBrandLink(href) {
    const path = String(href || "").trim();
    if (!path || /^https?:\/\//i.test(path) || path.startsWith("../")) return false;
    return ALLOWED_LINK_PREFIXES.some((prefix) => path === prefix || path.startsWith(prefix));
  }

  function validateBrandPortalHtml(html) {
    const violations = [];
    for (const pattern of FORBIDDEN_PATTERNS) {
      if (pattern.test(html)) violations.push(String(pattern));
    }
    return violations;
  }

  global.DdditBrandPortal = {
    ALLOWED_LINK_PREFIXES,
    FORBIDDEN_PATTERNS,
    SKIP_BRAND_DIRS,
    isAllowedBrandLink,
    validateBrandPortalHtml,
  };
})(typeof window !== "undefined" ? window : globalThis);
