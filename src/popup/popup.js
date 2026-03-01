/**
 * popup.js — Yozakura extension popup
 *
 * Renders the popup UI, handles user interactions (add/remove site,
 * manual toggle, pomodoro/duration controls, language switch, PIN modal)
 * and communicates with the service worker via chrome.runtime.sendMessage.
 */

import { t, translations } from "../shared/i18n.js";

// ─── State ────────────────────────────────────────────────────────────────────

let lang = "en";          // Current UI language ("en" | "de")
let pendingRemoveDomain = null;  // Domain waiting for PIN confirmation
let timerInterval = null; // setInterval handle for mode badge countdown
let state = null;         // Latest state from GET_STATE (set in refresh())

// ─── Utility: message helper ──────────────────────────────────────────────────

function sendMsg(msg) {
  return chrome.runtime.sendMessage(msg);
}

// ─── Utility: PIN hashing ─────────────────────────────────────────────────────

async function hashPin(pin) {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(pin)
  );
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ─── i18n helpers ────────────────────────────────────────────────────────────

/** Shorthand for t() using the current lang. */
function tr(key) {
  return t(key, lang);
}

/** Update all data-i18n elements and set correct lang on <html>. */
function applyTranslations() {
  document.documentElement.lang = lang;
  document.getElementById("popup-title").textContent = tr("popup.title");
  document.getElementById("lang-toggle").textContent = tr("popup.langToggle");
  document.getElementById("add-input").placeholder = tr("popup.addPlaceholder");
  document.getElementById("add-btn").textContent = tr("popup.addButton");
  document.getElementById("sites-heading").textContent = tr("popup.blockedSites");
  document.getElementById("sites-empty").textContent = tr("popup.noSites");
  document.getElementById("toggle-label").textContent = tr("popup.toggleLabel");
  document.getElementById("settings-link").textContent = tr("popup.settingsLink");
  document.getElementById("pomodoro-start-btn").textContent = tr("popup.pomodoroStart");
  document.getElementById("pomodoro-stop-btn").textContent = tr("popup.pomodoroStop");
  document.getElementById("duration-label").textContent = tr("popup.durationLabel");
  document.getElementById("duration-start-btn").textContent = tr("popup.durationStart");
  document.getElementById("pin-modal-title").textContent = tr("popup.pinPromptTitle");
  document.getElementById("pin-modal-desc").textContent = tr("popup.pinPromptLabel");
  document.getElementById("pin-input").placeholder = tr("popup.pinPlaceholder");
  document.getElementById("pin-submit").textContent = tr("popup.pinSubmit");
  document.getElementById("pin-cancel").textContent = tr("general.cancel");
  document.getElementById("challenge-modal-title").textContent = tr("popup.challengeTitle");
  document.getElementById("challenge-modal-desc").textContent = tr("popup.challengeDesc");
  document.getElementById("challenge-input").placeholder = tr("popup.challengePlaceholder");
  document.getElementById("challenge-submit").textContent = tr("popup.challengeSubmit");
  document.getElementById("challenge-cancel").textContent = tr("popup.challengeCancel");
  document.getElementById("challenge-error").textContent = tr("popup.challengeError");
  document.getElementById("add-allow-input").placeholder = tr("popup.addAllowPlaceholder");
  document.getElementById("add-allow-btn").textContent = tr("popup.allowButton");
  document.getElementById("allowed-heading").textContent = tr("popup.allowedSites");
  document.getElementById("allow-empty").textContent = tr("popup.noAllowedSites");
  const isAllowlist = state?.settings?.mode === "allowlist";
  document.getElementById("allowonly-btn").textContent =
    isAllowlist ? tr("popup.allowOnlyDisable") : tr("popup.allowOnlyEnable");
}

// ─── Mode badge ───────────────────────────────────────────────────────────────

function formatTime(msRemaining) {
  const totalSec = Math.max(0, Math.ceil(msRemaining / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function updateModeBadge(settings, active) {
  const label = document.getElementById("mode-label");
  const timerEl = document.getElementById("mode-timer");

  // Clear existing ticker
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }

  // Reset classes
  label.className = "mode-badge__label";

  if (!active) {
    if (settings.mode === "pomodoro" && settings.pomodoroPhase === "break") {
      label.textContent = tr("popup.modeBadge.pomodoro") + " — BREAK";
      label.classList.add("mode--break");
      timerEl.hidden = false;
      timerEl.textContent = formatTime(settings.pomodoroPhaseEnd - Date.now());
      timerInterval = setInterval(() => {
        const rem = settings.pomodoroPhaseEnd - Date.now();
        timerEl.textContent = formatTime(rem);
      }, 1000);
    } else {
      label.textContent = tr("popup.modeBadge.off");
      timerEl.hidden = true;
    }
    return;
  }

  switch (settings.mode) {
    case "pomodoro": {
      label.textContent = tr("popup.modeBadge.pomodoro");
      label.classList.add("mode--pomodoro");
      if (settings.pomodoroPhaseEnd) {
        timerEl.hidden = false;
        timerEl.textContent = formatTime(settings.pomodoroPhaseEnd - Date.now());
        timerInterval = setInterval(() => {
          timerEl.textContent = formatTime(settings.pomodoroPhaseEnd - Date.now());
        }, 1000);
      }
      break;
    }
    case "schedule": {
      label.textContent = tr("popup.modeBadge.schedule");
      label.classList.add("mode--schedule");
      timerEl.hidden = true;
      break;
    }
    case "duration": {
      label.textContent = tr("popup.modeBadge.duration");
      label.classList.add("mode--duration");
      if (settings.durationEnd) {
        timerEl.hidden = false;
        timerEl.textContent = formatTime(settings.durationEnd - Date.now());
        timerInterval = setInterval(() => {
          timerEl.textContent = formatTime(settings.durationEnd - Date.now());
        }, 1000);
      }
      break;
    }
    case "allowlist": {
      label.textContent = tr("popup.modeBadge.allowlist");
      label.classList.add("mode--active");
      timerEl.hidden = true;
      break;
    }
    default: {
      // manual
      label.textContent = tr("popup.modeBadge.manual");
      label.classList.add("mode--active");
      timerEl.hidden = true;
      break;
    }
  }
}

// ─── Sites list ───────────────────────────────────────────────────────────────

function renderSitesList(blocklist, settings) {
  const list = document.getElementById("sites-list");
  const empty = document.getElementById("sites-empty");
  list.innerHTML = "";

  if (blocklist.length === 0) {
    empty.hidden = false;
    return;
  }
  empty.hidden = true;

  for (const domain of blocklist) {
    const li = document.createElement("li");
    li.className = "sites-list__item";

    const span = document.createElement("span");
    span.className = "sites-list__domain";
    span.textContent = domain;

    const btn = document.createElement("button");
    btn.className = "sites-list__remove-btn";
    btn.title = tr("popup.removeButton");
    btn.textContent = "🗑️";
    btn.dataset.domain = domain;
    btn.addEventListener("click", () => handleRemoveSite(domain, settings));

    li.appendChild(span);
    li.appendChild(btn);
    list.appendChild(li);
  }
}

// ─── Allowlist rendering ──────────────────────────────────────────────────────

function renderAllowlist(allowlist) {
  const list = document.getElementById("allow-list");
  const empty = document.getElementById("allow-empty");
  list.innerHTML = "";

  if (allowlist.length === 0) {
    empty.hidden = false;
    return;
  }
  empty.hidden = true;

  for (const domain of allowlist) {
    const li = document.createElement("li");
    li.className = "sites-list__item";

    const span = document.createElement("span");
    span.className = "sites-list__domain";
    span.textContent = domain;

    const btn = document.createElement("button");
    btn.className = "sites-list__remove-btn";
    btn.title = tr("popup.removeButton");
    btn.textContent = "🗑️";
    btn.addEventListener("click", () => {
      sendMsg({ type: "REMOVE_ALLOWSITE", domain }).then(refresh);
    });

    li.appendChild(span);
    li.appendChild(btn);
    list.appendChild(li);
  }
}

// ─── Remove-site with PIN gate ────────────────────────────────────────────────

function handleRemoveSite(domain, settings) {
  if (settings.pin) {
    // PIN is set — show modal
    pendingRemoveDomain = domain;
    openPinModal();
  } else {
    // No PIN — remove directly
    performRemoveSite(domain);
  }
}

async function performRemoveSite(domain) {
  const result = await sendMsg({ type: "REMOVE_SITE", domain });
  if (result?.error === "locked") {
    showAddMsg(tr("popup.lockError"), true);
    return;
  }
  refresh();
}

// ─── PIN modal ────────────────────────────────────────────────────────────────

function openPinModal() {
  document.getElementById("pin-input").value = "";
  document.getElementById("pin-error").hidden = true;
  document.getElementById("pin-overlay").hidden = false;
  document.getElementById("pin-input").focus();
}

function closePinModal() {
  document.getElementById("pin-overlay").hidden = true;
  pendingRemoveDomain = null;
}

document.getElementById("pin-cancel").addEventListener("click", closePinModal);

document.getElementById("pin-overlay").addEventListener("click", (e) => {
  if (e.target === document.getElementById("pin-overlay")) closePinModal();
});

document.getElementById("pin-submit").addEventListener("click", async () => {
  const input = document.getElementById("pin-input").value.trim();
  const hashed = await hashPin(input);
  // We need the settings to verify the hash — fetch fresh state
  const state = await sendMsg({ type: "GET_STATE" });
  if (state.settings.pin && hashed === state.settings.pin) {
    closePinModal();
    if (pendingRemoveDomain) {
      await performRemoveSite(pendingRemoveDomain);
    }
  } else {
    document.getElementById("pin-error").hidden = false;
    document.getElementById("pin-error").textContent = tr("popup.pinError");
    document.getElementById("pin-input").value = "";
    document.getElementById("pin-input").focus();
  }
});

// Allow submitting PIN with Enter key
document.getElementById("pin-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter") document.getElementById("pin-submit").click();
});

// ─── Challenge modal ──────────────────────────────────────────────────────────

// Excludes visually ambiguous characters (0/O, 1/l/I)
const CHALLENGE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';

function generateChallenge() {
  const arr = new Uint8Array(20);
  crypto.getRandomValues(arr);
  return Array.from(arr, b => CHALLENGE_CHARS[b % CHALLENGE_CHARS.length]).join('');
}

let _challengePhrase = '';
let _challengeCallback = null;

function openChallengeModal(onConfirm) {
  _challengePhrase = generateChallenge();
  _challengeCallback = onConfirm;
  document.getElementById('challenge-phrase').textContent = _challengePhrase;
  document.getElementById('challenge-input').value = '';
  document.getElementById('challenge-error').hidden = true;
  document.getElementById('challenge-overlay').hidden = false;
  document.getElementById('challenge-input').focus();
}

function closeChallengeModal() {
  document.getElementById('challenge-overlay').hidden = true;
  _challengeCallback = null;
}

document.getElementById('challenge-submit').addEventListener('click', () => {
  const typed = document.getElementById('challenge-input').value;
  if (typed === _challengePhrase) {
    const cb = _challengeCallback;
    closeChallengeModal();
    cb?.();
  } else {
    document.getElementById('challenge-error').hidden = false;
    document.getElementById('challenge-input').value = '';
    document.getElementById('challenge-input').focus();
  }
});

document.getElementById('challenge-cancel').addEventListener('click', closeChallengeModal);

document.getElementById('challenge-overlay').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeChallengeModal();
});

document.getElementById('challenge-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('challenge-submit').click();
});

// ─── Controls wiring ──────────────────────────────────────────────────────────

function showAddMsg(text, isError = false) {
  const el = document.getElementById("add-msg");
  el.textContent = text;
  el.className = `add-msg${isError ? " add-msg--error" : ""}`;
  el.hidden = false;
  setTimeout(() => { el.hidden = true; }, 3000);
}

function showAddAllowMsg(text, isError = false) {
  const el = document.getElementById("add-allow-msg");
  el.textContent = text;
  el.className = `add-msg${isError ? " add-msg--error" : ""}`;
  el.hidden = false;
  setTimeout(() => { el.hidden = true; }, 3000);
}

function normalizeDomain(raw) {
  // Strip protocol, strip leading www., preserve paths and wildcards
  return raw.trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/\/$/, "")
    .toLowerCase();
}

function isValidPattern(pattern) {
  if (!pattern || /\s/.test(pattern)) return false;
  // Strip leading *. for domain-part check
  const base = pattern.startsWith("*.") ? pattern.slice(2) : pattern;
  const domainPart = base.split("/")[0];
  // TLD wildcard: "domain.*"
  if (domainPart.endsWith(".*")) return domainPart.split(".").length >= 2;
  return domainPart.includes(".");
}

document.getElementById("add-btn").addEventListener("click", async () => {
  const input = document.getElementById("add-input");
  const domain = normalizeDomain(input.value);

  if (!isValidPattern(domain)) {
    showAddMsg(tr("popup.invalidDomain"), true);
    return;
  }

  // Check for duplicate before sending
  const state = await sendMsg({ type: "GET_STATE" });
  if (state?.blocklist?.includes(domain)) {
    showAddMsg(tr("popup.alreadyBlocked"), false);
    input.value = "";
    return;
  }

  await sendMsg({ type: "ADD_SITE", domain });
  input.value = "";
  refresh();
});

document.getElementById("add-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter") document.getElementById("add-btn").click();
});

document.getElementById("manual-toggle").addEventListener("change", async (e) => {
  if (!e.target.checked && state?.settings?.challengeEnabled) {
    e.target.checked = true; // revert visually until confirmed
    openChallengeModal(async () => {
      const result = await sendMsg({ type: "SET_MANUAL", active: false });
      if (result?.error === "locked") {
        showAddMsg(tr("popup.lockError"), true);
        return;
      }
      refresh();
    });
    return;
  }
  const result = await sendMsg({ type: "SET_MANUAL", active: e.target.checked });
  if (result?.error === "locked") {
    e.target.checked = !e.target.checked; // revert
    showAddMsg(tr("popup.lockError"), true);
    return;
  }
  refresh();
});

document.getElementById("pomodoro-start-btn").addEventListener("click", async () => {
  await sendMsg({ type: "START_POMODORO" });
  refresh();
});

document.getElementById("pomodoro-stop-btn").addEventListener("click", async () => {
  if (state?.settings?.challengeEnabled) {
    openChallengeModal(async () => {
      await sendMsg({ type: "STOP_POMODORO" });
      refresh();
    });
    return;
  }
  await sendMsg({ type: "STOP_POMODORO" });
  refresh();
});

document.getElementById("duration-start-btn").addEventListener("click", async () => {
  const minutes = parseInt(document.getElementById("duration-input").value, 10);
  if (!minutes || minutes < 1) return;
  await sendMsg({ type: "START_DURATION", minutes });
  refresh();
});

document.getElementById("lang-toggle").addEventListener("click", async () => {
  lang = lang === "en" ? "de" : "en";
  // Persist language preference
  await chrome.storage.local.get("settings", (data) => {
    const settings = data.settings ?? {};
    settings.language = lang;
    chrome.storage.local.set({ settings });
  });
  applyTranslations();
  refresh();
});

document.getElementById("add-allow-btn").addEventListener("click", async () => {
  const input = document.getElementById("add-allow-input");
  const domain = normalizeDomain(input.value);

  if (!isValidPattern(domain)) {
    showAddAllowMsg(tr("popup.invalidDomain"), true);
    return;
  }

  const freshState = await sendMsg({ type: "GET_STATE" });
  if (freshState?.allowlist?.includes(domain)) {
    showAddAllowMsg(tr("popup.alreadyAllowed"), false);
    input.value = "";
    return;
  }

  await sendMsg({ type: "ADD_ALLOWSITE", domain });
  input.value = "";
  refresh();
});

document.getElementById("add-allow-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter") document.getElementById("add-allow-btn").click();
});

document.getElementById("allowonly-btn").addEventListener("click", async () => {
  const isAllowlist = state?.settings?.mode === "allowlist";
  if (isAllowlist) {
    if (state?.settings?.challengeEnabled) {
      openChallengeModal(async () => {
        await sendMsg({ type: "SET_ALLOWLIST", active: false });
        refresh();
      });
      return;
    }
    await sendMsg({ type: "SET_ALLOWLIST", active: false });
  } else {
    await sendMsg({ type: "SET_ALLOWLIST", active: true });
  }
  refresh();
});

document.getElementById("settings-link").addEventListener("click", (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: chrome.runtime.getURL("src/settings/settings.html") });
});

// ─── Rendering ────────────────────────────────────────────────────────────────

function updateControlsVisibility(settings, active) {
  const isAllowlist = settings.mode === "allowlist";

  // Switch between block-view and allow-view
  document.getElementById("block-view").hidden = isAllowlist;
  document.getElementById("allow-view").hidden = !isAllowlist;
  document.getElementById("allowonly-btn").textContent =
    isAllowlist ? tr("popup.allowOnlyDisable") : tr("popup.allowOnlyEnable");

  if (isAllowlist) return;

  const pomodoroSection = document.getElementById("pomodoro-section");
  const durationSection = document.getElementById("duration-section");
  const startBtn = document.getElementById("pomodoro-start-btn");
  const stopBtn = document.getElementById("pomodoro-stop-btn");
  const manualToggle = document.getElementById("manual-toggle");

  pomodoroSection.hidden = false;

  const isPomodoro = settings.mode === "pomodoro";
  if (isPomodoro && settings.pomodoroPhase !== "idle") {
    startBtn.hidden = true;
    stopBtn.hidden = false;
  } else {
    startBtn.hidden = false;
    stopBtn.hidden = true;
  }

  const isDuration = settings.mode === "duration" && settings.durationEnd;
  durationSection.hidden = !!isDuration;

  manualToggle.checked = active && settings.mode === "manual";
}

// ─── Main refresh ─────────────────────────────────────────────────────────────

async function refresh() {
  state = await sendMsg({ type: "GET_STATE" });
  if (!state?.ok) return;
  const { settings, blocklist, allowlist, active } = state;

  updateModeBadge(settings, active);
  renderSitesList(blocklist, settings);
  renderAllowlist(allowlist ?? []);
  updateControlsVisibility(settings, active);

  // Lock badge
  const lockBadge = document.getElementById("lock-badge");
  if (settings.lockedUntil && Date.now() < settings.lockedUntil) {
    const remaining = settings.lockedUntil - Date.now();
    const h = Math.floor(remaining / 3_600_000);
    const m = Math.floor((remaining % 3_600_000) / 60_000);
    document.getElementById("lock-badge-text").textContent =
      `🔒 ${tr("popup.lockActive")} (${h}h ${m}m)`;
    lockBadge.style.display = "";
  } else {
    lockBadge.style.display = "none";
  }
}

// ─── Init ─────────────────────────────────────────────────────────────────────

async function init() {
  // Load language preference from storage
  const data = await chrome.storage.local.get("settings");
  lang = data.settings?.language ?? "en";
  applyTranslations();
  await refresh();
}

init();
