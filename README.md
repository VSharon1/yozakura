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
  - Supports OpenAI (gpt-4o), Anthropic (claude-3-5-haiku), and Google Gemini (gemini-1.5-flash)
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
├── _dev-notes.md                  # Architecture decisions
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

## License

Not yet licensed.
