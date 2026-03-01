# 夜桜 Yozakura

**Tokyo Night productivity shield — block distractions with sakura beauty.**

A Chromium extension (Manifest V3) that blocks distracting websites and greets you with a mesmerizing sakura matrix animation whenever you try to visit them.

---

## Features

- **Four blocking modes:**
  - **Manual** — simple on/off toggle via the popup
  - **Duration** — block for a set number of minutes from activation
  - **Schedule** — block between two times of day (e.g., 09:00–17:00)
  - **Pomodoro** — 50-minute work sessions / 10-minute breaks (customizable), blocking only during work phases

- **Beautiful block page:**
  - Full-screen Tokyo Night dark theme
  - Canvas-rendered falling matrix of Japanese characters (kanji, hiragana) and sakura symbols (✿ ❀ 🌸) in pink, purple, and blue
  - Glassmorphism card showing the blocked site, countdown timer, daily hit count, your task reminder, and an AI-generated quote

- **AI-generated quotes:**
  - Supports OpenAI (gpt-4o-mini), Anthropic (claude-haiku-4-5), and Google Gemini (gemini-2.0-flash)
  - Configurable anime character style, tone (motivational / philosophical / stern / funny)
  - Hardcoded fallback quotes when no API key is set

- **Security:**
  - Optional 4-digit PIN (SHA-256 hashed) to protect removing blocked sites

- **Bilingual UI:**
  - Full German (DE) and English (EN) translations

- **Settings page:**
  - Schedule configuration, Pomodoro durations, task reminder text, AI provider/key, data export/import, stats reset

---

## Install as Unpacked Extension (Vivaldi / Chrome)

1. Clone or download this repository.
2. Open your browser and navigate to `chrome://extensions/` (or `vivaldi://extensions/`).
3. Enable **Developer mode** (toggle in the top-right corner).
4. Click **Load unpacked** and select the `yozakura/` folder (the one containing `manifest.json`).
5. The Yozakura icon will appear in your toolbar. Click it to open the popup.

---

## Configure AI Quotes

1. Open the Yozakura **Settings** page via the popup footer link.
2. Under **AI Quotes**, select your provider (OpenAI / Anthropic / Gemini).
3. Paste your API key into the key field (it is stored locally in `chrome.storage.local` and never transmitted anywhere except the selected provider's API).
4. Optionally set your favourite anime character and desired tone.
5. Save. The next time a site is blocked the quote will be fetched live.

---

## Project Structure

```
yozakura/
├── manifest.json                  # MV3 manifest
├── README.md
├── dev-notes.md                   # Architecture decisions
├── src/
│   ├── background/
│   │   └── service-worker.js      # DNR rules, block modes, alarms
│   ├── popup/
│   │   ├── popup.html
│   │   ├── popup.js
│   │   └── popup.css
│   ├── block-page/
│   │   ├── block.html
│   │   ├── block.js
│   │   └── block.css
│   ├── settings/
│   │   ├── settings.html
│   │   ├── settings.js
│   │   └── settings.css
│   └── shared/
│       ├── i18n.js                # DE/EN translations
│       ├── storage.js             # chrome.storage.local wrapper
│       └── ai-quotes.js           # AI quote fetching + fallbacks
└── assets/
    └── icons/
        ├── icon16.png
        ├── icon48.png
        └── icon128.png
```

---

## Roadmap

### Phase 1 — Polish ✅ done

| # | What | Files touched |
|---|------|---------------|
| 1 | Update outdated AI model IDs (`gpt-4o-mini`, `claude-haiku-4-5`, `gemini-2.0-flash`) | `ai-quotes.js`, `i18n.js`, `settings.html` |
| 2 | Move hardcoded EN-only fallback quote into i18n system (`block.fallbackQuote`) | `block.js`, `i18n.js` |
| 3 | Domain input validation (strip protocol, hostname check) + duplicate detection with inline feedback in popup | `popup.js`, `popup.html`, `popup.css`, `i18n.js` |
| 4 | Schedule time validation (HH:MM regex) before saving settings | `settings.js`, `i18n.js` |

---

### Phase 2 — Features (not yet started)

#### Stats Dashboard
Show blocked-attempt counts directly in the settings page. Data is already tracked daily per-domain in `chrome.storage.local` (under `stats`) — just needs a UI to read and display it.

- Add a "Stats" section to `src/settings/settings.html` + `settings.js`
- Read `storage.getStats()`, render a table of today's hits per domain plus a 7-day total row
- No new storage work required

#### Challenge-to-Unblock
Require the user to type a randomly-generated 20-character string before blocking can be disabled. Reduces impulsive override.

- Add `challengeEnabled: false` to `DEFAULT_STATE` in `storage.js`
- Add checkbox in `settings.html` / `settings.js`, persist to `settings.challengeEnabled`
- Add challenge modal overlay in `popup.html` / `popup.js`; intercept all disable actions (manual toggle off, stop pomodoro, etc.)
- Add translation keys to `i18n.js`

#### YouTube Content Filtering
Inject CSS to hide specific YouTube elements (Shorts shelf, recommendations sidebar, comments, thumbnails) without blocking the whole site. Controlled by per-element toggles in settings.

- New `src/content/youtube-filter.js` content script; reads storage and injects hiding CSS
- Add `content_scripts` entry to `manifest.json` (matches `youtube.com`)
- Add `youtubeFilter` object to `DEFAULT_STATE` in `storage.js`
- Add YouTube filter section to `settings.html` / `settings.js`

#### Allow-Only (Whitelist) Mode
Instead of specifying what to block, specify what you're _allowed_ to visit — everything else redirects to the block page. A different mental model suited to deep-work sessions.

- Add `allowlist: []` to `DEFAULT_STATE`; add `getAllowlist()`, `addAllowSite()`, `removeAllowSite()` to `storage.js`
- Add a fifth mode `"allowlist"` to `isBlockingActive()` and `updateDNRRules()` in `service-worker.js`
  - One catch-all DNR rule blocks `*` (`main_frame`), allowlist entries get priority-2 `allow` rules
- Add `ADD_ALLOWSITE` / `REMOVE_ALLOWSITE` message handlers in `service-worker.js`
- Add allowlist management UI to `popup.html` / `popup.js`
- Add translation keys to `i18n.js`

#### Daily Allowance _(deferred — complex)_
Allow N minutes/day on a blocked site before full blocking kicks in. Requires per-domain state tracking, a timer on the block page, and integration with the stats system. Skipped for now.

---

## License

Not yet licensed.
