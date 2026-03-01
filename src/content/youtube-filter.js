/**
 * youtube-filter.js — Yozakura content script for youtube.com
 *
 * Injects CSS to hide selected YouTube UI elements based on youtubeFilter
 * settings. Reacts to storage changes immediately without requiring a page reload.
 */

const STYLE_ID = "yozakura-yt";

const CSS_RULES = {
  hideShorts:     "ytd-rich-shelf-renderer[is-shorts], ytd-reel-shelf-renderer { display: none !important; }",
  hideSidebar:    "#secondary { display: none !important; }",
  hideComments:   "ytd-comments#comments { display: none !important; }",
  hideThumbnails: "ytd-thumbnail { visibility: hidden !important; }",
};

const DEFAULT_YF = { hideShorts: false, hideSidebar: false, hideComments: false, hideThumbnails: false };

function buildCSS(yf) {
  return Object.entries(CSS_RULES)
    .filter(([key]) => yf[key])
    .map(([, rule]) => rule)
    .join("\n");
}

function applyFilters(yf) {
  let el = document.getElementById(STYLE_ID);
  if (!el) {
    el = document.createElement("style");
    el.id = STYLE_ID;
    document.head.appendChild(el);
  }
  el.textContent = buildCSS(yf);
}

chrome.storage.local.get(null, (data) => {
  const yf = Object.assign({}, DEFAULT_YF, data.settings?.youtubeFilter ?? {});
  applyFilters(yf);
});

chrome.storage.onChanged.addListener((changes) => {
  if (!changes.settings) return;
  const yf = Object.assign({}, DEFAULT_YF, changes.settings.newValue?.youtubeFilter ?? {});
  applyFilters(yf);
});
