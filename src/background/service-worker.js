/**
 * service-worker.js — Yozakura background service worker
 *
 * Responsibilities:
 * - Manage declarativeNetRequest dynamic rules to redirect blocked domains
 *   to the block page.
 * - Implement four blocking modes: manual, duration, schedule, pomodoro.
 * - Handle chrome.alarms for time-based modes.
 * - Expose message handlers so popup/settings can trigger actions.
 */

import {
  getSettings,
  saveSettings,
  getBlocklist,
  addSite,
  removeSite,
  getAllowlist,
  addAllowSite,
  removeAllowSite,
  initDefaults
} from "../shared/storage.js";

// ─── Constants ────────────────────────────────────────────────────────────────

const ALARM_DURATION_END = "yozakura-duration-end";
const ALARM_SCHEDULE_CHECK = "yozakura-schedule-check";
const ALARM_POMODORO = "yozakura-pomodoro";

// Base URL for the block page (built at runtime since extension ID varies)
const BLOCK_PAGE_BASE = chrome.runtime.getURL("src/block-page/block.html");

// Fixed rule ID for the allowlist catch-all redirect rule
const CATCH_ALL_RULE_ID = 9_000_000;

// ─── Initialisation ───────────────────────────────────────────────────────────

/** Called on extension install — sets up default storage and initial DNR rules. */
chrome.runtime.onInstalled.addListener(async () => {
  await initDefaults();
  await updateDNRRules();
  // Create the recurring schedule-check alarm (every 1 minute)
  chrome.alarms.create(ALARM_SCHEDULE_CHECK, { periodInMinutes: 1 });
  console.log("[Yozakura] Installed and initialised.");
});

/** On service worker start, restore any running alarms from persisted state. */
chrome.runtime.onStartup.addListener(async () => {
  await restoreAlarms();
  await updateDNRRules();
});

// ─── Alarm handling ───────────────────────────────────────────────────────────

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === ALARM_DURATION_END) {
    await handleDurationEnd();
  } else if (alarm.name === ALARM_SCHEDULE_CHECK) {
    await handleScheduleCheck();
  } else if (alarm.name === ALARM_POMODORO) {
    await handlePomodoroTick();
  }
});

/** Duration mode: time expired — turn blocking off and clear state. */
async function handleDurationEnd() {
  await saveSettings({ durationEnd: null, mode: "manual", manualActive: false });
  await updateDNRRules();
  console.log("[Yozakura] Duration block ended.");
}

/** Schedule mode: re-evaluate whether we are inside the scheduled window. */
async function handleScheduleCheck() {
  const settings = await getSettings();
  if (settings.mode === "schedule") {
    await updateDNRRules();
  }
}

/** Pomodoro: switch between work and break phases. */
async function handlePomodoroTick() {
  const settings = await getSettings();
  if (settings.pomodoroPhase === "idle") return;

  const now = Date.now();
  if (settings.pomodoroPhase === "work") {
    // Transition to break
    const breakMs = (settings.pomodoro.breakMinutes ?? 10) * 60 * 1000;
    await saveSettings({
      pomodoroPhase: "break",
      pomodoroPhaseEnd: now + breakMs
    });
    chrome.alarms.create(ALARM_POMODORO, { delayInMinutes: settings.pomodoro.breakMinutes ?? 10 });
    console.log("[Yozakura] Pomodoro: work → break");
  } else {
    // Transition back to work
    const workMs = (settings.pomodoro.workMinutes ?? 50) * 60 * 1000;
    await saveSettings({
      pomodoroPhase: "work",
      pomodoroPhaseEnd: now + workMs
    });
    chrome.alarms.create(ALARM_POMODORO, { delayInMinutes: settings.pomodoro.workMinutes ?? 50 });
    console.log("[Yozakura] Pomodoro: break → work");
  }
  await updateDNRRules();
}

// ─── Block-active logic ───────────────────────────────────────────────────────

/**
 * Determines whether blocking should currently be active based on the
 * current mode and associated state.
 * @param {object} [settings]  Optional pre-fetched settings (avoids double read)
 * @returns {Promise<boolean>}
 */
export async function isBlockingActive(settings) {
  const s = settings ?? (await getSettings());
  switch (s.mode) {
    case "manual":
      return !!s.manualActive;

    case "duration": {
      if (!s.durationEnd) return false;
      const active = Date.now() < s.durationEnd;
      if (!active) {
        // Clean up if expired without the alarm firing (e.g. browser was off)
        await saveSettings({ durationEnd: null, mode: "manual", manualActive: false });
      }
      return active;
    }

    case "schedule": {
      if (!s.schedule.enabled) return false;
      const now = new Date();
      const [fH, fM] = s.schedule.from.split(":").map(Number);
      const [tH, tM] = s.schedule.to.split(":").map(Number);
      const currentMinutes = now.getHours() * 60 + now.getMinutes();
      const fromMinutes = fH * 60 + fM;
      const toMinutes = tH * 60 + tM;
      // Handles both same-day and overnight schedules
      if (fromMinutes <= toMinutes) {
        return currentMinutes >= fromMinutes && currentMinutes < toMinutes;
      } else {
        // Overnight: e.g. 22:00 → 06:00
        return currentMinutes >= fromMinutes || currentMinutes < toMinutes;
      }
    }

    case "pomodoro":
      return s.pomodoroPhase === "work";

    case "allowlist":
      return true;

    default:
      return false;
  }
}

// ─── DNR rule management ─────────────────────────────────────────────────────

/**
 * Stable numeric ID for a domain string (using simple djb2 hash, kept positive
 * and within the int32 range that Chrome accepts).
 * @param {string} domain
 * @returns {number}
 */
function domainToRuleId(domain) {
  let hash = 5381;
  for (let i = 0; i < domain.length; i++) {
    hash = ((hash << 5) + hash + domain.charCodeAt(i)) & 0x7fffffff;
  }
  // Ensure non-zero (rule ID 0 is invalid)
  return (hash % 2_000_000) + 1;
}

/**
 * Rebuilds the declarativeNetRequest dynamic rules to match the current
 * blocklist and active-blocking state.
 *
 * When blocking is inactive, all Yozakura-managed rules are removed.
 * When active, one redirect rule per blocked domain is added.
 */
export async function updateDNRRules() {
  const settings = await getSettings();
  const blocklist = await getBlocklist();
  const active = await isBlockingActive(settings);

  // Remove all existing dynamic rules first
  const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
  const existingIds = existingRules.map((r) => r.id);

  const addRules = [];

  if (settings.mode === "allowlist") {
    // Catch-all redirect (priority 1) + per-domain allow rules (priority 2)
    const allowlist = await getAllowlist();
    addRules.push({
      id: CATCH_ALL_RULE_ID,
      priority: 1,
      action: {
        type: "redirect",
        redirect: {
          // \1 is replaced by the captured domain name at match time
          regexSubstitution: `${BLOCK_PAGE_BASE}?site=\\1`
        }
      },
      condition: {
        // Capture the bare hostname (strips www., ignores path/query)
        regexFilter: "^https?://(?:www\\.)?([^/?#]+)",
        isUrlFilterCaseSensitive: false,
        resourceTypes: ["main_frame"]
      }
    });
    for (const domain of allowlist) {
      addRules.push({
        id: domainToRuleId(domain),
        priority: 2,
        action: { type: "allow" },
        condition: {
          urlFilter: `||${domain}^`,
          resourceTypes: ["main_frame"]
        }
      });
    }
  } else if (active && blocklist.length > 0) {
    for (const domain of blocklist) {
      const id = domainToRuleId(domain);
      const redirectUrl = `${BLOCK_PAGE_BASE}?site=${encodeURIComponent(domain)}`;
      addRules.push({
        id,
        priority: 1,
        action: {
          type: "redirect",
          redirect: { url: redirectUrl }
        },
        condition: {
          urlFilter: `||${domain}^`,
          resourceTypes: ["main_frame"]
        }
      });
    }
  }

  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: existingIds,
    addRules
  });

  console.log(
    `[Yozakura] DNR rules updated: active=${active}, rules=${addRules.length}`
  );
}

// ─── Pomodoro controls ────────────────────────────────────────────────────────

/**
 * Starts a new Pomodoro cycle (sets mode, creates alarm, updates rules).
 */
export async function startPomodoro() {
  const settings = await getSettings();
  const workMs = (settings.pomodoro.workMinutes ?? 50) * 60 * 1000;
  await saveSettings({
    mode: "pomodoro",
    pomodoroPhase: "work",
    pomodoroPhaseEnd: Date.now() + workMs
  });
  // Cancel any existing pomodoro alarm before creating a new one
  await chrome.alarms.clear(ALARM_POMODORO);
  chrome.alarms.create(ALARM_POMODORO, {
    delayInMinutes: settings.pomodoro.workMinutes ?? 50
  });
  await updateDNRRules();
  console.log("[Yozakura] Pomodoro started — work phase.");
}

/**
 * Stops the Pomodoro cycle (clears alarm, sets idle, updates rules).
 */
export async function stopPomodoro() {
  await chrome.alarms.clear(ALARM_POMODORO);
  await saveSettings({
    pomodoroPhase: "idle",
    pomodoroPhaseEnd: null,
    mode: "manual",
    manualActive: false
  });
  await updateDNRRules();
  console.log("[Yozakura] Pomodoro stopped.");
}

// ─── Duration mode ────────────────────────────────────────────────────────────

/**
 * Starts a duration block for the given number of minutes.
 * @param {number} minutes
 */
export async function startDuration(minutes) {
  const end = Date.now() + minutes * 60 * 1000;
  await saveSettings({ mode: "duration", durationEnd: end });
  await chrome.alarms.clear(ALARM_DURATION_END);
  chrome.alarms.create(ALARM_DURATION_END, { delayInMinutes: minutes });
  await updateDNRRules();
  console.log(`[Yozakura] Duration block started for ${minutes} min.`);
}

// ─── Public message API ───────────────────────────────────────────────────────
// The popup and settings pages communicate with the service worker via
// chrome.runtime.sendMessage / onMessage.

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  handleMessage(msg).then(sendResponse).catch((err) => {
    console.error("[Yozakura] Message handler error:", err);
    sendResponse({ ok: false, error: err.message });
  });
  // Return true to indicate async response
  return true;
});

async function handleMessage(msg) {
  switch (msg.type) {
    case "ADD_SITE": {
      await addSite(msg.domain);
      await updateDNRRules();
      return { ok: true };
    }
    case "REMOVE_SITE": {
      await removeSite(msg.domain);
      await updateDNRRules();
      return { ok: true };
    }
    case "ADD_ALLOWSITE": {
      await addAllowSite(msg.domain);
      await updateDNRRules();
      return { ok: true };
    }
    case "REMOVE_ALLOWSITE": {
      await removeAllowSite(msg.domain);
      await updateDNRRules();
      return { ok: true };
    }
    case "SET_ALLOWLIST": {
      if (msg.active) {
        await saveSettings({ mode: "allowlist" });
      } else {
        await saveSettings({ mode: "manual", manualActive: false });
      }
      await updateDNRRules();
      return { ok: true };
    }
    case "SET_MANUAL": {
      await saveSettings({ mode: "manual", manualActive: msg.active });
      await updateDNRRules();
      return { ok: true };
    }
    case "START_DURATION": {
      await startDuration(msg.minutes);
      return { ok: true };
    }
    case "START_POMODORO": {
      await startPomodoro();
      return { ok: true };
    }
    case "STOP_POMODORO": {
      await stopPomodoro();
      return { ok: true };
    }
    case "UPDATE_RULES": {
      await updateDNRRules();
      return { ok: true };
    }
    case "GET_STATE": {
      const settings = await getSettings();
      const blocklist = await getBlocklist();
      const allowlist = await getAllowlist();
      const active = await isBlockingActive(settings);
      return { ok: true, settings, blocklist, allowlist, active };
    }
    default:
      return { ok: false, error: `Unknown message type: ${msg.type}` };
  }
}

// ─── Restore alarms after restart ────────────────────────────────────────────

/**
 * After a service-worker restart, re-create alarms based on persisted state.
 * chrome.alarms survive browser restart but NOT service-worker restart in all
 * Chrome versions, so we re-register them defensively.
 */
async function restoreAlarms() {
  const settings = await getSettings();

  // Always keep the schedule alarm running
  const scheduleAlarm = await chrome.alarms.get(ALARM_SCHEDULE_CHECK);
  if (!scheduleAlarm) {
    chrome.alarms.create(ALARM_SCHEDULE_CHECK, { periodInMinutes: 1 });
  }

  // Restore duration alarm if still active
  if (settings.mode === "duration" && settings.durationEnd) {
    const remaining = (settings.durationEnd - Date.now()) / 60_000;
    if (remaining > 0) {
      const alarm = await chrome.alarms.get(ALARM_DURATION_END);
      if (!alarm) {
        chrome.alarms.create(ALARM_DURATION_END, { delayInMinutes: remaining });
      }
    } else {
      // Already expired
      await handleDurationEnd();
    }
  }

  // Restore pomodoro alarm if running
  if (settings.pomodoroPhase !== "idle" && settings.pomodoroPhaseEnd) {
    const remaining = (settings.pomodoroPhaseEnd - Date.now()) / 60_000;
    if (remaining > 0) {
      const alarm = await chrome.alarms.get(ALARM_POMODORO);
      if (!alarm) {
        chrome.alarms.create(ALARM_POMODORO, { delayInMinutes: remaining });
      }
    } else {
      // Phase ended while browser was closed — process tick immediately
      await handlePomodoroTick();
    }
  }
}
