# Luminus

A new tab extension that replaces the browser default with a focused, minimal dashboard. Built entirely in vanilla JS — no frameworks, no build tools, no dependencies to install.

---

## Overview

Most new tab pages are either empty or bloated. Luminus sits in the middle — it gives you what you actually reach for: the time, the weather, your most visited sites, and a place to dump tasks. Everything is configurable. Nothing is tracked.

---

## Features

### Clock
Displays hours, minutes, and live seconds alongside the full date. Updates every second without any visible flicker.

### Weather
Pulls current temperature and conditions on load using the Open-Meteo API. No account, no API key, no rate limit for personal use.

### Bookmarks
Up to eight sites pinned as favicon speed-dials below the search bar. Click to visit, hover to remove.

### Task Log
A persistent checklist anchored to the bottom-left on desktop. Tasks survive page reloads via localStorage. Check off, delete individually, or wipe the list entirely.

### Wallpaper
Upload any image as the page background. Four post-processing controls — blur, brightness, vignette, and color tint — let you dial in exactly how it sits behind the content.

### Themes
Four accent color schemes: Cobalt, GX Red, Neon, and Void. Switching theme recolors every interactive element on the page — borders, glows, toggles, sliders, and overlays.

### Visibility Toggles
Every widget can be shown or hidden from the settings panel. Preferences persist across sessions.

---

## Stack

| Layer | Technology |
|---|---|
| Markup | HTML5 |
| Styles | Tailwind CSS (CDN), DaisyUI |
| Logic | Vanilla JavaScript (ES2020+) |
| Weather | Open-Meteo REST API |
| Favicons | Google Favicon Service |
| Storage | localStorage |

---

## Getting Started

No build step required.

**Run locally**

```bash
git clone https://github.com/yourhandle/luminus.git
cd luminus
open index.html
```

**Install as a Chrome extension**

Create a `manifest.json` in the project root:

```json
{
  "manifest_version": 3,
  "name": "Luminus",
  "version": "2.0.0",
  "description": "Beautiful dark glassmorphism new tab dashboard.",
  "chrome_url_overrides": { "newtab": "newtab.html" },
  "permissions": ["storage"],
  "icons": { "16": "icon/icon.png", "48": "icon/icon.png", "128": "icon/icon.png" }
}
```

Then go to `chrome://extensions`, enable Developer Mode, click **Load unpacked**, and select the project folder.

---

## Data & Privacy

Luminus makes one outbound request: Open-Meteo for weather on tab open. No analytics, no telemetry, no external scripts beyond Tailwind and DaisyUI loaded from CDN. All user preferences and bookmarks are written to `localStorage` and never leave the browser.

---

## License

MIT
