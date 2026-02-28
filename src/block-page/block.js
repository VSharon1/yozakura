/**
 * block.js — Yozakura block page logic
 *
 * Responsibilities:
 * - Run the sakura matrix canvas animation.
 * - Read the ?site= URL param and display blocked site info.
 * - Increment the daily hit count for this domain.
 * - Compute and display the countdown timer based on current block mode.
 * - Display the task reminder and an AI-generated (or fallback) quote.
 * - Apply i18n strings based on stored language preference.
 */

import { t } from "../shared/i18n.js";
import {
  getSettings,
  getStats,
  incrementHit,
  getTodayHits
} from "../shared/storage.js";
import { fetchQuote } from "../shared/ai-quotes.js";

// ─── Matrix animation ─────────────────────────────────────────────────────────

const MATRIX_CHARS =
  "桜花夢想忍耐努力集中静寂平和あいうえおかきくけこさしすせそたちつてと✿❀🌸";

/**
 * Runs the falling-characters matrix animation on the given canvas element.
 * Characters cycle through pink, purple, and blue Tokyo Night colours.
 */
function startMatrixAnimation(canvas) {
  const ctx = canvas.getContext("2d");
  const FONT_SIZE = 18;
  const COLORS = ["#ff79c6", "#bd93f9", "#7dcfff", "#ff79c6aa", "#bd93f9aa"];

  let cols, drops, colColors, colAlphas;

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    cols = Math.floor(canvas.width / FONT_SIZE) + 1;
    drops = new Array(cols).fill(1);
    colColors = drops.map(() => COLORS[Math.floor(Math.random() * COLORS.length)]);
    colAlphas = drops.map(() => 0.4 + Math.random() * 0.6);
  }

  function draw() {
    // Semi-transparent background to create the fading trail effect
    ctx.fillStyle = "rgba(26, 27, 38, 0.06)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.font = `${FONT_SIZE}px monospace`;

    for (let i = 0; i < drops.length; i++) {
      const char = MATRIX_CHARS[Math.floor(Math.random() * MATRIX_CHARS.length)];
      const x = i * FONT_SIZE;
      const y = drops[i] * FONT_SIZE;

      // Head character is brighter
      ctx.globalAlpha = colAlphas[i];
      ctx.fillStyle = colColors[i];
      ctx.fillText(char, x, y);

      // Occasionally change column color for visual variety
      if (Math.random() < 0.005) {
        colColors[i] = COLORS[Math.floor(Math.random() * COLORS.length)];
      }

      // Reset drop to top with some randomness once it exits the screen
      if (y > canvas.height && Math.random() > 0.975) {
        drops[i] = 0;
      }
      drops[i]++;
    }
    ctx.globalAlpha = 1;
  }

  resize();
  window.addEventListener("resize", resize);
  setInterval(draw, 50); // ~20 fps — lightweight
}

// ─── Countdown timer ──────────────────────────────────────────────────────────

/**
 * Computes the milliseconds remaining until unblock for the current mode.
 * Returns null if blocking is indefinite or mode cannot be determined.
 * @param {object} settings
 * @returns {number|null}
 */
function computeRemainingMs(settings) {
  switch (settings.mode) {
    case "duration":
      return settings.durationEnd ? Math.max(0, settings.durationEnd - Date.now()) : null;
    case "schedule": {
      // Calculate ms until the schedule's to_time today (or tomorrow if past)
      const [tH, tM] = settings.schedule.to.split(":").map(Number);
      const now = new Date();
      const end = new Date(now);
      end.setHours(tH, tM, 0, 0);
      if (end <= now) end.setDate(end.getDate() + 1);
      return end - now;
    }
    case "pomodoro":
      return settings.pomodoroPhaseEnd
        ? Math.max(0, settings.pomodoroPhaseEnd - Date.now())
        : null;
    default:
      return null;
  }
}

function formatCountdown(ms) {
  if (ms === null) return null;
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// ─── i18n ─────────────────────────────────────────────────────────────────────

function applyI18n(lang) {
  document.documentElement.lang = lang;
  document.getElementById("card-title").textContent = t("block.title", lang);
  document.getElementById("card-blocked-by").textContent = t("block.blockedBy", lang);
  document.getElementById("site-label").textContent = t("block.site", lang);
  document.getElementById("timer-label").textContent = t("block.unblockIn", lang);
  document.getElementById("hits-label").textContent = t("block.hitsToday", lang);
  document.getElementById("reminder-label").textContent = t("block.taskReminder", lang);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function init() {
  // Start matrix animation immediately — it's the most visually impactful part
  startMatrixAnimation(document.getElementById("matrix-canvas"));

  // Parse blocked domain from URL param
  const params = new URLSearchParams(window.location.search);
  const site = params.get("site") ?? "unknown";
  document.getElementById("site-name").textContent = site;
  document.title = `夜桜 — ${site} blocked`;

  // Load settings and stats in parallel
  const [settings, stats] = await Promise.all([getSettings(), getStats()]);

  // Apply translations
  const lang = settings.language ?? "en";
  applyI18n(lang);

  // Increment hit count for this domain (fire-and-forget)
  incrementHit(site);

  // Show updated hit count (use pre-incremented stats + 1)
  const todayHits = await getTodayHits(site, stats);
  document.getElementById("hits-value").textContent = todayHits + 1;

  // Task reminder
  const reminder = settings.taskReminder?.trim();
  if (reminder) {
    document.getElementById("reminder-text").textContent = reminder;
    document.getElementById("reminder-section").hidden = false;
  }

  // Timer / countdown
  const timerRow = document.getElementById("timer-row");
  const timerVal = document.getElementById("timer-value");

  const remaining = computeRemainingMs(settings);
  if (remaining === null) {
    timerVal.textContent = t("block.noTimer", lang);
  } else {
    timerVal.textContent = formatCountdown(remaining);
    // Live countdown
    setInterval(() => {
      const r = computeRemainingMs(settings);
      timerVal.textContent = r !== null ? formatCountdown(r) : t("block.noTimer", lang);
    }, 1000);
  }

  // AI quote (async — show placeholder first)
  const quoteEl = document.getElementById("quote-text");
  try {
    const quote = await fetchQuote(settings.aiQuotes ?? {});
    quoteEl.textContent = quote;
    quoteEl.classList.add("loaded");
  } catch {
    quoteEl.textContent =
      "A sword that is never drawn grows dull. Sharpen your mind — return to your task.";
    quoteEl.classList.add("loaded");
  }
}

init();
