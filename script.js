/* ═══════════════════════════════════════════════════════════
   ELITE NEW TAB — script.js (Optimized for Low Memory Usage)
═════════════════════════════════════════════════════════════ */

const MAX_BOOKMARKS = 8;

function safeGet(key) {
  const v = localStorage.getItem(key);
  return v === null || v === "null" || v === "undefined" || v === "" ? null : v;
}

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
  initWallpaperControls();
  applyWallpaperEffects();
  initWidgetVisibility();
  setupEventDelegation(); 
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
  { max: 5, greet: "Still awake", focus: "Late-night grind." },
  { max: 12, greet: "Good morning", focus: "Start sharp." },
  { max: 18, greet: "Good afternoon", focus: "Stay productive." },
  { max: 23, greet: "Good evening", focus: "Ready to focus?" },
  { max: 24, greet: "Still awake", focus: "Late-night grind." },
];

function updateGreeting() {
  const greetingEl = document.getElementById("greeting-text");
  const focusEl = document.getElementById("focus-text");
  if (!greetingEl || !focusEl) return;

  const hour = new Date().getHours();
  const slot = slots.find((s) => hour < s.max) || slots[1];
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

    const elements = [
      "temp",
      "weather-icon",
      "temp-desktop",
      "weather-icon-desktop",
    ].map((id) => document.getElementById(id));
    if (elements[0]) elements[0].textContent = tempStr;
    if (elements[1]) elements[1].textContent = icon;
    if (elements[2]) elements[2].textContent = tempStr;
    if (elements[3]) elements[3].textContent = icon;
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

  document.getElementById("task-list")?.addEventListener("click", handleTaskListClick);
  document.getElementById("task-list-mobile")?.addEventListener("click", handleTaskListClick);

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
const backdrop = document.getElementById("modal-backdrop");
const modalTitle = document.getElementById("modal-title");
const modalInputs = document.getElementById("modal-inputs");
const modalConfirm = document.getElementById("modal-confirm");

function openModal() {
  backdrop?.classList.add("show");
}
function closeModal() {
  backdrop?.classList.remove("show");
}

backdrop?.addEventListener("click", (e) => {
  if (e.target === backdrop) closeModal();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeModal();
});

function openLinkModal() {
  if (!modalTitle || !modalInputs || !modalConfirm) return;
  modalTitle.textContent = "ADD QUICK LINK";
  modalInputs.innerHTML = `
    <input type="text" id="url-name" placeholder="Site name (e.g. Reddit)" autocomplete="off">
    <input type="url" id="url-link" placeholder="https://example.com" autocomplete="off">
  `;
  modalConfirm.textContent = "Add Link";

  modalConfirm.onclick = () => {
    if (state.bookmarks.length >= MAX_BOOKMARKS) return shakeinput();
    const name = document.getElementById("url-name")?.value.trim();
    const raw = document.getElementById("url-link")?.value.trim();

    if (!name || !raw) return shakeinput();

    let url;
    try {
      url = new URL(raw.startsWith("http") ? raw : "https://" + raw);
    } catch {
      return shakeinput();
    }

    const hostname = url.hostname;
    if (
      !hostname.includes(".") ||
      hostname.length <= 3 ||
      hostname.startsWith(".") ||
      hostname.endsWith(".")
    ) {
      return shakeinput();
    }

    const normalizedNew = url.href.replace(/\/$/, "");
    const exists = state.bookmarks.some((b) => {
      try {
        return new URL(b.url).href.replace(/\/$/, "") === normalizedNew;
      } catch {
        return false;
      }
    });

    if (exists) return shakeinput();

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
  if (!modalTitle || !modalInputs || !modalConfirm) return;
  modalTitle.textContent = "NEW TASK";
  modalInputs.innerHTML =
    '<input type="text" id="task-text" placeholder="What needs to be done?" autocomplete="off">';
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

function shakeinput() {
  modalInputs?.querySelectorAll("input").forEach((inp) => {
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

  document.getElementById("bg-input")?.addEventListener("change", (e) => {
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
          "Background image too large for localStorage storage.",
          err,
        );
        localStorage.removeItem("gx_bg");
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

  if (bg) bg.style.backgroundImage = `url(${dataUrl})`;
  if (base) base.style.opacity = "0"; 
  if (thumb) thumb.style.backgroundImage = `url(${dataUrl})`;

  state.hasBg = true;
  applyWallpaperEffects();
}

function clearBg() {
  localStorage.removeItem("gx_bg");

  const bg = document.getElementById("main-bg");
  const base = document.getElementById("base-overlay");
  const thumb = document.getElementById("wallpaper-thumb");

  const fallbackUrl = "url('background-image.png')";

  if (bg) bg.style.backgroundImage = fallbackUrl;
  if (base) base.style.opacity = "0"; 
  if (thumb) thumb.style.backgroundImage = fallbackUrl;

  state.hasBg = false;
  const inp = document.getElementById("bg-input");
  if (inp) inp.value = "";

  applyWallpaperEffects();
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
  // Handles bookmark grid items dynamically (Add or Remove clicks)
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

  // Handles checking or deleting individual list items
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

  document.getElementById("task-list")?.addEventListener("click", handleTaskListClick);
  document.getElementById("task-list-mobile")?.addEventListener("click", handleTaskListClick);

  // Global document click listener (Catches duplicate/multiple buttons cleanly)
  document.addEventListener("click", (e) => {
    // Triggers either of the '+' Add Task buttons
    if (e.target.closest(".task-add-trigger")) {
      openTaskModal();
    }
    // Triggers the 'Clear all' task icon
    if (e.target.closest(".clear-tasks-trigger")) {
      clearAllTasks();
    }
    // Triggers the modal close/cancel actions
    if (e.target.closest(".modal-cancel-trigger")) {
      closeModal();
    }
  });

  // Interface Skin Dot Buttons
  document.querySelectorAll("[data-theme-btn]").forEach((btn) => {
    btn.addEventListener("click", () => {
      setTheme(btn.dataset.themeBtn);
    });
  });

  // Sidebar visibility switches
  ["weather", "clock", "bookmarks", "tasks"].forEach((key) => {
    document.getElementById(`toggle-${key}`)?.addEventListener("change", () => {
      toggleWidget(key);
    });
  });

  // Reset Wallpaper button hook
  document.getElementById("clear-bg-btn")?.addEventListener("click", clearBg);
}

/* ── TEARDOWN CLEANUP ─────────────────────────────────────── */
window.addEventListener("beforeunload", () => {
  if (clockIntervalId) clearInterval(clockIntervalId);
  if (greetingIntervalId) clearInterval(greetingIntervalId);
  if (mouseMoveController) mouseMoveController.abort();
});