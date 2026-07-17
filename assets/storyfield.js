/* storyfield — scroll-driven particle story engine (WebGL2, zero deps)
 * Ядро неизменно; контент/палитра/формы приходят конфигом. Рескин = новый конфиг.
 *
 * const field = await createStoryField(canvas, config, { onProgress, onFrame });
 * config = {
 *   bg: '#050507',
 *   particles: { count: 24000, size: 1.0, glow: 1.0, dprCap: 2 },
 *   shapes: { id: { type:'galaxy'|'cloud'|'sphere'|'ring'|'wave'|'text', ...params } },
 *   chapters: [ { shape:'id', color:'#hex', spin: 0.05 }, ... ]
 * }
 * field.setTarget(f)  — позиция таймлайна в главах (0..chapters-1), сглаживание внутри
 * field.destroy()
 */

const TILE = 256;

/* ---------- seeded PRNG (детерминизм форм) ---------- */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function gauss(rnd) {
  const u = Math.max(rnd(), 1e-9), v = rnd();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
function rotX(p, i, a) {
  const c = Math.cos(a), s = Math.sin(a);
  const y = p[i + 1], z = p[i + 2];
  p[i + 1] = y * c - z * s; p[i + 2] = y * s + z * c;
}

/* ---------- реестр форм: каждая отдаёт РОВНО N позиций ---------- */
const SHAPES = {
  galaxy(N, o, rnd) {
    const p = new Float32Array(N * 3);
    const arms = o.arms || 3, R = o.radius || 1.15, twist = o.twist || 2.3, tilt = o.tilt ?? -0.5;
    const bulge = Math.floor(N * 0.14);
    for (let i = 0; i < N; i++) {
      let x, y, z;
      if (i < bulge) {
        const r = Math.abs(gauss(rnd)) * 0.13;
        x = gauss(rnd) * r; y = gauss(rnd) * r * 0.6; z = gauss(rnd) * r;
      } else {
        const r = Math.pow(rnd(), 0.62) * R;
        const arm = i % arms;
        const th = arm * (2 * Math.PI / arms) + r * twist + gauss(rnd) * (0.42 - 0.24 * r / R);
        x = Math.cos(th) * r; z = Math.sin(th) * r;
        y = gauss(rnd) * 0.05 * (1.25 - r / R);
      }
      p[i * 3] = x; p[i * 3 + 1] = y; p[i * 3 + 2] = z;
      rotX(p, i * 3, tilt);
    }
    return p;
  },
  cloud(N, o, rnd) {
    const p = new Float32Array(N * 3);
    const sx = o.sx || 0.62, sy = o.sy || 0.42, sz = o.sz || 0.5;
    for (let i = 0; i < N; i++) {
      p[i * 3] = gauss(rnd) * sx; p[i * 3 + 1] = gauss(rnd) * sy; p[i * 3 + 2] = gauss(rnd) * sz;
    }
    return p;
  },
  sphere(N, o, rnd) {
    const p = new Float32Array(N * 3);
    const R = o.radius || 0.92, GA = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < N; i++) {
      const y = 1 - (2 * i + 1) / N;
      const r = Math.sqrt(Math.max(0, 1 - y * y));
      const th = GA * i;
      const j = 1 + (rnd() - 0.5) * 0.06;
      p[i * 3] = Math.cos(th) * r * R * j;
      p[i * 3 + 1] = y * R * j;
      p[i * 3 + 2] = Math.sin(th) * r * R * j;
    }
    return p;
  },
  ring(N, o, rnd) {
    const p = new Float32Array(N * 3);
    const R = o.radius || 0.86, r0 = o.tube || 0.15, tilt = o.tilt ?? -0.45;
    for (let i = 0; i < N; i++) {
      const th = (i / N) * 2 * Math.PI + rnd() * 0.02;
      const ph = rnd() * 2 * Math.PI;
      const rr = r0 * Math.sqrt(rnd());
      const cx = R + Math.cos(ph) * rr;
      p[i * 3] = Math.cos(th) * cx;
      p[i * 3 + 1] = Math.sin(ph) * rr * 1.15;
      p[i * 3 + 2] = Math.sin(th) * cx;
      rotX(p, i * 3, tilt);
    }
    return p;
  },
  wave(N, o, rnd) {
    const p = new Float32Array(N * 3);
    const W = o.width || 1.55, D = o.depth || 0.75;
    const cols = Math.ceil(Math.sqrt(N * (W / D)));
    const rows = Math.ceil(N / cols);
    for (let i = 0; i < N; i++) {
      const cx = (i % cols) / (cols - 1), cz = Math.floor(i / cols) / (rows - 1);
      const x = (cx - 0.5) * 2 * W + (rnd() - 0.5) * 0.02;
      const z = (cz - 0.5) * 2 * D + (rnd() - 0.5) * 0.02;
      p[i * 3] = x;
      p[i * 3 + 1] = Math.sin(x * 3.4 + z * 1.8) * 0.2 + Math.sin(x * 8.1) * 0.05 - 0.1;
      p[i * 3 + 2] = z;
    }
    return p;
  },
  /* сэмплинг глифов с offscreen 2D canvas; шрифт должен быть загружен до вызова */
  text(N, o, rnd) {
    const cnv = SHAPES._textCanvas || (SHAPES._textCanvas = document.createElement('canvas'));
    const W = 640, H = 224;
    cnv.width = W; cnv.height = H;
    const ctx = cnv.getContext('2d', { willReadFrequently: true });
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    let px = o.px || 150;
    ctx.font = `${o.weight || 800} ${px}px ${o.font || 'sans-serif'}`;
    while (ctx.measureText(o.text).width > W * 0.94 && px > 20) {
      px -= 6;
      ctx.font = `${o.weight || 800} ${px}px ${o.font || 'sans-serif'}`;
    }
    ctx.fillText(o.text, W / 2, H / 2);
    const img = ctx.getImageData(0, 0, W, H).data;
    const lit = [];
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++)
        if (img[(y * W + x) * 4 + 3] > 128) lit.push(x, y);
    const M = lit.length / 2;
    const p = new Float32Array(N * 3);
    if (!M) return p;
    const scale = (o.width || 2.3) / W;
    for (let i = 0; i < N; i++) {
      const k = i < M ? i : Math.floor(rnd() * M);
      const x = lit[k * 2] + rnd() - 0.5, y = lit[k * 2 + 1] + rnd() - 0.5;
      p[i * 3] = (x - W / 2) * scale;
      p[i * 3 + 1] = -(y - H / 2) * scale;
      p[i * 3 + 2] = (rnd() - 0.5) * 0.08;
    }
    /* перемешивание, чтобы адаптивное урезание count рисовало равномерное подмножество */
    for (let i = N - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      for (let c = 0; c < 3; c++) {
        const t = p[i * 3 + c]; p[i * 3 + c] = p[j * 3 + c]; p[j * 3 + c] = t;
      }
    }
    return p;
  },
};

/* ---------- шейдеры ---------- */
const VERT = `#version 300 es
precision highp float;
uniform highp sampler2D uTargets;
uniform int uRows, uIdxA, uIdxB;
uniform float uProgress, uTime, uSpinA, uSpinB;
uniform float uScatter, uTurb, uMotion, uWorldScale, uPointScale, uSizeMul, uDist;
uniform mat4 uProj;
uniform vec3 uColA, uColB;
out vec3 vColor;

float hash11(float p){ p = fract(p*.1031); p *= p+33.33; p *= p+p; return fract(p); }
vec3 hash31(float p){
  vec3 p3 = fract(vec3(p)*vec3(.1031,.1030,.0973));
  p3 += dot(p3, p3.yzx+33.33);
  return fract((p3.xxy+p3.yzz)*p3.zyx);
}
vec3 spin(vec3 v, float a){
  float c = cos(a), s = sin(a);
  return vec3(v.x*c - v.z*s, v.y, v.x*s + v.z*c);
}
void main(){
  int vid = gl_VertexID;
  float fid = float(vid);
  ivec2 uv = ivec2(vid & ${TILE - 1}, vid >> 8);
  vec3 A = texelFetch(uTargets, uv + ivec2(0, uIdxA*uRows), 0).xyz;
  vec3 B = texelFetch(uTargets, uv + ivec2(0, uIdxB*uRows), 0).xyz;
  A = spin(A, uTime*uSpinA);
  B = spin(B, uTime*uSpinB);

  float h = hash11(fid*.123 + 7.7);
  float sw = .22;
  float t = clamp((uProgress - h*sw) / (1. - sw), 0., 1.);
  t = t*t*(3. - 2.*t);
  float env = sin(t*3.14159265);

  vec3 pos = mix(A, B, t);
  vec3 dir = normalize(hash31(fid)*2. - 1.);
  pos += dir * (.25 + .55*hash11(fid + 3.1)) * env * uScatter;
  pos += vec3(
    sin(pos.y*2.9 + uTime*.5  + h*6.283),
    sin(pos.z*2.5 + uTime*.42 + h*4.),
    sin(pos.x*3.1 + uTime*.36)
  ) * (env*uTurb + .012*uMotion);

  vec3 wp = pos * uWorldScale;
  vec4 mv = vec4(wp.xy, wp.z - uDist, 1.);
  gl_Position = uProj * mv;
  float size = uSizeMul * (.55 + .9*hash11(fid + 9.4));
  gl_PointSize = clamp(size * uPointScale / -mv.z, 1., 48.);
  vColor = mix(uColA, uColB, t) * (.72 + .5*hash11(fid + 5.2));
}`;

const FRAG = `#version 300 es
precision mediump float;
in vec3 vColor;
uniform float uGlow;
out vec4 o;
void main(){
  vec2 c = gl_PointCoord - .5;
  float a = max(0., 1. - dot(c,c)*4.);
  a *= a;
  o = vec4(vColor * (a * uGlow), 1.);
}`;

/* ---------- утилиты GL ---------- */
function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
    throw new Error('storyfield shader: ' + gl.getShaderInfoLog(s));
  return s;
}
function hex2rgb(h) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
}
function perspective(fovY, aspect, near, far) {
  const f = 1 / Math.tan(fovY / 2), nf = 1 / (near - far);
  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) * nf, -1,
    0, 0, 2 * far * near * nf, 0,
  ]);
}

const FOV = 34 * Math.PI / 180;
const DIST = 4.2;
/* тиры деградации: rolling-median dt решает, где мы */
const TIERS = [
  { dpr: 2, mult: 1 },
  { dpr: 1.5, mult: 1 },
  { dpr: 1.5, mult: 0.7 },
  { dpr: 1.25, mult: 0.5 },
];

export async function createStoryField(canvas, config, hooks = {}) {
  const gl = canvas.getContext('webgl2', {
    antialias: false, alpha: false, preserveDrawingBuffer: false,
    powerPreference: 'high-performance',
  });
  if (!gl) return null;

  const N = config.particles?.count || 24000;
  const rows = Math.ceil(N / TILE);
  const chapters = config.chapters;
  const shapeIds = Object.keys(config.shapes);

  /* --- формы -> RGBA32F атлас; с yield'ами между формами (прелоадер без фризов) --- */
  const atlas = new Float32Array(TILE * rows * shapeIds.length * 4);
  const rnd = mulberry32(config.seed || 20260717);
  for (let k = 0; k < shapeIds.length; k++) {
    const def = config.shapes[shapeIds[k]];
    const pos = SHAPES[def.type](N, def, rnd);
    const [ox, oy, oz] = def.offset || [0, 0, 0];
    const base = TILE * rows * 4 * k;
    for (let i = 0; i < N; i++) {
      atlas[base + i * 4] = pos[i * 3] + ox;
      atlas[base + i * 4 + 1] = pos[i * 3 + 1] + oy;
      atlas[base + i * 4 + 2] = pos[i * 3 + 2] + oz;
      atlas[base + i * 4 + 3] = 1;
    }
    hooks.onProgress?.((k + 1) / shapeIds.length);
    await new Promise(r => requestAnimationFrame(r));
  }

  const reducedMq = matchMedia('(prefers-reduced-motion: reduce)');
  const coarse = matchMedia('(pointer: coarse)').matches;
  const dprCap = config.particles?.dprCap ?? 2;

  const state = {
    tier: (devicePixelRatio >= 3 || coarse) ? 1 : 0,
    startTier: 0,
    target: 0, f: 0,
    rawScroll: 0,
    running: true, dead: false,
    dtHist: [], frames: 0, calmUp: 0,
    last: performance.now(),
  };
  state.startTier = state.tier;

  let prog, vao, tex, u = {};

  function buildGL() {
    prog = gl.createProgram();
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS))
      throw new Error('storyfield link: ' + gl.getProgramInfoLog(prog));
    gl.useProgram(prog);
    for (const name of ['uTargets','uRows','uIdxA','uIdxB','uProgress','uTime','uSpinA','uSpinB',
      'uScatter','uTurb','uMotion','uWorldScale','uPointScale','uSizeMul','uDist','uProj','uColA','uColB','uGlow'])
      u[name] = gl.getUniformLocation(prog, name);

    vao = gl.createVertexArray();          /* attribute-less: пустой VAO обязателен */
    gl.bindVertexArray(vao);

    tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, TILE, rows * shapeIds.length, 0, gl.RGBA, gl.FLOAT, atlas);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    const [br, bg2, bb] = hex2rgb(config.bg || '#050507');
    gl.clearColor(br, bg2, bb, 1);
    gl.uniform1i(u.uTargets, 0);
    gl.uniform1i(u.uRows, rows);
    gl.uniform1f(u.uDist, DIST);
  }

  let W = 0, H = 0;
  function resize(force) {
    const dpr = Math.min(devicePixelRatio || 1, dprCap, TIERS[state.tier].dpr);
    const w = Math.round(canvas.clientWidth * dpr), h = Math.round(canvas.clientHeight * dpr);
    if (!force && Math.abs(w - W) < 40 * dpr && Math.abs(h - H) < 40 * dpr) return; /* адресная строка iOS дёргает viewport */
    if (!w || !h) return;
    W = w; H = h;
    canvas.width = w; canvas.height = h;
    gl.viewport(0, 0, w, h);
    const aspect = w / h;
    gl.uniformMatrix4fv(u.uProj, false, perspective(FOV, aspect, 0.1, 30));
    gl.uniform1f(u.uWorldScale, Math.min(Math.max(aspect * 1.25, 0.62), 1.0));
    gl.uniform1f(u.uPointScale, h * 0.5 / Math.tan(FOV / 2));
  }

  function adaptPerf(dtMs) {
    state.dtHist.push(dtMs);
    if (state.dtHist.length < 50) return;
    const med = state.dtHist.slice().sort((a, b) => a - b)[25];
    state.dtHist.length = 0;
    if (med > 20 && state.tier < TIERS.length - 1) {
      state.tier++; state.calmUp = 0; resize(true);
    } else if (med < 12.5 && state.tier > state.startTier) {
      if (++state.calmUp >= 2) { state.tier--; state.calmUp = 0; resize(true); }
    }
  }

  const colCache = chapters.map(c => hex2rgb(c.color));
  const shapeIndex = chapters.map(c => shapeIds.indexOf(c.shape));

  function frame(now) {
    if (state.dead) return;
    if (!state.running) { state.last = now; requestAnimationFrame(frame); return; }
    if (!W) resize(true); /* канвас мог быть display:none при init (clientWidth=0) — самолечение */
    if (!W) { state.last = now; requestAnimationFrame(frame); return; }
    const dtMs = now - state.last;
    const dt = Math.min(Math.max(dtMs / 1000, 1 / 120), 1 / 30);
    state.last = now;

    const reduced = reducedMq.matches;
    const target = reduced ? Math.round(state.target) : state.target;
    state.f += (target - state.f) * (1 - Math.exp(-8 * dt));

    const iA = Math.min(Math.floor(state.f), chapters.length - 1);
    const iB = Math.min(iA + 1, chapters.length - 1);
    const p = state.f - iA;

    gl.useProgram(prog);
    gl.bindVertexArray(vao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(u.uIdxA, shapeIndex[iA]);
    gl.uniform1i(u.uIdxB, shapeIndex[iB]);
    gl.uniform1f(u.uProgress, p);
    gl.uniform1f(u.uTime, now * 0.001);
    gl.uniform1f(u.uSpinA, reduced ? 0 : (chapters[iA].spin || 0));
    gl.uniform1f(u.uSpinB, reduced ? 0 : (chapters[iB].spin || 0));
    gl.uniform1f(u.uScatter, reduced ? 0 : (config.particles?.scatter ?? 0.9));
    gl.uniform1f(u.uTurb, reduced ? 0 : (config.particles?.turb ?? 0.05));
    gl.uniform1f(u.uMotion, reduced ? 0 : 1);
    gl.uniform1f(u.uSizeMul, (config.particles?.size ?? 1) * 0.0085);
    gl.uniform1f(u.uGlow, (config.particles?.glow ?? 1) * 0.85);
    gl.uniform3fv(u.uColA, colCache[iA]);
    gl.uniform3fv(u.uColB, colCache[iB]);

    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.POINTS, 0, Math.floor(N * TIERS[state.tier].mult));

    hooks.onFrame?.(state.f);
    adaptPerf(dtMs);
    requestAnimationFrame(frame);
  }

  /* --- устойчивость --- */
  const onLost = e => { e.preventDefault(); state.running = false; };
  const onRestored = () => { buildGL(); resize(true); state.running = !document.hidden; };
  canvas.addEventListener('webglcontextlost', onLost);
  canvas.addEventListener('webglcontextrestored', onRestored);
  const onVis = () => { state.running = !document.hidden; };
  document.addEventListener('visibilitychange', onVis);
  let rzT;
  const onRz = () => { clearTimeout(rzT); rzT = setTimeout(() => resize(false), 180); };
  addEventListener('resize', onRz);
  visualViewport?.addEventListener('resize', onRz);

  buildGL();
  resize(true);
  requestAnimationFrame(frame);

  return {
    setTarget(f) { state.target = Math.min(Math.max(f, 0), chapters.length - 1); },
    get reduced() { return reducedMq.matches; },
    destroy() {
      state.dead = true;
      canvas.removeEventListener('webglcontextlost', onLost);
      canvas.removeEventListener('webglcontextrestored', onRestored);
      document.removeEventListener('visibilitychange', onVis);
      removeEventListener('resize', onRz);
      visualViewport?.removeEventListener('resize', onRz);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    },
  };
}
