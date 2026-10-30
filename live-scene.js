/* ═══════════════════════════════════════════════════════════
   LUMINUS — live-scene.js
   Animated backgrounds:
     GPU (WebGL2 shaders): Aurora · Lava Lamp · Ink · Nebula · Ripples
     Canvas 2D:            Star Field · Fireflies · Constellation

   Design notes:
   • GPU scenes compute every pixel mathematically → smooth edges and
     almost no CPU/RAM use. Light dithering removes color banding.
   • Every scene gets a fresh canvas and the old GPU context is released,
     so switching scenes never piles up memory.
   • The loop pauses when the tab is hidden; 60 fps (smooth) / 30 fps (eco).
   • Without WebGL2, GPU scenes fall back to Star Field.

   CONTENTS
   01. Helpers
   02. Time-of-day palette
   03. WebGL helpers
   04. Shared GLSL + shader-scene factory
   05. Scene: Aurora
   06. Scene: Lava Lamp
   07. Scene: Ink
   08. Scene: Star Field
   09. Scene: Fireflies
   10. Scene: Nebula
   11. Scene: Ripples
   12. Scene: Constellation
   13. Engine
   14. Public API
═════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  const Color = window.LuminusColor;

  /* ══ 01. HELPERS ═══════════════════════════════════════════ */
  function makeCanvas(w, h) {
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(w));
    c.height = Math.max(1, Math.round(h));
    return c;
  }

  function freeCanvas(c) {
    if (c) c.width = c.height = 0;
  }

  function rgba({ r, g, b }, a) {
    return `rgba(${r | 0},${g | 0},${b | 0},${a})`;
  }

  // Seeded random: layouts stay the same after a resize
  function seeded(seed) {
    let s = seed >>> 0;
    return () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  // Smooth 1D value noise (0..1) for organic motion
  function hash1(n) {
    const x = Math.sin(n * 127.1) * 43758.5453;
    return x - Math.floor(x);
  }
  function vnoise(x) {
    const i = Math.floor(x);
    const f = x - i;
    const u = f * f * (3 - 2 * f);
    return hash1(i) * (1 - u) + hash1(i + 1) * u;
  }

  // Palette entry i → [r, g, b] in 0..1 for shaders
  function pal(e, i) {
    const c = e.palette[i] || { r: 59, g: 130, b: 246 };
    return [c.r / 255, c.g / 255, c.b / 255];
  }

  /* ══ 02. TIME-OF-DAY PALETTE ═══════════════════════════════ */
  const DAY_KEYS = [
    { h: 0, c: ["#1e1b4b", "#0f766e", "#312e81"] }, // midnight
    { h: 5, c: ["#312e81", "#7c3aed", "#0e7490"] }, // before dawn
    { h: 7, c: ["#fb7185", "#f59e0b", "#a855f7"] }, // sunrise
    { h: 12, c: ["#38bdf8", "#22d3ee", "#a7f3d0"] }, // midday
    { h: 17, c: ["#f97316", "#ec4899", "#facc15"] }, // golden hour
    { h: 19.5, c: ["#7c3aed", "#db2777", "#f97316"] }, // dusk
    { h: 22, c: ["#1e3a8a", "#6d28d9", "#0f766e"] }, // night
    { h: 24, c: ["#1e1b4b", "#0f766e", "#312e81"] }, // wraps to midnight
  ];
  const DAY_MIX = 0.42; // how strongly the time of day tints the theme colors

  function dayPalette(date = new Date()) {
    const hour = date.getHours() + date.getMinutes() / 60;
    let i = 0;
    while (i < DAY_KEYS.length - 2 && hour >= DAY_KEYS[i + 1].h) i++;
    const a = DAY_KEYS[i];
    const b = DAY_KEYS[i + 1];
    const t = (hour - a.h) / (b.h - a.h);
    return a.c.map((hex, k) => Color.mixHex(hex, b.c[k], t));
  }

  /* ══ 03. WEBGL HELPERS ═════════════════════════════════════ */
  const VERT_SRC = `#version 300 es
layout(location = 0) in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

  const FRAG_HEAD = `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 vUv;
out vec4 fragColor;
`;

  function compileShader(gl, type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(s);
      gl.deleteShader(s);
      throw new Error("Shader compile failed: " + log);
    }
    return s;
  }

  // Builds a program and collects its uniform locations by name
  function makeProgram(gl, fragBody) {
    const vs = compileShader(gl, gl.VERTEX_SHADER, VERT_SRC);
    const fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAG_HEAD + fragBody);
    const p = gl.createProgram();
    gl.attachShader(p, vs);
    gl.attachShader(p, fs);
    gl.linkProgram(p);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      throw new Error("Program link failed: " + gl.getProgramInfoLog(p));
    }
    const u = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) {
      const info = gl.getActiveUniform(p, i);
      u[info.name.replace(/\[0\]$/, "")] = gl.getUniformLocation(p, info.name);
    }
    return { p, u };
  }

  // Sets uniforms by value type: number → float, texture → sampler,
  // {int} → int, arrays → vec2/vec3/vec4 (or vec4 arrays)
  function setUniforms(gl, prog, vals) {
    gl.useProgram(prog.p);
    let unit = 0;
    for (const key in vals) {
      const loc = prog.u[key];
      if (loc == null) continue; // unused uniforms get optimized away
      const v = vals[key];
      if (typeof v === "number") gl.uniform1f(loc, v);
      else if (v instanceof WebGLTexture) {
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, v);
        gl.uniform1i(loc, unit++);
      } else if (v.int !== undefined) gl.uniform1i(loc, v.int);
      else if (v.length === 2) gl.uniform2fv(loc, v);
      else if (v.length === 3) gl.uniform3fv(loc, v);
      else gl.uniform4fv(loc, v);
    }
  }

  // Draws the fullscreen triangle into a framebuffer (or the screen)
  function drawTo(e, target) {
    const gl = e.gl;
    if (target) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.fb);
      gl.viewport(0, 0, target.w, target.h);
    } else {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, e.w, e.h);
    }
    gl.bindVertexArray(e.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  // Half-float render target (smooth, filterable, half the memory of float)
  function createFBO(gl, w, h) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA16F,
      w,
      h,
      0,
      gl.RGBA,
      gl.HALF_FLOAT,
      null,
    );
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      tex,
      0,
    );
    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    return { tex, fb, w, h, ts: [1 / w, 1 / h] };
  }

  function createDoubleFBO(gl, w, h) {
    let a = createFBO(gl, w, h);
    let b = createFBO(gl, w, h);
    return {
      w,
      h,
      ts: a.ts,
      get read() {
        return a;
      },
      get write() {
        return b;
      },
      swap() {
        [a, b] = [b, a];
      },
      free() {
        deleteFBO(gl, a);
        deleteFBO(gl, b);
      },
    };
  }

  function deleteFBO(gl, f) {
    if (!f) return;
    gl.deleteTexture(f.tex);
    gl.deleteFramebuffer(f.fb);
  }

  // Can this browser render to half-float textures?
  function supportsFloatTargets(gl) {
    if (
      !gl.getExtension("EXT_color_buffer_float") &&
      !gl.getExtension("EXT_color_buffer_half_float")
    )
      return false;
    const test = createFBO(gl, 4, 4);
    const ok =
      gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    deleteFBO(gl, test);
    return ok;
  }

  /* ══ 04. SHARED GLSL + SHADER-SCENE FACTORY ════════════════ */
  const GLSL_NOISE = `
float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x),
             mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < 5; i++) { v += a * noise(p); p = m * p; a *= 0.5; }
  return v;
}
// removes banding in dark gradients
vec3 dither(vec3 c) {
  return c + (hash(gl_FragCoord.xy + fract(uTime) * 61.0) - 0.5) / 255.0;
}
`;

  // Uniforms every single-pass shader scene receives
  const GLSL_STD_UNIFORMS = `
uniform vec2 uRes;
uniform float uTime;
uniform vec2 uMouse;     // smoothed cursor, 0..1, y up
uniform float uStrength; // 0 = cursor off, 1 = on
uniform vec3 uC0, uC1, uC2;
`;

  // Factory for one-pass shader scenes (Aurora, Lava, Nebula).
  // opts: frag, resolution, maxDpr, init(e), update(e, dt, t) → extra uniforms,
  //       onClick(e, x, y) (optional; x/y are 0..1, y from the top)
  function shaderScene(opts) {
    const scene = {
      type: "gl",
      resolution: opts.resolution,
      maxDpr: opts.maxDpr ?? 1.5,
      alpha: false,
      setup(e) {
        this.prog = makeProgram(
          e.gl,
          GLSL_STD_UNIFORMS + GLSL_NOISE + opts.frag,
        );
        opts.init?.call(this, e);
      },
      build(e) {
        this.cols = [pal(e, 0), pal(e, 1), pal(e, 2)];
      },
      frame(e, dt, t) {
        const p = e.pointer;
        const extra = opts.update ? opts.update.call(this, e, dt, t) : null;
        setUniforms(e.gl, this.prog, {
          uRes: [e.w, e.h],
          uTime: t,
          uMouse: [p.x, 1 - p.y],
          uStrength: p.strength,
          uC0: this.cols[0],
          uC1: this.cols[1],
          uC2: this.cols[2],
          ...extra,
        });
        drawTo(e, null);
      },
      destroy(e) {
        if (this.prog && e.gl) e.gl.deleteProgram(this.prog.p);
        this.prog = null;
      },
    };
    if (opts.onClick) {
      scene.onClick = function (e, x, y) {
        return opts.onClick.call(this, e, x, y);
      };
    }
    return scene;
  }

  /* ══ 05. SCENE: AURORA ═════════════════════════════════════
     Neon northern lights: green / lime / teal / cyan low, pink → violet
     high up, lightly tinted by the theme (AURORA_CFG.themeMix).
     Dense: overlapping curtains with curling folds, fine rays and a soft
     wash, so there is never an empty gap.
     Endless: time runs forward, then eases into reverse and back again
     (rounded turns, no jump), so numbers stay small and the noise never
     degrades after hours. */
  const AURORA_CFG = {
    layers: 5, // curtains (3–7). More = denser, slightly heavier
    loopSeconds: 600, // seconds before the motion smoothly reverses
    themeMix: 0.15, // 0 = pure neon, 1 = pure theme colors
    brightness: 0.8, // overall glow strength
  };

  const AuroraScene = shaderScene({
    resolution: (eco) => (eco ? 0.65 : 1),
    maxDpr: 1.5,
    frag: `
#define LAYERS ${AURORA_CFG.layers}
#define LOOP ${AURORA_CFG.loopSeconds.toFixed(1)}
#define THEME_MIX ${AURORA_CFG.themeMix.toFixed(3)}
#define BRIGHT ${AURORA_CFG.brightness.toFixed(3)}
#define PI 3.14159265

// neon northern-lights colors (low altitude)
const vec3 NEON[6] = vec3[6](
  vec3(0.10, 1.00, 0.45),  // neon green
  vec3(0.00, 1.00, 0.78),  // neon teal
  vec3(0.55, 1.00, 0.12),  // neon lime
  vec3(0.05, 0.85, 1.00),  // electric cyan
  vec3(0.20, 1.00, 0.30),  // aurora green
  vec3(0.00, 0.95, 0.60)   // mint
);
// high-altitude colors (tops of the curtains)
const vec3 HIGH_A = vec3(1.00, 0.18, 0.70); // neon pink
const vec3 HIGH_B = vec3(0.62, 0.22, 1.00); // electric violet

// forward → smooth reverse → forward (rounded turns, never a jump)
float loopTime(float t) {
  float a = cos(PI * t / LOOP);
  return LOOP * acos(clamp(0.997 * a, -1.0, 1.0)) / PI;
}

// thin vertical rays: high-frequency noise along x only
float rays(float x, float t, float seed) {
  float r = 0.0;
  r += noise(vec2(x * 38.0 + seed, t * 0.35)) * 0.5;
  r += noise(vec2(x * 95.0 - seed * 2.0, t * 0.6)) * 0.3;
  r += noise(vec2(x * 210.0 + seed * 3.0, t * 0.9)) * 0.2;
  return smoothstep(0.25, 0.92, r);
}

void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  float asp = uRes.x / uRes.y;
  float x = uv.x * asp;
  float t = loopTime(uTime);
  vec2 m = vec2(uMouse.x * asp, uMouse.y);

  // deep night sky
  vec3 col = mix(vec3(0.003, 0.006, 0.014), vec3(0.010, 0.012, 0.035), smoothstep(0.0, 1.0, uv.y));

  // round, resolution-independent stars
  vec2 g = vec2(x, uv.y) * 140.0;
  vec2 cell = floor(g);
  float h = hash(cell);
  if (h > 0.982) {
    vec2 sp = vec2(hash(cell + 3.1), hash(cell + 7.7)) * 0.6 + 0.2;
    float d = length(fract(g) - sp) * 140.0 / uRes.y * 900.0;
    float tw = 0.55 + 0.45 * sin(t * 1.9 + h * 50.0);
    col += smoothstep(1.6, 0.0, d) * 0.6 * tw * smoothstep(0.3, 0.8, uv.y);
  }

  // soft wash behind the curtains (fills every gap)
  float wash = fbm(vec2(x * 0.7 + t * 0.02, uv.y * 1.5 - t * 0.015));
  col += mix(NEON[0], NEON[3], wash) * 0.07 * BRIGHT * exp(-pow(uv.y - 0.38, 2.0) * 7.0);

  vec3 glow = vec3(0.0);
  for (int i = 0; i < LAYERS; i++) {
    float fi = float(i);
    float k = fi / float(max(LAYERS - 1, 1)); // 0 = lowest curtain, 1 = highest

    vec3 low = mix(NEON[i % 6], i % 2 == 0 ? uC0 : uC1, THEME_MIX);
    vec3 high = mix(HIGH_A, HIGH_B, k);

    // curling folds: warp x so curtains bend and twist
    float xw = x + 0.35 * (fbm(vec2(x * 0.6 + fi * 3.7, t * 0.05 + fi)) - 0.5);

    // curtain bottom edge
    float edge = 0.20 + k * 0.30
      + 0.06 * sin(xw * 1.4 + t * 0.12 * (1.0 + fi * 0.25) + fi * 2.1)
      + 0.03 * sin(xw * 3.7 - t * 0.19 + fi * 4.3)
      + 0.08 * (fbm(vec2(xw * 0.9 + t * 0.04 + fi * 5.0, fi * 1.3)) - 0.5);

    // bend toward the cursor
    float near = exp(-pow(x - m.x, 2.0) * 4.0) * uStrength;
    edge += (m.y - 0.12 - edge) * 0.25 * near;

    float d = uv.y - edge;
    float height = 0.28 + 0.18 * fbm(vec2(xw * 1.3 - t * 0.03, fi * 7.0));

    // sharp anti-aliased lower edge, long soft fade upward
    float aa = 1.5 / uRes.y;
    float lower = smoothstep(-0.014 - aa, 0.004, d);
    float upper = exp(-max(d, 0.0) / height * 2.0);
    float body = lower * upper;
    float rim = exp(-abs(d - 0.006) * 140.0) * 0.55;

    float r = rays(xw + fi * 1.7, t, fi * 11.0);
    // brightness waves travelling along the curtain (never fully dark)
    float pulse = 0.72 + 0.28 * sin(t * 0.4 + fi * 1.9 + xw * 0.8);
    float intensity = (body * (0.35 + 1.15 * r) + rim * (0.5 + r)) * pulse * (0.8 + 0.5 * near) * (1.0 - 0.3 * k);

    // green low → pink/violet high, like real auroras
    vec3 tint = mix(low, high, smoothstep(0.02, height * 1.1, d) * 0.85);
    glow += tint * intensity;
  }
  col += glow * (0.85 / sqrt(float(LAYERS) / 3.0)) * BRIGHT;

  // horizon glow
  col += NEON[0] * 0.05 * BRIGHT * exp(-uv.y * 9.0);

  // glow around the cursor
  vec2 dm = vec2(x, uv.y) - m;
  col += mix(NEON[1], vec3(1.0), 0.3) * 0.04 * exp(-dot(dm, dm) * 14.0) * uStrength;

  col = 1.0 - exp(-col * 1.35); // soft tone mapping: no clipping, no harsh white
  fragColor = vec4(dither(col), 1.0);
}`,
  });

  /* ══ 06. SCENE: LAVA LAMP ══════════════════════════════════
     GPU metaballs with crisp anti-aliased edges, driven by a small
     physics simulation on the CPU:
     • 6–10 wax blobs with random sizes and non-overlapping random start
       positions, plus a rolling hot wax pool at the bottom.
     • Heat: the bottom heats wax (it rises), the top cools it (it sinks).
     • Connection: nearby blobs attract and melt together; touching blobs
       share heat.
     • Sphere zone: blobs only stretch in the bottom 30% of the lamp and
       are perfectly round above it.
     • Jelly: the stretch is a spring-damper, so blobs wobble and settle.
     • Random movement: smooth noise wandering plus random small kicks.
     • Cursor: within `mouseRangePx` of a blob's edge, the blob backs away
       at a constant slow speed and jiggles ("attract" mode pulls instead).
     • Click: a blob (or a junction between melted blobs) explodes into
       3–5 smaller blobs with the same total wax. Fragments later drift
       together and melt back into bigger blobs. */
  const LAVA_CFG = {
    countMin: 6, // random start count (min)
    countMax: 10, // random start count (max)
    maxBlobs: 22, // hard cap including explosion fragments (≤ LAVA_MAX)
    seed: null, // null = new layout every load, or a number to freeze it
    radiusMin: 0.04, // smallest blob (1 = screen height)
    radiusMax: 0.115, // biggest blob
    buoyancy: 0.45, // how strongly hot wax rises / cold wax sinks
    cohesion: 0.6, // how strongly blobs pull together
    viscosity: 1.2, // liquid drag (higher = slower, thicker)
    wander: 0.09, // random drifting strength
    kicks: 0.18, // random pushes per second per blob

    // sphere zone: stretch is allowed below sphereY, fully round above it
    sphereY: 0.3, // 30% from the bottom
    stretchFrom: 0.1, // below this height stretch is at full strength
    maxStretch: 0.3, // max extra stretch (0.3 = 30% taller)

    // jelly spring
    springK: 90, // stiffness (higher = faster wobble)
    springDamp: 5, // damping in the stretch zone (lower = jigglier)
    springDampRound: 11, // damping in the sphere zone (settles round fast)

    // cursor
    mouse: 1, // 0 = off
    mouseMode: "retreat", // "retreat" (back away) or "attract"
    mouseRangePx: 20, // reaction distance from the blob's edge, in px
    mouseSpeed: 0.1, // constant speed (screen heights per second)
    mouseGrip: 6, // how quickly the blob reaches that speed
    jiggle: 12, // jelly shake while the cursor is near

    // click explosion
    explode: true, // false = disable click explosions
    splitMin: 3, // fragments per explosion (min)
    splitMax: 5, // fragments per explosion (max)
    splitMinRadius: 0.05, // smaller blobs only wobble, they don't split
    blastSpeed: 0.45, // how fast fragments fly apart
    shockRadius: 0.3, // nearby blobs get pushed within this distance
    clickTolerance: 1.25, // clicks work up to this × radius from a center

    // fragments melting back together
    mergeAge: 5, // seconds before fragments may re-merge
    mergeBoost: 2.5, // extra pull between fragments
    mergeDist: 0.62, // merge when closer than this × (r1 + r2)
    fragDone: 0.085, // fragments that grow past this become normal blobs

    // wax colors: cool (top) → hot (bottom)
    coolColor: "#ff2d95", // neon pink
    hotColor: "#ff7a18", // neon orange
    themeMix: 0.25, // 0 = only the colors above, 1 = only theme colors
    minBrightness: 0.5, // wax is never darker than this (0–1)
  };
  const LAVA_MAX = 24; // must be ≥ LAVA_CFG.maxBlobs (shader array size)

  // Lifts a color to at least brightness `min`, keeping its hue
  function liftColor(rgb, min) {
    const lum = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
    if (lum >= min) return rgb;
    const max = Math.max(rgb.r, rgb.g, rgb.b, 1);
    const vivid = {
      r: (rgb.r / max) * 255,
      g: (rgb.g / max) * 255,
      b: (rgb.b / max) * 255,
    };
    const vlum = (0.299 * vivid.r + 0.587 * vivid.g + 0.114 * vivid.b) / 255;
    if (vlum < min) {
      const t = (min - vlum) / Math.max(1e-3, 1 - vlum);
      return Color.mixRgb(vivid, { r: 255, g: 255, b: 255 }, t);
    }
    const t = (min - lum) / Math.max(1e-3, vlum - lum);
    return Color.mixRgb(rgb, vivid, Math.min(1, t));
  }

  const lavaSmooth = (a, b, x) => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };

  function lavaMakeBlob(S, r0) {
    S.nextSeed += 9.17;
    return {
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      ax: 0,
      ay: 0,
      r0, // base radius (before the portrait-screen scale)
      r: r0 * S.sizeK,
      heat: 0.5,
      buoy: 0.75 + S.rnd() * 0.5, // every blob rises/sinks a bit differently
      s: 1, // stretch (spring position)
      sv: 0, // stretch velocity
      near: false,
      age: 0,
      frag: false, // explosion fragment (may melt back together)
      seed: S.nextSeed + S.rnd() * 5,
    };
  }

  // Click at (cx, cy) in lamp coordinates → explode every blob under it
  function lavaClick(S, cx, cy) {
    const C = LAVA_CFG;
    const B = S.blobs;
    let best = 0;
    let bestI = -1;
    let sum = 0;

    // wax contributed by each blob at the click (same formula as the
    // shader, so a click on a melted junction hits both blobs)
    const contrib = B.map((b, i) => {
      const dx = (cx - b.x) * b.s;
      const dy = (cy - b.y) / b.s;
      const r2 = b.r * b.r;
      const c = r2 / (dx * dx + dy * dy + r2 * 0.15);
      sum += c;
      if (c > best) {
        best = c;
        bestI = i;
      }
      return c;
    });
    if (bestI < 0) return;

    let hit = sum >= 0.75;
    if (!hit) {
      const nb = B[bestI];
      hit = Math.hypot(cx - nb.x, cy - nb.y) < nb.r * C.clickTolerance;
    }
    if (!hit) return;

    const targets = B.filter(
      (_, i) => i === bestI || (contrib[i] >= 0.25 && contrib[i] >= best * 0.3),
    );
    for (const t of targets) lavaExplode(S, t, cx, cy);
  }

  function lavaExplode(S, b, cx, cy) {
    const C = LAVA_CFG;
    const B = S.blobs;
    const rnd = S.rnd;

    // shockwave: push and shake the neighbours
    for (const o of B) {
      if (o === b) continue;
      const dx = o.x - b.x;
      const dy = o.y - b.y;
      const d = Math.hypot(dx, dy) + 1e-5;
      if (d > C.shockRadius) continue;
      const k = 1 - d / C.shockRadius;
      o.vx += (dx / d) * C.blastSpeed * 0.6 * k;
      o.vy += (dy / d) * C.blastSpeed * 0.6 * k;
      o.sv += (rnd() < 0.5 ? -1 : 1) * 3 * k;
    }

    const room = C.maxBlobs - B.length + 1; // the parent frees one slot
    const want = C.splitMin + Math.floor(rnd() * (C.splitMax - C.splitMin + 1));
    const k = Math.min(room, want);

    // too small or no room: wobble hard and move away from the click
    if (b.r0 < C.splitMinRadius || k < 2) {
      const dx = b.x - cx;
      const dy = b.y - cy;
      const d = Math.hypot(dx, dy) + 1e-5;
      b.vx += (dx / d) * C.blastSpeed * 0.5;
      b.vy += (dy / d) * C.blastSpeed * 0.5;
      b.sv += 4;
      return;
    }

    // random fragment sizes that add up to the parent's wax (area kept)
    const w = [];
    let sum = 0;
    for (let i = 0; i < k; i++) {
      const x = 0.6 + rnd() * 0.9;
      w.push(x);
      sum += x;
    }
    const a0 = rnd() * Math.PI * 2;
    B.splice(B.indexOf(b), 1);
    for (let i = 0; i < k; i++) {
      const ang = a0 + (i / k) * Math.PI * 2 + (rnd() - 0.5) * 0.8;
      const c = lavaMakeBlob(S, b.r0 * Math.sqrt(w[i] / sum));
      const off = b.r * 0.55;
      c.x = b.x + Math.cos(ang) * off;
      c.y = b.y + Math.sin(ang) * off;
      const sp = C.blastSpeed * (0.7 + rnd() * 0.6);
      c.vx = b.vx + Math.cos(ang) * sp;
      c.vy = b.vy + Math.sin(ang) * sp;
      c.heat = Math.min(1, b.heat + 0.15);
      c.sv = (rnd() - 0.5) * 6;
      c.frag = true;
      B.push(c);
    }
  }

  // Fragments that drifted together melt back into one blob
  function lavaMergePass(S) {
    const C = LAVA_CFG;
    const B = S.blobs;
    for (let i = 0; i < B.length; i++) {
      const a = B[i];
      if (!a.frag || a.age < C.mergeAge) continue;
      for (let j = 0; j < B.length; j++) {
        if (B.length <= C.countMin) return;
        if (j === i) continue;
        const b = B[j];
        if (b.age < C.mergeAge) continue;
        const r0 = Math.sqrt(a.r0 * a.r0 + b.r0 * b.r0);
        if (r0 > C.radiusMax) continue;
        const d = Math.hypot(b.x - a.x, b.y - a.y);
        if (d > (a.r + b.r) * C.mergeDist) continue;

        // merge b into a: area, momentum and heat are shared
        const ma = a.r0 * a.r0;
        const mb = b.r0 * b.r0;
        const m = ma + mb;
        a.x = (a.x * ma + b.x * mb) / m;
        a.y = (a.y * ma + b.y * mb) / m;
        a.vx = (a.vx * ma + b.vx * mb) / m;
        a.vy = (a.vy * ma + b.vy * mb) / m;
        a.heat = (a.heat * ma + b.heat * mb) / m;
        a.r0 = r0;
        a.r = r0 * S.sizeK;
        a.sv += 2.5;
        a.frag = a.frag && b.frag && r0 < C.fragDone;
        B.splice(j, 1);
        if (j < i) i--;
        j--;
      }
    }
  }

  const LavaScene = shaderScene({
    resolution: (eco) => (eco ? 0.6 : 1),
    maxDpr: 1.5,
    frag: `
uniform vec4 uB[${LAVA_MAX}]; // xy = position, z = radius, w = heat
uniform vec4 uS[${LAVA_MAX}]; // x = vertical stretch
uniform int uN;
uniform float uAsp;
uniform vec3 uCool, uHot; // bright wax colors (from JS)

// x = field strength, y = heat (weighted by each blob's influence)
vec2 field(vec2 p) {
  float v = 0.0, h = 0.0;
  for (int i = 0; i < ${LAVA_MAX}; i++) {
    if (i >= uN) break;
    vec2 d = p - uB[i].xy;
    float s = uS[i].x;
    d.y /= s;          // taller…
    d.x *= s;          // …and thinner (same amount of wax)
    float r2 = uB[i].z * uB[i].z;
    float c = r2 / (dot(d, d) + r2 * 0.15);
    v += c;
    h += c * uB[i].w;
  }
  // hot wax pool along the bottom, gently rolling
  float wave = 0.010 * sin(p.x * 6.0 + uTime * 0.35) + 0.007 * sin(p.x * 13.0 - uTime * 0.27);
  float pool = 1.45 * exp(-(p.y - wave) / 0.05);
  pool = pool / (1.0 + pool / 6.0);
  v += pool;
  h += pool;
  return vec2(v, h / max(v, 1e-5));
}

void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 p = vec2(uv.x * uAsp, uv.y);
  float t = uTime;

  // very soft wobble so wax edges ripple a little
  vec2 q = p + vec2(noise(p * 3.0 + vec2(t * 0.2, 0.0)) - 0.5,
                    noise(p * 3.0 + vec2(5.2, -t * 0.18)) - 0.5) * 0.014;

  vec2 F = field(q);
  float f = F.x;

  // surface normal from the field → round, glossy wax
  float e = 0.0025;
  vec2 g = vec2(field(q + vec2(e, 0.0)).x - f, field(q + vec2(0.0, e)).x - f) / e;
  vec3 n = normalize(vec3(-g / (f * f + 0.5) * 0.03, 1.0));

  // anti-aliased edge
  float aa = fwidth(f) * 1.2 + 1e-4;
  float edge = smoothstep(1.0 - aa, 1.0 + aa, f);

  // one wax color; the shade follows heat
  float heat = clamp(F.y, 0.0, 1.0);
  vec3 wax = mix(uCool, uHot, smoothstep(0.15, 0.85, heat));

  vec3 L = normalize(vec3(-0.35, 0.55, 0.75));
  float diff = clamp(dot(n, L), 0.0, 1.0);
  float spec = pow(clamp(dot(reflect(-L, n), vec3(0, 0, 1)), 0.0, 1.0), 16.0);
  float rim = 1.0 - n.z;
  vec3 waxCol = wax * (0.62 + 0.45 * diff) + wax * rim * 0.4 + spec * 0.22;
  waxCol += wax * smoothstep(1.5, 5.0, f) * 0.12; // glowing core

  // lamp liquid: dark, tinted, lit by the wax
  vec3 bg = mix(uHot * 0.08, uCool * 0.05, uv.y) + vec3(0.012, 0.010, 0.020);
  bg += wax * smoothstep(0.3, 1.0, f) * (1.0 - edge) * 0.3; // glow halo
  bg += uHot * 0.08 * exp(-uv.y * 6.0);                      // heat glow from the bottom
  float side = 0.5 - abs(uv.x - 0.5);
  bg *= 0.75 + 0.25 * smoothstep(0.0, 0.35, side);           // glass-lamp shading

  vec3 col = mix(bg, waxCol, edge);
  col = 1.0 - exp(-col * 1.4);
  fragColor = vec4(dither(col), 1.0);
}`,
    init() {
      const seed =
        LAVA_CFG.seed != null ? LAVA_CFG.seed : (Math.random() * 1e9) | 0;
      const rnd = seeded(seed);
      this.rnd = rnd;
      this.nextSeed = 0;
      this.sizeK = 1;
      this.click = null;

      const lo = Math.max(1, LAVA_CFG.countMin);
      const hi = Math.min(LAVA_MAX, LAVA_CFG.countMax);
      const n = lo + Math.floor(rnd() * (hi - lo + 1));
      const span = LAVA_CFG.radiusMax - LAVA_CFG.radiusMin;

      this.blobs = Array.from({ length: n }, () => {
        const b = lavaMakeBlob(
          this,
          LAVA_CFG.radiusMin + Math.pow(rnd(), 1.15) * span,
        );
        b.vx = (rnd() - 0.5) * 0.05;
        b.vy = (rnd() - 0.5) * 0.05;
        b.heat = rnd();
        return b;
      });
      this.asp = 0;
      this.placed = false;
      this.bufB = new Float32Array(LAVA_MAX * 4);
      this.bufS = new Float32Array(LAVA_MAX * 4);
      this.time = 0;
      this.palRef = null;
    },
    onClick(e, x, y) {
      if (LAVA_CFG.explode) this.click = { x, y };
    },
    update(e, dt) {
      const asp = e.w / e.h;
      const p = e.pointer;
      const mx = p.rx * asp;
      const my = 1 - p.ry;
      const mouseOn = p.inside ? p.strength : 0;
      const B = this.blobs;
      const rnd = this.rnd;
      const C = LAVA_CFG;

      // wax colors (recomputed only when the palette changes)
      if (this.palRef !== e.palette) {
        this.palRef = e.palette;
        const mixC = (hex, themeRgb) =>
          liftColor(
            Color.mixRgb(Color.hexToRgb(hex), themeRgb, C.themeMix),
            C.minBrightness,
          );
        const cool = mixC(C.coolColor, e.palette[2] || e.palette[0]);
        const hot = mixC(C.hotColor, e.palette[0]);
        this.cool = [cool.r / 255, cool.g / 255, cool.b / 255];
        this.hot = [hot.r / 255, hot.g / 255, hot.b / 255];
      }

      // screen shape changed (first frame, rotation, resize)
      if (this.asp !== asp) {
        const k = this.asp ? asp / this.asp : 1;
        this.sizeK = Math.min(1, Math.max(0.6, asp)); // smaller blobs in portrait
        for (const b of B) {
          b.x *= k;
          b.r = b.r0 * this.sizeK;
        }
        this.asp = asp;
      }

      // first frame: random, non-overlapping start positions
      if (!this.placed) {
        this.placed = true;
        const placedList = [];
        for (const b of B) {
          let bx = 0;
          let by = 0;
          for (let tries = 0; tries < 60; tries++) {
            bx = b.r * 1.2 + rnd() * Math.max(0.01, asp - b.r * 2.4);
            by = 0.12 + rnd() * Math.max(0.01, 0.76 - b.r * 2);
            let ok = true;
            for (const o of placedList) {
              if (Math.hypot(bx - o.x, by - o.y) < (b.r + o.r) * 1.15) {
                ok = false;
                break;
              }
            }
            if (ok) break;
          }
          b.x = bx;
          b.y = by;
          placedList.push(b);
        }
      }

      if (this.click) {
        const { x, y } = this.click;
        this.click = null;
        lavaClick(this, x * asp, 1 - y);
      }

      const n = B.length;

      // small fixed steps → stable physics at any speed
      const steps = Math.max(1, Math.ceil(dt / (1 / 60)));
      const h = dt / steps;
      const rangeU = C.mouseRangePx / Math.max(1, e.h); // px → screen-height units
      const sign = C.mouseMode === "attract" ? -1 : 1; // +1 = away from cursor

      for (let s = 0; s < steps; s++) {
        this.time += h;
        const T = this.time;

        for (const b of B) {
          b.ax = 0;
          b.ay = 0;
          b.age += h;

          // heat: bottom heats, top cools, slow cooling while travelling
          if (b.y < 0.2) b.heat += 0.28 * h;
          else if (b.y > 0.8) b.heat -= 0.3 * h;
          else b.heat -= 0.02 * h;
          b.heat += (vnoise(T * 0.15 + b.seed) - 0.5) * 0.05 * h;

          // buoyancy: hot rises, cold sinks
          b.ay += (b.heat - 0.5) * C.buoyancy * b.buoy;

          // random wandering (big blobs are lazier)
          const lazy = 0.075 / Math.max(0.04, b.r);
          b.ax += (vnoise(T * 0.1 + b.seed * 2.3) - 0.5) * C.wander * lazy;
          b.ay +=
            (vnoise(T * 0.09 + b.seed * 3.7 + 40) - 0.5) *
            C.wander *
            0.6 *
            lazy;

          // random kicks so no two paths ever repeat
          if (rnd() < C.kicks * h) {
            b.vx += (rnd() - 0.5) * 0.08;
            b.vy += (rnd() - 0.5) * 0.05;
            b.sv += (rnd() - 0.5) * 0.8;
          }
        }

        // connection physics between every pair
        for (let i = 0; i < n; i++) {
          const a = B[i];
          for (let j = i + 1; j < n; j++) {
            const b = B[j];
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const d = Math.hypot(dx, dy) + 1e-5;
            const R = a.r + b.r;
            if (d > R * 2.4) continue;

            // old fragments collide more softly and pull harder, so they
            // can find each other and melt back together
            const melting =
              (a.frag || b.frag) && a.age > C.mergeAge && b.age > C.mergeAge;
            const rest = R * (melting ? 0.5 : 0.85);
            const coh = C.cohesion * (melting ? C.mergeBoost : 1);
            let f;
            if (d > rest) {
              // attraction fading out with distance → gooey necks
              f = coh * (d - rest) * (1 - (d - rest) / (R * 2.4 - rest));
            } else {
              f = -2.2 * (rest - d); // don't collapse into one point
            }
            const fx = (dx / d) * f;
            const fy = (dy / d) * f;
            a.ax += fx;
            a.ay += fy;
            b.ax -= fx;
            b.ay -= fy;

            // touching blobs share heat
            if (d < R) {
              const ex = (b.heat - a.heat) * 0.25 * h;
              a.heat += ex;
              b.heat -= ex;
            }
          }
        }

        const drag = Math.exp(-C.viscosity * h);
        for (const b of B) {
          b.heat = Math.min(1, Math.max(0, b.heat));
          b.vx = (b.vx + b.ax * h) * drag;
          b.vy = (b.vy + b.ay * h) * drag;

          // cursor: constant-speed retreat (or pull) + jelly shake
          if (mouseOn > 0 && C.mouse > 0) {
            const dx = (b.x - mx) * sign;
            const dy = (b.y - my) * sign;
            const dist = Math.hypot(dx, dy) + 1e-5;
            const edge = dist - b.r; // gap between cursor and the blob's edge
            if (edge < rangeU) {
              // 0 at the edge of the zone → 1 when the cursor touches the blob
              const w =
                Math.min(1, Math.max(0, 1 - edge / rangeU)) * mouseOn * C.mouse;
              const dirx = dx / dist;
              const diry = dy / dist;
              const along = b.vx * dirx + b.vy * diry;
              const dv =
                (C.mouseSpeed - along) * Math.min(1, h * C.mouseGrip) * w;
              b.vx += dirx * dv;
              b.vy += diry * dv;
              if (!b.near) {
                b.near = true;
                b.sv += (rnd() < 0.5 ? -1 : 1) * 1.2 * mouseOn; // first poke
              }
              b.sv += Math.sin(T * 11 + b.seed) * C.jiggle * w * h;
            } else {
              b.near = false;
            }
          } else {
            b.near = false;
          }

          b.x += b.vx * h;
          b.y += b.vy * h;

          // glass walls keep the whole blob on screen
          const rx = (b.r * 1.05) / b.s;
          const ry = b.r * 1.05 * b.s;
          if (b.x < rx) {
            b.x = rx;
            b.sv += Math.abs(b.vx) * 3;
            b.vx = Math.abs(b.vx) * 0.3;
          }
          if (b.x > asp - rx) {
            b.x = asp - rx;
            b.sv -= Math.abs(b.vx) * 3;
            b.vx = -Math.abs(b.vx) * 0.3;
          }
          if (b.y < ry * 0.5) {
            b.y = ry * 0.5; // bottom: may dip into the wax pool
            b.vy = Math.abs(b.vy) * 0.2;
          }
          if (b.y > 1 - ry) {
            b.y = 1 - ry;
            b.sv += Math.abs(b.vy) * 3;
            b.vy = -Math.abs(b.vy) * 0.2;
          }

          // jelly stretch: spring-damper. zone = 1 in the bottom stretch
          // area, fading to 0 at sphereY, so blobs are round above it.
          const zone = 1 - lavaSmooth(C.stretchFrom, C.sphereY, b.y);
          const target = 1 + zone * Math.min(C.maxStretch, Math.abs(b.vy) * 3);
          const damp =
            C.springDampRound + (C.springDamp - C.springDampRound) * zone;
          b.sv += (-C.springK * (b.s - target) - damp * b.sv) * h;
          b.s += b.sv * h;
          const hi = 1 + 0.12 + zone * (C.maxStretch + 0.15);
          b.s = Math.min(hi, Math.max(0.8, b.s));
        }
      }

      lavaMergePass(this);

      const BB = this.bufB;
      const SS = this.bufS;
      const m = Math.min(B.length, LAVA_MAX);
      for (let i = 0; i < m; i++) {
        const b = B[i];
        BB[i * 4] = b.x;
        BB[i * 4 + 1] = b.y;
        BB[i * 4 + 2] = b.r * (1 + 0.04 * Math.sin(this.time * 0.5 + b.seed));
        BB[i * 4 + 3] = b.heat;
        SS[i * 4] = b.s;
      }
      return {
        uB: BB,
        uS: SS,
        uN: { int: m },
        uAsp: asp,
        uCool: this.cool,
        uHot: this.hot,
      };
    },
  });

  /* ══ 07. SCENE: INK (fluid simulation) ═════════════════════
     A simplified real fluid: every mouse movement pushes velocity and
     ink into the fluid, which swirls and diffuses.
     Click the background → burst of ink in a random color from
     INK_COLORS (remembered between visits).
     Anti-glare: new ink replaces the old color under the cursor instead
     of piling on top, and brightness is capped, so long hovering never
     builds up into white. Ink also drops in by itself now and then. */
  const INK_SHADERS = {
    splat: `
uniform sampler2D uTarget;
uniform float aspectRatio, radius, mixMode, amount;
uniform vec3 color;
uniform vec2 point;
void main() {
  vec2 p = vUv - point;
  p.x *= aspectRatio;
  float g = exp(-dot(p, p) / radius);
  vec3 base = texture(uTarget, vUv).xyz;
  if (mixMode > 0.5) {
    // dye: blend TOWARD the color (never brighter than the color itself)
    fragColor = vec4(mix(base, color, clamp(g * amount, 0.0, 1.0)), 1.0);
  } else {
    // velocity: add the push
    fragColor = vec4(base + g * color, 1.0);
  }
}`,
    advect: `
uniform sampler2D uVelocity, uSource;
uniform vec2 texelSize;
uniform float dt, dissipation;
void main() {
  vec2 coord = vUv - dt * texture(uVelocity, vUv).xy * texelSize;
  fragColor = texture(uSource, coord) / (1.0 + dissipation * dt);
}`,
    divergence: `
uniform sampler2D uVelocity;
uniform vec2 texelSize;
void main() {
  float L = texture(uVelocity, vUv - vec2(texelSize.x, 0.0)).x;
  float R = texture(uVelocity, vUv + vec2(texelSize.x, 0.0)).x;
  float T = texture(uVelocity, vUv + vec2(0.0, texelSize.y)).y;
  float B = texture(uVelocity, vUv - vec2(0.0, texelSize.y)).y;
  vec2 C = texture(uVelocity, vUv).xy;
  if (vUv.x - texelSize.x < 0.0) L = -C.x;
  if (vUv.x + texelSize.x > 1.0) R = -C.x;
  if (vUv.y + texelSize.y > 1.0) T = -C.y;
  if (vUv.y - texelSize.y < 0.0) B = -C.y;
  fragColor = vec4(0.5 * (R - L + T - B), 0.0, 0.0, 1.0);
}`,
    curl: `
uniform sampler2D uVelocity;
uniform vec2 texelSize;
void main() {
  float L = texture(uVelocity, vUv - vec2(texelSize.x, 0.0)).y;
  float R = texture(uVelocity, vUv + vec2(texelSize.x, 0.0)).y;
  float T = texture(uVelocity, vUv + vec2(0.0, texelSize.y)).x;
  float B = texture(uVelocity, vUv - vec2(0.0, texelSize.y)).x;
  fragColor = vec4(0.5 * (R - L - T + B), 0.0, 0.0, 1.0);
}`,
    vorticity: `
uniform sampler2D uVelocity, uCurl;
uniform vec2 texelSize;
uniform float curl, dt;
void main() {
  float L = texture(uCurl, vUv - vec2(texelSize.x, 0.0)).x;
  float R = texture(uCurl, vUv + vec2(texelSize.x, 0.0)).x;
  float T = texture(uCurl, vUv + vec2(0.0, texelSize.y)).x;
  float B = texture(uCurl, vUv - vec2(0.0, texelSize.y)).x;
  float C = texture(uCurl, vUv).x;
  vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
  force /= length(force) + 0.0001;
  force *= curl * C;
  force.y *= -1.0;
  vec2 v = texture(uVelocity, vUv).xy + force * dt;
  fragColor = vec4(clamp(v, -1000.0, 1000.0), 0.0, 1.0);
}`,
    pressure: `
uniform sampler2D uPressure, uDivergence;
uniform vec2 texelSize;
void main() {
  float L = texture(uPressure, vUv - vec2(texelSize.x, 0.0)).x;
  float R = texture(uPressure, vUv + vec2(texelSize.x, 0.0)).x;
  float T = texture(uPressure, vUv + vec2(0.0, texelSize.y)).x;
  float B = texture(uPressure, vUv - vec2(0.0, texelSize.y)).x;
  float div = texture(uDivergence, vUv).x;
  fragColor = vec4((L + R + B + T - div) * 0.25, 0.0, 0.0, 1.0);
}`,
    gradient: `
uniform sampler2D uPressure, uVelocity;
uniform vec2 texelSize;
void main() {
  float L = texture(uPressure, vUv - vec2(texelSize.x, 0.0)).x;
  float R = texture(uPressure, vUv + vec2(texelSize.x, 0.0)).x;
  float T = texture(uPressure, vUv + vec2(0.0, texelSize.y)).x;
  float B = texture(uPressure, vUv - vec2(0.0, texelSize.y)).x;
  vec2 v = texture(uVelocity, vUv).xy - vec2(R - L, T - B);
  fragColor = vec4(v, 0.0, 1.0);
}`,
    clear: `
uniform sampler2D uTexture;
uniform float value;
void main() { fragColor = value * texture(uTexture, vUv); }`,
    display: `
uniform sampler2D uDye;
uniform vec2 dyeTexel;
uniform vec3 uBg;
uniform float uTime;
float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
void main() {
  vec3 c = texture(uDye, vUv).rgb;
  // light the ink by its thickness → depth, like real ink in water
  float l = length(texture(uDye, vUv - vec2(dyeTexel.x, 0.0)).rgb);
  float r = length(texture(uDye, vUv + vec2(dyeTexel.x, 0.0)).rgb);
  float t = length(texture(uDye, vUv + vec2(0.0, dyeTexel.y)).rgb);
  float b = length(texture(uDye, vUv - vec2(0.0, dyeTexel.y)).rgb);
  vec3 n = normalize(vec3(l - r, b - t, 0.6));
  float diff = clamp(dot(n, normalize(vec3(0.3, 0.5, 1.0))), 0.0, 1.0);

  vec3 ink = 1.0 - exp(-c * 1.4);
  ink *= 0.82 + 0.3 * diff;
  // anti-glare: cap brightness so ink never turns into harsh white
  float lum = dot(ink, vec3(0.299, 0.587, 0.114));
  if (lum > 0.5) ink *= 0.5 / lum;
  float a = clamp(max(ink.r, max(ink.g, ink.b)) * 1.3, 0.0, 1.0);
  vec3 col = uBg * (1.0 - a * 0.85) + ink;
  col += (hash(gl_FragCoord.xy + fract(uTime) * 61.0) - 0.5) / 255.0;
  fragColor = vec4(col, 1.0);
}`,
  };

  const INK_SPEED = 0.1; // simulation speed (the slider's 1× = calm, slow ink)
  const INK_LEVEL = 0.75; // ink color strength (lower = darker, softer)

  // Before the first click the ink uses the theme colors; every click
  // picks a random color from this list.
  const INK_COLORS = [
    { name: "Neon Pink", hex: "#ff00aa" },
    { name: "Electric Lime", hex: "#ccff00" },
    { name: "Luminous Blue", hex: "#0033ff" },
    { name: "Neon Amber", hex: "#ffaa00" },
    { name: "Neon Aqua", hex: "#00e1ff" },
    { name: "Electric Red", hex: "#ff0000" },
    { name: "Bright Purple", hex: "#c400ff" },
    { name: "Neon Green", hex: "#11ff00" },
    { name: "Electric Flamingo", hex: "#ff66ff" },
    { name: "Bright Teal", hex: "#00ffc3" },
    { name: "Neon Tangerine", hex: "#ff5500" },
    { name: "Electric Violet", hex: "#7a00ff" },
    { name: "Neon Lemon", hex: "#f5ff00" },
    { name: "Fluorescent Pink", hex: "#ff0077" },
    { name: "Electric Sheep", hex: "#33ffff" },
    { name: "Bright Saffron", hex: "#ffcc00" },
    { name: "Neon Purple", hex: "#bb00ff" },
    { name: "Fluorescent Green", hex: "#00ff2a" },
    { name: "Neon Coral", hex: "#ff5a7a" },
    { name: "Electric Indigo", hex: "#4d00ff" },
    { name: "Neon Yellow", hex: "#eaff00" },
    { name: "Bright Magenta", hex: "#ff00dd" },
    { name: "Neon Mint", hex: "#00ff80" },
    { name: "Fluorescent Red", hex: "#ff3333" },
    { name: "Electric Cyan", hex: "#00ffff" },
    { name: "Neon Grape", hex: "#9d00ff" },
    { name: "Bright Green", hex: "#77ff00" },
    { name: "Neon Ruby", hex: "#ff0030" },
    { name: "Fluorescent Turquoise", hex: "#00ffee" },
    { name: "Electric Orange", hex: "#ff4400" },
    { name: "Light Neon Pink", hex: "#ff33ff" },
    { name: "Neon Blue", hex: "#00b7ff" },
    { name: "Bright Chartreuse", hex: "#b5ff00" },
    { name: "Electric Crimson", hex: "#ff0044" },
    { name: "Electric Purple", hex: "#d000ff" },
    { name: "Neon Carrot", hex: "#ff8800" },
    { name: "Electric Green", hex: "#3cff00" },
    { name: "Neon Fuchsia", hex: "#ff0066" },
    { name: "Fluorescent Yellow", hex: "#d9ff00" },
    { name: "Bright Scarlet", hex: "#ff0022" },
    { name: "Neon Hot Pink", hex: "#ff00ee" },
    { name: "Fluorescent Orange", hex: "#ffbb00" },
    { name: "Neon Raspberry", hex: "#ff0080" },
    { name: "Electric Yellow", hex: "#ffff00" },
    { name: "Bright Pink", hex: "#ff00bb" },
    { name: "Fluorescent Red Orange", hex: "#ff6600" },
    { name: "Neon Red", hex: "#ff0033" },
    { name: "Pinkish Red Neon", hex: "#ff0055" },
    { name: "Electric Pink", hex: "#ff0099" },
    { name: "Bright Red", hex: "#ff0010" },
  ];

  const InkScene = {
    type: "gl",
    resolution: (eco) => (eco ? 0.6 : 1),
    maxDpr: 1.5,
    setup(e) {
      const gl = e.gl;
      if (!supportsFloatTargets(gl)) return false;

      this.p = {};
      for (const k in INK_SHADERS) this.p[k] = makeProgram(gl, INK_SHADERS[k]);
      this.queue = [];
      this.clicks = [];
      this.key = "";
      this.colorPos = 0;
      this.ambient = 0.3;
      this.fresh = true;
      const saved = localStorage.getItem("gx_ink_color");
      const idx = saved === null ? -1 : Number(saved);
      this.colorIdx = idx >= 0 && idx < INK_COLORS.length ? idx : -1; // -1 = theme colors
      return true;
    },
    // theme colors (default) or the clicked color ± a small hue shimmer
    applyColor(e) {
      if (this.colorIdx < 0) {
        this.cols = [pal(e, 0), pal(e, 1), pal(e, 2)];
        return;
      }
      const hex = INK_COLORS[this.colorIdx].hex;
      this.cols = [
        hex,
        Color.rotateHue(hex, 14),
        Color.rotateHue(hex, -14),
      ].map((h) => {
        const c = Color.hexToRgb(h);
        return [c.r / 255, c.g / 255, c.b / 255];
      });
    },
    build(e) {
      const gl = e.gl;
      this.applyColor(e);
      const bg = Color.mixRgb(e.palette[0], { r: 4, g: 5, b: 9 }, 0.93);
      this.bg = [bg.r / 255, bg.g / 255, bg.b / 255];

      // small simulation grid (fast), large ink texture (smooth)
      const asp = e.w / e.h;
      const dims = (res) =>
        asp > 1 ? [Math.round(res * asp), res] : [res, Math.round(res / asp)];
      const [sw, sh] = dims(e.eco ? 96 : 128);
      const [dw, dh] = dims(e.eco ? 420 : 720);
      const key = `${sw}x${sh}|${dw}x${dh}`;
      if (key === this.key) return; // only a color change
      this.key = key;
      this.freeTargets(gl);
      this.vel = createDoubleFBO(gl, sw, sh);
      this.pressure = createDoubleFBO(gl, sw, sh);
      this.div = createFBO(gl, sw, sh);
      this.curl = createFBO(gl, sw, sh);
      this.dye = createDoubleFBO(gl, dw, dh);
      if (this.fresh) {
        this.fresh = false;
        for (let i = 0; i < 6; i++) this.randomSplat(e);
      }
    },
    freeTargets(gl) {
      this.vel?.free();
      this.pressure?.free();
      this.dye?.free();
      deleteFBO(gl, this.div);
      deleteFBO(gl, this.curl);
      this.vel = this.pressure = this.dye = this.div = this.curl = null;
    },
    // glides through the 3 palette colors
    nextColor(scale) {
      this.colorPos = (this.colorPos + 0.012) % 3;
      const i = Math.floor(this.colorPos);
      const f = this.colorPos - i;
      const a = this.cols[i];
      const b = this.cols[(i + 1) % 3];
      return [
        (a[0] + (b[0] - a[0]) * f) * scale,
        (a[1] + (b[1] - a[1]) * f) * scale,
        (a[2] + (b[2] - a[2]) * f) * scale,
      ];
    },
    // amount = how far the dye moves toward `color` at the center (0..1)
    splat(e, x, y, vx, vy, color, radiusMul = 1, amount = 1) {
      const gl = e.gl;
      const asp = e.w / e.h;
      let radius = 0.0022 * radiusMul;
      if (asp > 1) radius *= asp;
      setUniforms(gl, this.p.splat, {
        uTarget: this.vel.read.tex,
        aspectRatio: asp,
        point: [x, y],
        color: [vx, vy, 0],
        radius,
        mixMode: 0,
        amount: 1,
      });
      drawTo(e, this.vel.write);
      this.vel.swap();
      if (amount <= 0) return;
      setUniforms(gl, this.p.splat, {
        uTarget: this.dye.read.tex,
        aspectRatio: asp,
        point: [x, y],
        color,
        radius,
        mixMode: 1,
        amount,
      });
      drawTo(e, this.dye.write);
      this.dye.swap();
    },
    randomSplat(e) {
      const a = Math.random() * Math.PI * 2;
      const s = 500 + Math.random() * 500;
      this.splat(
        e,
        0.15 + Math.random() * 0.7,
        0.15 + Math.random() * 0.7,
        Math.cos(a) * s,
        Math.sin(a) * s,
        this.nextColor(INK_LEVEL * 0.8),
        2.2,
        0.9,
      );
    },
    // called straight from pointermove → reacts to every movement
    onPointer(e, x, y, dx, dy) {
      if (this.queue.length > 48) this.queue.shift();
      this.queue.push(x, 1 - y, dx, -dy);
    },
    // click → new random color (never the same twice in a row) + ink burst
    onClick(e, x, y) {
      let next;
      do {
        next = Math.floor(Math.random() * INK_COLORS.length);
      } while (next === this.colorIdx && INK_COLORS.length > 1);
      this.colorIdx = next;
      localStorage.setItem("gx_ink_color", String(next));
      this.applyColor(e);
      if (this.clicks.length < 20) this.clicks.push(x, 1 - y);
    },
    frame(e, dt, t) {
      const gl = e.gl;
      const P = this.p;
      gl.disable(gl.BLEND);
      const step = Math.min(dt * INK_SPEED, 1 / 30);

      // click bursts: a ring of ink shooting outward in the new colors
      const cl = this.clicks;
      for (let i = 0; i < cl.length; i += 2) {
        const spokes = 7;
        const turn = Math.random() * Math.PI * 2;
        for (let s = 0; s < spokes; s++) {
          const a = turn + (s / spokes) * Math.PI * 2;
          this.splat(
            e,
            cl[i],
            cl[i + 1],
            Math.cos(a) * 900,
            Math.sin(a) * 900,
            this.nextColor(INK_LEVEL),
            1.3,
            0.8,
          );
        }
        this.splat(
          e,
          cl[i],
          cl[i + 1],
          0,
          0,
          this.nextColor(INK_LEVEL),
          2.6,
          0.9,
        );
      }
      cl.length = 0;

      // ink drops in by itself every few seconds (real time, not sim time)
      this.ambient -= dt;
      if (this.ambient <= 0) {
        this.ambient = 2.5 + Math.random() * 3.5;
        this.randomSplat(e);
      }

      // every queued mouse movement pushes fluid + ink; fast moves paint
      // more, slow hovering only tints a little (no glare build-up)
      const q = this.queue;
      for (let i = 0; i < q.length; i += 4) {
        const speed = Math.hypot(q[i + 2], q[i + 3]);
        if (speed < 1e-5) continue;
        const strength = Math.min(1, speed * 60);
        this.splat(
          e,
          q[i],
          q[i + 1],
          q[i + 2] * 12000,
          q[i + 3] * 12000,
          this.nextColor(INK_LEVEL),
          1,
          0.08 + 0.3 * strength,
        );
      }
      q.length = 0;

      if (step > 0) {
        const ts = this.vel.ts;
        setUniforms(gl, P.curl, {
          uVelocity: this.vel.read.tex,
          texelSize: ts,
        });
        drawTo(e, this.curl);

        setUniforms(gl, P.vorticity, {
          uVelocity: this.vel.read.tex,
          uCurl: this.curl.tex,
          texelSize: ts,
          curl: 22,
          dt: step,
        });
        drawTo(e, this.vel.write);
        this.vel.swap();

        setUniforms(gl, P.divergence, {
          uVelocity: this.vel.read.tex,
          texelSize: ts,
        });
        drawTo(e, this.div);

        setUniforms(gl, P.clear, {
          uTexture: this.pressure.read.tex,
          value: 0.8,
        });
        drawTo(e, this.pressure.write);
        this.pressure.swap();

        const iterations = e.eco ? 12 : 20;
        for (let i = 0; i < iterations; i++) {
          setUniforms(gl, P.pressure, {
            uPressure: this.pressure.read.tex,
            uDivergence: this.div.tex,
            texelSize: ts,
          });
          drawTo(e, this.pressure.write);
          this.pressure.swap();
        }

        setUniforms(gl, P.gradient, {
          uPressure: this.pressure.read.tex,
          uVelocity: this.vel.read.tex,
          texelSize: ts,
        });
        drawTo(e, this.vel.write);
        this.vel.swap();

        setUniforms(gl, P.advect, {
          uVelocity: this.vel.read.tex,
          uSource: this.vel.read.tex,
          texelSize: ts,
          dt: step,
          dissipation: 0.2,
        });
        drawTo(e, this.vel.write);
        this.vel.swap();

        setUniforms(gl, P.advect, {
          uVelocity: this.vel.read.tex,
          uSource: this.dye.read.tex,
          texelSize: ts,
          dt: step,
          dissipation: 1,
        });
        drawTo(e, this.dye.write);
        this.dye.swap();
      }

      setUniforms(gl, P.display, {
        uDye: this.dye.read.tex,
        dyeTexel: this.dye.ts,
        uBg: this.bg,
        uTime: t,
      });
      drawTo(e, null);
    },
    destroy(e) {
      const gl = e.gl;
      if (gl) {
        this.freeTargets(gl);
        for (const k in this.p || {}) gl.deleteProgram(this.p[k].p);
      }
      this.p = null;
      this.queue = [];
      this.clicks = [];
      this.key = "";
      this.fresh = true;
    },
  };

  /* ══ 08. SCENE: STAR FIELD ═════════════════════════════════
     Slow drift through space; the cursor steers the view. */
  const StarScene = {
    type: "2d",
    maxDpr: 1,
    resolution: () => 1, // stars need crisp pixels (DPR is capped at 1)
    setup() {
      this.count = 0;
      this.nebula = null;
      this.shoot = { life: 0, x: 0, y: 0, vx: 0, vy: 0, wait: 6 };
    },
    build(e) {
      const { w, h, palette, eco } = e;
      const want = Math.min(eco ? 320 : 650, Math.floor((w * h) / 2600));
      if (want !== this.count) {
        this.count = want;
        this.sx = new Float32Array(want);
        this.sy = new Float32Array(want);
        this.sz = new Float32Array(want);
        this.tw = new Float32Array(want);
        this.ci = new Uint8Array(want);
        for (let i = 0; i < want; i++) this.respawn(i, true);
      }
      this.colors = palette.map((c) =>
        rgba(Color.mixRgb(c, { r: 255, g: 255, b: 255 }, 0.55), 1),
      );

      // soft nebula glow, drawn tiny then stretched (cheap + smooth)
      freeCanvas(this.nebula);
      this.nebula = makeCanvas(96, 54);
      const n = this.nebula.getContext("2d");
      n.fillStyle = rgba(
        Color.mixRgb(palette[0], { r: 2, g: 2, b: 6 }, 0.95),
        1,
      );
      n.fillRect(0, 0, 96, 54);
      const spots = [
        [24, 18, 34, 0],
        [70, 34, 30, 1],
        [52, 10, 22, 2],
      ];
      for (const [x, y, r, c] of spots) {
        const g = n.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, rgba(palette[c], 0.32));
        g.addColorStop(1, rgba(palette[c], 0));
        n.fillStyle = g;
        n.fillRect(0, 0, 96, 54);
      }
    },
    respawn(i, anyDepth) {
      this.sx[i] = Math.random() * 2 - 1;
      this.sy[i] = Math.random() * 2 - 1;
      this.sz[i] = anyDepth ? 0.05 + Math.random() * 0.95 : 1;
      this.tw[i] = Math.random() * Math.PI * 2;
      this.ci[i] = (Math.random() * 3) | 0;
    },
    frame(e, dt, t) {
      const { ctx, w, h, pointer: p } = e;
      const par = 0.04 * p.strength;

      // background nebula with a little parallax
      ctx.globalAlpha = 1;
      ctx.drawImage(
        this.nebula,
        -w * par - (p.x - 0.5) * w * par * 2,
        -h * par - (p.y - 0.5) * h * par * 2,
        w * (1 + par * 2),
        h * (1 + par * 2),
      );

      // the vanishing point follows the cursor → feels like steering
      const cx = w * 0.5 + (p.x - 0.5) * w * 0.3 * p.strength;
      const cy = h * 0.5 + (p.y - 0.5) * h * 0.3 * p.strength;
      const spread = Math.max(w, h) * 0.5;
      const dz = dt * 0.045;

      let lastColor = -1;
      for (let i = 0; i < this.count; i++) {
        let z = (this.sz[i] -= dz);
        if (z <= 0.03) {
          this.respawn(i, false);
          z = 1;
        }
        const px = cx + (this.sx[i] / z) * spread * 0.35;
        const py = cy + (this.sy[i] / z) * spread * 0.35;
        if (px < -4 || px > w + 4 || py < -4 || py > h + 4) {
          this.respawn(i, false);
          continue;
        }
        const near = 1 - z;
        const size = 0.6 + near * near * 2.4;
        const twinkle = 0.65 + 0.35 * Math.sin(t * 2.2 + this.tw[i]);
        if (this.ci[i] !== lastColor) {
          lastColor = this.ci[i];
          ctx.fillStyle = this.colors[lastColor];
        }
        ctx.globalAlpha = Math.min(1, (0.15 + near * 0.95) * twinkle);
        ctx.fillRect(px, py, size, size);
      }

      // occasional shooting star
      const s = this.shoot;
      if (s.life > 0) {
        s.life -= dt * 1.4;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        const g = ctx.createLinearGradient(
          s.x,
          s.y,
          s.x - s.vx * 0.12,
          s.y - s.vy * 0.12,
        );
        g.addColorStop(0, "rgba(255,255,255,0.9)");
        g.addColorStop(1, "rgba(255,255,255,0)");
        ctx.globalAlpha = Math.max(0, s.life);
        ctx.strokeStyle = g;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(s.x - s.vx * 0.12, s.y - s.vy * 0.12);
        ctx.stroke();
      } else if ((s.wait -= dt) <= 0) {
        s.life = 1;
        s.x = Math.random() * w * 0.7 + w * 0.15;
        s.y = Math.random() * h * 0.3;
        s.vx = (Math.random() < 0.5 ? -1 : 1) * w * 0.55;
        s.vy = h * 0.3;
        s.wait = 7 + Math.random() * 10;
      }
      ctx.globalAlpha = 1;
    },
    destroy() {
      freeCanvas(this.nebula);
      this.nebula = null;
      this.sx = this.sy = this.sz = this.tw = this.ci = null;
      this.count = 0;
    },
  };

  /* ══ 09. SCENE: FIREFLIES ══════════════════════════════════
     Glowing fireflies wander and blink. Near the cursor they swarm
     and orbit around it. */
  const FireflyScene = {
    type: "2d",
    maxDpr: 1.5,
    resolution: () => 1,
    setup() {
      this.count = 0;
      this.bg = null;
      this.sprites = [];
    },
    build(e) {
      const { w, h, palette, eco } = e;
      const want = eco ? 45 : 85;
      if (want !== this.count) {
        const rnd = seeded(77);
        this.count = want;
        this.fx = new Float32Array(want);
        this.fy = new Float32Array(want);
        this.vx = new Float32Array(want);
        this.vy = new Float32Array(want);
        this.ph = new Float32Array(want);
        this.sp = new Float32Array(want);
        this.sz = new Float32Array(want);
        this.ci = new Uint8Array(want);
        for (let i = 0; i < want; i++) {
          this.fx[i] = rnd();
          this.fy[i] = rnd();
          this.ph[i] = rnd() * Math.PI * 2;
          this.sp[i] = 0.6 + rnd() * 1.4;
          this.sz[i] = 0.6 + rnd() * 0.8;
          this.ci[i] = (rnd() * 3) | 0;
        }
      }

      // dusky night meadow background (built once)
      freeCanvas(this.bg);
      this.bg = makeCanvas(w, h);
      const b = this.bg.getContext("2d");
      const sky = b.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(
        0,
        rgba(Color.mixRgb(palette[2], { r: 3, g: 4, b: 10 }, 0.94), 1),
      );
      sky.addColorStop(
        1,
        rgba(Color.mixRgb(palette[0], { r: 2, g: 6, b: 6 }, 0.9), 1),
      );
      b.fillStyle = sky;
      b.fillRect(0, 0, w, h);
      const fog = b.createRadialGradient(
        w * 0.5,
        h * 1.1,
        0,
        w * 0.5,
        h * 1.1,
        h * 0.9,
      );
      fog.addColorStop(0, rgba(palette[1], 0.12));
      fog.addColorStop(1, rgba(palette[1], 0));
      b.fillStyle = fog;
      b.fillRect(0, 0, w, h);

      // one glow sprite per color: white-hot core + colored halo
      this.sprites.forEach(freeCanvas);
      this.sprites = palette.map((col) => {
        const light = Color.mixRgb(col, { r: 255, g: 255, b: 220 }, 0.55);
        const s = makeCanvas(64, 64);
        const sc = s.getContext("2d");
        const g = sc.createRadialGradient(32, 32, 0, 32, 32, 32);
        g.addColorStop(0, "rgba(255,255,240,1)");
        g.addColorStop(0.08, rgba(light, 0.95));
        g.addColorStop(0.25, rgba(col, 0.35));
        g.addColorStop(1, rgba(col, 0));
        sc.fillStyle = g;
        sc.fillRect(0, 0, 64, 64);
        return s;
      });
    },
    frame(e, dt, t) {
      const { ctx, w, h, pointer: p } = e;
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
      ctx.drawImage(this.bg, 0, 0);
      ctx.globalCompositeOperation = "lighter";

      const unit = Math.min(w, h);
      const asp = w / h;
      const active = p.strength * (p.inside ? 1 : 0);
      const damp = Math.exp(-1.6 * dt);

      for (let i = 0; i < this.count; i++) {
        // wander on smooth noise
        const ang = vnoise(t * 0.25 * this.sp[i] + i * 13.7) * Math.PI * 4;
        let ax = Math.cos(ang) * 0.05;
        let ay = Math.sin(ang) * 0.05;

        // swarm: settle on a ring around the cursor and orbit it
        const dx = (p.rx - this.fx[i]) * asp;
        const dy = p.ry - this.fy[i];
        const d2 = dx * dx + dy * dy;
        const near = active * Math.exp(-d2 / 0.09);
        if (near > 0.001) {
          const d = Math.sqrt(d2) + 1e-4;
          const ring = (d - 0.07) * 1.6;
          ax += ((dx / d) * ring - (dy / d) * 0.35) * near;
          ay += ((dy / d) * ring + (dx / d) * 0.35) * near;
        }

        this.vx[i] = (this.vx[i] + ax * dt) * damp;
        this.vy[i] = (this.vy[i] + ay * dt) * damp;
        this.fx[i] += (this.vx[i] / asp) * dt;
        this.fy[i] += this.vy[i] * dt;

        // wrap around the edges
        if (this.fx[i] < -0.05) this.fx[i] += 1.1;
        else if (this.fx[i] > 1.05) this.fx[i] -= 1.1;
        if (this.fy[i] < -0.05) this.fy[i] += 1.1;
        else if (this.fy[i] > 1.05) this.fy[i] -= 1.1;

        // blink: long glow, short dark pause
        const blink = Math.pow(
          0.5 + 0.5 * Math.sin(t * 1.3 * this.sp[i] + this.ph[i]),
          3,
        );
        const glow = 0.12 + 0.88 * blink + near * 0.4;
        const size = unit * 0.035 * this.sz[i] * (0.6 + 0.5 * glow);
        ctx.globalAlpha = Math.min(1, glow);
        ctx.drawImage(
          this.sprites[this.ci[i]],
          this.fx[i] * w - size,
          this.fy[i] * h - size,
          size * 2,
          size * 2,
        );
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
    },
    destroy() {
      freeCanvas(this.bg);
      this.sprites.forEach(freeCanvas);
      this.bg = null;
      this.sprites = [];
      this.count = 0;
    },
  };

  /* ══ 10. SCENE: NEBULA ═════════════════════════════════════
     Deep-space gas clouds with dark dust lanes and pixel-sharp stars.
     The view drifts slightly with the cursor (parallax). */
  const NebulaScene = shaderScene({
    resolution: (eco) => (eco ? 0.6 : 1),
    maxDpr: 1.5,
    frag: `
void main() {
  float asp = uRes.x / uRes.y;
  vec2 p = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
  vec2 m = (uMouse - 0.5) * vec2(asp, 1.0);
  p -= m * 0.06 * uStrength; // parallax
  float t = uTime * 0.025;

  // domain-warped gas
  vec2 q = vec2(fbm(p * 1.4 + t), fbm(p * 1.4 - t + 5.2));
  vec2 r = vec2(fbm(p * 2.0 + q * 2.2 + vec2(1.7, 9.2) + t * 0.6),
                fbm(p * 2.0 + q * 2.2 + vec2(8.3, 2.8) - t * 0.5));
  float f = fbm(p * 1.8 + r * 2.0);

  vec3 col = vec3(0.004, 0.005, 0.013);
  col += uC0 * pow(f, 2.4) * 1.3;
  col += uC1 * pow(r.x, 3.0) * 1.1;
  col += uC2 * pow(q.y * f, 2.0) * 1.6;
  col += mix(uC1, vec3(1.0), 0.5) * pow(f, 6.0) * 1.2; // bright cores

  // dark dust lanes
  float dust = fbm(p * 3.2 - r * 1.6 + 3.0);
  col *= 1.0 - 0.7 * smoothstep(0.5, 0.72, dust);

  // glow under the cursor
  vec2 dm = p - m;
  col += mix(uC1, vec3(1.0), 0.4) * 0.05 * exp(-dot(dm, dm) * 10.0) * uStrength;

  // pixel-sharp stars (sized in real pixels → crisp at any resolution)
  vec2 g = gl_FragCoord.xy / 3.0;
  vec2 cell = floor(g);
  float h = hash(cell);
  if (h > 0.985) {
    vec2 sp = vec2(hash(cell + 1.3), hash(cell + 4.7)) * 0.6 + 0.2;
    float d = length(fract(g) - sp) * 3.0;
    float tw = 0.55 + 0.45 * sin(uTime * (1.0 + h * 3.0) + h * 80.0);
    float size = 0.6 + 1.2 * hash(cell + 9.1);
    col += smoothstep(size, 0.0, d) * tw * mix(vec3(1.0), uC2 + 0.5, 0.25) * (0.5 + f);
  }

  col = 1.0 - exp(-col * 1.4);
  fragColor = vec4(dither(col), 1.0);
}`,
  });

  /* ══ 11. SCENE: RIPPLES (water) ════════════════════════════
     Real wave simulation: the cursor drags through the water and leaves
     ripples that spread, bounce and fade; clicks make a splash and
     raindrops fall on their own. Light bends through the surface
     (refraction), with caustics on the pool floor and glints on waves. */
  const RIPPLE_SHADERS = {
    drop: `
uniform sampler2D uState;
uniform vec2 point;
uniform float radius, strength, aspect;
void main() {
  vec2 s = texture(uState, vUv).rg;
  vec2 d = vUv - point;
  d.x *= aspect;
  float drop = exp(-dot(d, d) / (radius * radius));
  fragColor = vec4(s.r - drop * strength, s.g, 0.0, 1.0);
}`,
    step: `
uniform sampler2D uState;
uniform vec2 texel;
uniform float k, damping;
void main() {
  vec2 s = texture(uState, vUv).rg; // r = height now, g = height before
  float sum = texture(uState, vUv + vec2(texel.x, 0.0)).r
            + texture(uState, vUv - vec2(texel.x, 0.0)).r
            + texture(uState, vUv + vec2(0.0, texel.y)).r
            + texture(uState, vUv - vec2(0.0, texel.y)).r;
  float h = (2.0 * s.r - s.g + k * (sum - 4.0 * s.r)) * damping;
  fragColor = vec4(h, s.r, 0.0, 1.0);
}`,
    display: `
uniform sampler2D uState;
uniform vec2 texel, uRes;
uniform vec3 uC0, uC1, uC2;
uniform float uTime;
${GLSL_NOISE}
void main() {
  float hL = texture(uState, vUv - vec2(texel.x, 0.0)).r;
  float hR = texture(uState, vUv + vec2(texel.x, 0.0)).r;
  float hB = texture(uState, vUv - vec2(0.0, texel.y)).r;
  float hT = texture(uState, vUv + vec2(0.0, texel.y)).r;
  vec3 n = normalize(vec3(hL - hR, hB - hT, 0.09));

  // refraction: look at the pool floor through the bent surface
  vec2 uv = vUv + n.xy * 0.05;
  vec2 p = uv * vec2(uRes.x / uRes.y, 1.0) * 3.0;
  float t = uTime * 0.25;

  vec3 floorCol = mix(uC0 * 0.10, uC2 * 0.22, uv.y) + vec3(0.006, 0.01, 0.018);
  // classic water caustics (light web dancing on the pool floor)
  vec2 cp = mod(p * 2.1, 6.28318) - 250.0;
  vec2 ci = cp;
  float cc = 1.0;
  for (int n = 0; n < 4; n++) {
    float ct = t * 1.6 * (1.0 - 3.5 / float(n + 1));
    ci = cp + vec2(cos(ct - ci.x) + sin(ct + ci.y), sin(ct - ci.y) + cos(ct + ci.x));
    cc += 1.0 / length(vec2(cp.x / (sin(ci.x + ct) / 0.005), cp.y / (cos(ci.y + ct) / 0.005)));
  }
  cc /= 4.0;
  cc = 1.17 - pow(cc, 1.4);
  float caustic = clamp(pow(abs(cc), 8.0), 0.0, 1.0);
  floorCol += mix(uC1, vec3(1.0), 0.35) * caustic * 0.22;

  // light on the waves
  vec3 L = normalize(vec3(-0.4, 0.6, 0.7));
  float spec = pow(max(dot(reflect(-L, n), vec3(0.0, 0.0, 1.0)), 0.0), 90.0);
  float slope = 1.0 - n.z;
  vec3 col = floorCol + mix(uC1, vec3(1.0), 0.6) * spec * 0.8 + mix(uC2, vec3(1.0), 0.3) * slope * 0.35;

  vec2 sv = vUv - 0.5;
  col *= 1.0 - dot(sv, sv) * 0.6; // soft vignette
  col = 1.0 - exp(-col * 1.5);
  fragColor = vec4(dither(col), 1.0);
}`,
  };

  const RippleScene = {
    type: "gl",
    resolution: (eco) => (eco ? 0.6 : 1),
    maxDpr: 1.5,
    setup(e) {
      const gl = e.gl;
      if (!supportsFloatTargets(gl)) return false;
      this.p = {};
      for (const k in RIPPLE_SHADERS)
        this.p[k] = makeProgram(gl, RIPPLE_SHADERS[k]);
      this.queue = [];
      this.clicks = [];
      this.key = "";
      this.rain = 0.5;
      return true;
    },
    build(e) {
      this.cols = [pal(e, 0), pal(e, 1), pal(e, 2)];
      const asp = e.w / e.h;
      const res = e.eco ? 200 : 300;
      const [w, h] =
        asp > 1 ? [Math.round(res * asp), res] : [res, Math.round(res / asp)];
      const key = `${w}x${h}`;
      if (key === this.key) return;
      this.key = key;
      this.state?.free();
      this.state = createDoubleFBO(e.gl, w, h);
    },
    drop(e, x, y, radius, strength) {
      setUniforms(e.gl, this.p.drop, {
        uState: this.state.read.tex,
        point: [x, y],
        radius,
        strength,
        aspect: e.w / e.h,
      });
      drawTo(e, this.state.write);
      this.state.swap();
    },
    // click → big splash (center drop + ring of droplets)
    onClick(e, x, y) {
      if (this.clicks.length < 30) this.clicks.push(x, 1 - y);
    },
    onPointer(e, x, y, dx, dy) {
      if (this.queue.length > 60) this.queue.splice(0, 3);
      this.queue.push(x, 1 - y, Math.hypot(dx, dy));
    },
    frame(e, dt, t) {
      const gl = e.gl;
      gl.disable(gl.BLEND);

      // cursor trail → ripples
      const q = this.queue;
      for (let i = 0; i < q.length; i += 3) {
        const v = Math.min(1, q[i + 2] * 40);
        if (v > 0.02) this.drop(e, q[i], q[i + 1], 0.01, 0.18 * v);
      }
      q.length = 0;

      // click splashes
      const cl = this.clicks;
      const asp = e.w / e.h;
      for (let i = 0; i < cl.length; i += 2) {
        const cx = cl[i];
        const cy = cl[i + 1];
        this.drop(e, cx, cy, 0.028, 1.4); // main impact
        const n = 6;
        const turn = Math.random() * Math.PI * 2;
        for (let j = 0; j < n; j++) {
          const a = turn + (j / n) * Math.PI * 2;
          const d = 0.045 + Math.random() * 0.02;
          this.drop(
            e,
            cx + (Math.cos(a) * d) / asp,
            cy + Math.sin(a) * d,
            0.007,
            0.45,
          ); // splash droplets
        }
      }
      cl.length = 0;

      // random raindrops
      this.rain -= dt;
      if (this.rain <= 0) {
        this.rain = 0.35 + Math.random() * 1.2;
        this.drop(
          e,
          Math.random(),
          Math.random(),
          0.006 + Math.random() * 0.008,
          0.35 + Math.random() * 0.4,
        );
      }

      // wave speed follows the Speed slider; extra steps keep it stable
      const amount = Math.min(dt * 60, 4) * 1.4;
      const steps = Math.max(1, Math.ceil(amount));
      const k = 0.48 * Math.min(1, amount / steps);
      for (let i = 0; i < steps; i++) {
        setUniforms(gl, this.p.step, {
          uState: this.state.read.tex,
          texel: this.state.ts,
          k,
          damping: 0.99,
        });
        drawTo(e, this.state.write);
        this.state.swap();
      }

      setUniforms(gl, this.p.display, {
        uState: this.state.read.tex,
        texel: this.state.ts,
        uRes: [e.w, e.h],
        uC0: this.cols[0],
        uC1: this.cols[1],
        uC2: this.cols[2],
        uTime: t,
      });
      drawTo(e, null);
    },
    destroy(e) {
      this.state?.free();
      this.state = null;
      if (e.gl) for (const k in this.p || {}) e.gl.deleteProgram(this.p[k].p);
      this.p = null;
      this.key = "";
      this.queue = [];
      this.clicks = [];
    },
  };

  /* ══ 12. SCENE: CONSTELLATION ══════════════════════════════
     Floating stars linked by thin lines when they get close. The cursor
     joins the network: nearby stars connect to it and gather around it. */
  const ConstellationScene = {
    type: "2d",
    maxDpr: 1.5,
    resolution: () => 1,
    setup() {
      this.count = 0;
      this.bg = null;
    },
    build(e) {
      const { w, h, palette, eco } = e;
      const want = Math.round(Math.min(eco ? 70 : 120, (w * h) / 11000));
      if (want !== this.count) {
        const rnd = seeded(5);
        this.count = want;
        this.x = new Float32Array(want);
        this.y = new Float32Array(want);
        this.vx = new Float32Array(want);
        this.vy = new Float32Array(want);
        this.ci = new Uint8Array(want);
        this.sz = new Float32Array(want);
        for (let i = 0; i < want; i++) {
          this.x[i] = rnd();
          this.y[i] = rnd();
          const a = rnd() * Math.PI * 2;
          const sp = 0.006 + rnd() * 0.012;
          this.vx[i] = Math.cos(a) * sp;
          this.vy[i] = Math.sin(a) * sp;
          this.ci[i] = (rnd() * 3) | 0;
          this.sz[i] = 0.8 + rnd() * 1.4;
        }
      }
      this.rgb = palette.map((c) =>
        Color.mixRgb(c, { r: 255, g: 255, b: 255 }, 0.35),
      );

      freeCanvas(this.bg);
      this.bg = makeCanvas(w, h);
      const b = this.bg.getContext("2d");
      const g = b.createRadialGradient(
        w * 0.5,
        h * 0.4,
        0,
        w * 0.5,
        h * 0.4,
        Math.max(w, h) * 0.8,
      );
      g.addColorStop(
        0,
        rgba(Color.mixRgb(palette[0], { r: 6, g: 7, b: 14 }, 0.88), 1),
      );
      g.addColorStop(
        1,
        rgba(Color.mixRgb(palette[2], { r: 2, g: 2, b: 6 }, 0.96), 1),
      );
      b.fillStyle = g;
      b.fillRect(0, 0, w, h);
    },
    frame(e, dt) {
      const { ctx, w, h, pointer: p } = e;
      const n = this.count;
      const X = this.x;
      const Y = this.y;
      const asp = w / h;
      const link = 0.16; // link distance (fraction of height)
      const mouseOn = p.inside && p.strength > 0.05;
      const mx = p.rx;
      const my = p.ry;

      ctx.globalAlpha = 1;
      ctx.drawImage(this.bg, 0, 0);

      for (let i = 0; i < n; i++) {
        if (mouseOn) {
          const dx = (mx - X[i]) * asp;
          const dy = my - Y[i];
          const d2 = dx * dx + dy * dy;
          if (d2 < 0.06) {
            // gather around the cursor, keeping a little distance
            const d = Math.sqrt(d2) + 1e-4;
            const f = (d - 0.08) * 0.25 * p.strength * dt;
            X[i] += ((dx / d) * f) / asp;
            Y[i] += (dy / d) * f;
          }
        }
        X[i] += this.vx[i] * dt;
        Y[i] += this.vy[i] * dt;
        if (X[i] < -0.02) X[i] += 1.04;
        else if (X[i] > 1.02) X[i] -= 1.04;
        if (Y[i] < -0.02) Y[i] += 1.04;
        else if (Y[i] > 1.02) Y[i] -= 1.04;
      }

      // links between close stars, and from stars to the cursor
      ctx.lineWidth = Math.max(1, h / 900);
      for (let i = 0; i < n; i++) {
        const c = this.rgb[this.ci[i]];
        for (let j = i + 1; j < n; j++) {
          const dx = (X[i] - X[j]) * asp;
          const dy = Y[i] - Y[j];
          const d2 = dx * dx + dy * dy;
          if (d2 > link * link) continue;
          const a = (1 - Math.sqrt(d2) / link) * 0.45;
          ctx.strokeStyle = rgba(c, a);
          ctx.beginPath();
          ctx.moveTo(X[i] * w, Y[i] * h);
          ctx.lineTo(X[j] * w, Y[j] * h);
          ctx.stroke();
        }
        if (mouseOn) {
          const dx = (X[i] - mx) * asp;
          const dy = Y[i] - my;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < link * 1.4) {
            ctx.strokeStyle = rgba(
              c,
              (1 - d / (link * 1.4)) * 0.7 * p.strength,
            );
            ctx.beginPath();
            ctx.moveTo(X[i] * w, Y[i] * h);
            ctx.lineTo(mx * w, my * h);
            ctx.stroke();
          }
        }
      }

      for (let i = 0; i < n; i++) {
        const r = this.sz[i] * (h / 720);
        ctx.fillStyle = rgba(this.rgb[this.ci[i]], 0.95);
        ctx.beginPath();
        ctx.arc(X[i] * w, Y[i] * h, r, 0, Math.PI * 2);
        ctx.fill();
      }
      if (mouseOn) {
        ctx.fillStyle = `rgba(255,255,255,${0.8 * p.strength})`;
        ctx.beginPath();
        ctx.arc(mx * w, my * h, 2.2 * (h / 720), 0, Math.PI * 2);
        ctx.fill();
      }
    },
    destroy() {
      freeCanvas(this.bg);
      this.bg = null;
      this.count = 0;
    },
  };

  /* ══ 13. ENGINE ════════════════════════════════════════════ */
  const SCENES = {
    aurora: AuroraScene,
    ink: InkScene,
    stars: StarScene,
    lava: LavaScene,
    fireflies: FireflyScene,
    nebula: NebulaScene,
    ripples: RippleScene,
    constellation: ConstellationScene,
  };

  const engine = {
    canvas: null,
    ctx: null, // 2D context (2D scenes)
    gl: null, // WebGL2 context (GPU scenes)
    vao: null,
    ctxType: null, // "2d" | "gl" | null
    w: 0,
    h: 0,
    eco: false,
    raf: 0,
    last: 0,
    t: 0,
    scene: null,
    sceneId: null,
    basePalette: ["#3b82f6", "#8b5cf6", "#06b6d4"],
    palette: [],
    // x/y = smoothed (gentle scenes), rx/ry = raw (instant scenes)
    pointer: {
      x: 0.5,
      y: 0.5,
      tx: 0.5,
      ty: 0.5,
      rx: 0.5,
      ry: 0.5,
      speed: 0,
      strength: 1,
      inside: false,
    },
    cfg: {
      enabled: false,
      scene: "aurora",
      intensity: 0.9,
      speed: 1,
      cursor: true,
      dayCycle: true,
      blend: false,
      eco: false,
    },
    failed: new Set(), // scenes that can't run here (no WebGL2) → don't retry
    listeners: null, // AbortController for window listeners
    dayTimer: null,
    resizeTimer: null,
  };

  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)");

  // clicks on these never count as background clicks
  const UI_SELECTOR =
    "a, button, input, textarea, select, label, dialog, [role='button'], .glass-card, .glass-sidebar, #settings-sidebar, #menu-btn, #modal-backdrop, .search-form, .bookmark-item, .task-item";

  function computePalette() {
    const base = engine.basePalette.map((hex) =>
      Color.isHex(hex) ? hex : "#3b82f6",
    );
    const mixed = engine.cfg.dayCycle
      ? base.map((hex, i) => Color.mixHex(hex, dayPalette()[i], DAY_MIX))
      : base;
    engine.palette = mixed.map((hex) => Color.hexToRgb(hex));
  }

  // A canvas keeps its first context type forever, and GPU memory is only
  // released when the context is lost → every scene gets a fresh canvas.
  function releaseContext() {
    if (engine.gl) {
      try {
        engine.gl.getExtension("WEBGL_lose_context")?.loseContext();
      } catch { }
    }
    engine.gl = engine.ctx = engine.vao = null;
    if (engine.ctxType && engine.canvas) {
      const fresh = engine.canvas.cloneNode(false);
      fresh.width = fresh.height = 1;
      engine.canvas.replaceWith(fresh);
      engine.canvas = fresh;
    }
    engine.ctxType = null;
  }

  function createContext(type, alpha = false) {
    releaseContext();
    const canvas = engine.canvas;
    if (type === "gl") {
      const gl = canvas.getContext("webgl2", {
        alpha: false,
        antialias: false,
        depth: false,
        stencil: false,
        premultipliedAlpha: false,
        preserveDrawingBuffer: false,
        powerPreference: "low-power",
      });
      if (!gl) return false;
      engine.gl = gl;
      const vao = gl.createVertexArray();
      gl.bindVertexArray(vao);
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([-1, -1, 3, -1, -1, 3]),
        gl.STATIC_DRAW,
      );
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      engine.vao = vao;

      // GPU driver reset → rebuild the scene
      canvas.addEventListener("webglcontextlost", (ev) => {
        if (ev.target !== engine.canvas) return;
        ev.preventDefault();
        stop();
      });
      canvas.addEventListener("webglcontextrestored", (ev) => {
        if (ev.target !== engine.canvas || !engine.sceneId) return;
        engine.ctxType = null; // the context is new; don't swap the canvas again
        mountScene(engine.sceneId);
        start();
      });
    } else {
      engine.ctx = canvas.getContext("2d", { alpha: !!alpha });
    }
    engine.ctxType = type;
    return true;
  }

  function trySetup(scene) {
    try {
      return scene.setup(engine) !== false;
    } catch (err) {
      console.warn(
        "[LiveScene] scene setup failed, using Star Field instead:",
        err,
      );
      return false;
    }
  }

  function resize() {
    const { canvas, scene } = engine;
    if (!canvas || !scene) return;
    const dpr = Math.min(window.devicePixelRatio || 1, scene.maxDpr ?? 1);
    const s = scene.resolution(engine.eco) * dpr;

    // real on-screen size (100vh and innerHeight differ on tablets/phones
    // because of the browser's address bar)
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round((rect.width || window.innerWidth) * s));
    const h = Math.max(1, Math.round((rect.height || window.innerHeight) * s));
    canvas.width = w;
    canvas.height = h;
    engine.w = w;
    engine.h = h;
    scene.build(engine);
  }

  function loop(now) {
    engine.raf = requestAnimationFrame(loop);
    const minStep = engine.eco ? 1000 / 30 - 1 : 1000 / 60 - 2;
    const elapsed = now - engine.last;
    if (elapsed < minStep) return;
    engine.last = now;
    if (engine.gl?.isContextLost()) return;

    const motion = reducedMotion?.matches ? 0.35 : 1;
    const dt = (Math.min(elapsed, 100) / 1000) * engine.cfg.speed * motion;
    engine.t += dt;

    // smoothed cursor for gentle scenes
    const p = engine.pointer;
    const k = Math.min(1, (elapsed / 1000) * 7);
    const px = p.x;
    const py = p.y;
    p.x += (p.tx - p.x) * k;
    p.y += (p.ty - p.y) * k;
    const moved =
      Math.hypot(p.x - px, p.y - py) / Math.max(0.001, elapsed / 1000);
    p.speed += (moved - p.speed) * 0.2;
    p.strength +=
      ((engine.cfg.cursor ? 1 : 0) - p.strength) *
      Math.min(1, (elapsed / 1000) * 3.5);

    engine.scene.frame(engine, dt, engine.t);
  }

  function start() {
    if (engine.raf || !engine.scene || document.hidden) return;
    engine.last = performance.now();
    engine.raf = requestAnimationFrame(loop);
  }

  function stop() {
    if (engine.raf) cancelAnimationFrame(engine.raf);
    engine.raf = 0;
  }

  function bindWindow() {
    if (engine.listeners) return;
    engine.listeners = new AbortController();
    const opts = { passive: true, signal: engine.listeners.signal };

    window.addEventListener(
      "pointermove",
      (ev) => {
        if (!engine.cfg.cursor) return;
        const p = engine.pointer;
        const nx = ev.clientX / window.innerWidth;
        const ny = ev.clientY / window.innerHeight;
        const dx = p.inside ? nx - p.rx : 0;
        const dy = p.inside ? ny - p.ry : 0;
        p.rx = p.tx = nx;
        p.ry = p.ty = ny;
        p.inside = true;
        // instant hook (Ink, Ripples): no smoothing, no waiting
        if (engine.raf) engine.scene?.onPointer?.(engine, nx, ny, dx, dy);
      },
      opts,
    );

    // click on the background (not on UI) → scene.onClick (Ink, Ripples, Lava)
    window.addEventListener(
      "pointerdown",
      (ev) => {
        if (!engine.raf || !engine.scene?.onClick) return;
        if (ev.button !== 0) return;
        if (ev.target.closest?.(UI_SELECTOR)) return;
        const nx = ev.clientX / window.innerWidth;
        const ny = ev.clientY / window.innerHeight;
        const label = engine.scene.onClick(engine, nx, ny);
        if (label) showSceneToast(label, ev.clientX, ev.clientY);
      },
      opts,
    );

    document.documentElement.addEventListener(
      "pointerleave",
      () => {
        const p = engine.pointer;
        p.tx = p.ty = 0.5;
        p.inside = false;
      },
      opts,
    );

    window.addEventListener(
      "resize",
      () => {
        clearTimeout(engine.resizeTimer);
        engine.resizeTimer = setTimeout(resize, 150);
      },
      opts,
    );
    // tablets: rotation and browser-bar show/hide don't always fire "resize"
    const resizeSoon = () => {
      clearTimeout(engine.resizeTimer);
      engine.resizeTimer = setTimeout(resize, 200);
    };
    window.addEventListener("orientationchange", resizeSoon, opts);
    window.visualViewport?.addEventListener("resize", resizeSoon, opts);

    document.addEventListener(
      "visibilitychange",
      () => (document.hidden ? stop() : start()),
      opts,
    );

    // day cycle: recolor once a minute (not per frame)
    engine.dayTimer = setInterval(() => {
      if (!engine.cfg.dayCycle || !engine.scene) return;
      computePalette();
      engine.scene.build(engine);
    }, 60000);
  }

  // tiny floating label where you clicked (shown when onClick returns text)
  let toastEl = null;
  let toastTimer = 0;
  function showSceneToast(text, x, y) {
    if (!toastEl) {
      toastEl = document.createElement("div");
      toastEl.className = "scene-toast";
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = text;
    toastEl.style.left = `${x}px`;
    toastEl.style.top = `${y}px`;
    toastEl.classList.remove("show");
    void toastEl.offsetWidth; // restart the animation
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl?.classList.remove("show"), 1100);
  }

  function unbindWindow() {
    engine.listeners?.abort();
    engine.listeners = null;
    clearInterval(engine.dayTimer);
    clearTimeout(engine.resizeTimer);
  }

  function mountScene(id) {
    if (engine.scene) engine.scene.destroy(engine);
    engine.scene = null;

    let sceneId = SCENES[id] ? id : "aurora";
    let scene = SCENES[sceneId];
    if (
      engine.failed.has(sceneId) ||
      !createContext(scene.type, scene.alpha) ||
      !trySetup(scene)
    ) {
      engine.failed.add(sceneId);
      if (scene.type === "gl")
        console.warn("[LiveScene] WebGL2 not available → Star Field");
      sceneId = "stars";
      scene = SCENES.stars;
      createContext("2d");
      scene.setup(engine);
    }
    engine.scene = scene;
    engine.sceneId = sceneId;
    computePalette();
    resize();
  }

  function unmountScene() {
    stop();
    if (engine.scene) engine.scene.destroy(engine);
    engine.scene = null;
    engine.sceneId = null;
    releaseContext(); // frees GPU / pixel memory
    if (engine.canvas) engine.canvas.style.opacity = "0";
    unbindWindow();
  }

  function applyCanvasStyle() {
    const c = engine.canvas;
    if (!c) return;
    const sceneOpacity = engine.scene?.opacity ?? 1;
    c.style.opacity = engine.cfg.enabled
      ? String((0.25 + 0.75 * engine.cfg.intensity) * sceneOpacity)
      : "0";
    c.style.mixBlendMode = engine.cfg.blend ? "screen" : "normal";
  }

  /* ══ 14. PUBLIC API ════════════════════════════════════════ */
  window.LiveScene = {
    SCENES: Object.keys(SCENES),

    init(canvas) {
      engine.canvas = canvas;
    },

    configure(partial = {}) {
      const prev = { ...engine.cfg };
      Object.assign(engine.cfg, partial);
      const cfg = engine.cfg;

      if (!cfg.enabled) {
        if (prev.enabled || engine.scene) unmountScene();
        applyCanvasStyle();
        return;
      }

      bindWindow();
      const ecoChanged = engine.eco !== cfg.eco;
      engine.eco = cfg.eco;

      const wanted =
        SCENES[cfg.scene] && !engine.failed.has(cfg.scene)
          ? cfg.scene
          : engine.sceneId;
      if (!engine.scene || engine.sceneId !== wanted) {
        stop();
        mountScene(cfg.scene);
      } else if (ecoChanged) {
        resize();
      } else if (prev.dayCycle !== cfg.dayCycle) {
        computePalette();
        engine.scene.build(engine);
      }

      applyCanvasStyle();
      start();
    },

    setPalette(colors) {
      if (!Array.isArray(colors) || colors.length < 3) return;
      engine.basePalette = colors.slice(0, 3);
      if (!engine.scene) return;
      computePalette();
      engine.scene.build(engine);
    },

    // which scene is really running (differs if WebGL2 was unavailable)
    activeScene() {
      return engine.sceneId;
    },

    isActive() {
      return !!engine.cfg.enabled;
    },

    // scene clock in seconds (handy for debugging the speed slider)
    time() {
      return engine.t;
    },

    destroy() {
      unmountScene();
    },
  };
})();