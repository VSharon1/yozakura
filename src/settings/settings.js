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
  document.getElementById("add-schedule").textContent = tr("settings.scheduleAdd");
  document.getElementById("schedules-limit-note").textContent = tr("settings.scheduleLimit");
  document.getElementById("heading-lock").textContent = tr("settings.sectionLock");
  document.getElementById("label-lock-desc").textContent = tr("settings.lockDesc");
  document.getElementById("label-lock-hours").textContent = tr("settings.lockFor");
  document.getElementById("lock-activate").textContent = tr("settings.lockActivate");
  document.getElementById("heading-pomodoro").textContent = tr("settings.sectionPomodoro");
  document.getElementById("label-pom-work").textContent = tr("settings.pomodoroWork");
  document.getElementById("label-pom-break").textContent = tr("settings.pomodoroBreak");
  document.getElementById("heading-allowance").textContent = tr("settings.sectionAllowance");
  document.getElementById("label-allowance-minutes").textContent = tr("settings.allowanceMinutes");
  document.getElementById("heading-content-filters").textContent = tr("settings.sectionContentFilters");
  document.getElementById("summary-youtube").textContent = tr("settings.sectionYoutube");
  document.getElementById("label-yt-hide-shorts").textContent = tr("settings.ytHideShorts");
  document.getElementById("label-yt-hide-sidebar").textContent = tr("settings.ytHideSidebar");
  document.getElementById("label-yt-hide-comments").textContent = tr("settings.ytHideComments");
  document.getElementById("label-yt-hide-thumbnails").textContent = tr("settings.ytHideThumbnails");
  document.getElementById("summary-twitter").textContent = tr("settings.sectionTwitter");
  document.getElementById("label-tw-hide-feed").textContent = tr("settings.twHideFeed");
  document.getElementById("label-tw-hide-trending").textContent = tr("settings.twHideTrending");
  document.getElementById("label-tw-hide-who-to-follow").textContent = tr("settings.twHideWhoToFollow");
  document.getElementById("label-tw-hide-notif-badge").textContent = tr("settings.twHideNotifBadge");
  document.getElementById("summary-reddit").textContent = tr("settings.sectionReddit");
  document.getElementById("label-rd-hide-feed").textContent = tr("settings.rdHideFeed");
  document.getElementById("label-rd-hide-promoted").textContent = tr("settings.rdHidePromoted");
  document.getElementById("label-rd-hide-nsfw").textContent = tr("settings.rdHideNsfw");
  document.getElementById("label-rd-hide-awards").textContent = tr("settings.rdHideAwards");
  document.getElementById("summary-instagram").textContent = tr("settings.sectionInstagram");
  document.getElementById("label-ig-hide-feed").textContent = tr("settings.igHideFeed");
  document.getElementById("label-ig-hide-explore").textContent = tr("settings.igHideExplore");
  document.getElementById("label-ig-hide-reels").textContent = tr("settings.igHideReels");
  document.getElementById("label-ig-hide-suggested").textContent = tr("settings.igHideSuggested");
  document.getElementById("summary-linkedin").textContent = tr("settings.sectionLinkedin");
  document.getElementById("label-li-hide-feed").textContent = tr("settings.liHideFeed");
  document.getElementById("label-li-hide-pymk").textContent = tr("settings.liHidePymk");
  document.getElementById("label-li-hide-news").textContent = tr("settings.liHideNews");
  document.getElementById("label-li-hide-promoted").textContent = tr("settings.liHidePromoted");
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

// ─── Schedule slots ───────────────────────────────────────────────────────────

// Day labels: Mon=1, Tue=2, Wed=3, Thu=4, Fri=5, Sat=6, Sun=0
const DAY_KEYS = ["dayMon", "dayTue", "dayWed", "dayThu", "dayFri", "daySat", "daySun"];
// JS getDay() returns 0=Sun,1=Mon,...,6=Sat; our order is Mon-Sun
const DAY_VALUES = [1, 2, 3, 4, 5, 6, 0];

function generateSlotId() {
  return "sched-" + Date.now().toString(36);
}

// In-memory array of schedule slots (synced to DOM on render)
let _schedules = [];

function renderSchedules(schedules) {
  _schedules = schedules.map(s => ({ ...s }));
  _renderScheduleDOM();
}

function _renderScheduleDOM() {
  const container = document.getElementById("schedules-list");
  container.innerHTML = "";

  for (const slot of _schedules) {
    const card = document.createElement("div");
    card.className = "schedule-slot";
    card.dataset.id = slot.id;

    // Header: name input, enabled toggle, delete button
    const header = document.createElement("div");
    header.className = "schedule-slot__header";

    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.className = "schedule-slot__name";
    nameInput.placeholder = tr("settings.scheduleSlotName");
    nameInput.value = slot.name ?? "";

    const toggleLabel = document.createElement("label");
    toggleLabel.className = "toggle";
    const toggleInput = document.createElement("input");
    toggleInput.type = "checkbox";
    toggleInput.className = "schedule-slot__enabled";
    toggleInput.checked = slot.enabled ?? false;
    const slider = document.createElement("span");
    slider.className = "slider";
    toggleLabel.appendChild(toggleInput);
    toggleLabel.appendChild(slider);

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "btn btn--icon btn--outline btn--danger schedule-slot__delete";
    deleteBtn.title = tr("settings.scheduleRemove");
    deleteBtn.textContent = "×";
    deleteBtn.addEventListener("click", () => {
      _schedules = _schedules.filter(s => s.id !== slot.id);
      _renderScheduleDOM();
    });

    header.appendChild(nameInput);
    header.appendChild(toggleLabel);
    header.appendChild(deleteBtn);

    // Body: from/to time inputs + day checkboxes
    const body = document.createElement("div");
    body.className = "schedule-slot__body";

    const timeRow = document.createElement("div");
    timeRow.className = "field field--row";

    const fromSub = document.createElement("div");
    fromSub.className = "field__sub";
    const fromLabel = document.createElement("label");
    fromLabel.className = "field__label";
    fromLabel.textContent = tr("settings.scheduleFrom");
    const fromInput = document.createElement("input");
    fromInput.type = "time";
    fromInput.className = "schedule-slot__from field__input field__input--time";
    fromInput.value = slot.from ?? "09:00";
    fromSub.appendChild(fromLabel);
    fromSub.appendChild(fromInput);

    const toSub = document.createElement("div");
    toSub.className = "field__sub";
    const toLabel = document.createElement("label");
    toLabel.className = "field__label";
    toLabel.textContent = tr("settings.scheduleTo");
    const toInput = document.createElement("input");
    toInput.type = "time";
    toInput.className = "schedule-slot__to field__input field__input--time";
    toInput.value = slot.to ?? "17:00";
    toSub.appendChild(toLabel);
    toSub.appendChild(toInput);

    timeRow.appendChild(fromSub);
    timeRow.appendChild(toSub);

    const daysDiv = document.createElement("div");
    daysDiv.className = "schedule-slot__days";

    for (let i = 0; i < DAY_KEYS.length; i++) {
      const dayVal = DAY_VALUES[i];
      const dayLabel = document.createElement("label");
      dayLabel.className = "schedule-slot__day";
      const dayCheck = document.createElement("input");
      dayCheck.type = "checkbox";
      dayCheck.value = dayVal;
      dayCheck.checked = (slot.days ?? []).includes(dayVal);
      dayLabel.appendChild(dayCheck);
      dayLabel.appendChild(document.createTextNode(tr(`settings.${DAY_KEYS[i]}`)));
      daysDiv.appendChild(dayLabel);
    }

    body.appendChild(timeRow);
    body.appendChild(daysDiv);

    card.appendChild(header);
    card.appendChild(body);
    container.appendChild(card);
  }

  // Show/hide the limit note and add button
  const addBtn = document.getElementById("add-schedule");
  const limitNote = document.getElementById("schedules-limit-note");
  if (_schedules.length >= 5) {
    addBtn.style.display = "none";
    limitNote.style.display = "";
  } else {
    addBtn.style.display = "";
    limitNote.style.display = "none";
  }
}

function readSchedulesFromDOM() {
  const cards = document.querySelectorAll(".schedule-slot");
  return Array.from(cards).map(card => {
    const days = Array.from(card.querySelectorAll(".schedule-slot__days input:checked"))
      .map(cb => Number(cb.value));
    return {
      id: card.dataset.id,
      name: card.querySelector(".schedule-slot__name").value.trim() || "Schedule",
      enabled: card.querySelector(".schedule-slot__enabled").checked,
      from: card.querySelector(".schedule-slot__from").value || "09:00",
      to: card.querySelector(".schedule-slot__to").value || "17:00",
      days
    };
  });
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

// ─── Lock state rendering ─────────────────────────────────────────────────────

function renderLockState(settings) {
  const unlockedView = document.getElementById("lock-unlocked-view");
  const activeView = document.getElementById("lock-active-view");
  const activeMsg = document.getElementById("lock-active-msg");
  const page = document.querySelector(".page");

  if (settings.lockedUntil && Date.now() < settings.lockedUntil) {
    const remaining = settings.lockedUntil - Date.now();
    const h = Math.floor(remaining / 3_600_000);
    const m = Math.floor((remaining % 3_600_000) / 60_000);
    const lockedUntilDate = new Date(settings.lockedUntil);
    const timeStr = lockedUntilDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    activeMsg.textContent = `${tr("settings.lockUntil")} ${timeStr} (${h}h ${m}m remaining)`;
    unlockedView.style.display = "none";
    activeView.style.display = "";
    page.classList.add("form-locked");
    // Hide save bar button too
    document.getElementById("save-btn").disabled = true;
  } else {
    unlockedView.style.display = "";
    activeView.style.display = "none";
    page.classList.remove("form-locked");
    document.getElementById("save-btn").disabled = false;
  }
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

  // Schedule slots
  renderSchedules(settings.schedules ?? []);

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

  // Instagram filters
  const igf = settings.instagramFilter ?? {};
  document.getElementById("ig-hide-feed").checked      = igf.hideFeed      ?? false;
  document.getElementById("ig-hide-explore").checked   = igf.hideExplore   ?? false;
  document.getElementById("ig-hide-reels").checked     = igf.hideReels     ?? false;
  document.getElementById("ig-hide-suggested").checked = igf.hideSuggested ?? false;

  // LinkedIn filters
  const lif = settings.linkedinFilter ?? {};
  document.getElementById("li-hide-feed").checked     = lif.hideFeed     ?? false;
  document.getElementById("li-hide-pymk").checked     = lif.hidePymk     ?? false;
  document.getElementById("li-hide-news").checked     = lif.hideNews     ?? false;
  document.getElementById("li-hide-promoted").checked = lif.hidePromoted ?? false;

  // Task reminder
  document.getElementById("task-reminder").value = settings.taskReminder ?? "";

  // Lock state
  renderLockState(settings);
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

  const partial = {
    language: selectedLang,
    allowanceMinutes: parseInt(document.getElementById("allowance-minutes").value, 10) || 0,
    taskReminder: document.getElementById("task-reminder").value.trim(),
    schedules: readSchedulesFromDOM(),
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
  document.getElementById("add-schedule").addEventListener("click", () => {
    if (_schedules.length >= 5) return;
    _schedules.push({
      id: generateSlotId(),
      name: "",
      enabled: true,
      from: "09:00",
      to: "17:00",
      days: []
    });
    _renderScheduleDOM();
  });
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

  for (const [id, key] of [
    ["ig-hide-feed",      "hideFeed"],
    ["ig-hide-explore",   "hideExplore"],
    ["ig-hide-reels",     "hideReels"],
    ["ig-hide-suggested", "hideSuggested"],
  ]) {
    document.getElementById(id).addEventListener("change", async (e) => {
      await saveSettings({ instagramFilter: { [key]: e.target.checked } });
    });
  }

  for (const [id, key] of [
    ["li-hide-feed",     "hideFeed"],
    ["li-hide-pymk",     "hidePymk"],
    ["li-hide-news",     "hideNews"],
    ["li-hide-promoted", "hidePromoted"],
  ]) {
    document.getElementById(id).addEventListener("change", async (e) => {
      await saveSettings({ linkedinFilter: { [key]: e.target.checked } });
    });
  }

  document.getElementById("lock-activate").addEventListener("click", async () => {
    const hours = parseInt(document.getElementById("lock-hours").value, 10);
    if (!hours || hours < 1) return;
    const confirmed = confirm(`Lock settings for ${hours} hour(s)? This cannot be undone.`);
    if (!confirmed) return;
    const until = Date.now() + hours * 3_600_000;
    await chrome.runtime.sendMessage({ type: "SET_LOCK", until });
    renderLockState({ lockedUntil: until });
  });

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
