/**
 * settings.js — Yozakura settings page logic
 *
 * Manages all settings sections: Security (PIN), Language, AI Quotes,
 * Schedule, Pomodoro, Task Reminder, Data (export/import/clear).
 * Communicates settings to the service worker via chrome.runtime.sendMessage
 * so DNR rules are updated whenever blocking-related settings change.
 */

import { t } from "../shared/i18n.js";
import {
  getSettings,
  saveSettings,
  clearStats,
  getStats,
  exportAll,
  importAll
} from "../shared/storage.js";

// ─── State ────────────────────────────────────────────────────────────────────

let lang = "en";

// ─── i18n helpers ─────────────────────────────────────────────────────────────

function tr(key) { return t(key, lang); }

function applyTranslations() {
  document.documentElement.lang = lang;
  document.title = tr("settings.title");
  document.getElementById("settings-title").textContent = tr("settings.title");
  document.getElementById("heading-security").textContent = tr("settings.sectionSecurity");
  document.getElementById("label-pin-current").textContent = tr("settings.pinCurrent");
  document.getElementById("label-pin-new").textContent = tr("settings.pinNew");
  document.getElementById("label-pin-confirm").textContent = tr("settings.pinConfirm");
  document.getElementById("pin-set-btn").textContent = tr("settings.pinSet");
  document.getElementById("pin-remove-btn").textContent = tr("settings.pinRemove");
  document.getElementById("label-challenge").textContent = tr("settings.challengeLabel");
  document.getElementById("heading-language").textContent = tr("settings.sectionLanguage");
  document.getElementById("label-lang-en").textContent = tr("settings.langEN");
  document.getElementById("label-lang-de").textContent = tr("settings.langDE");
  document.getElementById("heading-ai").textContent = tr("settings.sectionAI");
  document.getElementById("label-ai-provider").textContent = tr("settings.aiProvider");
  document.getElementById("opt-none").textContent = tr("settings.aiProviderNone");
  document.getElementById("opt-openai").textContent = tr("settings.aiProviderOpenAI");
  document.getElementById("opt-anthropic").textContent = tr("settings.aiProviderAnthropic");
  document.getElementById("opt-gemini").textContent = tr("settings.aiProviderGemini");
  document.getElementById("label-ai-key").textContent = tr("settings.aiKey");
  document.getElementById("label-ai-character").textContent = tr("settings.aiCharacter");
  document.getElementById("ai-character").placeholder = tr("settings.aiCharacterPlaceholder");
  document.getElementById("label-ai-tone").textContent = tr("settings.aiTone");
  document.getElementById("opt-tone-motivational").textContent = tr("settings.aiToneMotivational");
  document.getElementById("opt-tone-philosophical").textContent = tr("settings.aiTonePhilosophical");
  document.getElementById("opt-tone-stern").textContent = tr("settings.aiToneStern");
  document.getElementById("opt-tone-funny").textContent = tr("settings.aiToneFunny");
  document.getElementById("heading-schedule").textContent = tr("settings.sectionSchedule");
  document.getElementById("label-schedule-enable").textContent = tr("settings.scheduleEnable");
  document.getElementById("label-schedule-from").textContent = tr("settings.scheduleFrom");
  document.getElementById("label-schedule-to").textContent = tr("settings.scheduleTo");
  document.getElementById("heading-pomodoro").textContent = tr("settings.sectionPomodoro");
  document.getElementById("label-pom-work").textContent = tr("settings.pomodoroWork");
  document.getElementById("label-pom-break").textContent = tr("settings.pomodoroBreak");
  document.getElementById("heading-allowance").textContent = tr("settings.sectionAllowance");
  document.getElementById("label-allowance-minutes").textContent = tr("settings.allowanceMinutes");
  document.getElementById("heading-youtube").textContent = tr("settings.sectionYoutube");
  document.getElementById("label-yt-hide-shorts").textContent = tr("settings.ytHideShorts");
  document.getElementById("label-yt-hide-sidebar").textContent = tr("settings.ytHideSidebar");
  document.getElementById("label-yt-hide-comments").textContent = tr("settings.ytHideComments");
  document.getElementById("label-yt-hide-thumbnails").textContent = tr("settings.ytHideThumbnails");
  document.getElementById("heading-twitter").textContent = tr("settings.sectionTwitter");
  document.getElementById("label-tw-hide-feed").textContent = tr("settings.twHideFeed");
  document.getElementById("label-tw-hide-trending").textContent = tr("settings.twHideTrending");
  document.getElementById("label-tw-hide-who-to-follow").textContent = tr("settings.twHideWhoToFollow");
  document.getElementById("label-tw-hide-notif-badge").textContent = tr("settings.twHideNotifBadge");
  document.getElementById("heading-reddit").textContent = tr("settings.sectionReddit");
  document.getElementById("label-rd-hide-feed").textContent = tr("settings.rdHideFeed");
  document.getElementById("label-rd-hide-promoted").textContent = tr("settings.rdHidePromoted");
  document.getElementById("label-rd-hide-nsfw").textContent = tr("settings.rdHideNsfw");
  document.getElementById("label-rd-hide-awards").textContent = tr("settings.rdHideAwards");
  document.getElementById("heading-reminder").textContent = tr("settings.sectionReminder");
  document.getElementById("task-reminder").placeholder = tr("settings.reminderPlaceholder");
  document.getElementById("heading-stats").textContent = tr("settings.sectionStats");
  document.getElementById("label-stats-today").textContent = tr("settings.statsToday");
  document.getElementById("label-stats-week").textContent = tr("settings.statsWeek");
  document.getElementById("heading-data").textContent = tr("settings.sectionData");
  document.getElementById("export-btn").textContent = tr("settings.exportBtn");
  document.getElementById("import-btn").textContent = tr("settings.importBtn");
  document.getElementById("clear-stats-btn").textContent = tr("settings.clearStats");
  document.getElementById("save-btn").textContent = tr("general.save");
}

// ─── PIN helpers ──────────────────────────────────────────────────────────────

async function hashPin(pin) {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(pin)
  );
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function showPinMsg(text, isError = false) {
  const el = document.getElementById("pin-msg");
  el.textContent = text;
  el.className = `field-msg${isError ? " field-msg--error" : ""}`;
  el.hidden = false;
  setTimeout(() => { el.hidden = true; }, 4000);
}

// ─── PIN section ──────────────────────────────────────────────────────────────

async function handleSetPin() {
  const currentInput = document.getElementById("pin-current").value;
  const newInput = document.getElementById("pin-new").value;
  const confirmInput = document.getElementById("pin-confirm").value;

  const settings = await getSettings();

  // If a PIN is already set, verify the current PIN first
  if (settings.pin) {
    if (!currentInput) {
      showPinMsg(tr("settings.pinWrong"), true);
      return;
    }
    const currentHash = await hashPin(currentInput);
    if (currentHash !== settings.pin) {
      showPinMsg(tr("settings.pinWrong"), true);
      return;
    }
  }

  if (newInput.length !== 4 || !/^\d{4}$/.test(newInput)) {
    showPinMsg(tr("settings.pinShort"), true);
    return;
  }
  if (newInput !== confirmInput) {
    showPinMsg(tr("settings.pinMismatch"), true);
    return;
  }

  const newHash = await hashPin(newInput);
  await saveSettings({ pin: newHash });
  document.getElementById("pin-current").value = "";
  document.getElementById("pin-new").value = "";
  document.getElementById("pin-confirm").value = "";
  showPinMsg(tr("settings.pinSaved"));
}

async function handleRemovePin() {
  const settings = await getSettings();
  if (settings.pin) {
    // Require current PIN to remove it
    const currentInput = document.getElementById("pin-current").value;
    const currentHash = await hashPin(currentInput);
    if (currentHash !== settings.pin) {
      showPinMsg(tr("settings.pinWrong"), true);
      return;
    }
  }
  await saveSettings({ pin: null });
  document.getElementById("pin-current").value = "";
  document.getElementById("pin-new").value = "";
  document.getElementById("pin-confirm").value = "";
  showPinMsg(tr("settings.pinRemoved"));
}

// ─── Populate form from settings ──────────────────────────────────────────────

async function populateForm() {
  const settings = await getSettings();

  // Language radios
  document.getElementById(`lang-${settings.language ?? "en"}`).checked = true;

  // AI quotes
  document.getElementById("ai-provider").value = settings.aiQuotes?.provider ?? "none";
  document.getElementById("ai-key").value = settings.aiQuotes?.apiKey ?? "";
  document.getElementById("ai-character").value = settings.aiQuotes?.character ?? "";
  document.getElementById("ai-tone").value = settings.aiQuotes?.tone ?? "motivational";

  // Schedule
  document.getElementById("schedule-enable").checked = settings.schedule?.enabled ?? false;
  document.getElementById("schedule-from").value = settings.schedule?.from ?? "09:00";
  document.getElementById("schedule-to").value = settings.schedule?.to ?? "17:00";

  // Pomodoro
  document.getElementById("pom-work").value = settings.pomodoro?.workMinutes ?? 50;
  document.getElementById("pom-break").value = settings.pomodoro?.breakMinutes ?? 10;

  // Challenge
  document.getElementById("challenge-enabled").checked = settings.challengeEnabled ?? false;

  // Daily allowance
  document.getElementById("allowance-minutes").value = settings.allowanceMinutes ?? 0;

  // YouTube filters
  const yf = settings.youtubeFilter ?? {};
  document.getElementById("yt-hide-shorts").checked     = yf.hideShorts    ?? false;
  document.getElementById("yt-hide-sidebar").checked    = yf.hideSidebar   ?? false;
  document.getElementById("yt-hide-comments").checked   = yf.hideComments  ?? false;
  document.getElementById("yt-hide-thumbnails").checked = yf.hideThumbnails ?? false;

  // Twitter/X filters
  const tf = settings.twitterFilter ?? {};
  document.getElementById("tw-hide-feed").checked          = tf.hideFeed         ?? false;
  document.getElementById("tw-hide-trending").checked      = tf.hideTrending      ?? false;
  document.getElementById("tw-hide-who-to-follow").checked = tf.hideWhoToFollow   ?? false;
  document.getElementById("tw-hide-notif-badge").checked   = tf.hideNotifBadge    ?? false;

  // Reddit filters
  const rf = settings.redditFilter ?? {};
  document.getElementById("rd-hide-feed").checked     = rf.hideFeed     ?? false;
  document.getElementById("rd-hide-promoted").checked = rf.hidePromoted ?? false;
  document.getElementById("rd-hide-nsfw").checked     = rf.hideNsfw     ?? false;
  document.getElementById("rd-hide-awards").checked   = rf.hideAwards   ?? false;

  // Task reminder
  document.getElementById("task-reminder").value = settings.taskReminder ?? "";
}

// ─── Collect & save all settings ─────────────────────────────────────────────

function showSaveMsg(text, isError = false) {
  const el = document.getElementById("save-msg");
  el.textContent = text;
  el.className = `save-bar__msg${isError ? " field-msg--error" : ""}`;
  el.hidden = false;
  setTimeout(() => { el.hidden = true; }, 3000);
}

async function saveAll() {
  const selectedLang = document.querySelector('input[name="lang"]:checked')?.value ?? "en";

  const scheduleFrom = document.getElementById("schedule-from").value;
  const scheduleTo = document.getElementById("schedule-to").value;
  const timeRegex = /^\d{2}:\d{2}$/;
  if (!timeRegex.test(scheduleFrom) || !timeRegex.test(scheduleTo)) {
    showSaveMsg(tr("settings.scheduleTimeInvalid"), true);
    return;
  }

  const partial = {
    language: selectedLang,
    allowanceMinutes: parseInt(document.getElementById("allowance-minutes").value, 10) || 0,
    taskReminder: document.getElementById("task-reminder").value.trim(),
    schedule: {
      enabled: document.getElementById("schedule-enable").checked,
      from: scheduleFrom,
      to: scheduleTo
    },
    pomodoro: {
      workMinutes: parseInt(document.getElementById("pom-work").value, 10) || 50,
      breakMinutes: parseInt(document.getElementById("pom-break").value, 10) || 10
    },
    aiQuotes: {
      provider: document.getElementById("ai-provider").value,
      apiKey: document.getElementById("ai-key").value.trim(),
      character: document.getElementById("ai-character").value.trim(),
      tone: document.getElementById("ai-tone").value
    }
  };

  await saveSettings(partial);

  // Tell service worker to re-evaluate DNR rules (schedule/mode may have changed)
  chrome.runtime.sendMessage({ type: "UPDATE_RULES" });

  // Update language in UI
  lang = selectedLang;
  applyTranslations();

  showSaveMsg(tr("settings.saved"));
}

// ─── Data: export, import, clear stats ───────────────────────────────────────

function showDataMsg(text, isError = false) {
  const el = document.getElementById("data-msg");
  el.textContent = text;
  el.className = `field-msg${isError ? " field-msg--error" : ""}`;
  el.hidden = false;
  setTimeout(() => { el.hidden = true; }, 4000);
}

async function handleExport() {
  const data = await exportAll();
  // Strip API key from export for safety? No — user chose to export, keep it complete.
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `yozakura-settings-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function handleImport() {
  document.getElementById("import-file-input").click();
}

async function handleImportFile(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    await importAll(data);
    chrome.runtime.sendMessage({ type: "UPDATE_RULES" });
    await populateForm();
    showDataMsg(tr("settings.saved"));
  } catch {
    showDataMsg("Import failed: invalid JSON.", true);
  }
  // Reset file input so the same file can be re-imported if needed
  e.target.value = "";
}

async function handleClearStats() {
  const confirmed = window.confirm(tr("settings.clearStatsConfirm"));
  if (!confirmed) return;
  await clearStats();
  await renderStats();
  showDataMsg(tr("settings.statsClearedMsg"));
}

// ─── Stats Dashboard ──────────────────────────────────────────────────────────

function renderStatsList(containerId, entries) {
  const el = document.getElementById(containerId);
  el.innerHTML = "";
  for (const [domain, count] of entries) {
    const row = document.createElement("div");
    row.className = "stats-row";
    const d = document.createElement("span");
    d.className = "stats-row__domain";
    d.textContent = domain;
    const c = document.createElement("span");
    c.className = "stats-row__count";
    c.textContent = count;
    row.appendChild(d);
    row.appendChild(c);
    el.appendChild(row);
  }
}

async function renderStats() {
  const stats = await getStats();
  const today = new Date().toISOString().slice(0, 10);

  // Aggregate the 7 days prior to today (excludes today to avoid double-counting)
  const weekAgg = {};
  for (let i = 1; i <= 7; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    for (const [domain, count] of Object.entries(stats[key] ?? {})) {
      weekAgg[domain] = (weekAgg[domain] ?? 0) + count;
    }
  }

  const todayEntries = Object.entries(stats[today] ?? {}).sort((a, b) => b[1] - a[1]);
  const weekEntries = Object.entries(weekAgg).sort((a, b) => b[1] - a[1]);

  const todayLabel = document.getElementById("label-stats-today");
  const weekLabel = document.getElementById("label-stats-week");
  const emptyEl = document.getElementById("stats-empty");

  todayLabel.hidden = todayEntries.length === 0;
  renderStatsList("stats-today", todayEntries);

  weekLabel.hidden = weekEntries.length === 0;
  renderStatsList("stats-week", weekEntries);

  if (todayEntries.length === 0 && weekEntries.length === 0) {
    emptyEl.textContent = tr("settings.statsEmpty");
    emptyEl.hidden = false;
  } else {
    emptyEl.hidden = true;
  }
}

// ─── API key show/hide toggle ─────────────────────────────────────────────────

function setupKeyToggle() {
  const toggleBtn = document.getElementById("ai-key-toggle");
  const keyInput = document.getElementById("ai-key");
  toggleBtn.addEventListener("click", () => {
    const isHidden = keyInput.type === "password";
    keyInput.type = isHidden ? "text" : "password";
    toggleBtn.textContent = isHidden ? tr("settings.aiKeyHide") : tr("settings.aiKeyShow");
  });
}

// ─── Wire up all event listeners ─────────────────────────────────────────────

function wireEvents() {
  document.getElementById("pin-set-btn").addEventListener("click", handleSetPin);
  document.getElementById("pin-remove-btn").addEventListener("click", handleRemovePin);
  document.getElementById("save-btn").addEventListener("click", saveAll);
  document.getElementById("export-btn").addEventListener("click", handleExport);
  document.getElementById("import-btn").addEventListener("click", handleImport);
  document.getElementById("import-file-input").addEventListener("change", handleImportFile);
  document.getElementById("clear-stats-btn").addEventListener("click", handleClearStats);
  document.getElementById("challenge-enabled").addEventListener("change", async (e) => {
    await saveSettings({ challengeEnabled: e.target.checked });
    chrome.runtime.sendMessage({ type: "UPDATE_RULES" });
  });

  for (const [id, key] of [
    ["yt-hide-shorts",     "hideShorts"],
    ["yt-hide-sidebar",    "hideSidebar"],
    ["yt-hide-comments",   "hideComments"],
    ["yt-hide-thumbnails", "hideThumbnails"],
  ]) {
    document.getElementById(id).addEventListener("change", async (e) => {
      await saveSettings({ youtubeFilter: { [key]: e.target.checked } });
    });
  }

  for (const [id, key] of [
    ["tw-hide-feed",          "hideFeed"],
    ["tw-hide-trending",      "hideTrending"],
    ["tw-hide-who-to-follow", "hideWhoToFollow"],
    ["tw-hide-notif-badge",   "hideNotifBadge"],
  ]) {
    document.getElementById(id).addEventListener("change", async (e) => {
      await saveSettings({ twitterFilter: { [key]: e.target.checked } });
    });
  }

  for (const [id, key] of [
    ["rd-hide-feed",     "hideFeed"],
    ["rd-hide-promoted", "hidePromoted"],
    ["rd-hide-nsfw",     "hideNsfw"],
    ["rd-hide-awards",   "hideAwards"],
  ]) {
    document.getElementById(id).addEventListener("change", async (e) => {
      await saveSettings({ redditFilter: { [key]: e.target.checked } });
    });
  }

  setupKeyToggle();

  // Update AI key show/hide button label when language changes
  document.querySelectorAll('input[name="lang"]').forEach((radio) => {
    radio.addEventListener("change", (e) => {
      lang = e.target.value;
      applyTranslations();
    });
  });
}

// ─── Init ─────────────────────────────────────────────────────────────────────

async function init() {
  // Load language from storage before applying translations
  const settings = await getSettings();
  lang = settings.language ?? "en";
  applyTranslations();
  await populateForm();
  await renderStats();
  wireEvents();
}

init();
