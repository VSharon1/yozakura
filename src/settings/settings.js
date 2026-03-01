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
  document.getElementById("heading-reminder").textContent = tr("settings.sectionReminder");
  document.getElementById("task-reminder").placeholder = tr("settings.reminderPlaceholder");
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
  showDataMsg(tr("settings.statsClearedMsg"));
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
  wireEvents();
}

init();
