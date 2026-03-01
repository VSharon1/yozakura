# Yozakura — Developer Notes

## Why Manifest V3?

MV3 is the current and future standard for Chrome extensions. The key change relevant to us is that background pages are replaced by **service workers**, which are event-driven and can be terminated at any time by the browser. This means:

- We cannot rely on in-memory state; everything persistent must live in `chrome.storage.local`.
- Long-running timers (`setInterval`) are unreliable. We use `chrome.alarms` instead, which survives service-worker restarts.
- The blocking mechanism uses `declarativeNetRequest` (DNR) rather than the deprecated `webRequest` blocking. DNR rules are declarative JSON objects managed via `chrome.declarativeNetRequest.updateDynamicRules()`.

## Why Vanilla JS?

No build step, no bundler, no framework. The extension is small and the benefit of React/Vue overhead would be negative. Using ES modules (`"type": "module"` in the manifest background entry) gives us clean imports. Each page (popup, settings, block) is a standalone HTML file with its own script — exactly how MV3 expects it.

## How declarativeNetRequest Works

Each blocked domain becomes a DNR rule with:
- `action.type: "redirect"` pointing to `chrome.runtime.getURL("src/block-page/block.html?site=<domain>")`
- `condition.urlFilter: "||<domain>^"` which matches the domain and all subpaths
- `condition.resourceTypes: ["main_frame"]` so only top-level navigations are blocked (not sub-resources)

Rules are added/removed dynamically via `chrome.declarativeNetRequest.updateDynamicRules({ addRules, removeRuleIds })`. Each rule gets a stable integer ID derived from the domain string (via a simple hash).

**Important:** Rules are only active when blocking is considered active by `isBlockingActive()`. When blocking is inactive, all dynamic rules are removed. When it becomes active, they are re-added.

## How PIN Hashing Works

The PIN is a 4-digit string. Before storing it we compute `SHA-256` via the Web Crypto API (`crypto.subtle.digest("SHA-256", encoder.encode(pin))`), convert to a hex string, and store only the hash. On verification we hash the entered PIN and compare hashes. The raw PIN never touches `chrome.storage`.

## How the Four Block Modes Interact with the Service Worker

### manual
`settings.manualActive` boolean. Blocking is active when `manualActive === true`. No alarms needed.

### duration
`settings.durationEnd` is a Unix timestamp (ms). Blocking is active when `Date.now() < durationEnd`. An alarm `"yozakura-duration-end"` fires at `durationEnd` to call `updateDNRRules()` and clear the state.

### schedule
`settings.schedule.from` and `settings.schedule.to` are `"HH:MM"` strings. `isBlockingActive()` checks whether the current local time falls within the window. An alarm `"yozakura-schedule-check"` fires every minute to re-evaluate and update DNR rules accordingly.

### pomodoro
State: `pomodoroPhase` (`"work"` | `"break"` | `"idle"`), `pomodoroPhaseEnd` (timestamp).
- `startPomodoro()` sets phase to `"work"`, computes end time, creates alarm `"yozakura-pomodoro"`.
- On alarm: if phase was `"work"`, switch to `"break"` and reschedule; if `"break"`, switch back to `"work"` and reschedule.
- Blocking is active only during `"work"` phase.
- `stopPomodoro()` clears the alarm and sets phase to `"idle"`.

## Hit Count Tracking

On each DNR redirect the block page reads the `?site=` param and calls `storage.incrementHit(domain)`. The service worker itself does not intercept individual navigations — the block page JS handles the increment. Stats are stored as `{ "stats": { "YYYY-MM-DD": { "domain.com": N } } }`.

## Storage Schema

```js
{
  // Block list
  blocklist: ["domain.com", ...],

  // Settings
  settings: {
    mode: "manual" | "duration" | "schedule" | "pomodoro",
    manualActive: false,
    durationMinutes: 25,
    durationEnd: null,          // Unix ms or null
    schedule: {
      enabled: false,
      from: "09:00",
      to: "17:00"
    },
    pomodoro: {
      workMinutes: 50,
      breakMinutes: 10
    },
    pomodoroPhase: "idle",       // "work" | "break" | "idle"
    pomodoroPhaseEnd: null,      // Unix ms or null
    pin: null,                   // SHA-256 hex or null
    language: "en",              // "en" | "de"
    taskReminder: "",
    aiQuotes: {
      provider: "none",          // "none" | "openai" | "anthropic" | "gemini"
      apiKey: "",
      character: "",
      tone: "motivational"       // "motivational" | "philosophical" | "stern" | "funny"
    }
  },

  // Daily hit counts: { "YYYY-MM-DD": { "domain.com": N } }
  stats: {}
}
```
