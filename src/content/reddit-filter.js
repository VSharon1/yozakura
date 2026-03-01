/**
 * reddit-filter.js — Yozakura content script for reddit.com
 *
 * Injects CSS to hide selected Reddit UI elements based on redditFilter
 * settings. Targets Reddit's web-component elements (shreddit-* tags).
 * Reacts to storage changes immediately without requiring a page reload.
 */

const STYLE_ID = "yozakura-reddit";

const CSS_RULES = {
  hideFeed:     "shreddit-post { display: none !important; }",
  hidePromoted: "shreddit-ad-post { display: none !important; }",
  hideNsfw:     "shreddit-post[nsfw] { display: none !important; }",
  hideAwards:   "shreddit-award-button { display: none !important; }",
};

const DEFAULT_RF = { hideFeed: false, hidePromoted: false, hideNsfw: false, hideAwards: false };

function buildCSS(rf) {
  return Object.entries(CSS_RULES)
    .filter(([key]) => rf[key])
    .map(([, rule]) => rule)
    .join("\n");
}

function applyFilters(rf) {
  let el = document.getElementById(STYLE_ID);
  if (!el) {
    el = document.createElement("style");
    el.id = STYLE_ID;
    document.head.appendChild(el);
  }
  el.textContent = buildCSS(rf);
}

chrome.storage.local.get(null, (data) => {
  const rf = Object.assign({}, DEFAULT_RF, data.settings?.redditFilter ?? {});
  applyFilters(rf);
});

chrome.storage.onChanged.addListener((changes) => {
  if (!changes.settings) return;
  const rf = Object.assign({}, DEFAULT_RF, changes.settings.newValue?.redditFilter ?? {});
  applyFilters(rf);
});
