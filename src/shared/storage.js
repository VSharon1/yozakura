/**
 * storage.js — chrome.storage.local wrapper for Yozakura
 *
 * All persistent state lives here. The default shape is defined in
 * DEFAULT_STATE. Callers use the typed helper functions rather than
 * touching chrome.storage directly.
 *
 * Storage schema:
 * {
 *   blocklist: string[],           // e.g. ["reddit.com", "twitter.com"]
 *   settings: {
 *     mode: "manual"|"duration"|"schedule"|"pomodoro",
 *     manualActive: boolean,
 *     durationMinutes: number,
 *     durationEnd: number|null,    // Unix ms timestamp or null
 *     schedule: {
 *       enabled: boolean,
 *       from: string,              // "HH:MM"
 *       to: string                 // "HH:MM"
 *     },
 *     pomodoro: {
 *       workMinutes: number,
 *       breakMinutes: number
 *     },
 *     pomodoroPhase: "idle"|"work"|"break",
 *     pomodoroPhaseEnd: number|null,
 *     pin: string|null,            // SHA-256 hex or null
 *     challengeEnabled: boolean,
 *     language: "en"|"de",
 *     taskReminder: string,
 *     aiQuotes: {
 *       provider: "none"|"openai"|"anthropic"|"gemini",
 *       apiKey: string,
 *       character: string,
 *       tone: "motivational"|"philosophical"|"stern"|"funny"
 *     }
 *   },
 *   stats: {
 *     "YYYY-MM-DD": { "domain.com": number }
 *   }
 * }
 */

const DEFAULT_STATE = {
  blocklist: [],
  settings: {
    mode: "manual",
    manualActive: false,
    durationMinutes: 25,
    durationEnd: null,
    schedule: {
      enabled: false,
      from: "09:00",
      to: "17:00"
    },
    pomodoro: {
      workMinutes: 50,
      breakMinutes: 10
    },
    pomodoroPhase: "idle",
    pomodoroPhaseEnd: null,
    pin: null,
    challengeEnabled: false,
    language: "en",
    taskReminder: "",
    aiQuotes: {
      provider: "none",
      apiKey: "",
      character: "",
      tone: "motivational"
    }
  },
  stats: {}
};

// ─── Internal helpers ───────────────────────────────────────────────────────

/** Read the entire storage object and merge defaults for missing keys. */
async function _readAll() {
  return new Promise((resolve) => {
    chrome.storage.local.get(null, (data) => {
      // Deep-merge top-level keys so new settings fields always exist
      const merged = {
        blocklist: data.blocklist ?? DEFAULT_STATE.blocklist,
        settings: Object.assign({}, DEFAULT_STATE.settings, data.settings ?? {}),
        stats: data.stats ?? DEFAULT_STATE.stats
      };
      // Ensure nested objects are also merged
      merged.settings.schedule = Object.assign(
        {}, DEFAULT_STATE.settings.schedule, merged.settings.schedule
      );
      merged.settings.pomodoro = Object.assign(
        {}, DEFAULT_STATE.settings.pomodoro, merged.settings.pomodoro
      );
      merged.settings.aiQuotes = Object.assign(
        {}, DEFAULT_STATE.settings.aiQuotes, merged.settings.aiQuotes
      );
      resolve(merged);
    });
  });
}

/** Write a partial update to storage. */
function _write(partial) {
  return new Promise((resolve) => {
    chrome.storage.local.set(partial, resolve);
  });
}

// ─── Settings ───────────────────────────────────────────────────────────────

/**
 * Returns the full settings object (with defaults filled in).
 * @returns {Promise<object>}
 */
export async function getSettings() {
  const all = await _readAll();
  return all.settings;
}

/**
 * Merge-saves a partial settings object.
 * @param {Partial<object>} partial
 */
export async function saveSettings(partial) {
  const all = await _readAll();
  const updated = Object.assign({}, all.settings, partial);
  // Preserve nested objects properly
  if (partial.schedule) {
    updated.schedule = Object.assign({}, all.settings.schedule, partial.schedule);
  }
  if (partial.pomodoro) {
    updated.pomodoro = Object.assign({}, all.settings.pomodoro, partial.pomodoro);
  }
  if (partial.aiQuotes) {
    updated.aiQuotes = Object.assign({}, all.settings.aiQuotes, partial.aiQuotes);
  }
  await _write({ settings: updated });
}

// ─── Blocklist ──────────────────────────────────────────────────────────────

/**
 * Returns the list of blocked domains.
 * @returns {Promise<string[]>}
 */
export async function getBlocklist() {
  const all = await _readAll();
  return all.blocklist;
}

/**
 * Adds a domain to the blocklist if not already present.
 * Normalises to lowercase with no leading "www.".
 * @param {string} domain
 */
export async function addSite(domain) {
  const normalised = normaliseDomain(domain);
  if (!normalised) return;
  const all = await _readAll();
  if (!all.blocklist.includes(normalised)) {
    all.blocklist.push(normalised);
    await _write({ blocklist: all.blocklist });
  }
}

/**
 * Removes a domain from the blocklist.
 * @param {string} domain
 */
export async function removeSite(domain) {
  const normalised = normaliseDomain(domain);
  const all = await _readAll();
  const updated = all.blocklist.filter((d) => d !== normalised);
  await _write({ blocklist: updated });
}

/**
 * Strips protocol, www prefix, paths, and lowercases a URL/domain string.
 * @param {string} raw
 * @returns {string}
 */
export function normaliseDomain(raw) {
  let s = raw.trim().toLowerCase();
  // Strip protocol
  s = s.replace(/^https?:\/\//, "");
  // Strip www.
  s = s.replace(/^www\./, "");
  // Strip path / query / hash
  s = s.split("/")[0].split("?")[0].split("#")[0];
  return s;
}

// ─── Stats ──────────────────────────────────────────────────────────────────

/**
 * Returns the full stats object.
 * @returns {Promise<object>}
 */
export async function getStats() {
  const all = await _readAll();
  return all.stats;
}

/**
 * Increments the hit count for a domain on today's date.
 * @param {string} domain
 */
export async function incrementHit(domain) {
  const today = todayKey();
  const all = await _readAll();
  const stats = all.stats;
  if (!stats[today]) stats[today] = {};
  stats[today][domain] = (stats[today][domain] ?? 0) + 1;
  await _write({ stats });
}

/**
 * Returns today's hit count for a domain.
 * @param {string} domain
 * @param {object} [stats] optional pre-fetched stats object
 * @returns {Promise<number>}
 */
export async function getTodayHits(domain, stats) {
  const s = stats ?? (await getStats());
  const today = todayKey();
  return s[today]?.[domain] ?? 0;
}

/**
 * Clears all stats.
 */
export async function clearStats() {
  await _write({ stats: {} });
}

/**
 * Returns today's date string in YYYY-MM-DD format.
 * @returns {string}
 */
export function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

// ─── Full export / import ───────────────────────────────────────────────────

/**
 * Exports the entire storage state as a plain object (for JSON download).
 * @returns {Promise<object>}
 */
export async function exportAll() {
  return _readAll();
}

/**
 * Replaces entire storage with imported data.
 * @param {object} data
 */
export async function importAll(data) {
  await _write({
    blocklist: data.blocklist ?? [],
    settings: Object.assign({}, DEFAULT_STATE.settings, data.settings ?? {}),
    stats: data.stats ?? {}
  });
}

/**
 * Initialises storage with default values if not already set.
 * Called on extension install.
 */
export async function initDefaults() {
  const all = await _readAll();
  // _readAll already merges defaults, just write back to persist them
  await _write({
    blocklist: all.blocklist,
    settings: all.settings,
    stats: all.stats
  });
}
