/**
 * instagram-filter.js — Yozakura content script for instagram.com
 *
 * Injects CSS to hide selected Instagram UI elements based on instagramFilter
 * settings. Reacts to storage changes immediately without requiring a page reload.
 *
 * Selectors target stable href patterns and ARIA roles rather than obfuscated
 * class names, which Instagram rotates on every build.
 */

const STYLE_ID = "yozakura-instagram";

const CSS_RULES = {
  hideFeed:     "article { display: none !important; }",
  hideExplore:  "a[href*='/explore/'] { display: none !important; }",
  hideReels:    "a[href*='/reels/'] { display: none !important; }",
  hideSuggested:"a[href*='/explore/people/'] { display: none !important; }",
};

const DEFAULT_IF = { hideFeed: false, hideExplore: false, hideReels: false, hideSuggested: false };

function buildCSS(inf) {
  return Object.entries(CSS_RULES)
    .filter(([key]) => inf[key])
    .map(([, rule]) => rule)
    .join("\n");
}

function applyFilters(inf) {
  let el = document.getElementById(STYLE_ID);
  if (!el) {
    el = document.createElement("style");
    el.id = STYLE_ID;
    document.head.appendChild(el);
  }
  el.textContent = buildCSS(inf);
}

chrome.storage.local.get(null, (data) => {
  const inf = Object.assign({}, DEFAULT_IF, data.settings?.instagramFilter ?? {});
  applyFilters(inf);
});

chrome.storage.onChanged.addListener((changes) => {
  if (!changes.settings) return;
  const inf = Object.assign({}, DEFAULT_IF, changes.settings.newValue?.instagramFilter ?? {});
  applyFilters(inf);
});
