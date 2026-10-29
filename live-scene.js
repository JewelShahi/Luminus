/* ═══════════════════════════════════════════════════════════
   LUMINUS — live-scene.js
   Animated backgrounds:
     GPU (WebGL2 shaders): Aurora · Lava Lamp (metaballs) · Ink (fluid sim)
                           Nebula · Ripples (wave sim)
     Canvas 2D:            Star Field · Fireflies · Constellation

   Quality + low memory:
   • GPU scenes compute every pixel mathematically → smooth edges,
     no visible pixels, and almost no CPU/RAM use.
   • A fresh canvas per scene; the old GPU context is released, so
     switching scenes never piles up memory.
   • Tiny dithering removes color banding in dark gradients.
   • Loop pauses when the tab is hidden; 60fps (smooth) / 30fps (battery).
   • If WebGL2 is not available, GPU scenes fall back to Star Field.

   CONTENTS
   01. Helpers (canvas, color, noise)
   02. Time-of-day palette
   03. WebGL helpers (programs, uniforms, framebuffers)
   04. Shared GLSL (noise)
   05. Scene: Aurora
   06. Scene: Lava Lamp (heat + connection physics)
   08. Scene: Ink (fluid simulation)
   09. Scene: Star Field
   10. Scene: Fireflies
   10b–d. Scenes: Nebula · Ripples · Constellation
   11. Engine (loop, sizing, cursor, palette)
   12. Public API
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

  // Tiny seeded random, so layouts stay the same after a resize
  function seeded(seed) {
    let s = seed >>> 0;
    return () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  // Smooth 1D value noise (0..1) — drives "unpredictable but organic" motion
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

  // palette entry i → [r, g, b] in 0..1 for shaders
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

  /* ══ 04. SHARED GLSL ═══════════════════════════════════════ */
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

  // Standard uniforms every single-pass shader scene receives
  const GLSL_STD_UNIFORMS = `
uniform vec2 uRes;
uniform float uTime;
uniform vec2 uMouse;     // smoothed cursor, 0..1, y up
uniform float uStrength; // 0 = cursor off, 1 = on
uniform vec3 uC0, uC1, uC2;
`;

  // Factory for one-pass shader scenes (Aurora, Lava, Nebula)
  function shaderScene(opts) {
    return {
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
  }

  /* ══ 05. SCENE: AURORA ═════════════════════════════════════
     Three glowing curtains rendered at full screen resolution:
     crisp lower edge, fine moving light rays, soft fade upward,
     a mirrored glow on the horizon and twinkling stars.
     Curtains sway on their own and bend toward the cursor. */
  const AuroraScene = shaderScene({
    resolution: (eco) => (eco ? 0.65 : 1),
    maxDpr: 1.5,
    frag: `
// thin vertical rays: sharp, high-frequency noise only along x
float rays(float x, float t, float seed) {
  float r = 0.0;
  r += noise(vec2(x * 38.0 + seed, t * 0.35)) * 0.55;
  r += noise(vec2(x * 95.0 - seed * 2.0, t * 0.6)) * 0.3;
  r += noise(vec2(x * 210.0 + seed * 3.0, t * 0.9)) * 0.15;
  return smoothstep(0.28, 0.95, r);
}

void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  float asp = uRes.x / uRes.y;
  float x = uv.x * asp;
  float t = uTime;
  vec2 m = vec2(uMouse.x * asp, uMouse.y);

  // deep night sky with a faint horizon glow
  vec3 col = mix(vec3(0.004, 0.006, 0.016), vec3(0.012, 0.018, 0.04), smoothstep(0.0, 1.0, uv.y));
  col += uC0 * 0.04 * exp(-uv.y * 5.0);

  // crisp stars (resolution independent, round)
  vec2 g = vec2(x, uv.y) * 140.0;
  vec2 cell = floor(g);
  float h = hash(cell);
  if (h > 0.982) {
    vec2 sp = vec2(hash(cell + 3.1), hash(cell + 7.7)) * 0.6 + 0.2;
    float d = length(fract(g) - sp) * 140.0 / uRes.y * 900.0;
    float tw = 0.55 + 0.45 * sin(t * 1.9 + h * 50.0);
    col += smoothstep(1.6, 0.0, d) * 0.7 * tw * smoothstep(0.2, 0.7, uv.y);
  }

  vec3 glow = vec3(0.0);
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    vec3 c = i == 0 ? uC0 : (i == 1 ? uC1 : uC2);
    c = mix(c, vec3(0.55, 1.0, 0.85), 0.08); // a touch of real aurora green

    // curtain bottom edge: big slow waves + finer folds
    float edge = 0.30 + fi * 0.11
      + 0.07 * sin(x * 1.3 + t * 0.10 * (1.0 + fi * 0.35) + fi * 2.3)
      + 0.035 * sin(x * 4.1 - t * 0.21 + fi * 4.0)
      + 0.06 * (fbm(vec2(x * 0.8 + t * 0.03 + fi * 5.0, fi)) - 0.5);

    // bend toward the cursor
    float near = exp(-pow(x - m.x, 2.0) * 4.0) * uStrength;
    edge += (m.y - 0.12 - edge) * 0.28 * near;

    float d = uv.y - edge;
    float height = 0.22 + 0.16 * fbm(vec2(x * 1.6 - t * 0.04, fi * 7.0));

    // sharp lower edge (anti-aliased), long soft fade upward
    float aa = 1.5 / uRes.y;
    float lower = smoothstep(-0.012 - aa, 0.004, d);
    float upper = exp(-max(d, 0.0) / height * 2.2);
    float body = lower * upper;
    float rim = exp(-abs(d - 0.006) * 140.0) * 0.6; // bright line along the edge

    float r = rays(x + fi * 1.7, t, fi * 11.0);
    float flicker = 0.8 + 0.2 * noise(vec2(x * 3.0 + t * 0.5, fi * 9.0));
    float intensity = (body * (0.25 + 1.1 * r) + rim * (0.4 + r)) * flicker * (0.75 + 0.6 * near);

    // color shifts slightly with height (greener low, warmer/purple high)
    vec3 tint = mix(c, mix(c, uC2, 0.6), smoothstep(0.0, height * 1.5, d));
    glow += tint * intensity;
  }
  col += glow;

  // soft reflection glow near the horizon
  col += mix(uC0, uC1, 0.5) * 0.05 * exp(-uv.y * 9.0);

  // gentle glow around the cursor
  vec2 dm = vec2(x, uv.y) - m;
  col += mix(uC1, vec3(1.0), 0.3) * 0.04 * exp(-dot(dm, dm) * 14.0) * uStrength;

  col = 1.0 - exp(-col * 1.35); // soft tone mapping (no clipping)
  fragColor = vec4(dither(col), 1.0);
}`,
  });

  /* ══ 06. SCENE: LAVA LAMP ══════════════════════════════════
     A real lava lamp (GPU metaballs, crisp anti-aliased edges):
     • 7 wax blobs (LAVA_CFG.count, 6–8) + a hot wax pool at the bottom
     • HEAT: the bottom heats wax (it rises), the top cools it (it sinks),
       and wax slowly cools while travelling → no two cycles look alike
     • CONNECTION: nearby blobs attract each other and melt together
       (gooey necks); merged blobs share heat, and when one gets hotter
       it stretches the neck and pinches off again
     • blobs stretch tall while moving fast, like real wax
     • your cursor is a soft heat source: blobs drift toward it and warm up */
  const LAVA_CFG = {
    count: 7, // 6–8 looks most like a real lamp (max 8)
    buoyancy: 0.45, // how strongly hot wax rises / cold wax sinks
    cohesion: 0.6, // how strongly blobs pull together
    viscosity: 1.2, // liquid drag (higher = slower, thicker)
    mouse: 0.35, // cursor pull (0 = off)
  };
  const LAVA_MAX = 8; // must match the shader arrays

  const LavaScene = shaderScene({
    resolution: (eco) => (eco ? 0.6 : 1),
    maxDpr: 1.5,
    frag: `
uniform vec4 uB[${LAVA_MAX}]; // xy = position, z = radius, w = heat
uniform vec4 uS[${LAVA_MAX}]; // x = vertical stretch
uniform int uN;
uniform float uAsp;

// x = field strength, y = heat (weighted by each blob's influence)
vec2 field(vec2 p) {
  float v = 0.0, h = 0.0;
  for (int i = 0; i < ${LAVA_MAX}; i++) {
    if (i >= uN) break;
    vec2 d = p - uB[i].xy;
    float s = uS[i].x;
    d.y /= s; // taller…
    d.x *= s; // …and thinner (keeps the same amount of wax)
    // softened falloff: smooth all the way to the center (no spike, no crease)
    float r2 = uB[i].z * uB[i].z;
    float c = r2 / (dot(d, d) + r2 * 0.15);
    v += c;
    h += c * uB[i].w;
  }
  // hot wax pool along the bottom, gently rolling
  float wave = 0.010 * sin(p.x * 6.0 + uTime * 0.35) + 0.007 * sin(p.x * 13.0 - uTime * 0.27);
  float pool = min(1.45 * exp(-(p.y - wave) / 0.05), 6.0);
  v += pool;
  h += pool;
  return vec2(v, h / max(v, 1e-5));
}

void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 p = vec2(uv.x * uAsp, uv.y);
  float t = uTime;

  // soft wobble so wax edges ripple a little
  vec2 q = p + vec2(noise(p * 3.0 + vec2(t * 0.2, 0.0)) - 0.5,
                    noise(p * 3.0 + vec2(5.2, -t * 0.18)) - 0.5) * 0.025;

  vec2 F = field(q);
  float f = F.x;

  // surface normal from the field → round, glossy wax
  float e = 0.0025;
  vec2 g = vec2(field(q + vec2(e, 0.0)).x - f, field(q + vec2(0.0, e)).x - f) / e;
  vec3 n = normalize(vec3(-g / (f * f + 1e-3) * 0.03, 1.0));

  // anti-aliased edge (smooth at any resolution)
  float aa = fwidth(f) * 1.2 + 1e-4;
  float edge = smoothstep(1.0 - aa, 1.0 + aa, f);

  // wax color by heat: cool (uC2) → warm (uC1) → hot (uC0)
  float heat = clamp(F.y, 0.0, 1.0);
  vec3 wax = heat > 0.5 ? mix(uC1, uC0, (heat - 0.5) * 2.0) : mix(uC2, uC1, heat * 2.0);
  wax = mix(wax, vec3(1.0), 0.08);

  vec3 L = normalize(vec3(-0.35, 0.55, 0.75));
  float diff = clamp(dot(n, L), 0.0, 1.0);
  float spec = pow(clamp(dot(reflect(-L, n), vec3(0, 0, 1)), 0.0, 1.0), 16.0);
  float rim = 1.0 - n.z;
  vec3 waxCol = wax * (0.45 + 0.65 * diff) + wax * rim * 0.55 + spec * 0.28;
  waxCol += wax * smoothstep(1.5, 5.0, f) * 0.18; // glowing core

  // lamp liquid: dark, tinted, lit by the wax
  vec3 bg = mix(uC0 * 0.10, uC2 * 0.05, uv.y) + vec3(0.012, 0.010, 0.020);
  bg += wax * smoothstep(0.25, 1.0, f) * (1.0 - edge) * 0.35; // glow halo
  bg += uC0 * 0.10 * exp(-uv.y * 6.0); // heat glow from the bottom
  float side = 0.5 - abs(uv.x - 0.5);
  bg *= 0.7 + 0.3 * smoothstep(0.0, 0.35, side); // glass-lamp shading

  vec3 col = mix(bg, waxCol, edge);
  col = 1.0 - exp(-col * 1.4);
  fragColor = vec4(dither(col), 1.0);
}`,
    init() {
      const rnd = seeded(2024);
      const n = Math.max(6, Math.min(LAVA_MAX, LAVA_CFG.count));
      this.blobs = Array.from({ length: n }, (_, i) => ({
        x: 0.15 + rnd() * 1.4,
        y: 0.15 + rnd() * 0.75,
        vx: 0,
        vy: 0,
        r: 0.06 + rnd() * 0.035,
        heat: rnd(),
        s: 1,
        seed: i * 9.17 + rnd() * 5,
      }));
      this.bufB = new Float32Array(LAVA_MAX * 4);
      this.bufS = new Float32Array(LAVA_MAX * 4);
      this.time = 0;
    },
    update(e, dt) {
      const asp = e.w / e.h;
      const p = e.pointer;
      const mx = p.rx * asp;
      const my = 1 - p.ry;
      const mouseOn = p.inside ? p.strength : 0;
      const B = this.blobs;
      const n = B.length;

      // small fixed steps → stable physics at any speed
      const steps = Math.max(1, Math.ceil(dt / (1 / 60)));
      const h = dt / steps;
      for (let s = 0; s < steps; s++) {
        this.time += h;
        const T = this.time;

        for (const b of B) {
          b.ax = 0;
          b.ay = 0;
          if (b.x > asp) b.x = asp - b.r; // window got narrower

          // heat: bottom heats, top cools, slow cooling while travelling
          if (b.y < 0.2) b.heat += 0.28 * h;
          else if (b.y > 0.8) b.heat -= 0.3 * h;
          else b.heat -= 0.02 * h;
          b.heat += (vnoise(T * 0.15 + b.seed) - 0.5) * 0.05 * h;

          // buoyancy: hot rises, cold sinks
          b.ay += (b.heat - 0.5) * LAVA_CFG.buoyancy;
          // gentle sideways wandering
          b.ax += (vnoise(T * 0.08 + b.seed * 2.3) - 0.5) * 0.06;

          // cursor = soft heat source that blobs drift toward
          if (mouseOn > 0 && LAVA_CFG.mouse > 0) {
            const dx = mx - b.x;
            const dy = my - b.y;
            const near = Math.exp(-(dx * dx + dy * dy) / 0.04) * mouseOn;
            b.ax += dx * LAVA_CFG.mouse * near;
            b.ay += dy * LAVA_CFG.mouse * near;
            b.heat += 0.25 * near * h;
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
            let f;
            const rest = R * 0.85;
            if (d > rest) {
              // attraction, fading out with distance → gooey necks
              f =
                LAVA_CFG.cohesion *
                (d - rest) *
                (1 - (d - rest) / (R * 2.4 - rest));
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

        const drag = Math.exp(-LAVA_CFG.viscosity * h);
        for (const b of B) {
          b.heat = Math.min(1, Math.max(0, b.heat));
          b.vx = (b.vx + b.ax * h) * drag;
          b.vy = (b.vy + b.ay * h) * drag;
          b.x += b.vx * h;
          b.y += b.vy * h;

          // glass walls (soft bounce)
          if (b.x < b.r * 0.8) {
            b.x = b.r * 0.8;
            b.vx = Math.abs(b.vx) * 0.3;
          }
          if (b.x > asp - b.r * 0.8) {
            b.x = asp - b.r * 0.8;
            b.vx = -Math.abs(b.vx) * 0.3;
          }
          if (b.y < b.r * 0.4) {
            b.y = b.r * 0.4;
            b.vy = Math.abs(b.vy) * 0.2;
          }
          if (b.y > 1 - b.r * 0.7) {
            b.y = 1 - b.r * 0.7;
            b.vy = -Math.abs(b.vy) * 0.2;
          }

          // stretch tall while moving vertically
          const want = 1 + Math.min(0.38, Math.abs(b.vy) * 3.5);
          b.s += (want - b.s) * Math.min(1, h * 3);
        }
      }

      const BB = this.bufB;
      const SS = this.bufS;
      for (let i = 0; i < n; i++) {
        const b = B[i];
        BB[i * 4] = b.x;
        BB[i * 4 + 1] = b.y;
        BB[i * 4 + 2] = b.r * (1 + 0.05 * Math.sin(this.time * 0.5 + b.seed));
        BB[i * 4 + 3] = b.heat;
        SS[i * 4] = b.s;
      }
      return { uB: BB, uS: SS, uN: { int: n }, uAsp: asp };
    },
  });

  /* ══ 08. SCENE: INK (fluid simulation) ═════════════════════
     A real (simplified) fluid: every mouse movement instantly pushes
     velocity + ink into the fluid, which swirls and diffuses.
     Click the background → burst of ink in a RANDOM color from
     INK_COLORS (15 colors). The color is remembered.
     Anti-glare: new ink REPLACES the old color under the cursor
     instead of piling on top, so hovering / circling for a long time
     never builds up into bright white. Brightness is also capped.
     Ink drops in by itself now and then so it's never empty. */
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

  // Speed: the slider's 1× now equals the old 0.2× (calm, slow ink).
  const INK_SPEED = 0.1;

  // Click the background → a random color from this list.
  // Before the first click the ink uses your theme colors.
  const INK_COLORS = [
    { name: "Neon Green", hex: "#39ff14" },
    { name: "Neon Lime", hex: "#ccff00" },
    { name: "Electric Chartreuse", hex: "#a6ff00" },
    { name: "Neon Mint", hex: "#00ff9f" },
    { name: "Neon Aqua", hex: "#00fff0" },
    { name: "Electric Cyan", hex: "#00e5ff" },
    { name: "Laser Blue", hex: "#1f51ff" },
    { name: "Electric Indigo", hex: "#6f00ff" },
    { name: "Neon Violet", hex: "#b026ff" },
    { name: "Electric Purple", hex: "#bf00ff" },
    { name: "Neon Magenta", hex: "#ff00ff" },
    { name: "Hot Pink", hex: "#ff1493" },
    { name: "Neon Pink", hex: "#ff3cac" },
    { name: "Neon Rose", hex: "#ff0066" },
    { name: "Neon Red", hex: "#ff073a" },
    { name: "Neon Coral", hex: "#ff4f3a" },
    { name: "Neon Orange", hex: "#ff6700" },
    { name: "Neon Tangerine", hex: "#ff9500" },
    { name: "Electric Yellow", hex: "#ffff33" },
    { name: "Neon Gold", hex: "#ffe100" },
  ];

  const INK_LEVEL = 0.75; // how strong the ink color is (lower = darker, softer)

  const InkScene = {
    type: "gl",
    resolution: (eco) => (eco ? 0.6 : 1),
    maxDpr: 1.5,
    setup(e) {
      const gl = e.gl;
      // needs render-to-half-float; test once so we can fall back cleanly
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

      // simulation grid is small (fast); ink texture is large (smooth)
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
    nextColor(scale) {
      // glide through the 3 palette colors
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
    // amount = how much the dye moves toward `color` at the center (0..1)
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
    // click → random new color (never the same twice in a row) + ink burst
    onClick(e, x, y) {
      let next;
      do {
        next = Math.floor(Math.random() * INK_COLORS.length);
      } while (next === this.colorIdx && INK_COLORS.length > 1);
      this.colorIdx = next;
      localStorage.setItem("gx_ink_color", String(next));
      this.applyColor(e);
      if (this.clicks.length < 20) this.clicks.push(x, 1 - y);
      return;
    },
    frame(e, dt, t) {
      const gl = e.gl;
      const P = this.p;
      gl.disable(gl.BLEND);
      const step = Math.min(dt * INK_SPEED, 1 / 30);

      // click bursts: ring of ink shooting outward in the new colors
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

      // every queued mouse movement becomes a push of fluid + ink
      const q = this.queue;
      for (let i = 0; i < q.length; i += 4) {
        const speed = Math.hypot(q[i + 2], q[i + 3]);
        if (speed < 1e-5) continue;
        const strength = Math.min(1, speed * 60);
        // fast moves paint more; slow hovering only tints a little (no glare build-up)
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
          dissipation: 0.35,
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

  /* ══ 09. SCENE: STAR FIELD ═════════════════════════════════
     Slow drift; the cursor steers the view. (unchanged) */
  const StarScene = {
    type: "2d",
    maxDpr: 1,
    resolution: () => 1, // stars need crisp pixels (device pixel ratio is capped at 1)
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

      // Soft nebula glow, drawn tiny then stretched (cheap + smooth)
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

      // Background nebula with a little parallax
      ctx.globalAlpha = 1;
      ctx.drawImage(
        this.nebula,
        -w * par - (p.x - 0.5) * w * par * 2,
        -h * par - (p.y - 0.5) * h * par * 2,
        w * (1 + par * 2),
        h * (1 + par * 2),
      );

      // Vanishing point follows the cursor → feels like steering
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

      // Occasional shooting star
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

  /* ══ 10. SCENE: FIREFLIES ══════════════════════════════════
     Glowing fireflies wander and blink. Near the cursor they
     swarm and orbit around it. Drawn at full resolution. */
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

      // background: dusky night meadow (built once)
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

        // swarm: pull toward the cursor + orbit around it
        const dx = (p.rx - this.fx[i]) * asp;
        const dy = p.ry - this.fy[i];
        const d2 = dx * dx + dy * dy;
        const near = active * Math.exp(-d2 / 0.09);
        if (near > 0.001) {
          const d = Math.sqrt(d2) + 1e-4;
          const ring = (d - 0.07) * 1.6; // settle on a ring around the cursor
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

  /* ══ 10b. SCENE: NEBULA ════════════════════════════════════
     Deep-space gas clouds with dark dust lanes and pixel-sharp
     stars. The view drifts slightly with the cursor (parallax). */
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

  // gentle glow under the cursor
  vec2 dm = p - m;
  col += mix(uC1, vec3(1.0), 0.4) * 0.05 * exp(-dot(dm, dm) * 10.0) * uStrength;

  // pixel-sharp stars (size in real pixels → crisp at any resolution)
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

  /* ══ 10c. SCENE: RIPPLES (water) ═══════════════════════════
     Real wave simulation: your cursor drags through the water and
     leaves ripples that spread, bounce and fade. Raindrops fall
     on their own. Light bends through the surface (refraction),
     with caustics on the pool floor and glints on the waves. */
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

  // Shared check: can this browser render to half-float textures?
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
      // no return value → no floating label for this scene
    },
    onPointer(e, x, y, dx, dy) {
      if (this.queue.length > 60) this.queue.splice(0, 3);
      this.queue.push(x, 1 - y, Math.hypot(dx, dy));
    },
    frame(e, dt, t) {
      const gl = e.gl;
      gl.disable(gl.BLEND);

      // cursor trail → ripples (instant, no smoothing)
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
        const cx = cl[i],
          cy = cl[i + 1];
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

  /* ══ 10d. SCENE: CONSTELLATION ═════════════════════════════
     Floating stars linked by thin lines when they get close.
     Your cursor joins the network: nearby stars connect to it
     and gently gather around it. Full resolution, crisp lines. */
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
      const X = this.x,
        Y = this.y;
      const asp = w / h;
      const link = 0.16; // link distance (fraction of height)
      const mouseOn = p.inside && p.strength > 0.05;
      const mx = p.rx,
        my = p.ry;

      ctx.globalAlpha = 1;
      ctx.drawImage(this.bg, 0, 0);

      // move
      for (let i = 0; i < n; i++) {
        if (mouseOn) {
          const dx = (mx - X[i]) * asp;
          const dy = my - Y[i];
          const d2 = dx * dx + dy * dy;
          if (d2 < 0.06) {
            // gather around the cursor, but keep a little distance
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

      // links between close stars
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
        // link to the cursor
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

      // stars on top
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

  /* ══ 11. ENGINE ════════════════════════════════════════════ */
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

  function computePalette() {
    const base = engine.basePalette.map((hex) =>
      Color.isHex(hex) ? hex : "#3b82f6",
    );
    const mixed = engine.cfg.dayCycle
      ? base.map((hex, i) => Color.mixHex(hex, dayPalette()[i], DAY_MIX))
      : base;
    engine.palette = mixed.map((hex) => Color.hexToRgb(hex));
  }

  // A canvas can only ever have one context type, and GPU memory is only
  // released when its context is lost → give every scene a fresh canvas.
  function releaseContext() {
    if (engine.gl) {
      try {
        engine.gl.getExtension("WEBGL_lose_context")?.loseContext();
      } catch {}
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
        engine.ctxType = null; // context is new; don't swap canvas again
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
    const w = Math.max(1, Math.round(window.innerWidth * s));
    const h = Math.max(1, Math.round(window.innerHeight * s));
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

    // smoothed cursor for gentle scenes (fast enough to feel direct)
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
        // instant hook (Ink): no smoothing, no waiting
        if (engine.raf) engine.scene?.onPointer?.(engine, nx, ny, dx, dy);
      },
      opts,
    );
    // click on the background (not on UI) → scene.onClick (Ink colors)
    window.addEventListener(
      "pointerdown",
      (ev) => {
        if (!engine.raf || !engine.scene?.onClick) return;
        if (ev.button !== 0) return;
        if (ev.target.closest?.(UI_SELECTOR)) return;
        const nx = ev.clientX / window.innerWidth;
        const ny = ev.clientY / window.innerHeight;
        const label = engine.scene.onClick(engine, nx, ny);
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
    document.addEventListener(
      "visibilitychange",
      () => (document.hidden ? stop() : start()),
      opts,
    );
    // Day cycle: recolor once a minute (not per frame)
    engine.dayTimer = setInterval(() => {
      if (!engine.cfg.dayCycle || !engine.scene) return;
      computePalette();
      engine.scene.build(engine);
    }, 60000);
  }

  // clicks on these never count as "background" clicks
  const UI_SELECTOR =
    "a, button, input, textarea, select, label, dialog, [role='button'], .glass-card, .glass-sidebar, #settings-sidebar, #menu-btn, #modal-backdrop, .search-form, .bookmark-item, .task-item";

  // tiny floating label (e.g. "Warm") where you clicked
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
    void toastEl.offsetWidth; // restart animation
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

  /* ══ 12. PUBLIC API ════════════════════════════════════════ */
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
