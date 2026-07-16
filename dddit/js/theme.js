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
    const dark = theme === "dark";
    document.querySelectorAll("[data-theme-toggle]").forEach((root) => {
      root.setAttribute("aria-pressed", dark ? "true" : "false");
      root.setAttribute("aria-label", dark ? "라이트 모드로 전환" : "다크 모드로 전환");
      root.title = dark ? "라이트 모드" : "다크 모드";
      const input = root.querySelector("[data-theme-input]");
      if (input) input.checked = dark;
      const label = root.querySelector("[data-theme-label]");
      if (label) label.textContent = dark ? "라이트" : "다크";
      const icon = root.querySelector("[data-theme-icon]");
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
    const root = event.target.closest("[data-theme-toggle]");
    if (!root) return;
    if (event.target.closest("[data-theme-input]")) return;
    event.preventDefault();
    toggle();
  });

  document.addEventListener("change", (event) => {
    const input = event.target.closest("[data-theme-input]");
    if (!input) return;
    apply(input.checked ? "dark" : "light");
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => apply(current()));
  } else {
    apply(current());
  }
})();
