/* ═══════════════════════════════════════════════════════════
   ELITE NEW TAB — script.js (Optimized for Low Memory Usage)
═════════════════════════════════════════════════════════════ */

const MAX_BOOKMARKS = 12;

function safeGet(key) {
  const v = localStorage.getItem(key);
  return v === null || v === "null" || v === "undefined" || v === "" ? null : v;
}

// 4K Wallpapers Directory Mapping
const PRESET_WALLPAPERS = [
  {
    id: "gojo-1",
    value: "https://res.cloudinary.com/dbgpxmjln/image/upload/w_2560,q_90,f_auto/v1779652796/satoru-gojo-1-4k_v0thvc.jpg",
  },
  {
    id: "gojo-2",
    value: "https://res.cloudinary.com/dbgpxmjln/image/upload/w_2560,q_90,f_auto/v1779652796/satoru-gojo-2-4k_t2ia0f.jpg",
  },
  {
    id: "gojo-3",
    value: "https://res.cloudinary.com/dbgpxmjln/image/upload/w_2560,q_90,f_auto/v1779652901/gojo_eyes_rwqbsb.png",
  },
  {
    id: "yuji-sukuna",
    value: "https://res.cloudinary.com/dbgpxmjln/image/upload/w_2560,q_90,f_auto/v1779654350/yuji-sukuna_a00hz4.jpg",
  },
  {
    id: "liebe-black-clover",
    value: "https://res.cloudinary.com/dbgpxmjln/image/upload/w_2560,q_90,f_auto/v1779654342/liebe-black-clover_tkchnm.jpg",
  },
  { id: "default-bg", value: "backgrounds/background-image.png" },
];

/* ── State & Initial Boot Fallbacks ───────────────────────── */
const state = {
  theme: safeGet("gx_theme") || "blue",
  bookmarks: (() => {
    try {
      const p = JSON.parse(localStorage.getItem("gx_bookmarks"));
      return Array.isArray(p) && p.length ? p : getDefaultBookmarks();
    } catch {
      return getDefaultBookmarks();
    }
  })(),
  tasks: (() => {
    try {
      const p = JSON.parse(localStorage.getItem("gx_tasks"));
      return Array.isArray(p) ? p : [];
    } catch {
      return [];
    }
  })(),
  hasBg: !!safeGet("gx_bg"),
  username: safeGet("gx_username") || "",
};

function getDefaultBookmarks() {
  return [
    { name: "YouTube", url: "https://www.youtube.com" },
    { name: "Discord", url: "https://discord.com/login" },
  ];
}

/* ── Widget Visibility Config ─────────────────────────────── */
const WIDGET_MAP = {
  weather: {
    ids: ["weather-widget", "weather-widget-desktop"],
    key: "gx_vis_weather",
  },
  clock: { ids: ["time-widget", "time-widget-desktop"], key: "gx_vis_clock" },
  bookmarks: { ids: ["bookmark-widget"], key: "gx_vis_bookmarks" },
  tasks: { ids: ["notes-widget", "notes-widget-mobile"], key: "gx_vis_tasks" },
};

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

/* ── Wallpaper FX ─────────────────────────────────────────── */
const DEFAULT_WALLPAPER_FX = {
  blur: 2.5,
  brightness: 0.25,
  vignette: 0.05,
  tint: 0.15,
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

function syncWallpaperToCSS() {
  const rootStyle = document.documentElement.style;
  rootStyle.setProperty("--bg-blur", `${wallpaperFX.blur}px`);
  rootStyle.setProperty("--bg-brightness", wallpaperFX.brightness);
  rootStyle.setProperty("--bg-vignette", wallpaperFX.vignette);
  rootStyle.setProperty("--bg-tint", wallpaperFX.tint);
}

/* ── Image Compression ────────────────────────────────────── */
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

/* ── BOOT ─────────────────────────────────────────────────── */
document.addEventListener("DOMContentLoaded", () => {

  const savedBg = safeGet("gx_bg");
  if (savedBg) {
    const bg = document.getElementById("main-bg");
    if (bg) bg.style.backgroundImage = `url('${savedBg}')`;
  }

  initClock();
  initGreeting();
  getWeather();
  renderBookmarks();
  renderTasks();
  applyTheme(state.theme);
  setupSidebar();
  setupBg();
  initUsername();
  setupAmbientLight();
  renderWallpaperButtons();
  initWallpaperControls();
  applyWallpaperEffects();
  initWidgetVisibility();
  setupEventDelegation();
  initOfflineToast();
});

/* ── USERNAME ─────────────────────────────────────────────── */
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

/* ── CLOCK ────────────────────────────────────────────────── */
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

/* ── GREETING ─────────────────────────────────────────────── */
let greetingIntervalId = null;
const slots = [
  {
    min: 0,
    max: 3,
    greet: "Working late",
    focus:
      "Finishing up, or just getting started? Either way, lets make it count.",
  },
  {
    min: 3,
    max: 5,
    greet: "Up early",
    focus: "Focused work matters, but so does rest. Make sure to take breaks.",
  },
  {
    min: 5,
    max: 7,
    greet: "Good early morning",
    focus: "Ahead of the crowd. Lets do this.",
  },
  {
    min: 7,
    max: 9,
    greet: "Ready for the day",
    focus: "Grab your coffee. Whats the plan today?",
  },
  {
    min: 9,
    max: 12,
    greet: "Good morning",
    focus: "Peak focus hours. Lets crush it.",
  },
  {
    min: 12,
    max: 14,
    greet: "Good afternoon",
    focus: "Lets keep things moving. You got this.",
  },
  {
    min: 14,
    max: 17,
    greet: "Hope all is well",
    focus: "Keeping the pace steady? You got this.",
  },
  {
    min: 17,
    max: 19,
    greet: "Welcome back",
    focus: "One more thing to finish? Lets get it done.",
  },
  {
    min: 19,
    max: 21,
    greet: "Good evening",
    focus: "Evening focus time? Lets make it productive.",
  },
  {
    min: 21,
    max: 24,
    greet: "Still focused",
    focus: "The world is quiet. Perfect time to focus.",
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

/* ── AMBIENT MOUSE LIGHT ──────────────────────────────────── */
let mouseMoveController = null;

function setupAmbientLight() {
  const light = document.getElementById("ambient-light");
  if (!light || window.matchMedia("(pointer: coarse)").matches) return;

  if (mouseMoveController) mouseMoveController.abort();
  mouseMoveController = new AbortController();

  let raf = null;
  window.addEventListener(
    "mousemove",
    (e) => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        light.style.setProperty(
          "--x",
          `${(e.clientX / window.innerWidth) * 100}%`,
        );
        light.style.setProperty(
          "--y",
          `${(e.clientY / window.innerHeight) * 100}%`,
        );
        raf = null;
      });
    },
    { signal: mouseMoveController.signal, passive: true },
  );
}

/* ── WEATHER ──────────────────────────────────────────────── */
function getWeather() {
  // ── palettes ───────────────────────────────────────────────
  const iceC = "#67E8F9", rainC = "#60A5FA", rainH = "#3B82F6",
    snowC = "#BAE6FD", hailC = "#E0F2FE";
  const clL = "#D1DCE8", clM = "#8FA5B8", clD = "#546070", clS = "#2B3845";
  const fogC = "#9CA3AF";

  // Night palette
  const clLN = "#3A4D60", clMN = "#2C3A4A", clDN = "#1E2D3D", clSN = "#162231";
  const fogCN = "#4B5563";
  const moonFill = "#E2E8F0";
  const moonShadow = "#0F172A";

  // ── shared sub-components ──────────────────────────────────
  const clBig = (f) =>
    `<circle cx="16" cy="14" r="7" fill="${f}"/><circle cx="10" cy="18" r="5" fill="${f}"/><circle cx="22" cy="18" r="5" fill="${f}"/><rect x="5" y="18" width="22" height="5" fill="${f}"/>`;
  const clSml = (f) =>
    `<circle cx="14" cy="20" r="5" fill="${f}"/><circle cx="9" cy="22" r="3.5" fill="${f}"/><circle cx="19" cy="22" r="3.5" fill="${f}"/><rect x="5" y="22" width="18" height="4" fill="${f}"/>`;
  const bolt = (bx = 14, by = 14) =>
    `<polygon points="${bx + 3},${by} ${bx},${by + 7} ${bx + 2.5},${by + 7} ${bx - 1},${by + 15} ${bx + 6},${by + 6} ${bx + 3},${by + 6}" fill="#FCD34D"/>`;

  // ── sun ────────────────────────────────────────────────────
  const sunFull = (cx, cy, r, sc) =>
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#FBBF24"/>` +
    `<line x1="${cx + r}" y1="${cy}" x2="${cx + r + 3}" y2="${cy}" stroke="${sc}" stroke-width="2" stroke-linecap="round"/>` +
    `<line x1="${cx + r - 1.6}" y1="${cy + 1.6}" x2="${cx + r + 0.8}" y2="${cy + 4.0}" stroke="${sc}" stroke-width="2" stroke-linecap="round"/>` +
    `<line x1="${cx}" y1="${cy + r}" x2="${cx}" y2="${cy + r + 3}" stroke="${sc}" stroke-width="2" stroke-linecap="round"/>` +
    `<line x1="${cx - r + 1.6}" y1="${cy + 1.6}" x2="${cx - r - 0.8}" y2="${cy + 4.0}" stroke="${sc}" stroke-width="2" stroke-linecap="round"/>` +
    `<line x1="${cx - r}" y1="${cy}" x2="${cx - r - 3}" y2="${cy}" stroke="${sc}" stroke-width="2" stroke-linecap="round"/>` +
    `<line x1="${cx - r + 1.6}" y1="${cy - 1.6}" x2="${cx - r - 0.8}" y2="${cy - 4.0}" stroke="${sc}" stroke-width="2" stroke-linecap="round"/>` +
    `<line x1="${cx}" y1="${cy - r}" x2="${cx}" y2="${cy - r - 3}" stroke="${sc}" stroke-width="2" stroke-linecap="round"/>` +
    `<line x1="${cx + r - 1.6}" y1="${cy - 1.6}" x2="${cx + r + 0.8}" y2="${cy - 4.0}" stroke="${sc}" stroke-width="2" stroke-linecap="round"/>`;

  // ── moon + stars ───────────────────────────────────────────
  const moonStars = (cx, cy, r) => {
    const sx = cx - 12, sy = cy - 4;
    return [
      `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${moonFill}"/>`,
      `<circle cx="${cx + r * 0.45}" cy="${cy - r * 0.25}" r="${r * 0.78}" fill="${moonShadow}"/>`,
      `<circle cx="${sx}"   cy="${sy}"   r="1.1" fill="${moonFill}" opacity="0.9"/>`,
      `<circle cx="${sx + 5}" cy="${sy - 4}" r="0.8" fill="${moonFill}" opacity="0.65"/>`,
      `<circle cx="${sx + 2}" cy="${sy + 3}" r="0.65" fill="${moonFill}" opacity="0.45"/>`
    ].join('');
  };

  // ── snowflake ──────────────────────────────────────────────
  const fK = (x, y) =>
    `<line x1="${x - 3}" y1="${y}" x2="${x + 3}" y2="${y}" stroke="${snowC}" stroke-width="1.5" stroke-linecap="round"/>` +
    `<line x1="${x}" y1="${y - 3}" x2="${x}" y2="${y + 3}" stroke="${snowC}" stroke-width="1.5" stroke-linecap="round"/>` +
    `<line x1="${x - 2.1}" y1="${y - 2.1}" x2="${x + 2.1}" y2="${y + 2.1}" stroke="${snowC}" stroke-width="1.5" stroke-linecap="round"/>` +
    `<line x1="${x + 2.1}" y1="${y - 2.1}" x2="${x - 2.1}" y2="${y + 2.1}" stroke="${snowC}" stroke-width="1.5" stroke-linecap="round"/>`;

  // ── raindrop ───────────────────────────────────────────────
  const drop = (x, y, fill) => `<ellipse cx="${x}" cy="${y}" rx="1.5" ry="2.5" fill="${fill}"/>`;

  // ── defaults ───────────────────────────────────────────────
  const DEF_LAT = 42.6977;
  const DEF_LON = 23.3219;

  // ── core fetch/render (receives final lat/lon) ─────────────
  function getCity(lat, lon) {
    return fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`
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

  async function fetchAndRender(lat, lon) {

    // ---------- WEATHER FETCH WITH FALLBACK ----------
    async function fetchWeather(lat, lon) {

      // PRIMARY: Open-Meteo
      try {

        const res = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,is_day`
        );

        if (!res.ok) {
          throw new Error(`Open-Meteo failed: ${res.status}`);
        }

        const data = await res.json();

        return {
          temperature: data.current.temperature_2m,
          weathercode: data.current.weather_code,
          is_day: data.current.is_day
        };

      } catch (err) {

        console.warn("Open-Meteo failed, trying fallback...", err);

      }

      // FALLBACK: wttr.in
      try {

        const res = await fetch(
          `https://wttr.in/${lat},${lon}?format=j1`
        );

        if (!res.ok) {
          throw new Error(`wttr.in failed: ${res.status}`);
        }

        const data = await res.json();

        const current = data.current_condition[0];

        let weathercode = 3;

        const desc =
          current.weatherDesc[0].value.toLowerCase();

        if (desc.includes("clear")) weathercode = 0;
        else if (desc.includes("partly")) weathercode = 2;
        else if (desc.includes("cloud")) weathercode = 3;
        else if (desc.includes("rain")) weathercode = 61;
        else if (desc.includes("snow")) weathercode = 71;

        return {
          temperature: parseFloat(current.temp_C),
          weathercode,
          is_day: current.isdayyes === "yes" ? 1 : 0
        };

      } catch (err) {

        console.error("Fallback weather API failed:", err);

        throw err;
      }
    }

    const weatherPromise = fetchWeather(lat, lon);

    const cityPromise = getCity(lat, lon);

    Promise.allSettled([weatherPromise, cityPromise])

      .then(([weatherRes, cityRes]) => {

        // weather failed
        if (weatherRes.status !== "fulfilled") {

          console.error(
            "Weather fetch failed:",
            weatherRes.reason
          );

          const t1 = document.getElementById("temp");
          const t2 = document.getElementById("temp-desktop");

          const d1 =
            document.getElementById("weather-description");

          const d2 =
            document.getElementById("weather-description-desktop");

          if (t1) t1.textContent = "--";
          if (t2) t2.textContent = "--";

          if (d1) d1.textContent = "Weather unavailable";
          if (d2) d2.textContent = "Weather unavailable";

          return;
        }

        const weatherData = weatherRes.value;

        // city fallback
        const city =
          cityRes.status === "fulfilled"
            ? cityRes.value
            : "Unknown location";

        const {
          temperature,
          weathercode,
          is_day
        } = weatherData;

        const night = !is_day;

        // cloud colours
        const cL = night ? clLN : clL;
        const cM = night ? clMN : clM;
        const cD = night ? clDN : clD;
        const cS = night ? clSN : clS;
        const fog = night ? fogCN : fogC;

        let s = "", desc = "";

        const sunOrMoon = (cx, cy, r) =>
          night
            ? moonStars(cx, cy, r)
            : sunFull(cx, cy, r, "#FBBF24");

        const sunOrMoonTiny = (cx, cy) =>
          night
            ? `<circle cx="${cx}" cy="${cy}" r="3.5" fill="${moonFill}"/><circle cx="${cx + 1.6}" cy="${cy - 0.9}" r="2.7" fill="${moonShadow}"/>`
            : `<circle cx="${cx}" cy="${cy}" r="4" fill="#FBBF24"/>` +
            `<line x1="${cx + 4}" y1="${cy}" x2="${cx + 6.5}" y2="${cy}" stroke="#FBBF24" stroke-width="2" stroke-linecap="round"/>` +
            `<line x1="${cx - 4}" y1="${cy}" x2="${cx - 6.5}" y2="${cy}" stroke="#FBBF24" stroke-width="2" stroke-linecap="round"/>` +
            `<line x1="${cx}" y1="${cy + 4}" x2="${cx}" y2="${cy + 6.5}" stroke="#FBBF24" stroke-width="2" stroke-linecap="round"/>` +
            `<line x1="${cx}" y1="${cy - 4}" x2="${cx}" y2="${cy - 6.5}" stroke="#FBBF24" stroke-width="2" stroke-linecap="round"/>`;

        switch (weathercode) {

          case 0:
            desc = "Clear sky";
            s = night
              ? moonStars(16, 13, 5.5)
              : sunFull(16, 13, 5.5, "#FBBF24");
            break;

          case 1:
            desc = "Mainly clear";
            s = sunOrMoon(20, 10, 5) + clSml(cL);
            break;

          case 2:
            desc = "Partly cloudy";
            s = sunOrMoon(23, 9, 4.5) + clBig(cL);
            break;

          case 3:
            desc = "Overcast";
            s = clBig(cM);
            break;

          case 61:
            desc = "Rain";
            s =
              clBig(cM) +
              `<ellipse cx="11" cy="28" rx="1.5" ry="2.5" fill="#60A5FA"/>` +
              `<ellipse cx="16" cy="30" rx="1.5" ry="2.5" fill="#60A5FA"/>` +
              `<ellipse cx="21" cy="28" rx="1.5" ry="2.5" fill="#60A5FA"/>`;
            break;

          case 71:
            desc = "Snow";
            s =
              clBig(cM) +
              `<circle cx="12" cy="28" r="1.5" fill="#BAE6FD"/>` +
              `<circle cx="18" cy="30" r="1.5" fill="#BAE6FD"/>` +
              `<circle cx="22" cy="27" r="1.5" fill="#BAE6FD"/>`;
            break;

          default:
            desc = "Cloudy";
            s = clBig(cM);
        }

        // night tint overlay
        if (night && [2, 3].includes(weathercode)) {

          s =
            `<rect x="0" y="0" width="32" height="32" fill="#0F172A" opacity="0.15" rx="4"/>`
            + s;
        }

        const finalSvg =
          `<svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">${s}</svg>`;

        const tempStr = `${Math.round(temperature)}°`;
        const cityStr = city;

        const c1 =
          document.getElementById("weather-city");

        const c2 =
          document.getElementById("weather-city-desktop");

        const t1 =
          document.getElementById("temp");

        const t2 =
          document.getElementById("temp-desktop");

        const i1 =
          document.getElementById("weather-icon");

        const i2 =
          document.getElementById("weather-icon-desktop");

        const d1 =
          document.getElementById("weather-description");

        const d2 =
          document.getElementById("weather-description-desktop");

        // city
        if (c1) c1.textContent = cityStr;
        if (c2) c2.textContent = cityStr;

        // temperature
        if (t1) t1.textContent = tempStr;
        if (t2) t2.textContent = tempStr;

        // icon
        if (i1) i1.innerHTML = finalSvg;
        if (i2) i2.innerHTML = finalSvg;

        // description
        if (d1) {
          d1.textContent = desc;
          d1.style.opacity = "0.45";
          d1.style.fontSize = "13px";
        }

        if (d2) {
          d2.textContent = desc;
          d2.style.opacity = "0.45";
          d2.style.fontSize = "13px";
        }

      })

      .catch((err) => {
        console.error("Weather widget failed:", err);
      });
  }

  // ── geolocation with fast fallback ─────────────────────────
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (pos) => fetchAndRender(pos.coords.latitude, pos.coords.longitude),
      () => fetchAndRender(DEF_LAT, DEF_LON),          // denied / error
      { enableHighAccuracy: false, timeout: 6000 }        // quick, low-power
    );
  } else {
    fetchAndRender(DEF_LAT, DEF_LON);                      // no API
  }
}

/* ── SIDEBAR ──────────────────────────────────────────────── */
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
    if (!sb.contains(e.target) && !menuBtn.contains(e.target)) close();
  });
}

/* ── THEMES ───────────────────────────────────────────────── */
function setTheme(theme) {
  state.theme = theme;
  localStorage.setItem("gx_theme", theme);
  applyTheme(theme);
}

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  document.querySelectorAll("[data-theme-btn]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.themeBtn === theme);
  });
}

/* ── EVENT DELEGATION ─────────────────────────────────────── */
function setupEventDelegation() {
  // Bookmark additions & removals
  document.getElementById("bookmarks-grid")?.addEventListener("click", (e) => {
    const removeBtn = e.target.closest(".bookmark-remove");
    if (removeBtn) {
      e.preventDefault();
      e.stopPropagation();
      const index = parseInt(removeBtn.dataset.index, 10);
      removeBookmark(removeBtn.closest(".bookmark-item"), index);
      return;
    }

    const addBtn = e.target.closest(".bookmark-add");
    if (addBtn) {
      openLinkModal();
    }
  });

  // Task events
  const handleTaskListClick = (e) => {
    const target = e.target;
    const taskItem = target.closest(".task-item");
    if (!taskItem) return;
    const index = parseInt(taskItem.dataset.index, 10);

    if (target.classList.contains("task-del")) {
      deleteTask(index);
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

  // Task action triggers (Fixes CSP issue)
  document.addEventListener("click", (e) => {
    if (e.target.closest(".task-add-trigger")) {
      openTaskModal();
    }
    if (e.target.closest(".clear-tasks-trigger")) {
      clearAllTasks();
    }
  });

  // Interface Skin Theme Button bindings
  document.querySelectorAll("[data-theme-btn]").forEach((btn) => {
    btn.addEventListener("click", () => {
      setTheme(btn.dataset.themeBtn);
    });
  });

  // Sidebar widget toggles
  ["weather", "clock", "bookmarks", "tasks"].forEach((key) => {
    document.getElementById(`toggle-${key}`)?.addEventListener("change", () => {
      toggleWidget(key);
    });
  });

  // Remove wallpaper binding
  document.getElementById("clear-bg-btn")?.addEventListener("click", clearBg);
}

/* ── BOOKMARKS ────────────────────────────────────────────── */
function renderBookmarks() {
  const grid = document.getElementById("bookmarks-grid");
  if (!grid) return;

  const frag = document.createDocumentFragment();

  state.bookmarks.forEach((b, i) => {
    const div = document.createElement("div");
    div.className = "bookmark-item";
    div.style.animationDelay = `${i * 50}ms`;
    div.innerHTML = `
      <a href="${b.url}" class="bookmark-circle">
        <img src="https://www.google.com/s2/favicons?domain=${b.url}&sz=128" loading="lazy" onerror="this.style.opacity='0.4'" alt="${b.name}">
        <button class="bookmark-remove" data-index="${i}" title="Remove">✕</button>
      </a>
      <span class="bookmark-label">${b.name}</span>
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
      <span class="bookmark-label" style="opacity:0.2">Add</span>
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
    localStorage.setItem("gx_bookmarks", JSON.stringify(state.bookmarks));
    renderBookmarks();
  }, 260);
}

/* ── TASKS ────────────────────────────────────────────────── */
function renderTasks() {
  const list = document.getElementById("task-list");
  const listMobile = document.getElementById("task-list-mobile");
  if (!list && !listMobile) return;

  const html = !state.tasks.length
    ? `<p class="text-[10px] opacity-20 text-center py-3 uppercase tracking-widest">No tasks yet</p>`
    : state.tasks
      .map(
        (t, i) => `
        <div class="task-item group" data-index="${i}">
          <input type="checkbox" ${t.done ? "checked" : ""} class="checkbox checkbox-primary checkbox-xs border-white/20 rounded flex-shrink-0">
          <span class="text-[11px] font-medium transition-all flex-1 ${t.done ? "line-through opacity-20" : "opacity-65"}">${t.text}</span>
          <button class="task-del">✕</button>
        </div>
      `,
      )
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

function saveTasks() {
  localStorage.setItem("gx_tasks", JSON.stringify(state.tasks));
}

/* ── MODALS ───────────────────────────────────────────────── */
function openModal() {
  document.getElementById("modal-backdrop")?.classList.add("show");
}

function closeModal() {
  document.getElementById("modal-backdrop")?.classList.remove("show");
}

document.getElementById("modal-backdrop")?.addEventListener("click", (e) => {
  if (e.target === e.currentTarget) closeModal();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeModal();
});

function openLinkModal() {
  const modalTitle = document.getElementById("modal-title");
  const modalInputs = document.getElementById("modal-inputs");
  const modalConfirm = document.getElementById("modal-confirm");
  if (!modalTitle || !modalInputs || !modalConfirm) return;

  modalTitle.textContent = "ADD QUICK LINK";
  modalInputs.innerHTML = `
    <input type="text" id="url-name" placeholder="Site name (e.g. Reddit)" autocomplete="off">
    <input type="url" id="url-link" placeholder="https://example.com" autocomplete="off">
  `;
  modalConfirm.textContent = "Add Link";

  modalConfirm.onclick = () => {
    if (state.bookmarks.length >= MAX_BOOKMARKS) return shakeInput();
    const name = document.getElementById("url-name")?.value.trim();
    const raw = document.getElementById("url-link")?.value.trim();
    if (!name || !raw) return shakeInput();

    let url;
    try {
      url = new URL(raw.startsWith("http") ? raw : "https://" + raw);
    } catch {
      return shakeInput();
    }

    const { hostname } = url;
    if (!hostname.includes(".") || hostname.length <= 3 || hostname.startsWith(".") || hostname.endsWith(".")) {
      return shakeInput();
    }

    const normalizedNew = url.href.replace(/\/$/, "");
    const exists = state.bookmarks.some((b) => {
      try { return new URL(b.url).href.replace(/\/$/, "") === normalizedNew; }
      catch { return false; }
    });
    if (exists) return shakeInput();

    state.bookmarks.push({ name, url: url.href });
    localStorage.setItem("gx_bookmarks", JSON.stringify(state.bookmarks));
    renderBookmarks();
    closeModal();
  };

  requestAnimationFrame(() => {
    openModal();
    setTimeout(() => document.getElementById("url-name")?.focus(), 200);
  });
}

function openTaskModal() {
  const modalTitle = document.getElementById("modal-title");
  const modalInputs = document.getElementById("modal-inputs");
  const modalConfirm = document.getElementById("modal-confirm");
  if (!modalTitle || !modalInputs || !modalConfirm) return;

  modalTitle.textContent = "NEW TASK";
  modalInputs.innerHTML = `<input type="text" id="task-text" placeholder="What needs to be done?" autocomplete="off">`;
  modalConfirm.textContent = "Add Task";

  modalConfirm.onclick = () => {
    const text = document.getElementById("task-text")?.value.trim();
    if (!text) return;
    state.tasks.push({ text, done: false });
    saveTasks();
    renderTasks();
    closeModal();
  };

  requestAnimationFrame(() => {
    openModal();
    setTimeout(() => document.getElementById("task-text")?.focus(), 200);
  });
}

function shakeInput() {
  document.getElementById("modal-inputs")?.querySelectorAll("input").forEach((inp) => {
    inp.style.borderColor = "rgba(244,63,94,0.7)";
    inp.style.animation = "shake 0.3s ease";
    setTimeout(() => {
      inp.style.borderColor = "";
      inp.style.animation = "";
    }, 600);
  });
}

/* ── BACKGROUND ───────────────────────────────────────────── */
function setupBg() {
  const savedBg = safeGet("gx_bg");

  if (
    typeof savedBg === "string" &&
    (savedBg.startsWith("data:image") ||
      savedBg.startsWith("backgrounds/") ||
      savedBg.startsWith("http"))
  ) {
    applyBg(savedBg);
  } else {
    clearBg();
  }

  document
    .getElementById("custom-bg-input")
    ?.addEventListener("change", (e) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const MAX_SIZE_MB = 4;
      if (file.size > MAX_SIZE_MB * 1024 * 1024) {
        alert(
          `Image is too large! Please choose an image smaller than ${MAX_SIZE_MB}MB.`,
        );
        e.target.value = "";
        return;
      }

      const reader = new FileReader();
      reader.onload = async (ev) => {
        const rawUrl = ev.target.result;
        if (typeof rawUrl !== "string" || !rawUrl.startsWith("data:image"))
          return;

        let dataUrl;
        try {
          dataUrl = await compressImage(rawUrl, 1280, 0.6);
        } catch {
          dataUrl = rawUrl;
        }

        applyBg(dataUrl);

        try {
          localStorage.setItem("gx_bg", dataUrl);
          state.hasBg = true;
        } catch (err) {
          console.warn(
            "Background image too large for localStorage storage capacity. Try a smaller file.",
            err,
          );
          state.hasBg = true;
        }
      };
      reader.readAsDataURL(file);
    });
}

function applyBg(url) {
  if (typeof url !== "string") return clearBg();

  const isData = url.startsWith("data:image");
  const isLocal = url.startsWith("backgrounds/");
  const isExternal = url.startsWith("http");

  if (!isData && !isLocal && !isExternal) return clearBg();

  const bg = document.getElementById("main-bg");
  const base = document.getElementById("base-overlay");
  const thumb = document.getElementById("wallpaper-thumb");
  if (!bg) return;

  const apply = () => {
    bg.style.backgroundImage = `url('${url}')`;
    if (thumb) thumb.style.backgroundImage = `url('${url}')`;
    if (base) base.style.opacity = "0";
    state.hasBg = true;
    applyWallpaperEffects();
  };

  if (isData || isLocal) {
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

  const fallbackUrl = "backgrounds/background-image.png";

  if (bg) bg.style.backgroundImage = `url('${fallbackUrl}')`;
  if (base) base.style.opacity = "0";
  if (thumb) thumb.style.backgroundImage = `url('${fallbackUrl}')`;

  state.hasBg = false;
  const inp = document.getElementById("custom-bg-input");
  if (inp) inp.value = "";

  applyWallpaperEffects();
}

/* ── WALLPAPER PRESETS ───────────────────────────────────── */
function renderWallpaperButtons() {
  const grid = document.getElementById("wallpaper-grid");
  if (!grid) return;

  grid.innerHTML = PRESET_WALLPAPERS.map(
    (wp) => `
    <button 
      data-preset-bg="${wp.id}" 
      title="${wp.id}"
      class="group relative aspect-video w-full rounded-2xl overflow-hidden bg-white/[0.02] shadow-xl transition-all duration-300 focus:outline-none hover:shadow-2xl hover:scale-[1.02] active:scale-95"
    >
      <img 
        src="${wp.value}" 
        alt="${wp.id}" 
        class="w-full h-full object-cover opacity-40 group-hover:opacity-60 group-hover:scale-110 transition-all duration-500 ease-out" 
        loading="lazy"
      >
      <div class="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all duration-300 ease-out rounded-2xl"></div>
    </button>
  `,
  ).join("");
}

/* ── WALLPAPER EFFECTS CONTROLS ───────────────────────────── */
function applyWallpaperEffects() {
  const bg = document.getElementById("main-bg");
  const vignette = document.getElementById("theme-overlay");
  if (!bg) return;

  const blur = Number.isFinite(wallpaperFX.blur) ? wallpaperFX.blur : 0;
  const brightness = Number.isFinite(wallpaperFX.brightness)
    ? wallpaperFX.brightness
    : 1;

  bg.style.filter = `blur(${blur}px) brightness(${brightness})`;

  if (vignette) {
    vignette.style.background = `
      radial-gradient(ellipse 70% 50% at 50% 0%, rgba(var(--primary-rgb), ${wallpaperFX.tint}) 0%, transparent 70%),
      radial-gradient(ellipse 80% 60% at 50% 100%, rgba(var(--primary-rgb), ${wallpaperFX.tint}) 0%, transparent 70%)
    `;
  }
  syncWallpaperToCSS();
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

  bind("blur-slider", "blur", "blur-value");
  bind("brightness-slider", "brightness", "brightness-value", (v) =>
    v.toFixed(2),
  );
  bind("vignette-slider", "vignette", "vignette-value", (v) => v.toFixed(2));
  bind("tint-slider", "tint", "tint-value", (v) => v.toFixed(2));

  applyWallpaperEffects();
}

/* ── EVENT DELEGATION ─────────────────────────────────────── */
function setupEventDelegation() {
  document.getElementById("bookmarks-grid")?.addEventListener("click", (e) => {
    const removeBtn = e.target.closest(".bookmark-remove");
    if (removeBtn) {
      e.preventDefault();
      e.stopPropagation();
      const index = parseInt(removeBtn.dataset.index, 10);
      removeBookmark(removeBtn.closest(".bookmark-item"), index);
      return;
    }

    const addBtn = e.target.closest(".bookmark-add");
    if (addBtn) {
      openLinkModal();
    }
  });

  const handleTaskListClick = (e) => {
    const target = e.target;
    const taskItem = target.closest(".task-item");
    if (!taskItem) return;
    const index = parseInt(taskItem.dataset.index, 10);

    if (target.classList.contains("task-del")) {
      deleteTask(index);
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

  // GLOBAL DOCUMENT CLICK LISTENER
  document.addEventListener("click", (e) => {
    if (e.target.closest(".task-add-trigger")) {
      openTaskModal();
    }
    if (e.target.closest(".clear-tasks-trigger")) {
      clearAllTasks();
    }
    if (e.target.closest(".modal-cancel-trigger")) {
      closeModal();
    }

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

  document.querySelectorAll("[data-theme-btn]").forEach((btn) => {
    btn.addEventListener("click", () => {
      setTheme(btn.dataset.themeBtn);
    });
  });

  ["weather", "clock", "bookmarks", "tasks"].forEach((key) => {
    document.getElementById(`toggle-${key}`)?.addEventListener("change", () => {
      toggleWidget(key);
    });
  });

  document.getElementById("clear-bg-btn")?.addEventListener("click", clearBg);
}

/* ── OFFLINE TOAST ────────────────────────────────────────── */
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

  document.getElementById("offline-toast-close")
    ?.addEventListener("click", () => {
      dismissed = true;
      hide();
    }, { passive: true });

  window.addEventListener("offline", () => {
    dismissed = false;
    show();
  }, { passive: true });

  window.addEventListener("online", hide, { passive: true });

  if (!navigator.onLine) show();
}

/* ── TEARDOWN CLEANUP ─────────────────────────────────────── */
window.addEventListener("beforeunload", () => {
  if (clockIntervalId) clearInterval(clockIntervalId);
  if (greetingIntervalId) clearInterval(greetingIntervalId);
  if (mouseMoveController) mouseMoveController.abort();
});
