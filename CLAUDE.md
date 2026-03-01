# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

Yozakura is a **Chromium Manifest V3 extension** (no build step, no bundler, vanilla JS ES modules) that blocks distracting websites and redirects them to a sakura matrix animation page. Load it as an unpacked extension via `chrome://extensions/` → Developer mode → Load unpacked, pointing at the repo root (where `manifest.json` lives).

There are no npm scripts, no tests, no linter config. Development is done by editing files and reloading the extension in the browser.

## Reloading after changes

- **Service worker changes** (`src/background/`): go to `chrome://extensions/`, click the reload icon on the Yozakura card, then reopen the popup.
- **Popup/settings/block-page changes**: just close and reopen the popup (or refresh the settings/block page tab). The browser re-parses HTML/JS on each open.
- **manifest.json changes**: always requires a full reload from `chrome://extensions/`.

The service worker can be inspected via the "service worker" link on the extensions page (opens DevTools). The popup has its own DevTools (right-click → Inspect Popup).

## Architecture

### Data flow

All persistent state lives in `chrome.storage.local` — the service worker is ephemeral (MV3) and cannot hold in-memory state. `src/shared/storage.js` is the single interface to storage; nothing else calls `chrome.storage` directly (except one legacy call in `popup.js` for the language toggle).

### Popup ↔ Service worker communication

The popup and settings page never touch storage directly for mutations. They use `chrome.runtime.sendMessage` with typed message objects. The service worker's `handleMessage` switch in `service-worker.js` handles: `ADD_SITE`, `REMOVE_SITE`, `SET_MANUAL`, `START_DURATION`, `START_POMODORO`, `STOP_POMODORO`, `UPDATE_RULES`, `GET_STATE`.

### Blocking mechanism

`updateDNRRules()` in the service worker is the central function — it reads the blocklist and current mode state, then either installs or clears all `declarativeNetRequest` dynamic redirect rules. Each blocked domain gets a rule that redirects top-level navigations to `src/block-page/block.html?site=<domain>`. Rule IDs are derived from a djb2 hash of the domain string.

`isBlockingActive()` is called before every rule update and contains the mode-specific logic:
- **manual**: `settings.manualActive`
- **duration**: `Date.now() < settings.durationEnd`
- **schedule**: current local time within `settings.schedule.from`–`settings.schedule.to` (handles overnight ranges)
- **pomodoro**: `settings.pomodoroPhase === "work"`

### Alarms

`chrome.alarms` survive browser restarts but not all service-worker restarts, so `restoreAlarms()` re-registers them defensively on `onStartup`. Three named alarms: `yozakura-duration-end`, `yozakura-schedule-check` (fires every 1 min), `yozakura-pomodoro`.

### Block page

`src/block-page/block.js` reads the `?site=` URL param, calls `storage.incrementHit(domain)` to track today's hit count, and fetches an AI quote via `src/shared/ai-quotes.js`. It also renders the canvas sakura matrix animation.

### i18n

`src/shared/i18n.js` exports a `t(key, lang)` function and a `translations` object with `en` and `de` keys. Language is stored in `settings.language` and read on page init.

### Storage schema

```js
{
  blocklist: string[],
  settings: {
    mode: "manual" | "duration" | "schedule" | "pomodoro",
    manualActive: boolean,
    durationMinutes: number,
    durationEnd: number | null,       // Unix ms
    schedule: { enabled: boolean, from: "HH:MM", to: "HH:MM" },
    pomodoro: { workMinutes: number, breakMinutes: number },
    pomodoroPhase: "idle" | "work" | "break",
    pomodoroPhaseEnd: number | null,  // Unix ms
    pin: string | null,               // SHA-256 hex
    language: "en" | "de",
    taskReminder: string,
    aiQuotes: {
      provider: "none" | "openai" | "anthropic" | "gemini",
      apiKey: string,
      character: string,
      tone: "motivational" | "philosophical" | "stern" | "funny"
    }
  },
  stats: { "YYYY-MM-DD": { "domain.com": number } }
}
```

`storage.saveSettings(partial)` does a shallow merge; nested objects (`schedule`, `pomodoro`, `aiQuotes`) are also merged one level deep.

## Key constraints (MV3)

- No background page — only a service worker that can be killed at any time. Never rely on module-level variables surviving between events.
- Blocking uses `declarativeNetRequest` redirect rules, not `webRequest`. Rules must be re-applied after any service-worker restart.
- `chrome.alarms` minimum period is 1 minute (browser enforced).
- `fetch()` calls to external APIs (for AI quotes) happen from the block page JS context, not the service worker.
