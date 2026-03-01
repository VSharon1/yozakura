# Yozakura — Competitive Roadmap

## Currently Implemented

- ✅ Custom blocklist (add / remove / validate domains) — popup UI, djb2-hashed DNR rules
- ✅ Allow-only / whitelist mode — catch-all DNR redirect + per-domain allow rules
- ✅ Manual mode — toggle in popup
- ✅ Duration mode — alarm-based, 1–480 min
- ✅ Schedule mode — single time window, overnight support
- ✅ Pomodoro mode — configurable work/break, auto-transitions
- ✅ Daily allowance per site — session-based bypass, per-domain per-day tracking
- ✅ PIN protection (SHA-256) — guards site removal
- ✅ Challenge modal (typing test) — guards disabling any blocking mode
- ✅ Block page — sakura matrix animation (canvas, Tokyo Night palette)
- ✅ Block page — countdown timer (all modes)
- ✅ Block page — daily hit count (per-domain, per-day)
- ✅ Block page — task reminder (from settings)
- ✅ Block page — AI quotes (OpenAI, Anthropic, Gemini + 10 fallbacks)
- ✅ Stats dashboard — today + last 7 days, per-domain hit counts
- ✅ YouTube content filters — Shorts, sidebar, comments, thumbnails via content script
- ✅ Data export / import (JSON) — full storage round-trip
- ✅ Bilingual UI — EN / DE (100+ keys)
- ✅ Domain normalisation + validation — strip protocol, www, paths

---

## Phase 3: Feed & Social Filters

Extend the YouTube content-script model to other major platforms. Pure content scripts — no new permissions required.

- ✅ Twitter/X feed removal — hide timeline feed, trending panel, "Who to follow", notifications dot
- ✅ Reddit feed removal — hide home feed, NSFW blur, promoted posts, awards
- ✅ Instagram feed removal — hide explore grid, reels tab, suggested posts
- ✅ LinkedIn feed removal — hide feed, "People you may know", news module
- ✅ Per-platform filter settings in Settings — extend content-filter section with collapsible platform groups

---

## Phase 4: Power User Blocking

Closes the gap vs. LeechBlock / StayFocusd.

- ✅ Subdomain & path blocking — allow `reddit.com/r/programming` while blocking `reddit.com/r/gaming`; DNR `urlFilter` already supports path patterns, just expose it in UI
- ✅ Wildcard patterns — `*.reddit.com`, `reddit.*` — LeechBlock-style
- ✅ Multiple schedule slots — up to 5 named schedules, each with own time range + days-of-week selector
- ✅ Nuclear option — "Lock" toggle: once enabled, settings page is inaccessible and blocking can't be disabled until the configured end time; backed by `lockedUntil` timestamp
- ✅ Incognito support — add `"incognito": "spanning"` to manifest + instruct user on enabling it in `chrome://extensions/`
- ✅ Context-menu quick-add — `chrome.contextMenus` API: right-click any page → "Block this site with Yozakura"

---

## Phase 5: Stats & Insights

Closes the gap vs. WasteNoTime / StayFocusd.

- [ ] Usage-time tracking — content script sends 30-second heartbeats on blocked sites; background accumulates minutes-on-site in `timeUsage` storage key
- [ ] Streak tracking — count consecutive days where total daily hits = 0; store `streak: { current, longest, lastDate }`
- [ ] Visual bar charts — simple CSS/canvas bar chart in stats dashboard, no external libraries
- [ ] Weekly / monthly aggregation — extend stats dashboard with 30-day view
- [ ] Stats by mode — show which blocking mode was active when hits occurred

---

## Phase 6: UX Polish

Parity with BlockSite / Freedom.

- [ ] Category presets — built-in preset groups: Social (Twitter, Instagram, TikTok, Reddit, Facebook), Gaming (Twitch, Steam), News (Reddit frontpage, news sites), Shopping (Amazon, eBay); one-click adds all to blocklist
- [ ] Browser notifications — `chrome.notifications` API: notify when Pomodoro phase switches, duration block expires
- [ ] Keyboard shortcut — declarative `chrome.commands` shortcut (e.g. Ctrl+Shift+Y) to toggle manual blocking
- [ ] Grace period — configurable N-second countdown on block page before redirect sticks; user can cancel within the window
- [ ] More languages — add French (FR) and Spanish (ES) translation objects to `i18n.js`
- [ ] Custom block-page redirect — option to redirect to a custom URL (e.g. `https://todoist.com`) instead of the sakura page

---

## Phase 7: Commitment & Gamification

Differentiators vs. all competitors.

- [ ] Hard mode — when active, settings page shows "Settings are locked" and all controls are read-only until block ends; backed by `hardMode: boolean` + `lockedUntil: timestamp`
- [ ] Focus session goals — before starting a session, user writes a goal ("Finish feature X"); goal appears on block page and persists until session ends
- [ ] Break activity suggestions — during Pomodoro break, block page suggests activities (stretch, drink water, review notes); configurable list
- [ ] Multiple Pomodoro presets — save named presets ("Deep Work: 90/20", "Standard: 50/10") and switch quickly from popup
- [ ] Achievement badges — unlock visual badges on the block page for streaks, total hours focused, etc.; pure local-storage gamification

---

## Out of Scope

Features that require a server, desktop app, or OS-level access — not buildable as a browser extension alone:

- Cross-device sync (would require a backend / cloud account)
- App blocking (requires OS-level agent; browser extensions cannot block native apps)
- Parental controls / remote management (requires server + authentication infrastructure)
- Website blocking across all browsers simultaneously (OS hosts-file approach or desktop app)
- VPN-based blocking (Freedom's approach; requires a network layer outside the browser)
