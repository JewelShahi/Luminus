/* ═══════════════════════════════════════════════════════════
   LUMINUS NEW TAB — script.js
   Load order: color.js → live-scene.js → script.js

   CONTENTS
   01. Config & constants
   02. Storage helpers
   03. State
   04. Boot
   05. Username
   06. Clock
   07. Greeting
   08. Weather
   09. Sidebar
   10. Themes (built-in + custom)
   11. Color wheel (reusable)
   12. Custom theme editor
   13. Live scene controls
   14. Widget visibility
   15. Event delegation
   16. Modals (shared helper, link/task modals, task color picker)
   17. Bookmarks
   18. Tasks (render, toggle, delete, drag & drop reorder)
   19. Task log collapse
   20. Background / wallpaper
   21. Wallpaper presets
   22. Wallpaper effects (blur / brightness / vignette / tint)
   23. Offline toast
   24. Teardown
═════════════════════════════════════════════════════════════ */

/* ══ 01. CONFIG & CONSTANTS ═══════════════════════════════════ */
const MAX_BOOKMARKS = 12;
const MAX_CUSTOM_THEMES = 8;
const FALLBACK_BG = "backgrounds/background-image.png";

// 4K Wallpapers Directory Mapping (Cloudinary-hosted, auto-optimized, and free to use)
// For optimized video background /w_1920,q_auto:eco,f_auto,fps_30 after the video/upload segment and the version to be entered
const PRESET_WALLPAPERS = [
  {
    id: "gojo-1",
    value:
      "https://res.cloudinary.com/dbgpxmjln/image/upload/w_2560,q_90,f_auto/v1779652796/satoru-gojo-1-4k_v0thvc.jpg",
  },
  {
    id: "kagurabachi",
    value:
      "https://res.cloudinary.com/dbgpxmjln/image/upload/v1785792406/kagurabachi_qdtheh.jpg",
  },
  {
    id: "gojo-3",
    value:
      "https://res.cloudinary.com/dbgpxmjln/image/upload/w_2560,q_90,f_auto/v1779652901/gojo_eyes_rwqbsb.png",
  },
  {
    id: "kafka-hibino",
    value:
      "https://res.cloudinary.com/dbgpxmjln/image/upload/v1785792544/kafka-hibino_loenym.jpg",
  },
  {
    id: "hoshino",
    value:
      "https://res.cloudinary.com/dbgpxmjln/image/upload/v1785793600/hoshino_b3wd5k.jpg",
  },
  {
    id: "liebe-black-clover",
    value:
      "https://res.cloudinary.com/dbgpxmjln/image/upload/w_2560,q_90,f_auto/v1779654342/liebe-black-clover_tkchnm.jpg",
  },
  {
    id: "default-bg",
    value: "backgrounds/background-image.png",
  },
  {
    id: "sukuna-vs-gojo",
    value:
      "https://res.cloudinary.com/dbgpxmjln/video/upload/w_1920,q_auto:eco,f_auto,fps_30/v1785789580/sukuna-vs-gojo_dwkzlp.mp4",
  },
  {
    id: "kokushibo",
    value:
      "https://res.cloudinary.com/dbgpxmjln/video/upload/w_1920,q_auto:eco,f_auto,fps_30/v1785793601/kokushibo_hq6r3t.mp4",
  },
  {
    id: "sung-jin-woo",
    value:
      "https://res.cloudinary.com/dbgpxmjln/video/upload/w_2560,q_auto:eco,f_auto,fps_30/v1785794123/sung-jin-woo_q4bkvh.mp4",
  },
  {
    id: "sung-jin-woo-stare",
    value:
      "https://res.cloudinary.com/dbgpxmjln/video/upload/w_2560,q_auto:eco,f_auto,fps_30/v1785933141/sung-jin-woo-stare_akcntt.mp4",
  },
  {
    id: "gojo-domain-expansion",
    value:
      "https://res.cloudinary.com/dbgpxmjln/video/upload/w_2560,q_auto:eco,f_auto,fps_30/v1785933193/gojo-domain-expansion_hccc1d.mp4",
  },
];

// Built-in skins (colors live in styles.css → [data-theme="..."])
const BUILTIN_THEMES = ["blue", "red", "purple", "green", "orange"];
const DEFAULT_THEME = "blue";

// One-click starting points inside the custom theme editor
const CUSTOM_THEME_PRESETS = [
  {
    name: "Synthwave",
    primary: "#ff2bd6",
    a: "#7c3aed",
    b: "#ff2bd6",
    c: "#22d3ee",
  },
  {
    name: "Deep Sea",
    primary: "#06b6d4",
    a: "#0ea5e9",
    b: "#14b8a6",
    c: "#1e3a8a",
  },
  {
    name: "Matcha",
    primary: "#84cc16",
    a: "#22c55e",
    b: "#a3e635",
    c: "#0f766e",
  },
  {
    name: "Blood Moon",
    primary: "#ef4444",
    a: "#7f1d1d",
    b: "#f97316",
    c: "#db2777",
  },
  {
    name: "Golden Hour",
    primary: "#f59e0b",
    a: "#f97316",
    b: "#fde047",
    c: "#ec4899",
  },
  {
    name: "Glacier",
    primary: "#7dd3fc",
    a: "#93c5fd",
    b: "#c4b5fd",
    c: "#67e8f9",
  },
  {
    name: "Obsidian",
    primary: "#a1a1aa",
    a: "#3f3f46",
    b: "#71717a",
    c: "#52525b",
  },
];

// Task priority colors (tap one in the task modal, or pick any color on the wheel)
const TASK_COLORS = [
  { name: "Urgent", color: "#ef4444" },
  { name: "High", color: "#f97316" },
  { name: "Medium", color: "#eab308" },
  { name: "Low", color: "#22c55e" },
  { name: "Later", color: "#3b82f6" },
  { name: "Idea", color: "#a855f7" },
];

// Live scene defaults (saved as one JSON object)
const SCENE_DEFAULTS = {
  enabled: false,
  scene: "aurora",
  intensity: 0.9,
  speed: 1,
  cursor: true,
  dayCycle: true,
  blend: false,
  eco: false,
};

// Widget visibility config
const WIDGET_MAP = {
  weather: {
    ids: ["weather-widget", "weather-widget-desktop"],
    key: "gx_vis_weather",
  },
  clock: { ids: ["time-widget", "time-widget-desktop"], key: "gx_vis_clock" },
  bookmarks: { ids: ["bookmark-widget"], key: "gx_vis_bookmarks" },
  tasks: { ids: ["notes-widget", "notes-widget-mobile"], key: "gx_vis_tasks" },
};

// Wallpaper FX defaults
const DEFAULT_WALLPAPER_FX = {
  blur: 2.5,
  brightness: 0.25,
  vignette: 0.05,
  tint: 0.15,
};

/* ══ 02. STORAGE HELPERS ══════════════════════════════════════ */
function safeGet(key) {
  const v = localStorage.getItem(key);
  return v === null || v === "null" || v === "undefined" || v === "" ? null : v;
}

function readJSON(key, fallback) {
  try {
    const v = JSON.parse(localStorage.getItem(key));
    return v ?? fallback;
  } catch {
    return fallback;
  }
}

function writeJSON(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function escapeHtml(str) {
  return String(str ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c],
  );
}

// Set the same text on several elements (mobile + desktop copies)
function setTextAll(ids, text) {
  ids.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  });
}

/* ══ 03. STATE ════════════════════════════════════════════════ */
function getDefaultBookmarks() {
  return [
    { name: "YouTube", url: "https://www.youtube.com" },
    { name: "Discord", url: "https://discord.com/login" },
  ];
}

const state = {
  theme: safeGet("gx_theme") || DEFAULT_THEME,
  bookmarks: (() => {
    const p = readJSON("gx_bookmarks", null);
    return Array.isArray(p) && p.length ? p : getDefaultBookmarks();
  })(),
  tasks: (() => {
    const p = readJSON("gx_tasks", []);
    return Array.isArray(p) ? p : [];
  })(),
  hasBg: !!safeGet("gx_bg"),
  username: safeGet("gx_username") || "",
  customThemes: (() => {
    const p = readJSON("gx_custom_themes", []);
    return Array.isArray(p)
      ? p.filter((t) => t && t.id && LuminusColor.isHex(t.primary))
      : [];
  })(),
  customActive: safeGet("gx_custom_active"),
  scene: { ...SCENE_DEFAULTS, ...readJSON("gx_scene", {}) },
};

const wallpaperFX = (() => {
  const fx = {};
  for (const key in DEFAULT_WALLPAPER_FX) {
    const raw = localStorage.getItem(`gx_${key}`);
    const num = Number(raw);
    const isBad =
      raw === null ||
      raw === "null" ||
      raw === "undefined" ||
      raw === "" ||
      Number.isNaN(num);
    fx[key] = isBad ? DEFAULT_WALLPAPER_FX[key] : num;
    localStorage.setItem(`gx_${key}`, fx[key]);
  }
  return fx;
})();

/* ══ 04. BOOT ═════════════════════════════════════════════════ */
document.addEventListener("DOMContentLoaded", () => {
  initClock();
  initGreeting();
  getWeather();
  renderBookmarks();
  renderTasks();
  initLiveScene(); // before applyTheme so the scene gets the theme colors
  applyTheme(state.theme);
  setupSidebar();
  setupBg();
  initUsername();
  renderWallpaperButtons();
  initWallpaperControls();
  initWidgetVisibility();
  setupEventDelegation();
  initModals();
  initThemeEditor();
  initOfflineToast();
  initTaskLogCollapse();
  initTaskDrag();
});

/* ══ 05. USERNAME ═════════════════════════════════════════════ */
function initUsername() {
  const input = document.getElementById("username-input");
  if (!input) return;
  input.value = state.username;
  input.addEventListener("input", (e) => {
    state.username = e.target.value.trim();
    localStorage.setItem("gx_username", state.username);
    updateGreeting();
  });
}

/* ══ 06. CLOCK ════════════════════════════════════════════════ */
let clockIntervalId = null;

function initClock() {
  const targets = [
    {
      hm: document.getElementById("h-m"),
      sec: document.getElementById("seconds"),
      date: document.getElementById("date"),
    },
    {
      hm: document.getElementById("h-m-desktop"),
      sec: document.getElementById("seconds-desktop"),
      date: document.getElementById("date-desktop"),
    },
  ];
  const tick = () => {
    const now = new Date();
    const H = String(now.getHours()).padStart(2, "0");
    const M = String(now.getMinutes()).padStart(2, "0");
    const S = String(now.getSeconds()).padStart(2, "0");
    const dateStr = now
      .toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
      })
      .toUpperCase();
    targets.forEach((t) => {
      if (t.hm) t.hm.textContent = `${H}:${M}`;
      if (t.sec) t.sec.textContent = S;
      if (t.date) t.date.textContent = dateStr;
    });
  };
  tick();
  if (clockIntervalId) clearInterval(clockIntervalId);
  clockIntervalId = setInterval(tick, 1000);
}

/* ══ 07. GREETING ═════════════════════════════════════════════ */
let greetingIntervalId = null;

const slots = [
  {
    min: 0,
    max: 3,
    greet: "A quiet hello",
    focus: "Keeping late hours? Take things at your own pace.",
  },
  {
    min: 3,
    max: 5,
    greet: "An early hello",
    focus: "A quiet start. Make room for rest, too.",
  },
  {
    min: 5,
    max: 7,
    greet: "Good early morning",
    focus: "A fresh start, ahead of the day.",
  },
  {
    min: 7,
    max: 9,
    greet: "Good morning",
    focus: "Ease into the day. Choose what matters.",
  },
  {
    min: 9,
    max: 11,
    greet: "Good morning",
    focus: "Fresh perspective. Clear priorities.",
  },
  {
    min: 11,
    max: 12,
    greet: "Good late morning",
    focus: "A little progress before a well-earned pause.",
  },
  {
    min: 12,
    max: 13,
    greet: "Good afternoon",
    focus: "Pause, recharge, and enjoy a fresh perspective.",
  },
  {
    min: 13,
    max: 15,
    greet: "Good afternoon",
    focus: "Reset your focus. Take the next step.",
  },
  {
    min: 15,
    max: 17,
    greet: "Good afternoon",
    focus: "Keep it steady. Make each step count.",
  },
  {
    min: 17,
    max: 18,
    greet: "Good late afternoon",
    focus: "Bring your priorities to a comfortable close.",
  },
  {
    min: 18,
    max: 20,
    greet: "Good evening",
    focus: "A change of pace. Make time for yourself.",
  },
  {
    min: 20,
    max: 22,
    greet: "Good evening",
    focus: "Let things settle. Enjoy a quieter moment.",
  },
  {
    min: 22,
    max: 24,
    greet: "A late hello",
    focus: "Wind down gently. Tomorrow is a fresh start.",
  },
];

function updateGreeting() {
  const greetingEl = document.getElementById("greeting-text");
  const focusEl = document.getElementById("focus-text");
  if (!greetingEl || !focusEl) return;
  const hour = new Date().getHours();
  const slot = slots.find((s) => hour >= s.min && hour < s.max) || slots[4];
  const name = state.username ? `, ${state.username}` : "";
  greetingEl.textContent = `${slot.greet}${name}.`;
  focusEl.textContent = slot.focus;
}

function initGreeting() {
  updateGreeting();
  if (greetingIntervalId) clearInterval(greetingIntervalId);
  greetingIntervalId = setInterval(updateGreeting, 60000);
}

/* ══ 08. WEATHER ══════════════════════════════════════════════
   Drop-in replacement for section 08 in script.js.

   • Covers EVERY Open-Meteo weather code (WMO 4677 subset):
     0 1 2 3 · 45 48 · 51 53 55 · 56 57 · 61 63 65 · 66 67
     71 73 75 · 77 · 80 81 82 · 85 86 · 95 96 99
   • Day + night versions (sun ↔ crescent moon, darker clouds at night)
   • Intensity is visible: light / moderate / heavy = more drops/flakes
   • wttr.in fallback now uses its numeric weather code + real
     sunrise/sunset instead of guessing from the description text
   • Each SVG gets its own gradient id prefix, so the mobile and desktop
     copies never clash (a hidden copy can't break the visible one)
═════════════════════════════════════════════════════════════ */

/* ── WMO code table: description + how to draw it ─────────── */
// sky:    clear | few | partly | overcast | precip | shower | storm | fog
// fall:   drizzle | rain | frz-drizzle | frz-rain | snow | grains | hail
// n:      intensity (how many drops / flakes)
const WMO_WEATHER = {
  0: { desc: "Clear sky", sky: "clear" },
  1: { desc: "Mainly clear", sky: "few" },
  2: { desc: "Partly cloudy", sky: "partly" },
  3: { desc: "Overcast", sky: "overcast" },

  45: { desc: "Fog", sky: "fog" },
  48: { desc: "Freezing fog", sky: "fog", rime: true },

  51: { desc: "Light drizzle", sky: "precip", fall: "drizzle", n: 1 },
  53: { desc: "Drizzle", sky: "precip", fall: "drizzle", n: 2 },
  55: { desc: "Dense drizzle", sky: "precip", fall: "drizzle", n: 3 },
  56: {
    desc: "Light freezing drizzle",
    sky: "precip",
    fall: "frz-drizzle",
    n: 1,
  },
  57: {
    desc: "Dense freezing drizzle",
    sky: "precip",
    fall: "frz-drizzle",
    n: 2,
  },

  61: { desc: "Light rain", sky: "precip", fall: "rain", n: 1 },
  63: { desc: "Rain", sky: "precip", fall: "rain", n: 2 },
  65: { desc: "Heavy rain", sky: "precip", fall: "rain", n: 3, dark: true },
  66: { desc: "Light freezing rain", sky: "precip", fall: "frz-rain", n: 1 },
  67: {
    desc: "Heavy freezing rain",
    sky: "precip",
    fall: "frz-rain",
    n: 2,
    dark: true,
  },

  71: { desc: "Light snow", sky: "precip", fall: "snow", n: 1 },
  73: { desc: "Snow", sky: "precip", fall: "snow", n: 2 },
  75: { desc: "Heavy snow", sky: "precip", fall: "snow", n: 3 },
  77: { desc: "Snow grains", sky: "precip", fall: "grains", n: 2 },

  80: { desc: "Light rain showers", sky: "shower", fall: "rain", n: 1 },
  81: { desc: "Rain showers", sky: "shower", fall: "rain", n: 2 },
  82: {
    desc: "Violent rain showers",
    sky: "shower",
    fall: "rain",
    n: 3,
    dark: true,
  },
  85: { desc: "Light snow showers", sky: "shower", fall: "snow", n: 1 },
  86: { desc: "Heavy snow showers", sky: "shower", fall: "snow", n: 3 },

  95: { desc: "Thunderstorm", sky: "storm" },
  96: { desc: "Thunderstorm with hail", sky: "storm", fall: "hail", n: 1 },
  99: {
    desc: "Thunderstorm with heavy hail",
    sky: "storm",
    fall: "hail",
    n: 2,
  },

  // Not a WMO code: only the wttr.in fallback reports thunder + snow
  1095: {
    desc: "Thunderstorm with snow",
    sky: "storm",
    fall: "storm-snow",
    n: 1,
  },
};

// Unknown code → closest known code below it (keeps the icon sensible)
function getWeatherInfo(code) {
  code = Number(code);
  if (WMO_WEATHER[code]) return WMO_WEATHER[code];
  const known = Object.keys(WMO_WEATHER)
    .map(Number)
    .filter((c) => c <= code);
  return WMO_WEATHER[known.length ? Math.max(...known) : 3];
}

/* ── Icon renderer (32×32) ────────────────────────────────── */
function weatherIconSvg(code, isNight = false, uid = "wx") {
  const info = getWeatherInfo(code);
  const id = (name) => `${uid}-${name}`;
  const url = (name) => `url(#${id(name)})`;
  const r1 = (v) => Math.round(v * 100) / 100;

  // ── palette ──
  const C = {
    sunRay: "#FBBF24",
    rain: "#60A5FA",
    rainHeavy: "#3B82F6",
    drizzle: "#93C5FD",
    ice: "#67E8F9",
    snow: "#E0F2FE",
    hail: "#F0F9FF",
    hailEdge: "#7DD3FC",
    fog: isNight ? "#94A3B8" : "#CBD5E1",
    star: "#F8FAFC",
  };

  // ── gradients (unique ids per svg) ──
  const defs = `
    <defs>
      <radialGradient id="${id("sun")}" cx="40%" cy="38%" r="70%">
        <stop offset="0" stop-color="#FEF3C7"/><stop offset="0.45" stop-color="#FCD34D"/><stop offset="1" stop-color="#F59E0B"/>
      </radialGradient>
      <linearGradient id="${id("moon")}" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#CBD5E1"/>
      </linearGradient>
      <linearGradient id="${id("cl")}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${isNight ? "#CBD5E1" : "#FFFFFF"}"/><stop offset="1" stop-color="${isNight ? "#7C8BA1" : "#CBD5E1"}"/>
      </linearGradient>
      <linearGradient id="${id("clBack")}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${isNight ? "#8392A8" : "#B8C4D3"}"/><stop offset="1" stop-color="${isNight ? "#4B5A70" : "#8796AA"}"/>
      </linearGradient>
      <linearGradient id="${id("clDark")}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${isNight ? "#7C8BA1" : "#A3B1C2"}"/><stop offset="1" stop-color="${isNight ? "#3F4B5E" : "#5B6B80"}"/>
      </linearGradient>
      <linearGradient id="${id("bolt")}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#FEF08A"/><stop offset="1" stop-color="#F59E0B"/>
      </linearGradient>
    </defs>`;

  // ── building blocks ──

  // Cloud: one smooth path (local box ≈ x 2.8–24.3, y 3.7–17).
  // Placed by its bottom-center point (cx, bottom) and scale s.
  const CLOUD_PATH =
    "M6.5 17h13a4.5 4.5 0 0 0 .5-8.97A6.5 6.5 0 0 0 7.6 8.6 4.25 4.25 0 0 0 6.5 17z";
  const cloud = (cx, bottom, s, fill) =>
    `<path d="${CLOUD_PATH}" fill="${fill}" transform="translate(${r1(cx - 13.55 * s)} ${r1(bottom - 17 * s)}) scale(${s})"/>`;

  // Sun: gradient disc + 8 evenly spaced rounded rays
  const sun = (cx, cy, r) => {
    let rays = "";
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      const c = Math.cos(a),
        s = Math.sin(a);
      rays += `<line x1="${r1(cx + c * (r + 1.9))}" y1="${r1(cy + s * (r + 1.9))}" x2="${r1(cx + c * (r + 3.9))}" y2="${r1(cy + s * (r + 3.9))}"/>`;
    }
    return (
      `<g stroke="${C.sunRay}" stroke-width="${r1(Math.max(1.3, r * 0.32))}" stroke-linecap="round">${rays}</g>` +
      `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${url("sun")}"/>`
    );
  };

  // Crescent moon (true crescent path — no dark "cover" circle)
  // Path box is ~3–21 in a 24 grid, so size = rendered width.
  const moon = (cx, cy, size) => {
    const k = size / 18;
    return `<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" fill="${url("moon")}" transform="translate(${r1(cx - 12 * k)} ${r1(cy - 12 * k)}) scale(${r1(k)})"/>`;
  };

  // 4-point sparkle star
  const star = (x, y, r, op = 1) =>
    `<path d="M${x} ${y - r}Q${x} ${y} ${x + r} ${y}Q${x} ${y} ${x} ${y + r}Q${x} ${y} ${x - r} ${y}Q${x} ${y} ${x} ${y - r}z" fill="${C.star}" opacity="${op}"/>`;

  const sky = (cx, cy, r) => (isNight ? moon(cx, cy, r * 2.5) : sun(cx, cy, r));

  // Slanted rain streak
  const streak = (x, y, len, color, w = 1.7) =>
    `<line x1="${x}" y1="${y}" x2="${r1(x - len * 0.35)}" y2="${r1(y + len)}" stroke="${color}" stroke-width="${w}" stroke-linecap="round"/>`;

  // Snowflake: 3 crossing strokes (6 arms)
  const flake = (x, y, r, color = C.snow, w = 1.3) => {
    let s = "";
    for (let i = 0; i < 3; i++) {
      const a = (i * Math.PI) / 3 + Math.PI / 2;
      const dx = Math.cos(a) * r,
        dy = Math.sin(a) * r;
      s += `<line x1="${r1(x - dx)}" y1="${r1(y - dy)}" x2="${r1(x + dx)}" y2="${r1(y + dy)}"/>`;
    }
    return `<g stroke="${color}" stroke-width="${w}" stroke-linecap="round">${s}</g>`;
  };

  const dot = (x, y, r, color) =>
    `<circle cx="${x}" cy="${y}" r="${r}" fill="${color}"/>`;

  // Lightning bolt
  const bolt = () =>
    `<path d="M17.6 15.5 12.4 23.6h3.7l-1.9 7 6.6-9.1h-3.7l2.3-6z" fill="${url("bolt")}" stroke="#B45309" stroke-width="0.5" stroke-linejoin="round"/>`;

  // ── precipitation under a cloud whose bottom is y≈20 ──
  const fallLayer = (type, n, heavyColor) => {
    const rows = {
      1: [
        [13, 22.5],
        [20, 22.5],
      ],
      2: [
        [10.5, 22.5],
        [16.5, 24.5],
        [22.5, 22.5],
      ],
      3: [
        [9, 22.5],
        [14, 24.5],
        [19, 22.5],
        [24, 24.5],
      ],
    }[Math.min(3, Math.max(1, n))];

    switch (type) {
      case "rain": {
        const color = n >= 3 ? C.rainHeavy : C.rain;
        const len = n >= 3 ? 6 : n === 2 ? 5 : 4.2;
        return rows
          .map(([x, y]) =>
            streak(x, y, len, heavyColor || color, n >= 3 ? 1.9 : 1.7),
          )
          .join("");
      }
      case "drizzle": {
        // two staggered rows of short dashes / dots
        const pts =
          n === 1
            ? [
                [12, 23],
                [20, 23],
                [16, 27.5],
              ]
            : n === 2
              ? [
                  [10, 23],
                  [16, 23],
                  [22, 23],
                  [13, 27.5],
                  [19, 27.5],
                ]
              : [
                  [9, 23],
                  [14, 23],
                  [19, 23],
                  [24, 23],
                  [11.5, 27.5],
                  [16.5, 27.5],
                  [21.5, 27.5],
                ];
        return pts.map(([x, y]) => streak(x, y, 1.6, C.drizzle, 1.5)).join("");
      }
      case "frz-drizzle": {
        const pts =
          n === 1
            ? [
                [11, 23],
                [17, 23],
              ]
            : [
                [9.5, 23],
                [15, 23],
                [20.5, 23],
              ];
        return (
          pts.map(([x, y]) => streak(x, y, 1.6, C.ice, 1.5)).join("") +
          flake(n === 1 ? 22.5 : 25, 27, 2.3, C.ice, 1.15) +
          dot(n === 1 ? 14 : 12.5, 28.3, 0.95, C.ice)
        );
      }
      case "frz-rain": {
        const pts =
          n === 1
            ? [
                [11, 22.5],
                [17, 22.5],
              ]
            : [
                [9, 22.5],
                [14.5, 24],
                [20, 22.5],
              ];
        return (
          pts
            .map(([x, y]) => streak(x, y, n === 1 ? 4.2 : 5.2, C.ice, 1.7))
            .join("") + flake(n === 1 ? 23 : 25, 26.5, 2.4, C.ice, 1.15)
        );
      }
      case "snow": {
        const pts =
          n === 1
            ? [
                [12.5, 24.5],
                [20.5, 26.5],
              ]
            : n === 2
              ? [
                  [10, 24.5],
                  [16.5, 27.5],
                  [23, 24.5],
                ]
              : [
                  [8.5, 24.5],
                  [14, 27.8],
                  [19.5, 24.5],
                  [25, 27.8],
                ];
        return pts.map(([x, y]) => flake(x, y, n >= 3 ? 2.3 : 2.6)).join("");
      }
      case "grains": {
        const pts = [
          [10, 23.5],
          [15, 25],
          [20, 23.5],
          [24, 25.5],
          [12.5, 28],
          [18, 28.5],
        ];
        return pts.map(([x, y]) => dot(x, y, 1, C.snow)).join("");
      }
      case "storm-snow": // flakes either side of the lightning bolt
        return flake(9, 25.5, 2.5) + flake(24, 26.5, 2.5);
      case "hail": {
        const pts =
          n === 1
            ? [
                [10, 25.5],
                [23.5, 26.5],
              ]
            : [
                [9, 24.5],
                [24, 24.5],
                [10.5, 29],
                [23, 29.5],
              ];
        return pts
          .map(
            ([x, y]) =>
              `<circle cx="${x}" cy="${y}" r="1.7" fill="${C.hail}" stroke="${C.hailEdge}" stroke-width="0.7"/>`,
          )
          .join("");
      }
      default:
        return "";
    }
  };

  // ── compose by sky type ──
  let body = "";
  const cl = url("cl");
  const clBack = url("clBack");
  const clDark = url("clDark");

  switch (info.sky) {
    case "clear":
      body = isNight
        ? moon(17, 16, 19) +
          star(6.5, 8, 2, 0.95) +
          star(9.5, 15.5, 1.3, 0.7) +
          star(26.5, 27, 1.2, 0.55)
        : sun(16, 16, 6.8);
      break;

    case "few": // sun/moon in front, a small cloud tucked bottom-right
      body =
        (isNight
          ? moon(14, 13, 15) + star(26, 7, 1.5, 0.85)
          : sun(13.5, 13, 5.6)) + cloud(21, 27, 0.62, cl);
      break;

    case "partly": // sun/moon peeks out top-left behind a big cloud
      body =
        (isNight
          ? moon(11.5, 10.5, 13) + star(26, 5.5, 1.4, 0.8)
          : sun(11.5, 11, 4.6)) + cloud(18, 27, 0.95, cl);
      break;

    case "overcast": // two layered clouds
      body = cloud(20.5, 19.5, 0.78, clBack) + cloud(14.5, 26, 1.02, cl);
      break;

    case "fog":
      body =
        cloud(16, 17, 0.8, info.rime ? url("clBack") : cl) +
        `<g stroke="${info.rime ? C.ice : C.fog}" stroke-width="1.8" stroke-linecap="round">` +
        `<line x1="6" y1="21" x2="22" y2="21"/><line x1="10" y1="25" x2="27" y2="25"/><line x1="7" y1="29" x2="20" y2="29"/>` +
        `</g>` +
        (info.rime ? flake(25.5, 29, 2.2, C.ice, 1.1) : "");
      break;

    case "precip":
      body =
        cloud(16, 20, 1.08, info.dark ? clDark : cl) +
        fallLayer(info.fall, info.n);
      break;

    case "shower": // sun/moon behind cloud + precipitation = showers
      body =
        sky(23, 7.5, 3.5) +
        cloud(14.5, 20, 1.02, info.dark ? clDark : cl) +
        fallLayer(info.fall, info.n);
      break;

    case "storm":
      body =
        cloud(16, 19.5, 1.08, clDark) + bolt() + fallLayer(info.fall, info.n);
      break;

    default:
      body = cloud(16, 24, 1.1, cl);
  }

  return `<svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${info.desc}">${defs}${body}</svg>`;
}

/* ── Fallback provider (wttr.in) code → WMO code ──────────── */
// wttr.in returns WorldWeatherOnline codes; map them to WMO so the
// same icons + descriptions are used no matter which API answered.
const WWO_TO_WMO = {
  113: 0,
  116: 2,
  119: 3,
  122: 3,
  143: 45,
  248: 45,
  260: 48,
  176: 80,
  263: 51,
  266: 53,
  281: 56,
  284: 57,
  185: 56,
  293: 61,
  296: 61,
  299: 63,
  302: 63,
  305: 65,
  308: 65,
  311: 66,
  314: 67,
  317: 66,
  320: 67,
  350: 67,
  182: 66,
  179: 85,
  227: 73,
  230: 75,
  323: 71,
  326: 71,
  329: 73,
  332: 73,
  335: 75,
  338: 75,
  353: 80,
  356: 81,
  359: 82,
  362: 66,
  365: 67,
  374: 66,
  377: 67,
  368: 85,
  371: 86,
  200: 95,
  386: 95,
  389: 95,
  392: 1095,
  395: 1095,
};

// "06:42 AM" → minutes after midnight
function parseClock12(str) {
  const m = /(\d{1,2}):(\d{2})\s*(AM|PM)/i.exec(str || "");
  if (!m) return null;
  let h = Number(m[1]) % 12;
  if (m[3].toUpperCase() === "PM") h += 12;
  return h * 60 + Number(m[2]);
}

/* ── Main widget ──────────────────────────────────────────── */
function getWeather() {
  // ── defaults (Sofia) ───────────────────────────────────────
  const DEF_LAT = 42.6977;
  const DEF_LON = 23.3219;

  // ── element ids (mobile + desktop copies) ──────────────────
  const IDS = {
    city: ["weather-city", "weather-city-desktop"],
    temp: ["temp", "temp-desktop"],
    icon: ["weather-icon", "weather-icon-desktop"],
    desc: ["weather-description", "weather-description-desktop"],
  };

  // ── reverse geocode ────────────────────────────────────────
  function getCity(lat, lon) {
    return fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`,
    )
      .then((r) => r.json())
      .then((data) => {
        return (
          data.address.city ||
          data.address.town ||
          data.address.village ||
          data.address.state ||
          "Unknown location"
        );
      });
  }

  // ── weather fetch with fallback ────────────────────────────
  async function fetchWeather(lat, lon) {
    // PRIMARY: Open-Meteo
    try {
      const res = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,is_day`,
      );
      if (!res.ok) {
        throw new Error(`Open-Meteo failed: ${res.status}`);
      }
      const data = await res.json();
      return {
        temperature: data.current.temperature_2m,
        weathercode: data.current.weather_code,
        is_day: data.current.is_day,
      };
    } catch (err) {
      console.warn("Open-Meteo failed, trying fallback...", err);
    }
    // FALLBACK: wttr.in
    try {
      const res = await fetch(`https://wttr.in/${lat},${lon}?format=j1`);
      if (!res.ok) {
        throw new Error(`wttr.in failed: ${res.status}`);
      }
      const data = await res.json();
      const current = data.current_condition[0];

      // numeric code first, text only as a last resort
      let weathercode = WWO_TO_WMO[Number(current.weatherCode)];
      if (weathercode === undefined) {
        const desc = (current.weatherDesc?.[0]?.value || "").toLowerCase();
        if (desc.includes("thunder")) weathercode = 95;
        else if (desc.includes("snow")) weathercode = 73;
        else if (desc.includes("sleet") || desc.includes("freezing"))
          weathercode = 66;
        else if (desc.includes("drizzle")) weathercode = 53;
        else if (desc.includes("rain") || desc.includes("shower"))
          weathercode = 63;
        else if (desc.includes("fog") || desc.includes("mist"))
          weathercode = 45;
        else if (desc.includes("partly")) weathercode = 2;
        else if (desc.includes("clear") || desc.includes("sunny"))
          weathercode = 0;
        else weathercode = 3;
      }

      // day/night from the location's real sunrise/sunset ("observation_time" is UTC,
      // so use the local time wttr reports when available)
      const astro = data.weather?.[0]?.astronomy?.[0];
      const rise = parseClock12(astro?.sunrise);
      const set = parseClock12(astro?.sunset);
      const localNow = parseClock12(
        current.localObsDateTime?.split(" ").slice(1).join(" "),
      );
      const now =
        localNow ?? new Date().getHours() * 60 + new Date().getMinutes();
      const is_day =
        rise !== null && set !== null
          ? now >= rise && now < set
            ? 1
            : 0
          : new Date().getHours() >= 6 && new Date().getHours() < 20
            ? 1
            : 0;

      return {
        temperature: parseFloat(current.temp_C),
        weathercode,
        is_day,
      };
    } catch (err) {
      console.error("Fallback weather API failed:", err);
      throw err;
    }
  }

  // ── core fetch/render (receives final lat/lon) ─────────────
  function fetchAndRender(lat, lon) {
    Promise.allSettled([fetchWeather(lat, lon), getCity(lat, lon)])
      .then(([weatherRes, cityRes]) => {
        // weather failed
        if (weatherRes.status !== "fulfilled") {
          console.error("Weather fetch failed:", weatherRes.reason);
          setTextAll(IDS.temp, "--");
          setTextAll(IDS.desc, "Weather unavailable");
          return;
        }

        // city fallback
        const city =
          cityRes.status === "fulfilled" ? cityRes.value : "Unknown location";
        const { temperature, weathercode, is_day } = weatherRes.value;
        const night = Number(is_day) !== 1;
        const desc = getWeatherInfo(weathercode).desc;

        setTextAll(IDS.city, city);
        setTextAll(IDS.temp, `${Math.round(temperature)}°`);
        IDS.icon.forEach((id) => {
          const el = document.getElementById(id);
          if (el) el.innerHTML = weatherIconSvg(weathercode, night, id); // element id = unique gradient prefix
        });
        IDS.desc.forEach((id) => {
          const el = document.getElementById(id);
          if (!el) return;
          el.textContent = desc;
          el.style.opacity = "0.45";
          el.style.fontSize = "13px";
        });
      })
      .catch((err) => {
        console.error("Weather widget failed:", err);
      });
  }

  // ── geolocation with fast fallback ─────────────────────────
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (pos) => fetchAndRender(pos.coords.latitude, pos.coords.longitude),
      () => fetchAndRender(DEF_LAT, DEF_LON), // denied / error
      { enableHighAccuracy: false, timeout: 6000 }, // quick, low-power
    );
  } else {
    fetchAndRender(DEF_LAT, DEF_LON); // no API
  }
}

/* ══ 09. SIDEBAR ══════════════════════════════════════════════ */
function isThemeEditorOpen() {
  return !!document.getElementById("theme-editor")?.open;
}

function setupSidebar() {
  const sb = document.getElementById("settings-sidebar");
  const menuBtn = document.getElementById("menu-btn");
  const closeBtn = document.getElementById("close-sidebar");
  const hoverZone = document.getElementById("sidebar-hover-zone");
  if (!sb || !menuBtn) return;

  const open = () => {
    sb.classList.add("active");
    menuBtn.classList.add("open");
  };
  const close = () => {
    if (isThemeEditorOpen()) return; // keep sidebar while editing a theme
    sb.classList.remove("active");
    menuBtn.classList.remove("open");
  };

  menuBtn.addEventListener("click", () =>
    sb.classList.contains("active") ? close() : open(),
  );
  if (closeBtn) closeBtn.addEventListener("click", close);
  hoverZone?.addEventListener("mouseenter", () => {
    if (window.innerWidth >= 768) open();
  });
  sb.addEventListener("mouseleave", () => {
    if (window.innerWidth >= 768) close();
  });
  document.addEventListener("click", (e) => {
    if (e.target.closest("#theme-editor")) return; // clicks inside the theme editor
    if (!sb.contains(e.target) && !menuBtn.contains(e.target)) close();
  });
}

/* ══ 10. THEMES (built-in + custom) ═══════════════════════════ */
const THEME_VARS = ["--primary", "--primary-rgb", "--glow"];

function getCustomTheme(id) {
  return state.customThemes.find((t) => t.id === id) || null;
}

function saveCustomThemes() {
  writeJSON("gx_custom_themes", state.customThemes);
  if (state.customActive)
    localStorage.setItem("gx_custom_active", state.customActive);
  else localStorage.removeItem("gx_custom_active");
}

// Old "black" theme was replaced by custom themes → fall back safely
function normalizeTheme(theme) {
  if (theme === "custom" && getCustomTheme(state.customActive)) return "custom";
  return BUILTIN_THEMES.includes(theme) ? theme : DEFAULT_THEME;
}

function setThemeVars(hex) {
  const rgb = LuminusColor.hexToRgb(hex);
  if (!rgb) return;
  const root = document.documentElement.style;
  root.setProperty("--primary", hex);
  root.setProperty("--primary-rgb", `${rgb.r}, ${rgb.g}, ${rgb.b}`);
  root.setProperty("--glow", `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.18)`);
}

function clearThemeVars() {
  const root = document.documentElement.style;
  THEME_VARS.forEach((v) => root.removeProperty(v));
}

function getPrimaryHex() {
  return (
    getComputedStyle(document.documentElement)
      .getPropertyValue("--primary")
      .trim() || "#3b82f6"
  );
}

// Keep daisyUI parts (toggles, checkboxes) in the same accent color
function syncDaisyPrimary() {
  const ok = LuminusColor.hexToOklchString(getPrimaryHex());
  if (!ok) return;
  const root = document.documentElement.style;
  root.setProperty("--p", ok.css);
  root.setProperty("--pc", ok.L > 0.72 ? "20% 0.02 260" : "98% 0.01 260");
}

// Colors the live scene uses: custom theme slots, or derived from the accent
function getScenePalette() {
  const custom =
    state.theme === "custom" ? getCustomTheme(state.customActive) : null;
  if (custom) return [custom.a, custom.b, custom.c];
  const p = getPrimaryHex();
  return [p, LuminusColor.rotateHue(p, 45), LuminusColor.rotateHue(p, -60)];
}

function setTheme(theme) {
  state.theme = normalizeTheme(theme);
  localStorage.setItem("gx_theme", state.theme);
  applyTheme(state.theme);
}

function applyTheme(theme) {
  theme = normalizeTheme(theme);
  state.theme = theme;
  const root = document.documentElement;
  const custom = theme === "custom" ? getCustomTheme(state.customActive) : null;

  if (custom) {
    root.setAttribute("data-theme", "custom");
    setThemeVars(custom.primary);
  } else {
    clearThemeVars();
    root.setAttribute("data-theme", theme);
  }
  syncDaisyPrimary();

  document.querySelectorAll("[data-theme-btn]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.themeBtn === theme);
  });
  document
    .getElementById("custom-theme-btn")
    ?.classList.toggle("active", theme === "custom");

  renderCustomThemeList();
  window.LiveScene?.setPalette(getScenePalette());
}

function applyCustomTheme(id) {
  if (!getCustomTheme(id)) return;
  state.customActive = id;
  saveCustomThemes();
  setTheme("custom");
}

function deleteCustomTheme(id) {
  state.customThemes = state.customThemes.filter((t) => t.id !== id);
  if (state.customActive === id) {
    state.customActive = state.customThemes[0]?.id || null;
    if (state.theme === "custom" && !state.customActive)
      state.theme = DEFAULT_THEME;
  }
  saveCustomThemes();
  setTheme(state.theme);
}

function renderCustomThemeList() {
  const list = document.getElementById("custom-theme-list");
  if (!list) return;
  if (!state.customThemes.length) {
    list.innerHTML = `<p class="text-[9px] uppercase tracking-widest opacity-30">No custom themes yet — tap Custom to make one.</p>`;
    return;
  }
  list.innerHTML = state.customThemes
    .map((t) => {
      const active = state.theme === "custom" && state.customActive === t.id;
      return `
        <div class="custom-chip ${active ? "active" : ""}">
          <button class="custom-chip-apply" data-custom-apply="${escapeHtml(t.id)}" title="Use ${escapeHtml(t.name)}">
            <span class="custom-chip-swatch" style="background: conic-gradient(${t.primary}, ${t.a}, ${t.b}, ${t.c}, ${t.primary})"></span>
            <span class="custom-chip-name">${escapeHtml(t.name)}</span>
          </button>
          <button class="custom-chip-action" data-custom-edit="${escapeHtml(t.id)}" title="Edit">
            <svg viewBox="0 0 640 640" width="9" height="9" fill="currentColor"><path d="M416.9 85.2L372 130.1L509.9 268L554.8 223.1C568.4 209.6 576 191.2 576 172C576 152.8 568.4 134.4 554.8 120.9L519.1 85.2C505.6 71.6 487.2 64 468 64C448.8 64 430.4 71.6 416.9 85.2zM338.1 164L122.9 379.1C112.2 389.8 104.4 403.2 100.3 417.8L64.9 545.6C62.6 553.9 64.9 562.9 71.1 569C77.3 575.1 86.2 577.5 94.5 575.2L222.3 539.7C236.9 535.6 250.2 527.9 261 517.1L476 301.9L338.1 164z"/></svg>
          </button>
          <button class="custom-chip-action danger" data-custom-delete="${escapeHtml(t.id)}" title="Delete">✕</button>
        </div>`;
    })
    .join("");
}

/* ══ 11. COLOR WHEEL (reusable: theme editor + task colors) ═══ */
// Wires up one wheel UI. Returns { set(hex), get() }.
// Elements: wheel (circle), knob, shade (darkness layer), value (range), hex (text input)
function createColorWheel({ wheel, knob, shade, value, hex, onChange }) {
  if (!wheel) return null;
  let hsv = { h: 0, s: 1, v: 1 };
  let current = "#ffffff";

  const render = () => {
    const { h, s, v } = hsv;
    const rad = ((h - 90) * Math.PI) / 180;
    if (knob) {
      knob.style.left = `${50 + Math.cos(rad) * s * 50}%`;
      knob.style.top = `${50 + Math.sin(rad) * s * 50}%`;
      knob.style.background = current;
    }
    if (shade) shade.style.opacity = String(1 - v);
    if (value) {
      value.value = String(v);
      value.style.setProperty(
        "--cw-hue",
        LuminusColor.rgbToHex(LuminusColor.hsvToRgb(h, s, 1)),
      );
    }
    if (hex && document.activeElement !== hex) hex.value = current;
  };

  const commit = () => {
    current = LuminusColor.rgbToHex(LuminusColor.hsvToRgb(hsv.h, hsv.s, hsv.v));
    render();
    onChange?.(current);
  };

  // Drag on the wheel → hue (angle) + saturation (distance from center)
  const pick = (ev) => {
    const rect = wheel.getBoundingClientRect();
    const R = rect.width / 2;
    const dx = ev.clientX - (rect.left + R);
    const dy = ev.clientY - (rect.top + R);
    hsv.h = ((Math.atan2(dy, dx) * 180) / Math.PI + 90 + 360) % 360;
    hsv.s = Math.min(1, Math.hypot(dx, dy) / R);
    commit();
  };
  wheel.addEventListener("pointerdown", (ev) => {
    wheel.setPointerCapture(ev.pointerId);
    pick(ev);
  });
  wheel.addEventListener("pointermove", (ev) => {
    if (wheel.hasPointerCapture(ev.pointerId)) pick(ev);
  });

  // Brightness slider
  value?.addEventListener("input", () => {
    hsv.v = Number(value.value);
    commit();
  });

  // Hex input (invalid input snaps back)
  hex?.addEventListener("change", () => {
    let val = hex.value.trim();
    if (!val.startsWith("#")) val = "#" + val;
    const rgb = LuminusColor.hexToRgb(val);
    if (!rgb) {
      hex.value = current;
      return;
    }
    api.set(LuminusColor.rgbToHex(rgb));
    onChange?.(current);
  });

  const api = {
    set(hexStr) {
      const rgb = LuminusColor.hexToRgb(hexStr);
      if (!rgb) return;
      current = LuminusColor.rgbToHex(rgb);
      hsv = LuminusColor.rgbToHsv(rgb);
      render();
    },
    get: () => current,
  };
  return api;
}

/* ══ 12. CUSTOM THEME EDITOR ══════════════════════════════════ */
const SLOT_LABELS = {
  primary: "Accent",
  a: "Scene 1",
  b: "Scene 2",
  c: "Scene 3",
};

const themeEditor = {
  draft: null, // { id, name, primary, a, b, c }
  slot: "primary",
  wheel: null,
  isNew: true,
  saved: false,
};

function initThemeEditor() {
  const dialog = document.getElementById("theme-editor");
  if (!dialog) return;

  themeEditor.wheel = createColorWheel({
    wheel: document.getElementById("cw-wheel"),
    knob: document.getElementById("cw-knob"),
    shade: document.getElementById("cw-shade"),
    value: document.getElementById("cw-value"),
    hex: document.getElementById("cw-hex"),
    onChange: (hex) => {
      if (!themeEditor.draft) return;
      themeEditor.draft[themeEditor.slot] = hex;
      previewDraft();
    },
  });

  // Slot chips (Accent / Scene 1-3)
  document.getElementById("cw-slots")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-slot]");
    if (!btn) return;
    selectEditorSlot(btn.dataset.slot);
  });

  // Name
  document.getElementById("cw-name")?.addEventListener("input", (e) => {
    if (themeEditor.draft) themeEditor.draft.name = e.target.value;
  });

  // Quick presets
  const presetWrap = document.getElementById("cw-presets");
  if (presetWrap) {
    presetWrap.innerHTML = CUSTOM_THEME_PRESETS.map(
      (p, i) => `
        <button type="button" class="cw-preset" data-preset="${i}" title="${p.name}">
          <span class="cw-preset-swatch" style="background: linear-gradient(135deg, ${p.primary}, ${p.a}, ${p.b}, ${p.c})"></span>
          <span>${p.name}</span>
        </button>`,
    ).join("");
    presetWrap.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-preset]");
      if (!btn) return;
      const p = CUSTOM_THEME_PRESETS[Number(btn.dataset.preset)];
      Object.assign(themeEditor.draft, {
        primary: p.primary,
        a: p.a,
        b: p.b,
        c: p.c,
      });
      const nameInput = document.getElementById("cw-name");
      if (themeEditor.isNew && nameInput) {
        themeEditor.draft.name = p.name;
        nameInput.value = p.name;
      }
      loadSlotIntoWheel();
      previewDraft();
    });
  }

  // Save / cancel
  document
    .getElementById("cw-save")
    ?.addEventListener("click", saveThemeEditor);
  document
    .getElementById("cw-cancel")
    ?.addEventListener("click", () => dialog.close());
  // Any close without saving (Esc, backdrop, cancel) → restore the real theme
  dialog.addEventListener("close", () => {
    if (!themeEditor.saved) applyTheme(state.theme);
    themeEditor.draft = null;
  });
}

function openThemeEditor(id = null) {
  const dialog = document.getElementById("theme-editor");
  if (!dialog) return;
  const existing = id ? getCustomTheme(id) : null;
  const palette = getScenePalette();

  themeEditor.isNew = !existing;
  themeEditor.saved = false;
  themeEditor.draft = existing
    ? { ...existing }
    : {
        id: `ct-${Date.now().toString(36)}`,
        name: `Custom ${state.customThemes.length + 1}`,
        primary: getPrimaryHex(),
        a: palette[0],
        b: palette[1],
        c: palette[2],
      };

  const nameInput = document.getElementById("cw-name");
  if (nameInput) nameInput.value = themeEditor.draft.name;

  const full =
    themeEditor.isNew && state.customThemes.length >= MAX_CUSTOM_THEMES;
  const saveBtn = document.getElementById("cw-save");
  const note = document.getElementById("cw-limit-note");
  if (saveBtn) saveBtn.disabled = full;
  if (note) note.classList.toggle("hidden", !full);

  selectEditorSlot("primary");
  previewDraft();
  dialog.showModal();
}

function selectEditorSlot(slot) {
  themeEditor.slot = SLOT_LABELS[slot] ? slot : "primary";
  document.querySelectorAll("#cw-slots [data-slot]").forEach((b) => {
    b.classList.toggle("active", b.dataset.slot === themeEditor.slot);
  });
  const label = document.getElementById("cw-slot-label");
  if (label) label.textContent = SLOT_LABELS[themeEditor.slot];
  loadSlotIntoWheel();
}

function loadSlotIntoWheel() {
  const hex = themeEditor.draft?.[themeEditor.slot];
  if (hex) themeEditor.wheel?.set(hex);
}

// Live preview on the real page while editing
function previewDraft() {
  const d = themeEditor.draft;
  if (!d) return;
  document.documentElement.setAttribute("data-theme", "custom");
  setThemeVars(d.primary);
  syncDaisyPrimary();
  window.LiveScene?.setPalette([d.a, d.b, d.c]);

  document.querySelectorAll("#cw-slots [data-slot]").forEach((b) => {
    const dot = b.querySelector(".cw-slot-dot");
    if (dot) dot.style.background = d[b.dataset.slot];
  });
  const strip = document.getElementById("cw-preview");
  if (strip) {
    strip.style.background = `linear-gradient(110deg, ${d.a}, ${d.b} 50%, ${d.c})`;
    strip.style.setProperty("--cw-accent", d.primary);
  }
}

function saveThemeEditor() {
  const d = themeEditor.draft;
  const dialog = document.getElementById("theme-editor");
  if (!d) return;
  d.name = (d.name || "").trim() || "Custom";
  const idx = state.customThemes.findIndex((t) => t.id === d.id);
  if (idx >= 0) state.customThemes[idx] = { ...d };
  else if (state.customThemes.length < MAX_CUSTOM_THEMES)
    state.customThemes.push({ ...d });
  else return;
  state.customActive = d.id;
  themeEditor.saved = true;
  saveCustomThemes();
  setTheme("custom");
  dialog?.close();
}

/* ══ 13. LIVE SCENE CONTROLS ══════════════════════════════════ */
function saveSceneConfig() {
  writeJSON("gx_scene", state.scene);
}

// Scene replaces the wallpaper → pause video to save memory/CPU.
// In "blend" mode the scene glows on top of the wallpaper instead.
function syncSceneWithWallpaper() {
  const bg = document.getElementById("main-bg");
  const video = document.getElementById("main-bg-video");
  const hideWallpaper = state.scene.enabled && !state.scene.blend;
  if (bg) bg.style.opacity = hideWallpaper ? "0" : "";
  if (video) {
    if (hideWallpaper) video.pause();
    else if (video.getAttribute("src")) video.play().catch(() => {});
  }
}

function updateSceneUI() {
  const cfg = state.scene;
  const enabled = document.getElementById("scene-enabled");
  if (enabled) enabled.checked = cfg.enabled;
  document
    .getElementById("scene-options")
    ?.classList.toggle("is-off", !cfg.enabled);
  document.querySelectorAll("[data-scene]").forEach((btn) => {
    btn.classList.toggle(
      "active",
      cfg.enabled && btn.dataset.scene === cfg.scene,
    );
  });
  [
    ["scene-cursor", "cursor"],
    ["scene-daycycle", "dayCycle"],
    ["scene-blend", "blend"],
    ["scene-eco", "eco"],
  ].forEach(([id, key]) => {
    const el = document.getElementById(id);
    if (el) el.checked = !!cfg[key];
  });
}

function updateScene(partial) {
  Object.assign(state.scene, partial);
  saveSceneConfig();
  window.LiveScene?.configure(state.scene);
  syncSceneWithWallpaper();
  updateSceneUI();
}

function initLiveScene() {
  const canvas = document.getElementById("live-scene");
  if (!canvas || !window.LiveScene) return;
  if (!LiveScene.SCENES.includes(state.scene.scene))
    state.scene.scene = SCENE_DEFAULTS.scene;
  LiveScene.init(canvas);

  // Scene cards
  document.getElementById("scene-grid")?.addEventListener("click", (e) => {
    const card = e.target.closest("[data-scene]");
    if (card) updateScene({ enabled: true, scene: card.dataset.scene });
  });

  // Master switch + option toggles
  document.getElementById("scene-enabled")?.addEventListener("change", (e) => {
    updateScene({ enabled: e.target.checked });
  });
  [
    ["scene-cursor", "cursor"],
    ["scene-daycycle", "dayCycle"],
    ["scene-blend", "blend"],
    ["scene-eco", "eco"],
  ].forEach(([id, key]) => {
    document.getElementById(id)?.addEventListener("change", (e) => {
      updateScene({ [key]: e.target.checked });
    });
  });

  // Sliders
  const bindSlider = (id, key, labelId, fmt) => {
    const el = document.getElementById(id);
    const label = document.getElementById(labelId);
    if (!el) return;
    el.value = state.scene[key];
    if (label) label.textContent = fmt(state.scene[key]);
    el.addEventListener("input", () => {
      const val = Number(el.value);
      if (label) label.textContent = fmt(val);
      updateScene({ [key]: val });
    });
  };
  bindSlider(
    "scene-intensity",
    "intensity",
    "scene-intensity-value",
    (v) => `${Math.round(v * 100)}%`,
  );
  bindSlider(
    "scene-speed",
    "speed",
    "scene-speed-value",
    (v) => `${v.toFixed(1)}×`,
  );

  LiveScene.setPalette(getScenePalette());
  LiveScene.configure(state.scene);
  updateSceneUI();
}

/* ══ 14. WIDGET VISIBILITY ════════════════════════════════════ */
function isWidgetVisible(widgetKey) {
  return localStorage.getItem(WIDGET_MAP[widgetKey].key) !== "false";
}

function applyWidgetVisibility(el, visible) {
  if (visible) {
    el.style.display = "";
    el.style.opacity = "0";
    el.style.transform = "scale(0.92) translateY(8px)";
    void el.offsetHeight; // Force reflow
    el.style.transition =
      "opacity 400ms cubic-bezier(0.16,1,0.3,1), transform 400ms cubic-bezier(0.16,1,0.3,1)";
    el.style.opacity = "1";
    el.style.transform = "scale(1) translateY(0)";
    const cleanup = () => {
      el.style.transition = el.style.opacity = el.style.transform = "";
      el.removeEventListener("transitionend", cleanup);
    };
    el.addEventListener("transitionend", cleanup, { once: true });
  } else {
    el.style.transition = "opacity 250ms ease, transform 250ms ease";
    el.style.opacity = "0";
    el.style.transform = "scale(0.92) translateY(8px)";
    setTimeout(() => {
      el.style.display = "none";
      el.style.transition = el.style.opacity = el.style.transform = "";
    }, 260);
  }
}

function toggleWidget(widgetKey) {
  const config = WIDGET_MAP[widgetKey];
  if (!config) return;
  const newVisible = !isWidgetVisible(widgetKey);
  localStorage.setItem(config.key, String(newVisible));
  config.ids.forEach((id) => {
    const el = document.getElementById(id);
    if (el) applyWidgetVisibility(el, newVisible);
  });
  const checkbox = document.getElementById(`toggle-${widgetKey}`);
  if (checkbox) checkbox.checked = newVisible;
}

function initWidgetVisibility() {
  for (const [key, config] of Object.entries(WIDGET_MAP)) {
    const visible = isWidgetVisible(key);
    config.ids.forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.style.display = visible ? "" : "none";
    });
    const checkbox = document.getElementById(`toggle-${key}`);
    if (checkbox) checkbox.checked = visible;
  }
}

/* ══ 15. EVENT DELEGATION ═════════════════════════════════════ */
function setupEventDelegation() {
  // Task list click events (desktop + mobile lists share one handler)
  const handleTaskListClick = (e) => {
    const target = e.target;
    const taskItem = target.closest(".task-item");
    if (!taskItem) return;
    const index = parseInt(taskItem.dataset.index, 10);
    if (target.closest(".task-del")) {
      deleteTask(index);
    } else if (target.closest(".task-edit")) {
      openEditTaskModal(index);
    } else if (target.type === "checkbox") {
      toggleTask(index);
    }
  };
  document
    .getElementById("task-list")
    ?.addEventListener("click", handleTaskListClick);
  document
    .getElementById("task-list-mobile")
    ?.addEventListener("click", handleTaskListClick);

  // Favicon failed to load → dim it (replaces inline onerror, which extensions block)
  document.getElementById("bookmarks-grid")?.addEventListener(
    "error",
    (e) => {
      if (e.target.tagName === "IMG") e.target.style.opacity = "0.7";
    },
    true,
  );

  // GLOBAL DOCUMENT CLICK LISTENER — all button triggers
  document.addEventListener("click", (e) => {
    // Remove bookmark
    const removeBtn = e.target.closest(".bookmark-remove");
    if (removeBtn) {
      e.preventDefault();
      e.stopPropagation();
      const index = parseInt(removeBtn.dataset.index, 10);
      removeBookmark(removeBtn.closest(".bookmark-item"), index);
      return;
    }
    // Edit bookmark
    const editBtn = e.target.closest(".bookmark-edit");
    if (editBtn) {
      e.preventDefault();
      e.stopPropagation();
      const index = parseInt(editBtn.dataset.index, 10);
      openEditBookmarkModal(index);
      return;
    }
    // Add bookmark
    if (e.target.closest(".bookmark-add")) {
      openLinkModal();
      return;
    }

    // Tasks
    if (e.target.closest(".task-add-trigger")) openTaskModal();
    if (e.target.closest(".clear-tasks-trigger")) clearAllTasks();
    if (e.target.closest(".modal-cancel-trigger")) closeModal();

    // Custom themes (open editor / apply / edit / delete)
    if (e.target.closest("#custom-theme-btn")) {
      openThemeEditor(); // always starts a new theme from the current colors
      return;
    }
    const applyBtn = e.target.closest("[data-custom-apply]");
    if (applyBtn) return applyCustomTheme(applyBtn.dataset.customApply);
    const editThemeBtn = e.target.closest("[data-custom-edit]");
    if (editThemeBtn) return openThemeEditor(editThemeBtn.dataset.customEdit);
    const delThemeBtn = e.target.closest("[data-custom-delete]");
    if (delThemeBtn) return deleteCustomTheme(delThemeBtn.dataset.customDelete);

    // Preset wallpapers
    const presetBtn = e.target.closest("[data-preset-bg]");
    if (presetBtn) {
      const presetId = presetBtn.getAttribute("data-preset-bg");
      const wallpaperObj = PRESET_WALLPAPERS.find((wp) => wp.id === presetId);
      if (wallpaperObj) {
        applyBg(wallpaperObj.value);
        localStorage.setItem("gx_bg", wallpaperObj.value);
      }
    }
  });

  // Interface Skin theme button bindings
  document.querySelectorAll("[data-theme-btn]").forEach((btn) => {
    btn.addEventListener("click", () => setTheme(btn.dataset.themeBtn));
  });

  // Sidebar widget toggles
  Object.keys(WIDGET_MAP).forEach((key) => {
    document.getElementById(`toggle-${key}`)?.addEventListener("change", () => {
      toggleWidget(key);
    });
  });

  // Remove wallpaper binding
  document.getElementById("clear-bg-btn")?.addEventListener("click", clearBg);
}

/* ══ 16. MODALS ═══════════════════════════════════════════════ */
function openModal() {
  const backdrop = document.getElementById("modal-backdrop");
  const box = document.getElementById("modal-box");
  if (!backdrop || !box) return;
  backdrop.style.opacity = "1";
  backdrop.style.pointerEvents = "auto";
  box.style.transform = "scale(1)";
}

function closeModal() {
  const backdrop = document.getElementById("modal-backdrop");
  const box = document.getElementById("modal-box");
  if (!backdrop || !box) return;
  backdrop.style.opacity = "0";
  backdrop.style.pointerEvents = "none";
  box.style.transform = "scale(0.95)";
}

function initModals() {
  document.getElementById("modal-backdrop")?.addEventListener("click", (e) => {
    if (e.target === e.currentTarget) closeModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeModal();
  });
}

// One helper for every small modal (add/edit link, add/edit task)
function showModal({ title, inputs, confirmText, focusId, onConfirm }) {
  const modalTitle = document.getElementById("modal-title");
  const modalInputs = document.getElementById("modal-inputs");
  const modalConfirm = document.getElementById("modal-confirm");
  if (!modalTitle || !modalInputs || !modalConfirm) return;
  modalTitle.textContent = title;
  modalInputs.innerHTML = inputs;
  modalConfirm.textContent = confirmText;
  modalConfirm.onclick = onConfirm;
  requestAnimationFrame(() => {
    openModal();
    setTimeout(() => document.getElementById(focusId)?.focus(), 200);
  });
}

function shakeInput() {
  document
    .getElementById("modal-inputs")
    ?.querySelectorAll(":scope > input")
    .forEach((inp) => {
      inp.style.borderColor = "rgba(244,63,94,0.7)";
      inp.style.animation = "shake 0.3s ease";
      setTimeout(() => {
        inp.style.borderColor = "";
        inp.style.animation = "";
      }, 600);
    });
}

// Accepts "example.com" or "https://example.com" → URL or null
function parseUrlInput(raw) {
  try {
    return new URL(raw.startsWith("http") ? raw : "https://" + raw);
  } catch {
    return null;
  }
}

const linkInputs = (name = "", url = "", namePlaceholder = "Site name") => `
  <input type="text" id="url-name" placeholder="${namePlaceholder}" autocomplete="off" value="${escapeHtml(name)}">
  <input type="url" id="url-link" placeholder="https://example.com" autocomplete="off" value="${escapeHtml(url)}">
`;

const taskInput = (text = "") =>
  `<input type="text" id="task-text" placeholder="What needs to be done?" autocomplete="off" value="${escapeHtml(text)}">
  ${taskColorPickerHtml()}`;

// Priority color picker shown under the task text
function taskColorPickerHtml() {
  const swatches = TASK_COLORS.map(
    (c) =>
      `<button type="button" class="tcp-swatch" data-color="${c.color}" title="${c.name}" style="--sw:${c.color}"></button>`,
  ).join("");
  return `
  <div class="tcp">
    <div class="tcp-head">
      <span>Priority color</span>
      <span id="tcp-name" class="tcp-name">None</span>
    </div>
    <div id="tcp-swatches" class="tcp-swatches">
      <button type="button" class="tcp-swatch tcp-swatch--none" data-color="" title="No color"></button>
      ${swatches}
      <button type="button" class="tcp-swatch tcp-swatch--custom" data-custom title="Custom color"></button>
    </div>
    <div id="tcp-wheel-wrap" class="tcp-wheel-wrap hidden">
      <div id="tcp-wheel" class="cw-wheel cw-wheel--sm">
        <div id="tcp-shade" class="cw-shade"></div>
        <div id="tcp-knob" class="cw-knob"></div>
      </div>
      <div class="tcp-wheel-side">
        <input id="tcp-hex" type="text" maxlength="7" spellcheck="false" autocomplete="off" class="cw-input text-center font-mono uppercase">
        <input id="tcp-value" type="range" min="0" max="1" step="0.01" class="cw-value">
      </div>
    </div>
  </div>`;
}

// Wires the picker that showModal just inserted. Returns () => chosen color | null
function initTaskColorPicker(initial) {
  let picked = LuminusColor.isHex(initial) ? initial : null;
  const wrap = document.getElementById("tcp-swatches");
  const nameEl = document.getElementById("tcp-name");
  const wheelWrap = document.getElementById("tcp-wheel-wrap");
  const customBtn = wrap?.querySelector("[data-custom]");
  if (!wrap) return () => picked;

  const preset = (hex) =>
    TASK_COLORS.find(
      (c) => c.color.toLowerCase() === String(hex).toLowerCase(),
    );

  const refresh = () => {
    const known = picked ? preset(picked) : null;
    wrap.querySelectorAll(".tcp-swatch").forEach((b) => {
      const isCustom = b.hasAttribute("data-custom");
      const active = isCustom
        ? !!picked && !known
        : (b.dataset.color || null) === (known ? known.color : picked);
      b.classList.toggle("active", active);
    });
    if (customBtn)
      customBtn.style.setProperty("--sw", picked && !known ? picked : "");
    if (nameEl) {
      nameEl.textContent = !picked ? "None" : known ? known.name : "Custom";
      nameEl.style.color = picked || "";
    }
  };

  const wheel = createColorWheel({
    wheel: document.getElementById("tcp-wheel"),
    knob: document.getElementById("tcp-knob"),
    shade: document.getElementById("tcp-shade"),
    value: document.getElementById("tcp-value"),
    hex: document.getElementById("tcp-hex"),
    onChange: (hex) => {
      picked = hex;
      refresh();
    },
  });
  wheel?.set(picked || "#22d3ee");

  wrap.addEventListener("click", (e) => {
    const b = e.target.closest(".tcp-swatch");
    if (!b) return;
    if (b.hasAttribute("data-custom")) {
      const opening = wheelWrap?.classList.contains("hidden");
      wheelWrap?.classList.toggle("hidden", !opening);
      if (opening) {
        picked = wheel?.get() || picked;
      }
    } else {
      picked = b.dataset.color || null;
      if (picked) wheel?.set(picked);
      wheelWrap?.classList.add("hidden");
    }
    refresh();
  });

  // Custom color already chosen → open the wheel straight away
  if (picked && !preset(picked)) wheelWrap?.classList.remove("hidden");
  refresh();
  return () => picked;
}

function openLinkModal() {
  showModal({
    title: "ADD QUICK LINK",
    inputs: linkInputs("", "", "Site name (e.g. Reddit)"),
    confirmText: "Add Link",
    focusId: "url-name",
    onConfirm: () => {
      if (state.bookmarks.length >= MAX_BOOKMARKS) return shakeInput();
      const name = document.getElementById("url-name")?.value.trim();
      const raw = document.getElementById("url-link")?.value.trim();
      if (!name || !raw) return shakeInput();
      const url = parseUrlInput(raw);
      if (!url) return shakeInput();
      const { hostname } = url;
      if (
        !hostname.includes(".") ||
        hostname.length <= 3 ||
        hostname.startsWith(".") ||
        hostname.endsWith(".")
      ) {
        return shakeInput();
      }
      const normalizedNew = url.href.replace(/\/$/, "");
      const exists = state.bookmarks.some((b) => {
        try {
          return new URL(b.url).href.replace(/\/$/, "") === normalizedNew;
        } catch {
          return false;
        }
      });
      if (exists) return shakeInput();
      state.bookmarks.push({ name, url: url.href });
      saveBookmarks();
      renderBookmarks();
      closeModal();
    },
  });
}

function openEditBookmarkModal(index) {
  const bookmark = state.bookmarks[index];
  if (!bookmark) return;
  showModal({
    title: "EDIT LINK",
    inputs: linkInputs(bookmark.name, bookmark.url),
    confirmText: "Save Changes",
    focusId: "url-name",
    onConfirm: () => {
      const name = document.getElementById("url-name")?.value.trim();
      const raw = document.getElementById("url-link")?.value.trim();
      if (!name || !raw) return shakeInput();
      const url = parseUrlInput(raw);
      if (!url) return shakeInput();
      state.bookmarks[index] = { name, url: url.href };
      saveBookmarks();
      renderBookmarks();
      closeModal();
    },
  });
}

function openTaskModal() {
  let getColor = () => null;
  showModal({
    title: "NEW TASK",
    inputs: taskInput(),
    confirmText: "Add Task",
    focusId: "task-text",
    onConfirm: () => {
      const text = document.getElementById("task-text")?.value.trim();
      if (!text) return;
      state.tasks.push({ text, done: false, color: getColor() });
      saveTasks();
      renderTasks();
      closeModal();
    },
  });
  getColor = initTaskColorPicker(null);
}

function openEditTaskModal(index) {
  const task = state.tasks[index];
  if (!task) return;
  let getColor = () => task.color || null;
  showModal({
    title: "EDIT TASK",
    inputs: taskInput(task.text),
    confirmText: "Save Changes",
    focusId: "task-text",
    onConfirm: () => {
      const text = document.getElementById("task-text")?.value.trim();
      if (!text) return shakeInput();
      state.tasks[index].text = text;
      state.tasks[index].color = getColor();
      saveTasks();
      renderTasks();
      closeModal();
    },
  });
  getColor = initTaskColorPicker(task.color);
}

/* ══ 17. BOOKMARKS ════════════════════════════════════════════ */
function saveBookmarks() {
  writeJSON("gx_bookmarks", state.bookmarks);
}

function renderBookmarks() {
  const grid = document.getElementById("bookmarks-grid");
  if (!grid) return;
  const frag = document.createDocumentFragment();

  state.bookmarks.forEach((b, i) => {
    const name = escapeHtml(b.name);
    const url = escapeHtml(b.url);
    const div = document.createElement("div");
    div.className = "bookmark-item";
    div.style.animationDelay = `${i * 50}ms`;
    div.innerHTML = `
      <div class="bookmark-circle-wrap">
        <a href="${url}" class="bookmark-circle">
          <img src="https://www.google.com/s2/favicons?domain=${url}&sz=128" loading="lazy" alt="${name}">
        </a>
        <div class="bookmark-actions">
          <button class="bookmark-edit" data-index="${i}" title="Edit">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" width="12" height="12" fill="white">
              <path d="M416.9 85.2L372 130.1L509.9 268L554.8 223.1C568.4 209.6 576 191.2 576 172C576 152.8 568.4 134.4 554.8 120.9L519.1 85.2C505.6 71.6 487.2 64 468 64C448.8 64 430.4 71.6 416.9 85.2zM338.1 164L122.9 379.1C112.2 389.8 104.4 403.2 100.3 417.8L64.9 545.6C62.6 553.9 64.9 562.9 71.1 569C77.3 575.1 86.2 577.5 94.5 575.2L222.3 539.7C236.9 535.6 250.2 527.9 261 517.1L476 301.9L338.1 164z"/>
            </svg>
          </button>
          <button class="bookmark-remove" data-index="${i}" title="Remove">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" width="12" height="12" fill="white">
              <path d="M183.1 137.4C170.6 124.9 150.3 124.9 137.8 137.4C125.3 149.9 125.3 170.2 137.8 182.7L275.2 320L137.9 457.4C125.4 469.9 125.4 490.2 137.9 502.7C150.4 515.2 170.7 515.2 183.2 502.7L320.5 365.3L457.9 502.6C470.4 515.1 490.7 515.1 503.2 502.6C515.7 490.1 515.7 469.8 503.2 457.3L365.8 320L503.1 182.6C515.6 170.1 515.6 149.8 503.1 137.3C490.6 124.8 470.3 124.8 457.8 137.3L320.5 274.7L183.1 137.4z"/>
            </svg>
          </button>
        </div>
      </div>
      <span class="bookmark-label">${name}</span>
    `;
    frag.appendChild(div);
  });

  if (state.bookmarks.length < MAX_BOOKMARKS) {
    const addDiv = document.createElement("div");
    addDiv.className = "bookmark-item";
    addDiv.style.animationDelay = `${state.bookmarks.length * 50}ms`;
    addDiv.innerHTML = `
      <button class="bookmark-add" title="Add link">
        <svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path d="M12 5v14M5 12h14"/>
        </svg>
      </button>
      <span class="bookmark-label" style="opacity:0.3">Add</span>
    `;
    frag.appendChild(addDiv);
  }

  grid.innerHTML = "";
  grid.appendChild(frag);
}

function removeBookmark(itemElement, i) {
  if (!itemElement) return;
  itemElement.style.transition = "opacity 250ms ease, transform 250ms ease";
  itemElement.style.opacity = "0";
  itemElement.style.transform = "scale(0.8)";
  setTimeout(() => {
    state.bookmarks.splice(i, 1);
    saveBookmarks();
    renderBookmarks();
  }, 260);
}

/* ══ 18. TASKS ════════════════════════════════════════════════ */
function saveTasks() {
  writeJSON("gx_tasks", state.tasks);
}

function renderTasks() {
  const list = document.getElementById("task-list");
  const listMobile = document.getElementById("task-list-mobile");
  if (!list && !listMobile) return;
  const html = !state.tasks.length
    ? `<p class="text-[10px] opacity-20 text-center py-3 uppercase tracking-widest">No tasks yet</p>`
    : state.tasks
        .map((t, i) => {
          // only trusted hex values go into the style attribute
          const color = LuminusColor.isHex(t.color) ? t.color : null;
          return `
        <div class="task-item group ${color ? "has-color" : ""}" data-index="${i}"${color ? ` style="--task-color:${color}"` : ""}>
          <button class="task-drag" title="Drag to reorder" aria-label="Drag to reorder" tabindex="-1">
            <svg width="8" height="12" viewBox="0 0 8 12" fill="currentColor" aria-hidden="true">
              <circle cx="2" cy="2" r="1.1"/><circle cx="6" cy="2" r="1.1"/>
              <circle cx="2" cy="6" r="1.1"/><circle cx="6" cy="6" r="1.1"/>
              <circle cx="2" cy="10" r="1.1"/><circle cx="6" cy="10" r="1.1"/>
            </svg>
          </button>
          <input type="checkbox" ${t.done ? "checked" : ""} class="checkbox checkbox-primary checkbox-xs border-white/20 rounded flex-shrink-0">
          <span class="text-[11px] font-medium transition-all flex-1 ${t.done ? "line-through opacity-20" : "opacity-65"}">${escapeHtml(t.text)}</span>
          <button class="task-edit" title="Edit">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" width="10" height="10" fill="currentColor">
              <path d="M416.9 85.2L372 130.1L509.9 268L554.8 223.1C568.4 209.6 576 191.2 576 172C576 152.8 568.4 134.4 554.8 120.9L519.1 85.2C505.6 71.6 487.2 64 468 64C448.8 64 430.4 71.6 416.9 85.2zM338.1 164L122.9 379.1C112.2 389.8 104.4 403.2 100.3 417.8L64.9 545.6C62.6 553.9 64.9 562.9 71.1 569C77.3 575.1 86.2 577.5 94.5 575.2L222.3 539.7C236.9 535.6 250.2 527.9 261 517.1L476 301.9L338.1 164z"/>
            </svg>
          </button>
          <button class="task-del">✕</button>
        </div>
      `;
        })
        .join("");
  if (list) list.innerHTML = html;
  if (listMobile) listMobile.innerHTML = html;
}

function toggleTask(i) {
  state.tasks[i].done = !state.tasks[i].done;
  saveTasks();
  renderTasks();
}

function deleteTask(i) {
  state.tasks.splice(i, 1);
  saveTasks();
  renderTasks();
}

function clearAllTasks() {
  if (!state.tasks.length) return;
  state.tasks.length = 0;
  saveTasks();
  renderTasks();
}

/* ── Task drag & drop (reorder) ───────────────────────────────
   Desktop: grab the ⋮⋮ handle and drag.
   Phone:   press and hold a task (~0.35s, light buzz), then drag.
            A quick swipe still scrolls the list like normal.
   The list scrolls by itself when you drag near its top/bottom edge.
──────────────────────────────────────────────────────────────── */
const TASK_LONG_PRESS_MS = 350;
const TASK_MOVE_CANCEL_PX = 8;
let taskDrag = null; // active drag state

function moveTask(from, to) {
  if (from === to || !state.tasks[from]) return;
  const [task] = state.tasks.splice(from, 1);
  state.tasks.splice(to, 0, task);
  saveTasks();
  renderTasks();
  // little flash so you can see where it landed
  document
    .querySelectorAll(`.task-item[data-index="${to}"]`)
    .forEach((el) => el.classList.add("just-moved"));
}

function beginTaskDrag(list, item, clientY) {
  const items = [...list.querySelectorAll(".task-item")];
  if (items.length < 2) return false;
  const rects = items.map((el) => el.getBoundingClientRect());
  const from = items.indexOf(item);
  const gap = rects[1].top - rects[0].bottom;
  taskDrag = {
    list,
    item,
    items,
    rects,
    from,
    to: from,
    startY: clientY,
    lastY: clientY,
    scroll0: list.scrollTop,
    size: rects[from].height + gap,
    raf: 0,
  };
  list.classList.add("is-sorting");
  item.classList.add("dragging");
  document.body.classList.add("is-dragging-task");
  navigator.vibrate?.(10);
  taskDrag.raf = requestAnimationFrame(taskDragTick);
  return true;
}

// Runs every frame while dragging: auto-scroll + layout
function taskDragTick() {
  const d = taskDrag;
  if (!d) return;
  const box = d.list.getBoundingClientRect();
  // edge zone scales with the list, so tiny phone lists don't scroll too eagerly
  const edge = Math.min(28, box.height * 0.15);
  const speed = (dist) => Math.min(8, Math.ceil(dist / 5));
  if (d.lastY < box.top + edge)
    d.list.scrollTop -= speed(box.top + edge - d.lastY);
  else if (d.lastY > box.bottom - edge)
    d.list.scrollTop += speed(d.lastY - (box.bottom - edge));
  layoutTaskDrag();
  d.raf = requestAnimationFrame(taskDragTick);
}

function layoutTaskDrag() {
  const d = taskDrag;
  const offset = d.lastY - d.startY + (d.list.scrollTop - d.scroll0);
  d.item.style.transform = `translateY(${offset}px)`;

  // Where is the dragged task's center now (in start-of-drag coordinates)?
  const r = d.rects[d.from];
  const center = r.top + r.height / 2 + offset;
  let to = d.from;
  for (let i = 0; i < d.from; i++) {
    if (center < d.rects[i].top + d.rects[i].height / 2) {
      to = i;
      break;
    }
  }
  if (to === d.from) {
    for (let i = d.items.length - 1; i > d.from; i--) {
      if (center > d.rects[i].top + d.rects[i].height / 2) {
        to = i;
        break;
      }
    }
  }
  d.to = to;

  // Slide the other tasks out of the way
  d.items.forEach((el, i) => {
    if (i === d.from) return;
    let shift = 0;
    if (d.from < i && i <= to) shift = -d.size;
    else if (to <= i && i < d.from) shift = d.size;
    el.style.transform = shift ? `translateY(${shift}px)` : "";
  });
}

function endTaskDrag(commit = true) {
  const d = taskDrag;
  if (!d) return;
  taskDrag = null;
  cancelAnimationFrame(d.raf);
  d.items.forEach((el) => {
    el.style.transform = "";
    el.classList.remove("dragging");
  });
  d.list.classList.remove("is-sorting");
  document.body.classList.remove("is-dragging-task");
  if (commit && d.to !== d.from) moveTask(d.from, d.to);
}

function initTaskDrag() {
  ["task-list", "task-list-mobile"].forEach((id) => {
    const list = document.getElementById(id);
    if (!list) return;

    // ── Mouse / pen / touch on the ⋮⋮ handle ──
    list.addEventListener("pointerdown", (e) => {
      const handle = e.target.closest(".task-drag");
      if (!handle || taskDrag) return;
      if (e.pointerType === "mouse" && e.button !== 0) return;
      e.preventDefault();
      if (!beginTaskDrag(list, handle.closest(".task-item"), e.clientY)) return;
      handle.setPointerCapture(e.pointerId);
      const move = (ev) => {
        if (taskDrag) taskDrag.lastY = ev.clientY;
      };
      const up = (ev) => {
        handle.removeEventListener("pointermove", move);
        handle.removeEventListener("pointerup", up);
        handle.removeEventListener("pointercancel", up);
        endTaskDrag(ev.type === "pointerup");
      };
      handle.addEventListener("pointermove", move);
      handle.addEventListener("pointerup", up);
      handle.addEventListener("pointercancel", up);
    });

    // ── Phone: press and hold anywhere on a task ──
    let press = null; // { timer, x, y, item }
    const cancelPress = () => {
      if (press) clearTimeout(press.timer);
      press = null;
    };

    list.addEventListener(
      "touchstart",
      (e) => {
        if (taskDrag || e.touches.length !== 1) return cancelPress();
        const item = e.target.closest(".task-item");
        if (!item || e.target.closest("button, input")) return; // buttons & checkbox keep their tap
        const t = e.touches[0];
        press = {
          x: t.clientX,
          y: t.clientY,
          item,
          timer: setTimeout(() => {
            if (press) beginTaskDrag(list, press.item, press.y);
            press = null;
          }, TASK_LONG_PRESS_MS),
        };
      },
      { passive: true },
    );

    // Not passive: once dragging, we stop the page/list from scrolling
    list.addEventListener(
      "touchmove",
      (e) => {
        const t = e.touches[0];
        if (taskDrag && taskDrag.list === list) {
          e.preventDefault();
          taskDrag.lastY = t.clientY;
          return;
        }
        if (
          press &&
          Math.hypot(t.clientX - press.x, t.clientY - press.y) >
            TASK_MOVE_CANCEL_PX
        ) {
          cancelPress(); // finger moved early → it's a scroll, not a drag
        }
      },
      { passive: false },
    );

    const touchEnd = (e) => {
      cancelPress();
      if (taskDrag && taskDrag.list === list) {
        e.preventDefault(); // no "click" after a drop
        endTaskDrag(e.type === "touchend");
      }
    };
    list.addEventListener("touchend", touchEnd);
    list.addEventListener("touchcancel", touchEnd);

    // Long-press would otherwise open the phone's context menu
    list.addEventListener("contextmenu", (e) => {
      if (taskDrag || press) e.preventDefault();
    });
  });

  // Esc cancels a drag
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && taskDrag) endTaskDrag(false);
  });
}

/* ══ 19. TASK LOG COLLAPSE ════════════════════════════════════ */
function initTaskLogCollapse() {
  const configs = [
    {
      toggleId: "task-log-toggle",
      chevronId: "task-log-chevron",
      listId: "task-list",
      key: "gx_tasklog_open",
    },
    {
      toggleId: "task-log-toggle-mobile",
      chevronId: "task-log-chevron-mobile",
      listId: "task-list-mobile",
      key: "gx_tasklog_open_mobile",
    },
  ];
  configs.forEach(({ toggleId, chevronId, listId, key }) => {
    const toggleBtn = document.getElementById(toggleId);
    const chevron = document.getElementById(chevronId);
    const list = document.getElementById(listId);
    if (!toggleBtn || !chevron || !list) return;
    const setState = (open) => {
      list.classList.toggle("open", open);
      chevron.classList.toggle("open", open);
      localStorage.setItem(key, String(open));
    };
    // Default: closed on first visit, otherwise restore last state
    setState(localStorage.getItem(key) === "true");
    toggleBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      setState(!list.classList.contains("open"));
    });
  });
}

/* ══ 20. BACKGROUND / WALLPAPER ═══════════════════════════════ */
function isVideoUrl(url) {
  if (typeof url !== "string") return false;
  return (
    url.includes("/video/upload/") ||
    url.startsWith("data:video") ||
    /\.(mp4|webm|mov)$/i.test(url)
  );
}

// Small static poster for Cloudinary videos (used for thumbnails)
function getVideoPosterUrl(url, { width = 400, quality = 30 } = {}) {
  if (!url.includes("/video/upload/")) return url; // not a Cloudinary video, leave as-is
  const transform = `w_${width},q_${quality},f_jpg`;
  return url
    .replace("/video/upload/", `/video/upload/${transform}/`)
    .replace(/\.(mp4|webm|mov)$/i, ".jpg");
}

function compressImage(dataUrl, maxWidth = 1920, quality = 0.7) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      let w = img.width;
      let h = img.height;
      if (w > maxWidth) {
        h = Math.round((maxWidth / w) * h);
        w = maxWidth;
      }
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
}

function setupBg() {
  const savedBg = safeGet("gx_bg");
  if (savedBg) {
    applyBg(savedBg);
  } else {
    clearBg();
  }

  document
    .getElementById("custom-bg-input")
    ?.addEventListener("change", (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const isVideo = file.type.startsWith("video/");
      const MAX_SIZE_MB = isVideo ? 15 : 4;
      if (file.size > MAX_SIZE_MB * 1024 * 1024) {
        alert(
          `File is too large! Please choose a file smaller than ${MAX_SIZE_MB}MB.`,
        );
        e.target.value = "";
        return;
      }
      const reader = new FileReader();
      reader.onload = async (ev) => {
        const rawUrl = ev.target.result;
        if (typeof rawUrl !== "string") return;
        let dataUrl = rawUrl;
        if (!isVideo && rawUrl.startsWith("data:image")) {
          try {
            dataUrl = await compressImage(rawUrl, 1280, 0.6);
          } catch {
            dataUrl = rawUrl;
          }
        }
        applyBg(dataUrl);
        try {
          localStorage.setItem("gx_bg", dataUrl);
        } catch (err) {
          console.warn(
            "Background too large for localStorage storage capacity.",
            err,
          );
        }
        state.hasBg = true;
      };
      reader.readAsDataURL(file);
    });
}

function stopBgVideo(videoEl) {
  if (!videoEl) return;
  videoEl.pause();
  videoEl.src = "";
  videoEl.style.display = "none";
}

function applyBg(url) {
  if (typeof url !== "string") return clearBg();
  const bg = document.getElementById("main-bg");
  const base = document.getElementById("base-overlay");
  const thumb = document.getElementById("wallpaper-thumb");
  if (!bg) return;

  let videoEl = document.getElementById("main-bg-video");

  if (isVideoUrl(url)) {
    bg.style.backgroundImage = "none";
    if (!videoEl) {
      videoEl = document.createElement("video");
      videoEl.id = "main-bg-video";
      videoEl.autoplay = true;
      videoEl.loop = true;
      videoEl.muted = true;
      videoEl.playsInline = true;
      Object.assign(videoEl.style, {
        position: "fixed",
        top: "0",
        left: "0",
        width: "100vw",
        height: "100vh",
        objectFit: "cover",
        pointerEvents: "none",
        zIndex: "-10",
      });
      bg.appendChild(videoEl);
    }
    // Full-quality original URL — untouched, this is the real background
    if (videoEl.src !== url) {
      videoEl.src = url;
    }
    videoEl.style.display = "block";
    videoEl.play().catch(() => {});
    // Sidebar thumb: small low-quality static poster, never plays
    if (thumb) {
      thumb.style.backgroundImage = `url('${getVideoPosterUrl(url, { width: 300, quality: 25 })}')`;
    }
    if (base) base.style.opacity = "0";
    state.hasBg = true;
    applyWallpaperEffects();
    syncSceneWithWallpaper(); // pause again if a live scene covers it
    return;
  }

  stopBgVideo(videoEl);
  const apply = () => {
    bg.style.backgroundImage = `url('${url}')`;
    if (thumb) thumb.style.backgroundImage = `url('${url}')`;
    if (base) base.style.opacity = "0";
    state.hasBg = true;
    applyWallpaperEffects();
  };
  if (url.startsWith("data:image") || url.startsWith("backgrounds/")) {
    apply();
  } else {
    const img = new Image();
    img.onload = apply;
    img.onerror = () => clearBg();
    img.src = url;
  }
}

function clearBg() {
  localStorage.removeItem("gx_bg");
  const bg = document.getElementById("main-bg");
  const base = document.getElementById("base-overlay");
  const thumb = document.getElementById("wallpaper-thumb");
  const thumbVideo = document.getElementById("wallpaper-thumb-video");

  stopBgVideo(document.getElementById("main-bg-video"));
  if (thumbVideo) {
    thumbVideo.pause();
    thumbVideo.removeAttribute("src");
    thumbVideo.classList.add("hidden");
  }

  if (bg) bg.style.backgroundImage = `url('${FALLBACK_BG}')`;
  if (base) base.style.opacity = "0";
  if (thumb) {
    thumb.style.backgroundImage = `url('${FALLBACK_BG}')`;
    thumb.classList.remove("hidden");
  }
  state.hasBg = false;
  const inp = document.getElementById("custom-bg-input");
  if (inp) inp.value = "";
  applyWallpaperEffects();
}

/* ══ 21. WALLPAPER PRESETS ════════════════════════════════════ */
function renderWallpaperButtons() {
  const grid = document.getElementById("wallpaper-grid");
  if (!grid) return;
  grid.innerHTML = PRESET_WALLPAPERS.map((wp) => {
    const isVideo = isVideoUrl(wp.value);
    // Grid thumbnails are small, so keep this poster tight and cheap
    const previewSrc = isVideo
      ? getVideoPosterUrl(wp.value, { width: 300, quality: 25 })
      : wp.value;
    return `
      <button
        data-preset-bg="${wp.id}"
        title="${wp.id}"
        class="group relative aspect-video w-full rounded-2xl overflow-hidden bg-white/[0.02] shadow-xl transition-all duration-300 focus:outline-none hover:shadow-2xl hover:scale-[1.02] active:scale-95"
      >
        <img
          src="${previewSrc}"
          alt="${wp.id}"
          class="w-full h-full object-cover opacity-40 group-hover:opacity-60 group-hover:scale-110 transition-all duration-500 ease-out"
          loading="lazy"
        />
        <span class="wallpaper-badge">${isVideo ? "Live" : "Static"}</span>
        <div class="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all duration-300 ease-out rounded-2xl"></div>
      </button>
    `;
  }).join("");
}

/* ══ 22. WALLPAPER EFFECTS ════════════════════════════════════ */
// styles.css reads these CSS variables for #main-bg (blur/brightness)
// and #theme-overlay (tint/vignette) — one source of truth.
function applyWallpaperEffects() {
  const rootStyle = document.documentElement.style;
  const blur = Number.isFinite(wallpaperFX.blur) ? wallpaperFX.blur : 0;
  const brightness = Number.isFinite(wallpaperFX.brightness)
    ? wallpaperFX.brightness
    : 1;
  rootStyle.setProperty("--bg-blur", `${blur}px`);
  rootStyle.setProperty("--bg-brightness", brightness);
  rootStyle.setProperty("--bg-vignette", wallpaperFX.vignette);
  rootStyle.setProperty("--bg-tint", wallpaperFX.tint);
}

function initWallpaperControls() {
  const bind = (id, key, labelId, fmt = (v) => v) => {
    const el = document.getElementById(id);
    const label = document.getElementById(labelId);
    if (!el) return;
    el.value = wallpaperFX[key];
    if (label) label.textContent = fmt(wallpaperFX[key]);
    el.addEventListener("input", () => {
      const val = Number(el.value);
      wallpaperFX[key] = val;
      localStorage.setItem(`gx_${key}`, val);
      if (label) label.textContent = fmt(val);
      applyWallpaperEffects();
    });
  };
  const fixed2 = (v) => Number(v).toFixed(2);
  bind("blur-slider", "blur", "blur-value");
  bind("brightness-slider", "brightness", "brightness-value", fixed2);
  bind("vignette-slider", "vignette", "vignette-value", fixed2);
  bind("tint-slider", "tint", "tint-value", fixed2);
  applyWallpaperEffects();
}

/* ══ 23. OFFLINE TOAST ════════════════════════════════════════ */
function initOfflineToast() {
  const toast = document.getElementById("offline-toast");
  if (!toast) return;
  let dismissed = false;
  let autoTimer = null;

  function show() {
    if (dismissed) return;
    toast.classList.add("toast-show");
    autoTimer = setTimeout(hide, 5000);
  }
  function hide() {
    clearTimeout(autoTimer);
    toast.classList.remove("toast-show");
  }

  document.getElementById("offline-toast-close")?.addEventListener(
    "click",
    () => {
      dismissed = true;
      hide();
    },
    { passive: true },
  );
  window.addEventListener(
    "offline",
    () => {
      dismissed = false;
      show();
    },
    { passive: true },
  );
  window.addEventListener("online", hide, { passive: true });
  if (!navigator.onLine) show();
}

/* ══ 24. TEARDOWN ═════════════════════════════════════════════ */
window.addEventListener("beforeunload", () => {
  if (clockIntervalId) clearInterval(clockIntervalId);
  if (greetingIntervalId) clearInterval(greetingIntervalId);
  window.LiveScene?.destroy(); // also removes the scene's cursor/resize listeners
});
