/**
 * linkedin-filter.js — Yozakura content script for linkedin.com
 *
 * Injects CSS to hide selected LinkedIn UI elements based on linkedinFilter
 * settings. Reacts to storage changes immediately without requiring a page reload.
 *
 * Selectors confirmed from multiple open-source LinkedIn feed-blocker extensions.
 */

const STYLE_ID = "yozakura-linkedin";

const CSS_RULES = {
  hideFeed:    ".occludable-update, [data-chameleon-result-urn*='update'], div[data-id*='urn:li:activity'] { display: none !important; }",
  hidePymk:    ".pymk-carousel, .people-you-may-know { display: none !important; }",
  hideNews:    ".feed-shared-news-module { display: none !important; }",
  hidePromoted:".ad-banner-container, .promotional-card, [data-test-id*='sponsored'] { display: none !important; }",
};

const DEFAULT_LF = { hideFeed: false, hidePymk: false, hideNews: false, hidePromoted: false };

function buildCSS(lf) {
  return Object.entries(CSS_RULES)
    .filter(([key]) => lf[key])
    .map(([, rule]) => rule)
    .join("\n");
}

function applyFilters(lf) {
  let el = document.getElementById(STYLE_ID);
  if (!el) {
    el = document.createElement("style");
    el.id = STYLE_ID;
    document.head.appendChild(el);
  }
  el.textContent = buildCSS(lf);
}

chrome.storage.local.get(null, (data) => {
  const lf = Object.assign({}, DEFAULT_LF, data.settings?.linkedinFilter ?? {});
  applyFilters(lf);
});

chrome.storage.onChanged.addListener((changes) => {
  if (!changes.settings) return;
  const lf = Object.assign({}, DEFAULT_LF, changes.settings.newValue?.linkedinFilter ?? {});
  applyFilters(lf);
});
