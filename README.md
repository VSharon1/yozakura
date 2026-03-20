# 夜桜 Yozakura

**Tokyo Night productivity shield — block distractions with sakura beauty.**

A Chromium extension (Manifest V3) that blocks distracting websites and greets you with a mesmerizing sakura matrix animation whenever you try to visit them.

---

## Features

- **Four blocking modes:**
  - **Manual** — simple on/off toggle via the popup
  - **Duration** — block for a set number of minutes from activation
  - **Schedule** — block between two times of day (e.g., 09:00–17:00), with multiple named slots and day-of-week selection
  - **Pomodoro** — configurable work/break sessions, blocking only during work phases

- **Beautiful block page:**
  - Full-screen Tokyo Night dark theme
  - Canvas-rendered falling matrix of Japanese characters (kanji, hiragana) and sakura symbols (✿ ❀ 🌸) in pink, purple, and blue
  - Glassmorphism card showing the blocked site, countdown timer, daily hit count, your task reminder, and an AI-generated quote

- **AI-generated quotes:**
  - Supports OpenAI (gpt-4o-mini), Anthropic (claude-haiku-4-5), and Google Gemini (gemini-2.0-flash)
  - Configurable anime character style and tone (motivational / philosophical / stern / funny)
  - Hardcoded fallback quotes when no API key is set

- **Flexible blocking rules:**
  - Block by domain, subdomain, or path (`reddit.com/r/gaming` while allowing `reddit.com/r/programming`)
  - Wildcard patterns (`*.reddit.com`, `reddit.*`)
  - Allow-only (whitelist) mode — everything is blocked except your allowed list
  - Daily allowance — N minutes per day before full blocking kicks in
  - Context-menu quick-add — right-click any page → "Block this site with Yozakura"

- **Content filters (without full blocking):**
  - YouTube: hide Shorts, sidebar recommendations, comments, thumbnails
  - Twitter/X, Reddit, Instagram, LinkedIn: hide feeds and distracting UI elements

- **Security:**
  - Optional 4-digit PIN (SHA-256 hashed) to protect removing blocked sites
  - Challenge modal (typing test) to guard disabling any blocking mode
  - Nuclear lock — once enabled, settings are inaccessible until the configured end time

- **Bilingual UI:** full English and German translations

- **Settings page:** schedule configuration, Pomodoro durations, task reminder text, AI provider/key, data export/import, stats dashboard

---

## Install as Unpacked Extension (Chrome / Vivaldi / Edge)

1. Clone or download this repository.
2. Open your browser and navigate to `chrome://extensions/`.
3. Enable **Developer mode** (toggle in the top-right corner).
4. Click **Load unpacked** and select the `yozakura/` folder (the one containing `manifest.json`).
5. The Yozakura icon will appear in your toolbar. Click it to open the popup.

---

## Configure AI Quotes

1. Open the Yozakura **Settings** page via the popup footer link.
2. Under **AI Quotes**, select your provider (OpenAI / Anthropic / Gemini).
3. Paste your API key — it is stored locally in `chrome.storage.local` and never transmitted anywhere except the selected provider's API.
4. Optionally set your favourite anime character and desired tone.
5. Save. The next block page load will fetch a live quote.

---

## Project Structure

```
yozakura/
├── manifest.json                  # MV3 manifest
├── src/
│   ├── background/
│   │   └── service-worker.js      # DNR rules, block modes, alarms
│   ├── popup/
│   │   ├── popup.html / .js / .css
│   ├── block-page/
│   │   ├── block.html / .js / .css
│   ├── settings/
│   │   ├── settings.html / .js / .css
│   ├── content/
│   │   └── *-filter.js            # Per-platform content scripts
│   └── shared/
│       ├── i18n.js                # EN/DE translations
│       ├── storage.js             # chrome.storage.local wrapper
│       └── ai-quotes.js           # AI quote fetching + fallbacks
└── assets/icons/
```

---

## Architecture

**No build step.** Vanilla JS ES modules, loaded directly by the browser.

**All state lives in `chrome.storage.local`** — the MV3 service worker is ephemeral and can be killed at any time. `src/shared/storage.js` is the single interface; nothing else calls `chrome.storage` directly.

**Blocking uses `declarativeNetRequest` (DNR)** — each blocked domain becomes a redirect rule pointing to `block.html?site=<domain>`. Rule IDs are derived from a djb2 hash of the domain. Rules are re-applied on every service-worker restart via `restoreAlarms()` + `updateDNRRules()`.

**Popup ↔ service worker communication** uses `chrome.runtime.sendMessage` with typed message objects (`ADD_SITE`, `REMOVE_SITE`, `SET_MANUAL`, `START_DURATION`, etc.). The popup never mutates storage directly.

**Alarms** (`chrome.alarms`) survive browser restarts but not all service-worker restarts, so `restoreAlarms()` re-registers them defensively on `chrome.runtime.onStartup`.

---

## Roadmap

See [ROADMAP.md](ROADMAP.md) for planned features.

---

## License

[MIT](LICENSE)
