// Living Octopus 3D - decorative store-hero mascot. Separate from the sellable Living Mascot
// engine (mascot.min.js / mascot/mascot.esm.js) - this is a store-only illustration, not a
// product. Real WebGL 3D (three.js): low-res render buffer + nearest-neighbor upscale for the
// "pixelated but volumetric" look, toon (cel) shading with a hard-stepped gradient map,
// inverted-hull outlines, spring-physics drag (critically-damped spring, frame-rate
// independent). The emotion system (idle mood pool, click escalation, sleep-on-idle, blink,
// wander) is a direct port of the sold Living Mascot engine's behavior model
// (living-mascot/src/mascot.js IDLE_POOL/click()/loop()), re-expressed for a 3D rigged-by-
// groups octopus instead of the ghost's 2D profile mesh - same personality, different body.
import * as THREE from './vendor/three.module.min.js';

export function createOctopus3D(canvas, opts) {
  opts = opts || {};
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var PAL = Object.assign({
    light: 0xffb87a,
    mid: 0xe8813f,
    shade: 0xb85a24,
    belly: 0xffe0ad,
    eyeDark: 0x1c0e06,
    outline: 0x140900,
    rim: 0xff9a5c,
    anger: 0xff5a3c,
    blush: 0xff9d8a,
  }, opts.colors ? opts.colors() : {});

  var PIXEL_SCALE = 4.2; // CSS px per rendered "pixel" - the chunky pixel-art grid size

  var renderer = new THREE.WebGLRenderer({ canvas: canvas, alpha: true, antialias: true });
  renderer.setPixelRatio(1); // fixed grid: pixel-block size stays consistent across devices
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  canvas.style.imageRendering = 'pixelated';

  var scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
  camera.position.set(0, 0.15, 9);
  camera.lookAt(0, 0, 0);

  // warm, moody lighting to match the reference: soft fill + a warm key + a coral rim
  scene.add(new THREE.HemisphereLight(0x55402c, 0x120a06, 0.6));
  var key = new THREE.DirectionalLight(0xffd9ad, 1.9);
  key.position.set(-3.5, 4, 4);
  scene.add(key);
  var rim = new THREE.PointLight(PAL.rim, 1.1, 14);
  rim.position.set(2.5, 1.5, -3);
  scene.add(rim);
  var fill = new THREE.PointLight(0xff8a4a, 0.4, 12);
  fill.position.set(-2, -1.5, 2);
  scene.add(fill);

  var root = new THREE.Group();
  scene.add(root);

  // hard 4-step gradient LUT for the N.L term - what turns smooth PBR shading into flat
  // cel/toon bands (generic toon-shader technique, not specific to this asset)
  var gradientMap = (function () {
    var c = document.createElement('canvas');
    c.width = 4; c.height = 1;
    var ctx = c.getContext('2d');
    [40, 120, 190, 255].forEach(function (v, i) {
      ctx.fillStyle = 'rgb(' + v + ',' + v + ',' + v + ')';
      ctx.fillRect(i, 0, 1, 1);
    });
    var tex = new THREE.CanvasTexture(c);
    tex.minFilter = THREE.NearestFilter;
    tex.magFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    return tex;
  })();
  function toonMat(color) { return new THREE.MeshToonMaterial({ color: color, gradientMap: gradientMap }); }
  function makeSprite(glyph, color) {
    var c = document.createElement('canvas');
    c.width = 64; c.height = 64;
    var ctx = c.getContext('2d');
    ctx.font = '900 46px "JetBrains Mono", monospace';
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(glyph, 32, 36);
    var tex = new THREE.CanvasTexture(c);
    tex.minFilter = THREE.NearestFilter;
    tex.magFilter = THREE.NearestFilter;
    var mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, opacity: 0 });
    var spr = new THREE.Sprite(mat);
    spr.scale.setScalar(0.5);
    spr.visible = false;
    scene.add(spr);
    return spr;
  }

  var headBaseColor = new THREE.Color(PAL.mid), legBaseColor = new THREE.Color(PAL.shade);
  var angerColor = new THREE.Color(PAL.anger);
  var headMat = toonMat(PAL.mid);
  var bellyMat = toonMat(PAL.belly);
  var legMat = toonMat(PAL.shade);
  var eyeWhiteMat = toonMat(0xfff6ea);
  var eyeDarkMat = new THREE.MeshBasicMaterial({ color: PAL.eyeDark });
  var outlineMat = new THREE.MeshBasicMaterial({ color: PAL.outline, side: THREE.BackSide });
  var blushMat = new THREE.MeshBasicMaterial({ color: PAL.blush, transparent: true, opacity: 0, depthWrite: false });

  function addOutline(mesh, scale) {
    var o = new THREE.Mesh(mesh.geometry, outlineMat);
    o.scale.setScalar(scale);
    mesh.add(o);
    return o;
  }

  // body scale tuned to occupy the same frame-fill as the sold Living Mascot ghost demo
  // (measured empirically: ghost ~56% of canvas height, ~28% width, centered slightly below
  // middle) - k applied uniformly to every body dimension below, margins stay proportional.
  var HEAD_R = 0.975;
  var head = new THREE.Mesh(new THREE.SphereGeometry(HEAD_R, 28, 20), headMat);
  root.add(head);
  addOutline(head, 1.13);

  var belly = new THREE.Mesh(new THREE.SphereGeometry(HEAD_R * 0.44, 16, 12), bellyMat);
  belly.position.set(0, -HEAD_R * 0.36, HEAD_R * 0.82);
  belly.scale.set(1, 0.72, 0.5);
  root.add(belly);
  addOutline(belly, 1.22);

  var blushGeo = new THREE.CircleGeometry(HEAD_R * 0.16, 12);
  var blushes = [-1, 1].map(function (s) {
    var m = new THREE.Mesh(blushGeo, blushMat);
    m.position.set(s * HEAD_R * 0.56, -HEAD_R * 0.05, HEAD_R * 0.9);
    m.scale.setScalar(0.001);
    head.add(m);
    return m;
  });

  // eyes - small pupil group offset toward the look target each frame
  var eyes = [];
  [-1, 1].forEach(function (s) {
    var g = new THREE.Group();
    var w = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), eyeWhiteMat);
    g.add(w);
    addOutline(w, 1.34);
    var p = new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 6), eyeDarkMat);
    p.position.z = 0.13;
    g.add(p);
    g.position.set(s * 0.5, HEAD_R * 0.08, HEAD_R * 0.92);
    g.userData.pupil = p;
    g.userData.white = w;
    root.add(g);
    eyes.push(g);
  });
  var winkSide = 0;

  // tentacles - segment chains hanging under the head; each segment is a child group of the
  // previous one so a sine wave applied down the chain reads as an organic wave, cheap to
  // animate (rotate a few groups per frame, no geometry rebuild)
  var LEGS = 6, SEGMENTS = 5, SEG_LEN = 0.245, SEG_R0 = 0.173;
  var legs = [];
  for (var i = 0; i < LEGS; i++) {
    var u = (i + 0.5) / LEGS - 0.5; // -0.5..0.5
    var base = new THREE.Group();
    base.position.set(u * HEAD_R * 1.5, -HEAD_R * 0.62, Math.sqrt(Math.max(0, HEAD_R * HEAD_R * 0.55 - u * u * HEAD_R * HEAD_R * 2.2)));
    root.add(base);
    var parent = base;
    var chain = [];
    for (var s = 0; s < SEGMENTS; s++) {
      var r = SEG_R0 * (1 - s / SEGMENTS * 0.55);
      var seg = new THREE.Group();
      seg.position.y = s === 0 ? 0 : -SEG_LEN;
      var mesh = new THREE.Mesh(new THREE.CapsuleGeometry(r, SEG_LEN * 0.82, 4, 8), legMat);
      mesh.position.y = -SEG_LEN / 2;
      seg.add(mesh);
      addOutline(mesh, 1.32);
      parent.add(seg);
      parent = seg;
      chain.push(seg);
    }
    legs.push({ chain: chain, phase: Math.random() * Math.PI * 2, side: u });
  }

  // soft contact shadow (flat, cheap - not real shadow mapping for a decorative widget)
  var shadowMat = new THREE.MeshBasicMaterial({ color: 0x0c0602, transparent: true, opacity: 0.34 });
  var shadow = new THREE.Mesh(new THREE.CircleGeometry(1.15, 16), shadowMat);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = -2.55;
  scene.add(shadow);

  var zSprite = makeSprite('z', '#fff2df');
  var angerSprite = makeSprite('!', '#ff5a3c');

  // ink bubbles - the "flower" idle-mood equivalent from the ghost, reinterpreted for an
  // octopus: a small burst of bubbles instead of a flower, same idle-pool slot/weight.
  var bubbles = [];
  var bubbleGeo = new THREE.SphereGeometry(1, 8, 6);
  function spawnBubbles(t) {
    for (var n = 0; n < 5; n++) {
      var mat = new THREE.MeshBasicMaterial({ color: 0xcdeeff, transparent: true, opacity: 0.7 });
      var m = new THREE.Mesh(bubbleGeo, mat);
      var a = Math.random() * Math.PI * 2;
      m.position.copy(root.position);
      m.position.y += HEAD_R * 0.3;
      m.position.z += HEAD_R * 0.8;
      m.userData.vx = Math.cos(a) * (0.008 + Math.random() * 0.006);
      m.userData.vy = 0.014 + Math.random() * 0.012;
      m.userData.born = t;
      m.userData.life = 1100 + Math.random() * 500;
      m.scale.setScalar(0.05 + Math.random() * 0.06);
      scene.add(m);
      bubbles.push(m);
    }
  }

  // --- emotion system (ported behavior model from the sold ghost engine, re-tuned for this
  // body): weighted idle-mood pool, click escalation (melt -> surprise -> angry), sleep after
  // sustained inactivity, blink cycle, idle eye-wander and body drift.
  var DUR = { wink: 750, lookAround: 1700, bounce: 950, blush: 2400, turn: 2100, flip: 1300,
    melt: 1900, bubble: 1800, yawn: 1900, surprise: 750, angry: 2600 };
  var IDLE_POOL = [['wink', 2.3], ['lookAround', 3], ['bounce', 2], ['blush', 2], ['turn', 1.6],
    ['flip', 1], ['melt', 0.7], ['bubble', 0.9], ['yawn', 1.3]];
  var IDLE_TOTAL = IDLE_POOL.reduce(function (s, e) { return s + e[1]; }, 0);
  var JUMP = HEAD_R * 0.55, HOP = HEAD_R * 0.22;
  var SLEEP_AFTER = 30000, SLEEP_IN = 1200;

  var emote = null, nextIdle = 4000 + Math.random() * 6000;
  var lastPointer = performance.now();
  var sleeping = false, sleepSince = 0;
  var lastBlink = 0, nextBlink = 2200 + Math.random() * 3800, blinkUntil = 0;
  var wanderT = 0, wanderX = 0, wanderY = -0.2, wanderTX = 0, wanderTY = -0.2;
  var driftT = 1400, driftX = 0, driftY = 0, driftTX = 0, driftTY = 0;
  var wHappy = 0, wAngry = 0, wWide = 0, wBlush = 0, angryUntil = 0, angryHeat = 0;
  var clicks = [];

  function env(p) { return Math.sin(Math.PI * Math.min(1, Math.max(0, p))); }
  function easeIO(p) { return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2; }

  function startEmote(name, t) {
    emote = { name: name, t0: t, dur: DUR[name] || 1000 };
    if (name === 'wink') winkSide = Math.random() < 0.5 ? 0 : 1;
    if (name === 'angry') angryUntil = t + DUR.angry;
    if (name === 'bubble') spawnBubbles(t);
  }
  function wake(t) { if (sleeping) { sleeping = false; startEmote('bounce', t); } }
  function click(t) {
    clicks.push(t);
    clicks = clicks.filter(function (c) { return t - c < 2200; });
    if ((emote && emote.name === 'angry' && angryUntil > t) || clicks.length >= 5) {
      angryHeat = Math.min(3, angryHeat + 1);
      if (emote && emote.name === 'angry') angryUntil = Math.min(t + 2600, emote.t0 + 9000);
      else startEmote('angry', t);
    } else if (clicks.length >= 3) {
      startEmote('surprise', t);
    } else {
      startEmote('melt', t);
    }
  }

  // --- spring-physics drag: critically-damped spring pulls the character back to `home`
  // after release, with a couple of settling bounces - real position/velocity integration,
  // stepped with a delta-time factor so the feel is identical on a 60Hz and a 120Hz screen.
  var home = new THREE.Vector3(0, 0.05, 0);
  var pos = home.clone();
  var vel = new THREE.Vector3();
  var dragging = false, dragTarget = new THREE.Vector3();
  var downPos = null, downT = 0, moved = false;
  var pointerNDC = new THREE.Vector2(0, -0.4);
  var lookX = 0, lookY = -0.15;
  var raycaster = new THREE.Raycaster();
  var dragPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  var STIFFNESS = 0.10, DAMPING = 0.82;

  function boundsAt(z) {
    var dist = camera.position.z - z;
    var vh = 2 * Math.tan((camera.fov * Math.PI / 180) / 2) * dist;
    var vw = vh * camera.aspect;
    var marginX = HEAD_R * 1.58, marginTop = HEAD_R * 1.68, marginBottom = HEAD_R * 0.65 + SEGMENTS * SEG_LEN + 0.4;
    return {
      minX: -vw / 2 + marginX, maxX: vw / 2 - marginX,
      minY: -vh / 2 + marginBottom, maxY: vh / 2 - marginTop,
    };
  }

  function pointerToWorld(clientX, clientY) {
    var r = canvas.getBoundingClientRect();
    pointerNDC.x = ((clientX - r.left) / r.width) * 2 - 1;
    pointerNDC.y = -((clientY - r.top) / r.height) * 2 + 1;
    raycaster.setFromCamera(pointerNDC, camera);
    var out = new THREE.Vector3();
    raycaster.ray.intersectPlane(dragPlane, out);
    return out || new THREE.Vector3();
  }

  function onDown(e) {
    var w = pointerToWorld(e.clientX, e.clientY);
    if (w.distanceTo(pos) <= HEAD_R * 1.6) {
      dragging = true;
      dragTarget.copy(pos);
      downPos = { x: e.clientX, y: e.clientY };
      downT = performance.now();
      moved = false;
    } else {
      bumpReact();
    }
  }
  var reactT = 0;
  function bumpReact() { reactT = 1; vel.y += 0.05; }

  function onMoveWindow(e) {
    lastPointer = performance.now();
    if (sleeping) wake(lastPointer);
    var w = pointerToWorld(e.clientX, e.clientY);
    lookX = THREE.MathUtils.clamp((e.clientX - (canvas.getBoundingClientRect().left + canvas.getBoundingClientRect().width / 2)) / 220, -1, 1);
    lookY = THREE.MathUtils.clamp(-(e.clientY - (canvas.getBoundingClientRect().top + canvas.getBoundingClientRect().height / 2)) / 220, -1, 1);
    if (!dragging) return;
    if (downPos && (Math.abs(e.clientX - downPos.x) > 6 || Math.abs(e.clientY - downPos.y) > 6)) moved = true;
    var b = boundsAt(0);
    dragTarget.set(THREE.MathUtils.clamp(w.x, b.minX, b.maxX), THREE.MathUtils.clamp(w.y, b.minY, b.maxY), 0);
  }
  function onUp() {
    if (dragging) {
      dragging = false;
      var t = performance.now();
      if (!moved && t - downT < 400) click(t);
      bumpReact();
      downPos = null;
    }
  }
  canvas.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMoveWindow, { passive: true });
  window.addEventListener('pointerup', onUp);
  canvas.style.touchAction = 'none';
  canvas.style.cursor = 'grab';

  function resize() {
    var w = canvas.clientWidth || canvas.width, h = canvas.clientHeight || canvas.height;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    var rw = Math.max(1, Math.round(w / PIXEL_SCALE));
    var rh = Math.max(1, Math.round(h / PIXEL_SCALE));
    renderer.setSize(rw, rh, false);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
  }
  resize();
  window.addEventListener('resize', resize);

  var visible = true;
  var io = new IntersectionObserver(function (es) { visible = es[0].isIntersecting; });
  io.observe(canvas);

  var raf = 0, destroyed = false, lastT = 0;
  function tick(t) {
    raf = 0;
    if (destroyed) return;
    if (!visible || document.hidden) { lastT = 0; raf = requestAnimationFrame(tick); return; }

    var dt = lastT ? THREE.MathUtils.clamp((t - lastT) / 16.6667, 0, 4) : 1;
    lastT = t;

    if (!reduced) {
      // blink cycle (suppressed by sleep/wink/surprise, handled in the eye pass below)
      if (t - lastBlink > nextBlink) { blinkUntil = t + 140; lastBlink = t; nextBlink = 2200 + Math.random() * 3800; }
      // idle eye-wander once the pointer has been still for a while
      if (t - lastPointer > 4000) {
        wanderT -= 16.7 * dt;
        if (wanderT <= 0) {
          wanderT = 1800 + Math.random() * 2600;
          wanderTX = (Math.random() - 0.5) * 1.3; wanderTY = -0.25 + Math.random() * 0.55;
        }
        wanderX += (wanderTX - wanderX) * 0.02 * dt; wanderY += (wanderTY - wanderY) * 0.02 * dt;
      }
      // idle body drift so it doesn't stand dead-still
      driftT -= 16.7 * dt;
      if (driftT <= 0) {
        driftT = 3200 + Math.random() * 4300;
        driftTX = (Math.random() - 0.5) * 0.42; driftTY = (Math.random() - 0.5) * 0.22;
      }
      driftX += (driftTX - driftX) * 0.009 * dt; driftY += (driftTY - driftY) * 0.009 * dt;

      if (!sleeping && !emote && !dragging && t - lastPointer > SLEEP_AFTER) { sleeping = true; sleepSince = t; }
      if (!sleeping && !emote && !dragging && t > nextIdle) {
        var r = Math.random() * IDLE_TOTAL;
        for (var pi = 0; pi < IDLE_POOL.length; pi++) { r -= IDLE_POOL[pi][1]; if (r <= 0) { startEmote(IDLE_POOL[pi][0], t); break; } }
        nextIdle = t + 6000 + Math.random() * 9000;
      }
      if (angryHeat > 0 && t > angryUntil) angryHeat = 0;
    }

    var sleepK = sleeping ? THREE.MathUtils.clamp((t - sleepSince) / SLEEP_IN, 0, 1) : 0;
    var homeX = home.x + (sleeping ? 0 : driftX), homeY = home.y + (sleeping ? 0 : driftY);

    if (dragging) {
      pos.lerp(dragTarget, 1 - Math.pow(1 - 0.32, dt));
      vel.set(0, 0, 0);
    } else if (!reduced) {
      // critically-damped spring back to home - real position/velocity integration, dt-scaled
      var ax = (homeX - pos.x) * STIFFNESS;
      var ay = (homeY - pos.y) * STIFFNESS;
      var damp = Math.pow(DAMPING, dt);
      vel.x = (vel.x + ax * dt) * damp;
      vel.y = (vel.y + ay * dt) * damp;
      pos.x += vel.x * dt; pos.y += vel.y * dt;
    }

    var name = null, p = 0;
    if (emote) {
      p = (t - emote.t0) / emote.dur;
      if (emote.name === 'angry' && angryUntil > emote.t0 + emote.dur) { emote.dur = angryUntil - emote.t0; p = (t - emote.t0) / emote.dur; }
      if (p >= 1) { emote = null; } else { name = emote.name; }
    }

    var speed = vel.length();
    reactT = Math.max(0, reactT - 0.02 * dt);
    var bobFreq = THREE.MathUtils.lerp(0.0016, 0.0007, sleepK), bobAmp = THREE.MathUtils.lerp(0.05, 0.022, sleepK);
    var bob = reduced ? 0 : Math.sin(t * bobFreq) * bobAmp;
    var yE = 0, sxE = 1, syE = 1, tiltExtra = 0, yawExtra = 0, pitchExtra = 0;
    var lookOverrideX = null, lookOverrideY = null, legAmpMul = 1;
    var heat = Math.min(3, angryHeat);

    if (!reduced) {
      if (name === 'wink') { tiltExtra += 0.08 * env(p); }
      if (name === 'bounce') { yE += Math.abs(Math.sin(p * Math.PI * 2)) * HOP; }
      if (name === 'blush') { sxE = syE = 1 - 0.05 * env(p); lookOverrideX = -0.7; lookOverrideY = 0.5; }
      if (name === 'turn') { yawExtra = easeIO(p) * Math.PI * 2; legAmpMul = 1.5; }
      if (name === 'flip') {
        var q = easeIO(p);
        yE += Math.sin(q * Math.PI) * JUMP;
        pitchExtra = q * Math.PI * 2;
        syE = 1 - 0.12 * Math.sin(q * Math.PI * 2);
        legAmpMul = 1.6;
      }
      if (name === 'melt') { syE = 1 - 0.5 * env(p); sxE = 1 + 0.3 * env(p); tiltExtra += Math.sin(t * 0.008) * 0.04; legAmpMul = 0.4; }
      if (name === 'bubble') { legAmpMul = 1.2; }
      if (name === 'yawn') {
        var str = env(p);
        sxE *= 1 - 0.06 * str; syE *= 1 + 0.09 * str;
        if (p > 0.55 && p < 0.80) { var sp = (p - 0.55) / 0.25; tiltExtra += Math.sin(sp * Math.PI * 7) * 0.05 * (1 - sp); }
      }
      if (name === 'lookAround') { lookOverrideX = Math.sin(p * Math.PI * 3) * 1.05; lookOverrideY = 0; }
      if (name === 'surprise') { yE += env(p) * HOP * 1.1; syE = 1 + 0.08 * env(p); }
      if (name === 'angry') {
        tiltExtra += Math.sin(t * 0.05) * 0.02;
        yE += Math.sin(t * 0.09) * 0.03 * (1 + heat * 0.3) * env(Math.min(p * 3, 1));
      }
    }

    var stretch = 1 + Math.min(0.16, speed * 3) + reactT * 0.08;
    var squash = 1 - Math.min(0.12, speed * 2.2) - reactT * 0.05;
    root.position.set(pos.x, pos.y + bob + yE, pos.z);
    root.scale.set(sxE / Math.sqrt(stretch), stretch * syE, sxE / Math.sqrt(stretch));
    head.scale.set(1, squash, 1);
    root.rotation.y = THREE.MathUtils.lerp(root.rotation.y, yawExtra, name === 'turn' ? 1 : 0.2);
    root.rotation.x = THREE.MathUtils.lerp(root.rotation.x, pitchExtra, name === 'flip' ? 1 : 0.2);

    var wAngryTarget = name === 'angry' ? 1 : 0;
    var wWideTarget = name === 'surprise' ? 1 : 0;
    var wBlushTarget = name === 'blush' ? env(p) : name === 'melt' ? 0.85 : name === 'bubble' ? 0.35 : 0;
    var wHappyTarget = (name === 'melt' || name === 'bounce') ? 1 : 0;
    wAngry = THREE.MathUtils.lerp(wAngry, wAngryTarget, 0.14 * dt);
    wWide = THREE.MathUtils.lerp(wWide, wWideTarget, 0.18 * dt);
    wBlush = THREE.MathUtils.lerp(wBlush, wBlushTarget, 0.1 * dt);
    wHappy = THREE.MathUtils.lerp(wHappy, wHappyTarget, 0.1 * dt);

    headMat.color.copy(headBaseColor).lerp(angerColor, wAngry);
    legMat.color.copy(legBaseColor).lerp(angerColor, wAngry * 0.8);
    blushes.forEach(function (m) { m.scale.setScalar(Math.max(0.001, wBlush)); });
    blushMat.opacity = 0.55 * wBlush;

    if (!reduced) {
      var tilt = dragging ? (dragTarget.x - pos.x) * 0.25 : Math.sin(t * 0.0009) * 0.06 * (1 - sleepK);
      root.rotation.z = THREE.MathUtils.lerp(root.rotation.z, tilt + tiltExtra, 1 - Math.pow(1 - 0.15, dt));
      legs.forEach(function (leg) {
        leg.chain.forEach(function (seg, si) {
          var amp = (dragging ? 0.10 : 0.16) * legAmpMul;
          var w1 = Math.sin(t * 0.0026 + leg.phase + si * 0.9) * amp * (si + 1) / SEGMENTS;
          var w2 = Math.cos(t * 0.0021 + leg.phase * 1.3 + si * 0.7) * amp * 0.6 * (si + 1) / SEGMENTS;
          seg.rotation.x = w1;
          seg.rotation.z = w2 + leg.side * 0.12;
        });
      });
      var wanderActive = !dragging && (t - lastPointer > 4000);
      var curLookX = dragging ? lookX : lookOverrideX !== null ? lookOverrideX : wanderActive ? wanderX : lookX;
      var curLookY = dragging ? lookY : lookOverrideY !== null ? lookOverrideY : wanderActive ? wanderY : lookY;
      eyes.forEach(function (g, idx) {
        var pu = g.userData.pupil, wh = g.userData.white;
        pu.position.x = THREE.MathUtils.clamp(curLookX, -1, 1) * 0.05;
        pu.position.y = THREE.MathUtils.clamp(curLookY, -1, 1) * 0.05;
        var isWinking = name === 'wink' && idx === winkSide;
        var closeAmt = sleeping ? sleepK : isWinking ? env(p) : (t < blinkUntil && name !== 'surprise' ? 1 : 0);
        var s = THREE.MathUtils.lerp(1, 0.12, closeAmt) * THREE.MathUtils.lerp(1, 1.32, wWide);
        wh.scale.set(1, s, 1);
      });
    }

    // sleep zzz + anger mark sprites
    if (sleeping) {
      var zc = ((t - sleepSince) % 1800) / 1800;
      zSprite.visible = true;
      zSprite.position.set(pos.x + HEAD_R * 0.75, pos.y + bob + HEAD_R * 0.9 + zc * 0.6, pos.z + 0.4);
      zSprite.material.opacity = Math.sin(Math.PI * zc) * 0.85 * sleepK;
      zSprite.scale.setScalar(0.32 + zc * 0.14);
    } else { zSprite.visible = false; }
    if (wAngry > 0.02) {
      angerSprite.visible = true;
      angerSprite.position.set(pos.x + Math.sin(t * 0.02) * 0.08, pos.y + bob + HEAD_R * 1.55, pos.z + 0.4);
      angerSprite.material.opacity = wAngry;
      angerSprite.scale.setScalar(0.42 + wAngry * 0.14);
    } else { angerSprite.visible = false; }

    // ink bubbles - rise, drift, fade, then get recycled
    for (var bi = bubbles.length - 1; bi >= 0; bi--) {
      var bm = bubbles[bi];
      var life = (t - bm.userData.born) / bm.userData.life;
      if (life >= 1) { scene.remove(bm); bm.material.dispose(); bubbles.splice(bi, 1); continue; }
      bm.position.x += bm.userData.vx * dt;
      bm.position.y += bm.userData.vy * dt;
      bm.material.opacity = 0.7 * (1 - life);
    }

    shadow.position.x = pos.x;
    shadow.scale.setScalar(THREE.MathUtils.clamp(1 - pos.y * 0.15, 0.7, 1.15));

    renderer.render(scene, camera);
    raf = requestAnimationFrame(tick);
  }

  // even under reduced-motion the render loop must keep running: idle animation is what's
  // suppressed (gated by `reduced` inside tick), but user-initiated dragging still needs
  // frames to draw, or the character silently stops responding to the pointer.
  raf = requestAnimationFrame(tick);

  return {
    destroy: function () {
      destroyed = true;
      io.disconnect();
      canvas.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMoveWindow);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('resize', resize);
      if (raf) cancelAnimationFrame(raf);
      renderer.dispose();
    },
  };
}
