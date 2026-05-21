/* ═══════════════════════════════════════════════════════════
   ELITE NEW TAB — script.js
═════════════════════════════════════════════════════════════ */

const MAX_BOOKMARKS = 8;

function safeGet(key) {
  const v = localStorage.getItem(key);
  if (v === null || v === "null" || v === "undefined" || v === "") return null;
  return v;
}

/* ── State ────────────────────────────────────────────────── */
const state = {
  theme: safeGet("gx_theme") || "blue",
  bookmarks: (() => {
    try {
      const p = JSON.parse(localStorage.getItem("gx_bookmarks"));

      return Array.isArray(p) && p.length
        ? p
        : [
            { name: "YouTube", url: "https://www.youtube.com" },
            { name: "Discord", url: "https://discord.com" },
          ];
    } catch {
      return [
        { name: "YouTube", url: "https://www.youtube.com" },
        { name: "Discord", url: "https://discord.com" },
      ];
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

/* ── Widget Visibility Config ─────────────────────────────── */
const WIDGET_MAP = {
  weather: {
    ids: ["weather-widget", "weather-widget-desktop"],
    key: "gx_vis_weather",
  },
  clock: {
    ids: ["time-widget", "time-widget-desktop"],
    key: "gx_vis_clock",
  },
  bookmarks: {
    ids: ["bookmark-widget"],
    key: "gx_vis_bookmarks",
  },
  tasks: {
    ids: ["notes-widget", "notes-widget-mobile"],
    key: "gx_vis_tasks",
  },
};

function isWidgetVisible(widgetKey) {
  const raw = localStorage.getItem(WIDGET_MAP[widgetKey].key);
  // Default to visible if never saved
  return raw !== "false";
}

function applyWidgetVisibility(el, visible) {
  if (visible) {
    el.style.display = "";
    el.style.opacity = "0";
    el.style.transform = "scale(0.92) translateY(8px)";
    // Force reflow so the browser registers the starting state
    void el.offsetHeight;
    el.style.transition =
      "opacity 400ms cubic-bezier(0.16,1,0.3,1), transform 400ms cubic-bezier(0.16,1,0.3,1)";
    el.style.opacity = "1";
    el.style.transform = "scale(1) translateY(0)";
    const cleanup = () => {
      el.style.transition = "";
      el.style.opacity = "";
      el.style.transform = "";
      el.removeEventListener("transitionend", cleanup);
    };
    el.addEventListener("transitionend", cleanup, { once: true });
    setTimeout(cleanup, 450);
  } else {
    el.style.transition = "opacity 250ms ease, transform 250ms ease";
    el.style.opacity = "0";
    el.style.transform = "scale(0.92) translateY(8px)";
    setTimeout(() => {
      el.style.display = "none";
      el.style.transition = "";
      el.style.opacity = "";
      el.style.transform = "";
    }, 260);
  }
}

function toggleWidget(widgetKey) {
  const config = WIDGET_MAP[widgetKey];
  if (!config) return;

  const currentlyVisible = isWidgetVisible(widgetKey);
  const newVisible = !currentlyVisible;

  localStorage.setItem(config.key, String(newVisible));

  config.ids.forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    applyWidgetVisibility(el, newVisible);
  });

  // Keep checkbox in sync
  const checkbox = document.getElementById(`toggle-${widgetKey}`);
  if (checkbox) checkbox.checked = newVisible;
}

function initWidgetVisibility() {
  for (const [key, config] of Object.entries(WIDGET_MAP)) {
    const visible = isWidgetVisible(key);

    config.ids.forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      // Instant apply on boot — no animation
      el.style.display = visible ? "" : "none";
    });

    const checkbox = document.getElementById(`toggle-${key}`);
    if (checkbox) checkbox.checked = visible;
  }
}

/* ── Wallpaper FX ─────────────────────────────────────────── */
const DEFAULT_WALLPAPER_FX = {
  blur: 0,
  brightness: 1,
  vignette: 0.0,
  tint: 0.25,
};

function loadWallpaperFX() {
  const fx = {};
  for (const key in DEFAULT_WALLPAPER_FX) {
    const raw = localStorage.getItem(`gx_${key}`);
    const num = Number(raw);
    const bad =
      raw === null ||
      raw === "null" ||
      raw === "undefined" ||
      raw === "" ||
      Number.isNaN(num);
    fx[key] = bad ? DEFAULT_WALLPAPER_FX[key] : num;
    localStorage.setItem(`gx_${key}`, fx[key]);
  }
  return fx;
}

const wallpaperFX = loadWallpaperFX();

function syncWallpaperToCSS() {
  const root = document.documentElement;
  root.style.setProperty("--bg-blur", `${wallpaperFX.blur}px`);
  root.style.setProperty("--bg-brightness", wallpaperFX.brightness);
  root.style.setProperty("--bg-vignette", wallpaperFX.vignette);
  root.style.setProperty("--bg-tint", wallpaperFX.tint);
}

/* ── Image Compression (keeps bg under localStorage limit) ── */
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
  initClock();
  initGreeting();
  getWeather();
  renderBookmarks();
  renderTasks();
  applyTheme(state.theme, false);
  setupSidebar();
  setupBg();
  initUsername();
  setupAmbientLight();
  initWallpaperControls();
  applyWallpaperEffects();
  syncWallpaperToCSS();
  initWidgetVisibility();
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
function initClock() {
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

    const targets = [
      ["h-m", "seconds", "date"],
      ["h-m-desktop", "seconds-desktop", "date-desktop"],
    ];

    targets.forEach(([hmId, secId, dateId]) => {
      const hm = document.getElementById(hmId);
      const sec = document.getElementById(secId);
      const date = document.getElementById(dateId);
      if (hm) hm.textContent = `${H}:${M}`;
      if (sec) sec.textContent = S;
      if (date) date.textContent = dateStr;
    });
  };

  tick();
  setInterval(tick, 1000);
}

/* ── WEATHER ──────────────────────────────────────────────── */
async function getWeather() {
  try {
    const r = await fetch(
      "https://api.open-meteo.com/v1/forecast?latitude=42.6977&longitude=23.3219&current_weather=true",
    );
    const d = await r.json();
    const { temperature, weathercode } = d.current_weather;

    const icons = {
      0: "☀️",
      1: "🌤️",
      2: "⛅",
      3: "☁️",
      45: "🌫️",
      48: "🌫️",
      51: "🌦️",
      61: "🌧️",
      71: "🌨️",
      80: "🌦️",
      95: "🌩️",
    };

    const icon = icons[weathercode] ?? "🌡️";
    const tempStr = `${Math.round(temperature)}°`;

    const temp = document.getElementById("temp");
    const weather = document.getElementById("weather-icon");
    const tempD = document.getElementById("temp-desktop");
    const weatherD = document.getElementById("weather-icon-desktop");

    if (temp) temp.textContent = tempStr;
    if (weather) weather.textContent = icon;
    if (tempD) tempD.textContent = tempStr;
    if (weatherD) weatherD.textContent = icon;
  } catch (err) {
    console.warn("Weather fetch failed:", err);
  }
}

/* ── SIDEBAR ──────────────────────────────────────────────── */
function setupSidebar() {
  const sb = document.getElementById("settings-sidebar");
  const menuBtn = document.getElementById("menu-btn");
  const closeBtn = document.getElementById("close-sidebar");
  const hoverZone = document.getElementById("sidebar-hover-zone");

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
  closeBtn.addEventListener("click", close);

  hoverZone.addEventListener("mouseenter", () => {
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
  applyTheme(theme, true);
}

function applyTheme(theme, animate = true) {
  document.documentElement.setAttribute("data-theme", theme);
  document.querySelectorAll("[data-theme-btn]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.themeBtn === theme);
  });
}

/* ── BOOKMARKS ────────────────────────────────────────────── */
function renderBookmarks() {
  const grid = document.getElementById("bookmarks-grid");
  if (!grid) return;

  const isFull = state.bookmarks.length >= MAX_BOOKMARKS;

  const items = state.bookmarks.map((b, i) => {
    const div = document.createElement("div");
    div.className = "bookmark-item";
    div.style.animationDelay = `${i * 50}ms`;
    div.innerHTML = `
      <a href="${b.url}" class="bookmark-circle">
        <img src="https://www.google.com/s2/favicons?domain=${b.url}&sz=128"
             loading="lazy"
             onerror="this.style.opacity='0.4'"
             alt="${b.name}">
        <button class="bookmark-remove" onclick="removeBookmark(event,${i})" title="Remove">✕</button>
      </a>
      <span class="bookmark-label">${b.name}</span>
    `;
    return div;
  });

  grid.innerHTML = "";
  items.forEach((el) => grid.appendChild(el));

  if (!isFull) {
    const addDiv = document.createElement("div");
    addDiv.className = "bookmark-item";
    addDiv.style.animationDelay = `${state.bookmarks.length * 50}ms`;
    addDiv.innerHTML = `
      <button class="bookmark-add" onclick="openLinkModal()" title="Add link">
        <svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path d="M12 5v14M5 12h14"/>
        </svg>
      </button>
      <span class="bookmark-label" style="opacity:0.2">Add</span>
    `;
    grid.appendChild(addDiv);
  }
}

function removeBookmark(e, i) {
  e.preventDefault();
  e.stopPropagation();
  const item = e.target.closest(".bookmark-item");
  if (item) {
    item.style.transition = "opacity 250ms ease, transform 250ms ease";
    item.style.opacity = "0";
    item.style.transform = "scale(0.8)";
    setTimeout(() => {
      state.bookmarks.splice(i, 1);
      saveBookmarks();
      renderBookmarks();
    }, 260);
  }
}

function saveBookmarks() {
  localStorage.setItem("gx_bookmarks", JSON.stringify(state.bookmarks));
}

/* ── TASKS ────────────────────────────────────────────────── */
function renderTasks() {
  const lists = [
    document.getElementById("task-list"),
    document.getElementById("task-list-mobile"),
  ].filter(Boolean);

  const html = !state.tasks.length
    ? `<p class="text-[10px] opacity-20 text-center py-3 uppercase tracking-widest">No tasks yet</p>`
    : state.tasks
        .map(
          (t, i) => `
        <div class="task-item group">
          <input type="checkbox" ${t.done ? "checked" : ""} onchange="toggleTask(${i})"
                 class="checkbox checkbox-primary checkbox-xs border-white/20 rounded flex-shrink-0">
          <span class="text-[11px] font-medium transition-all flex-1
            ${t.done ? "line-through opacity-20" : "opacity-65"}">${t.text}</span>
          <button class="task-del" onclick="deleteTask(${i})">✕</button>
        </div>
      `,
        )
        .join("");

  lists.forEach((list) => {
    list.innerHTML = html;
  });
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
  state.tasks = [];
  saveTasks();
  renderTasks();
}

function saveTasks() {
  localStorage.setItem("gx_tasks", JSON.stringify(state.tasks));
}

/* ── MODAL ────────────────────────────────────────────────── */
const backdrop = document.getElementById("modal-backdrop");
const modalTitle = document.getElementById("modal-title");
const modalInputs = document.getElementById("modal-inputs");
const modalConfirm = document.getElementById("modal-confirm");

function openModal() {
  backdrop.classList.add("show");
}

function closeModal() {
  backdrop.classList.remove("show");
}

backdrop.addEventListener("click", (e) => {
  if (e.target === backdrop) closeModal();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeModal();
});

function openLinkModal() {
  modalTitle.textContent = "ADD QUICK LINK";
  modalInputs.innerHTML = `
    <input type="text" id="url-name" placeholder="Site name (e.g. Reddit)" autocomplete="off">
    <input type="url" id="url-link" placeholder="https://example.com" autocomplete="off">
  `;
  modalConfirm.textContent = "Add Link";

  modalConfirm.onclick = () => {
    if (state.bookmarks.length >= MAX_BOOKMARKS) {
      shakeinput();
      return;
    }

    const name = document.getElementById("url-name").value.trim();
    const raw = document.getElementById("url-link").value.trim();

    if (!name || !raw) {
      shakeinput();
      return;
    }

    let url;
    try {
      url = new URL(raw.startsWith("http") ? raw : "https://" + raw);
    } catch {
      shakeinput();
      return;
    }

    const hostname = url.hostname;
    const isValidDomain =
      hostname.includes(".") &&
      hostname.length > 3 &&
      !hostname.startsWith(".") &&
      !hostname.endsWith(".");

    if (!isValidDomain) {
      shakeinput();
      return;
    }

    const normalizedNew = url.href.replace(/\/$/, "");

    const exists = state.bookmarks.some((b) => {
      try {
        return new URL(b.url).href.replace(/\/$/, "") === normalizedNew;
      } catch {
        return false;
      }
    });

    if (exists) {
      shakeinput();
      return;
    }

    state.bookmarks.push({ name, url: url.href });
    saveBookmarks();
    renderBookmarks();
    closeModal();
  };

  requestAnimationFrame(() => {
    openModal();
    setTimeout(() => document.getElementById("url-name")?.focus(), 200);
  });
}

function openTaskModal() {
  modalTitle.textContent = "NEW TASK";
  modalInputs.innerHTML = `
    <input type="text" id="task-text" placeholder="What needs to be done?" autocomplete="off">
  `;
  modalConfirm.textContent = "Add Task";

  modalConfirm.onclick = () => {
    const text = document.getElementById("task-text").value.trim();
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

function shakeinput() {
  const inputs = modalInputs.querySelectorAll("input");
  inputs.forEach((inp) => {
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

  if (typeof savedBg === "string" && savedBg.startsWith("data:image")) {
    applyBg(savedBg);
  } else {
    clearBg();
  }

  const input = document.getElementById("bg-input");
  if (!input) return;

  input.addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();

    reader.onload = async (ev) => {
      const rawUrl = ev.target.result;

      if (typeof rawUrl !== "string" || !rawUrl.startsWith("data:image"))
        return;

      let dataUrl;
      try {
        dataUrl = await compressImage(rawUrl, 1920, 0.7);
      } catch {
        dataUrl = rawUrl;
      }

      applyBg(dataUrl);

      try {
        localStorage.setItem("gx_bg", dataUrl);
        state.hasBg = true;
      } catch (err) {
        console.warn(
          "Background image too large for localStorage — it will not persist.",
          err,
        );
        localStorage.removeItem("gx_bg");
        state.hasBg = true;
      }
    };

    reader.readAsDataURL(file);
  });
}

function applyBg(dataUrl) {
  if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:image")) {
    return clearBg();
  }

  const bg = document.getElementById("main-bg");
  const base = document.getElementById("base-overlay");
  const thumb = document.getElementById("wallpaper-thumb");

  if (!bg) return;

  bg.style.backgroundImage = `url(${dataUrl})`;
  if (base) base.style.opacity = "0";
  if (thumb) thumb.style.backgroundImage = `url(${dataUrl})`;

  state.hasBg = true;
  applyWallpaperEffects();
  syncWallpaperToCSS();
}

function clearBg() {
  localStorage.removeItem("gx_bg");

  const bg = document.getElementById("main-bg");
  const base = document.getElementById("base-overlay");
  const thumb = document.getElementById("wallpaper-thumb");

  if (bg) bg.style.backgroundImage = "";
  if (base) base.style.opacity = "1";
  if (thumb) thumb.style.backgroundImage = "";

  state.hasBg = false;

  const inp = document.getElementById("bg-input");
  if (inp) inp.value = "";

  applyWallpaperEffects();
  syncWallpaperToCSS();
}

/* ── GREETING ─────────────────────────────────────────────── */
function getGreetingData() {
  const hour = new Date().getHours();
  const slots = [
    { max: 5, greet: "Still awake", focus: "Late-night grind." },
    { max: 12, greet: "Good morning", focus: "Start sharp." },
    { max: 18, greet: "Good afternoon", focus: "Stay productive." },
    { max: 23, greet: "Good evening", focus: "Ready to focus?" },
    { max: 24, greet: "Still awake", focus: "Late-night grind." },
  ];
  const slot = slots.find((s) => hour < s.max);
  const name = state.username ? `, ${state.username}` : "";
  return { greeting: `${slot.greet}${name}.`, focus: slot.focus };
}

function updateGreeting() {
  const greetingEl = document.getElementById("greeting-text");
  const focusEl = document.getElementById("focus-text");
  if (!greetingEl || !focusEl) return;
  const data = getGreetingData();
  greetingEl.textContent = data.greeting;
  focusEl.textContent = data.focus;
}

function initGreeting() {
  updateGreeting();
  setInterval(updateGreeting, 60000);
}

/* ── Ambient Mouse Light ──────────────────────────────────── */
function setupAmbientLight() {
  const light = document.getElementById("ambient-light");
  if (!light) return;

  if (window.matchMedia("(pointer: coarse)").matches) return;

  let raf = null;
  window.addEventListener("mousemove", (e) => {
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
  });
}

/* ── Wallpaper Controls ───────────────────────────────────── */
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
      radial-gradient(
        ellipse 70% 50% at 50% 0%,
        rgba(var(--primary-rgb), ${wallpaperFX.tint}) 0%,
        transparent 70%
      ),
      radial-gradient(
        ellipse 80% 60% at 50% 100%,
        rgba(var(--primary-rgb), ${wallpaperFX.tint}) 0%,
        transparent 70%
      )
    `;
  }

  syncWallpaperToCSS();
}

function initWallpaperControls() {
  const blur = document.getElementById("blur-slider");
  const brightness = document.getElementById("brightness-slider");
  const vignette = document.getElementById("vignette-slider");
  const tint = document.getElementById("tint-slider");

  const blurVal = document.getElementById("blur-value");
  const brightVal = document.getElementById("brightness-value");
  const vignetteVal = document.getElementById("vignette-value");
  const tintVal = document.getElementById("tint-value");

  const bind = (el, key, label, fmt = (v) => v) => {
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

  bind(blur, "blur", blurVal);
  bind(brightness, "brightness", brightVal, (v) => v.toFixed(2));
  bind(vignette, "vignette", vignetteVal, (v) => v.toFixed(2));
  bind(tint, "tint", tintVal, (v) => v.toFixed(2));

  applyWallpaperEffects();
}
