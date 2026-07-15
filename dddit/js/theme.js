/**
 * Dddit light/dark theme toggle (shared across workspace pages).
 */
(function () {
  "use strict";

  const KEY = "works/dddit/theme";

  function current() {
    return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
  }

  function syncControls(theme) {
    document.querySelectorAll("[data-theme-toggle]").forEach((btn) => {
      const dark = theme === "dark";
      btn.setAttribute("aria-pressed", dark ? "true" : "false");
      btn.setAttribute("aria-label", dark ? "라이트 모드로 전환" : "다크 모드로 전환");
      btn.title = dark ? "라이트 모드" : "다크 모드";
      const label = btn.querySelector("[data-theme-label]");
      if (label) label.textContent = dark ? "라이트" : "다크";
      const icon = btn.querySelector("[data-theme-icon]");
      if (icon) icon.textContent = dark ? "☀" : "☾";
    });
  }

  function apply(theme) {
    const next = theme === "dark" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", next);
    document.documentElement.style.colorScheme = next;
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* ignore */
    }
    syncControls(next);
    document.dispatchEvent(new CustomEvent("dddit-theme", { detail: { theme: next } }));
  }

  function toggle() {
    apply(current() === "dark" ? "light" : "dark");
  }

  window.DdditTheme = { apply, toggle, current };

  document.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-theme-toggle]");
    if (!btn) return;
    event.preventDefault();
    toggle();
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => apply(current()));
  } else {
    apply(current());
  }
})();
