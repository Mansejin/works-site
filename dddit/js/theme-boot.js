/**
 * Apply saved / system theme before first paint (sync, no defer).
 * Storage key: works/dddit/theme
 */
(function () {
  "use strict";
  try {
    var key = "works/dddit/theme";
    var theme = localStorage.getItem(key);
    if (theme !== "dark" && theme !== "light") {
      theme =
        window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light";
    }
    document.documentElement.setAttribute("data-theme", theme);
    document.documentElement.style.colorScheme = theme;
  } catch (e) {
    document.documentElement.setAttribute("data-theme", "light");
  }
})();
