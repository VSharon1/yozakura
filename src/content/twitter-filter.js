/**
 * twitter-filter.js — Yozakura content script for twitter.com / x.com
 *
 * Injects CSS to hide selected Twitter/X UI elements based on twitterFilter
 * settings. Reacts to storage changes immediately without requiring a page reload.
 */

const STYLE_ID = "yozakura-twitter";

const CSS_RULES = {
  hideFeed:       "[data-testid=\"primaryColumn\"] [data-testid=\"cellInnerDiv\"] { display: none !important; }",
  hideTrending:   "[data-testid=\"trend\"] { display: none !important; }",
  hideWhoToFollow:"[data-testid=\"sidebarColumn\"] [data-testid=\"UserCell\"] { display: none !important; }",
  hideNotifBadge: "[data-testid=\"icon-badge-count\"] { display: none !important; }",
};

const DEFAULT_TF = { hideFeed: false, hideTrending: false, hideWhoToFollow: false, hideNotifBadge: false };

function buildCSS(tf) {
  return Object.entries(CSS_RULES)
    .filter(([key]) => tf[key])
    .map(([, rule]) => rule)
    .join("\n");
}

function applyFilters(tf) {
  let el = document.getElementById(STYLE_ID);
  if (!el) {
    el = document.createElement("style");
    el.id = STYLE_ID;
    document.head.appendChild(el);
  }
  el.textContent = buildCSS(tf);
}

chrome.storage.local.get(null, (data) => {
  const tf = Object.assign({}, DEFAULT_TF, data.settings?.twitterFilter ?? {});
  applyFilters(tf);
});

chrome.storage.onChanged.addListener((changes) => {
  if (!changes.settings) return;
  const tf = Object.assign({}, DEFAULT_TF, changes.settings.newValue?.twitterFilter ?? {});
  applyFilters(tf);
});
