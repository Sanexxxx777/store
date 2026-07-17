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

  var PIXEL_SCALE = 3.8; // CSS px per rendered "pixel" - the chunky pixel-art grid size

  // naturalness knobs - what separates "a looping animation" from "a creature".
  // All overridable via opts.natural: this file is meant as an engine with parameters,
  // not a hardcoded octopus (see living-canvas skill, "слагаемые естественности").
  var NAT = Object.assign({
    bobFreqs: [0.0016, 0.00093],   // два несоизмеримых синуса парения - ритм не зацикливается
    bobAmps: [0.042, 0.02],
    yawNoiseAmp: 0.05,             // медленное шумовое поворачивание корпуса
    yawNoiseFreq: 0.00031,
    sighEvery: [18000, 42000],     // редкий глубокий "вздох" мантии, мс (min..max)
    sighDur: 3400,
    sighDepth: 2.1,                // множитель глубины дыхания на пике вздоха
    saccadeEvery: [900, 2600],     // микро-рывки зрачков при слежении, мс
    saccadeAmp: 0.09,
    tipCurlAmp: 0.5,               // подкручивание кончиков щупалец
    tipCurlFreq: 0.0031,
    blinkClose: 80,                // двухфазное моргание: быстро закрыл...
    blinkOpen: 210,                // ...медленнее открыл
  }, opts.natural || {});

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

  // hard 5-step gradient LUT for the N.L term - what turns smooth PBR shading into flat
  // cel/toon bands (generic toon-shader technique, not specific to this asset)
  var gradientMap = (function () {
    var c = document.createElement('canvas');
    c.width = 5; c.height = 1;
    var ctx = c.getContext('2d');
    [30, 95, 150, 205, 255].forEach(function (v, i) {
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

  // fresnel rim on the toon materials: coral glow along the silhouette that survives the
  // hard cel bands. Injected after <lights_fragment_end> where `normal`/`vViewPosition` are
  // in scope and reflectedLight is still open for adding; outgoingLight is declared later.
  function addRim(mat, strength) {
    mat.onBeforeCompile = function (sh) {
      sh.uniforms.rimColor = { value: new THREE.Color(PAL.rim) };
      var before = sh.fragmentShader.length;
      sh.fragmentShader = 'uniform vec3 rimColor;\n' + sh.fragmentShader.replace(
        '#include <lights_fragment_end>',
        '#include <lights_fragment_end>\n' +
        'float rimF = pow(1.0 - clamp(dot(normalize(vViewPosition), normal), 0.0, 1.0), 3.0);\n' +
        'reflectedLight.indirectDiffuse += rimColor * rimF * ' + strength.toFixed(2) + ';'
      );
      // replace на переименованном чанке молча вернёт строку как есть - rim исчезнет без
      // ошибки; ловим это при будущем bump вендоренной three
      if (sh.fragmentShader.length <= before + 20) console.warn('octopus rim: shader chunk not found, rim light disabled');
    };
    mat.customProgramCacheKey = function () { return 'octo-rim-' + strength.toFixed(2); };
  }
  addRim(headMat, 0.55);
  addRim(legMat, 0.4);

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
    // specular catchlight: tiny fixed white dot up-left on the pupil - the "alive" glint
    var glint = new THREE.Mesh(new THREE.SphereGeometry(0.024, 6, 5), new THREE.MeshBasicMaterial({ color: 0xfff8ee }));
    glint.position.set(-0.026, 0.028, 0.062);
    p.add(glint);
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
  // suckers: shared unit-sphere geometry scaled per instance - one geometry, many cheap meshes
  var suckGeo = new THREE.SphereGeometry(1, 6, 5);
  var suckMat = toonMat(PAL.belly);
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
      seg.userData.avx = 0; // angular velocity state for the follow-through spring
      seg.userData.avz = 0;
      var mesh = new THREE.Mesh(new THREE.CapsuleGeometry(r, SEG_LEN * 0.82, 4, 8), legMat);
      mesh.position.y = -SEG_LEN / 2;
      seg.add(mesh);
      addOutline(mesh, 1.32);
      // front-facing sucker pads down the chain - the detail that sells "octopus", not "worms"
      if (s >= 1) {
        for (var sk = 0; sk < 2; sk++) {
          var su = new THREE.Mesh(suckGeo, suckMat);
          su.scale.setScalar(r * 0.3);
          su.position.set(0, -SEG_LEN * (0.22 + sk * 0.44), r * 0.82);
          seg.add(su);
        }
      }
      parent.add(seg);
      parent = seg;
      chain.push(seg);
    }
    legs.push({ chain: chain, phase: Math.random() * Math.PI * 2, side: u });
  }

  // plankton motes: tiny warm dust drifting at different depths - parallax sells the volume
  // of the scene even when the character holds still
  var moteGeo = new THREE.SphereGeometry(1, 5, 4);
  var motes = [];
  for (var mi = 0; mi < 14; mi++) {
    var moMat = new THREE.MeshBasicMaterial({ color: 0xffcf9a, transparent: true, opacity: 0, depthWrite: false });
    var mo = new THREE.Mesh(moteGeo, moMat);
    mo.scale.setScalar(0.016 + Math.random() * 0.028);
    mo.position.set((Math.random() - 0.5) * 4.6, (Math.random() - 0.5) * 3.4, -1.6 + Math.random() * 2.4);
    mo.userData.ph = Math.random() * Math.PI * 2;
    mo.userData.baseOp = 0.12 + Math.random() * 0.16;
    moMat.opacity = mo.userData.baseOp;
    scene.add(mo);
    motes.push(mo);
  }

  // dumbo-octopus ear fins on top of the mantle: two flattened cones with a soft flap,
  // phase-locked to the bob so they read as part of the same "breathing" body
  var fins = [-1, 1].map(function (s) {
    var fin = new THREE.Mesh(new THREE.ConeGeometry(HEAD_R * 0.22, HEAD_R * 0.52, 8), headMat);
    fin.position.set(s * HEAD_R * 0.72, HEAD_R * 0.62, -HEAD_R * 0.1);
    fin.scale.set(0.45, 1, 0.8);
    fin.rotation.z = s * -0.95;
    addOutline(fin, 1.22);
    root.add(fin);
    return { mesh: fin, side: s, baseRot: s * -0.95 };
  });

  // soft contact shadow: radial-gradient alpha texture instead of a hard-edged disc, so the
  // character actually "sits" on a surface; opacity fades as the body lifts off the ground
  var shadowTex = (function () {
    var c = document.createElement('canvas');
    c.width = 64; c.height = 64;
    var ctx = c.getContext('2d');
    var g = ctx.createRadialGradient(32, 32, 2, 32, 32, 32);
    g.addColorStop(0, 'rgba(12, 6, 2, 0.55)');
    g.addColorStop(0.55, 'rgba(12, 6, 2, 0.28)');
    g.addColorStop(1, 'rgba(12, 6, 2, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  })();
  var shadowMat = new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false });
  var shadow = new THREE.Mesh(new THREE.PlaneGeometry(2.7, 2.7), shadowMat);
  shadow.rotation.x = -Math.PI / 2;
  // inside the camera frustum: bottom of view at z=0 is ~-2.43 (fov 32, dist~8.85), the old
  // -2.55 put the shadow permanently off-screen - it had never actually been visible
  shadow.position.y = -2.18;
  scene.add(shadow);

  var zSprite = makeSprite('z', '#fff2df');
  var angerSprite = makeSprite('!', '#ff5a3c');

  // ink bubbles - the "flower" idle-mood equivalent from the ghost, reinterpreted for an
  // octopus: a small burst of bubbles instead of a flower, same idle-pool slot/weight.
  // Pooled: materials are created once and recycled (create/dispose per burst caused GC hitches).
  var BUBBLE_POOL = 8;
  var bubbleGeo = new THREE.SphereGeometry(1, 8, 6);
  var bubbles = [];
  for (var bp = 0; bp < BUBBLE_POOL; bp++) {
    var bMat = new THREE.MeshBasicMaterial({ color: 0xcdeeff, transparent: true, opacity: 0 });
    var bM = new THREE.Mesh(bubbleGeo, bMat);
    bM.visible = false;
    bM.userData.live = false;
    scene.add(bM);
    bubbles.push(bM);
  }
  function spawnBubbles(t) {
    var spawned = 0;
    for (var n = 0; n < bubbles.length && spawned < 5; n++) {
      var m = bubbles[n];
      if (m.userData.live) continue;
      var a = Math.random() * Math.PI * 2;
      m.position.copy(root.position);
      m.position.y += HEAD_R * 0.3;
      m.position.z += HEAD_R * 0.8;
      m.userData.vx = Math.cos(a) * (0.008 + Math.random() * 0.006);
      m.userData.vy = 0.014 + Math.random() * 0.012;
      m.userData.born = t;
      m.userData.life = 1100 + Math.random() * 500;
      m.scale.setScalar(0.05 + Math.random() * 0.06);
      m.userData.live = true;
      m.visible = true;
      spawned++;
    }
  }

  // ink cloud burst - the signature octopus move, fired on click escalation: one flipbook
  // sprite (4 posterized dark-blob frames on a single texture, UV offset per frame) that
  // expands and fades. One draw call, reads as a chunky pixel-art ink "poof" at low res.
  var inkTex = (function () {
    var c = document.createElement('canvas');
    c.width = 256; c.height = 64; // 4 frames of 64x64
    var ctx = c.getContext('2d');
    for (var f = 0; f < 4; f++) {
      var ox = f * 64 + 32;
      var blobs = 5 + f * 2;
      for (var b = 0; b < blobs; b++) {
        var ba = (b / blobs) * Math.PI * 2 + f * 0.7;
        var br = (6 + f * 5) * (0.5 + Math.random() * 0.8);
        var bx = ox + Math.cos(ba) * (4 + f * 7) * (0.6 + Math.random() * 0.7);
        var by = 32 + Math.sin(ba) * (4 + f * 6) * (0.6 + Math.random() * 0.7);
        ctx.fillStyle = 'rgba(26, 16, 48, ' + (0.9 - f * 0.14).toFixed(2) + ')';
        ctx.beginPath();
        ctx.arc(bx, by, br, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    var tex = new THREE.CanvasTexture(c);
    tex.minFilter = THREE.NearestFilter;
    tex.magFilter = THREE.NearestFilter;
    tex.repeat.set(0.25, 1);
    return tex;
  })();
  var inkMat = new THREE.SpriteMaterial({ map: inkTex, transparent: true, opacity: 0, depthTest: false });
  var inkSprite = new THREE.Sprite(inkMat);
  inkSprite.visible = false;
  scene.add(inkSprite);
  var inkBorn = -1;
  var INK_DUR = 950;
  function spawnInk(t) {
    inkBorn = t;
    inkSprite.visible = true;
    inkSprite.position.set(root.position.x, root.position.y - HEAD_R * 0.2, root.position.z - HEAD_R * 0.6);
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
  var lastBlink = 0, nextBlink = 2200 + Math.random() * 3800, blinkStart = -1e9;
  var nextSigh = 9000 + Math.random() * (NAT.sighEvery[1] - NAT.sighEvery[0]), sighStart = -1e9;
  var nextSaccade = 0, sacX = 0, sacY = 0;
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
    // the signature octopus move: pestered enough - vanishes behind an ink cloud
    if (name === 'surprise' || name === 'angry') spawnInk(t);
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
  var prevPos = pos.clone();
  var bodyVel = new THREE.Vector3(); // measured per-frame motion (covers both drag and spring)
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

  var lastInteract = performance.now();
  function onDown(e) {
    lastInteract = performance.now();
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
    // вне вьюпорта raycast + два getBoundingClientRect на каждый pointermove
    // по всей странице - пустой расход, персонажа всё равно не видно
    if (!visible) return;
    var w = pointerToWorld(e.clientX, e.clientY);
    var cr = canvas.getBoundingClientRect(); // один rect на move, не пять
    lookX = THREE.MathUtils.clamp((e.clientX - (cr.left + cr.width / 2)) / 220, -1, 1);
    lookY = THREE.MathUtils.clamp(-(e.clientY - (cr.top + cr.height / 2)) / 220, -1, 1);
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
  // pan-y, НЕ none: канвас стоит в потоке страницы, палец на осьминоге обязан
  // прокручивать её вертикально; горизонтальный драг и тапы работают как раньше
  canvas.style.touchAction = 'pan-y';
  canvas.style.cursor = 'grab';

  // --- page awareness: the character notices the page, not just the cursor.
  // Glance toward clicks anywhere on the page; perk up when hero CTAs are hovered;
  // tentacles get dragged by scroll momentum (handled in tick via scrollImp).
  var gazeUntil = 0, gazeX = 0, gazeY = -0.15;
  function gazeAtClient(cx, cy, dur) {
    var r = canvas.getBoundingClientRect();
    gazeX = THREE.MathUtils.clamp((cx - (r.left + r.width / 2)) / 260, -1.15, 1.15);
    gazeY = THREE.MathUtils.clamp(-(cy - (r.top + r.height / 2)) / 260, -1, 1);
    gazeUntil = performance.now() + (dur || 1100);
  }
  function onDocDown(e) {
    if (e.target === canvas) return;
    gazeAtClient(e.clientX, e.clientY, 900);
  }
  document.addEventListener('pointerdown', onDocDown, { passive: true });
  function onCtaEnter(e) {
    var t = performance.now();
    if (sleeping || dragging) return;
    var r = e.currentTarget.getBoundingClientRect();
    gazeAtClient(r.left + r.width / 2, r.top + r.height / 2, 1400);
    if (!reduced && !emote) startEmote('bounce', t);
  }
  var ctaEls = Array.prototype.slice.call(document.querySelectorAll('.hero-cta .btn, .cta-mini, .hero-stage-cap'));
  ctaEls.forEach(function (el) { el.addEventListener('pointerenter', onCtaEnter); });
  var lastScrollY = window.scrollY, scrollImp = 0;
  function onScroll() {
    var y = window.scrollY;
    scrollImp += y - lastScrollY;
    lastScrollY = y;
  }
  window.addEventListener('scroll', onScroll, { passive: true });

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

  var raf = 0, destroyed = false, lastT = 0;
  var visible = true;
  function arm() { if (!raf && !destroyed && visible && !document.hidden) raf = requestAnimationFrame(tick); }
  // rAF останавливается полностью вне вьюпорта/в скрытой вкладке (не re-arm впустую);
  // будят IntersectionObserver и visibilitychange
  var io = new IntersectionObserver(function (es) {
    visible = es[0].isIntersecting;
    if (visible) { lastT = 0; arm(); }
  });
  io.observe(canvas);
  function onVis() { if (!document.hidden) { lastT = 0; arm(); } }
  document.addEventListener('visibilitychange', onVis);

  function tick(t) {
    raf = 0;
    if (destroyed) return;
    if (!visible || document.hidden) { lastT = 0; return; }

    var dt = lastT ? THREE.MathUtils.clamp((t - lastT) / 16.6667, 0, 4) : 1;
    lastT = t;

    if (!reduced) {
      // blink cycle (suppressed by sleep/wink/surprise, handled in the eye pass below)
      if (t - lastBlink > nextBlink) { blinkStart = t; lastBlink = t; nextBlink = 2200 + Math.random() * 3800; }
      // редкий глубокий вздох мантии
      if (t > nextSigh) {
        sighStart = t;
        nextSigh = t + NAT.sighEvery[0] + Math.random() * (NAT.sighEvery[1] - NAT.sighEvery[0]);
      }
      // саккады: зрачки при живом слежении двигаются микро-рывками, не идеальной слежкой
      if (t > nextSaccade) {
        nextSaccade = t + NAT.saccadeEvery[0] + Math.random() * (NAT.saccadeEvery[1] - NAT.saccadeEvery[0]);
        sacX = (Math.random() - 0.5) * 2 * NAT.saccadeAmp;
        sacY = (Math.random() - 0.5) * 2 * NAT.saccadeAmp;
      }
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

    // measured body velocity for tentacle follow-through: works during drag too, where the
    // spring `vel` is zeroed; normalized per 16.7ms step so it is frame-rate independent
    bodyVel.set(
      THREE.MathUtils.clamp((pos.x - prevPos.x) / dt, -0.09, 0.09),
      THREE.MathUtils.clamp((pos.y - prevPos.y) / dt, -0.09, 0.09),
      0
    );
    prevPos.copy(pos);
    // scroll momentum decays and feeds the tentacles like a water current
    scrollImp *= Math.pow(0.85, dt);
    var scrollLean = THREE.MathUtils.clamp(scrollImp * 0.0011, -0.55, 0.55);

    var speed = vel.length();
    reactT = Math.max(0, reactT - 0.02 * dt);
    // парение = сумма двух несоизмеримых синусов: ритм не читается как метроном
    var bobSlow = THREE.MathUtils.lerp(1, 0.5, sleepK);
    var bob = reduced ? 0
      : Math.sin(t * NAT.bobFreqs[0] * bobSlow) * NAT.bobAmps[0] * THREE.MathUtils.lerp(1, 0.45, sleepK)
      + Math.sin(t * NAT.bobFreqs[1] * bobSlow + 1.7) * NAT.bobAmps[1] * THREE.MathUtils.lerp(1, 0.45, sleepK);
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
    // mantle breathing: slow uneven pulse, slower and deeper while asleep - the micro-motion
    // that separates "a creature" from "a model"
    var sighP = (t - sighStart) / NAT.sighDur;
    var sighMul = (sighP > 0 && sighP < 1) ? 1 + (NAT.sighDepth - 1) * env(sighP) : 1;
    var breath = reduced ? 0 : Math.sin(t * THREE.MathUtils.lerp(0.0013, 0.0008, sleepK)) * THREE.MathUtils.lerp(0.014, 0.024, sleepK) * sighMul;
    head.scale.set(1 + breath * 0.6, squash * (1 + breath), 1 + breath * 0.6);
    // шумовое поворачивание корпуса: две несоизмеримые частоты, гаснет во сне
    var yawNoise = reduced ? 0
      : (Math.sin(t * NAT.yawNoiseFreq) + 0.5 * Math.sin(t * NAT.yawNoiseFreq * 2.63 + 1.1)) * NAT.yawNoiseAmp * (1 - sleepK * 0.5);
    root.rotation.y = THREE.MathUtils.lerp(root.rotation.y, yawExtra + (name === 'turn' ? 0 : yawNoise), name === 'turn' ? 1 : 0.2);
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
      // tentacle follow-through: each segment is a damped angular spring chasing the swim
      // wave plus an inertia term from the measured body motion (drag/spring/scroll) - the
      // chain lags, whips and settles instead of replaying a fixed sine. Stiffness falls and
      // lag weight grows toward the tip, so tips trail the most.
      legs.forEach(function (leg) {
        leg.chain.forEach(function (seg, si) {
          var w = (si + 1) / SEGMENTS;
          var amp = (dragging ? 0.10 : 0.16) * legAmpMul;
          var targetX = Math.sin(t * 0.0026 + leg.phase - si * 0.6) * amp * w
            + (bodyVel.y * 4.5 + scrollLean) * w;
          var targetZ = Math.cos(t * 0.0021 + leg.phase * 1.3 - si * 0.5) * amp * 0.6 * w
            + leg.side * 0.12 - bodyVel.x * 5.5 * w;
          // кончики подкручиваются собственным ритмом - щупальце "ищет", а не висит
          if (si === SEGMENTS - 1) targetX += Math.sin(t * NAT.tipCurlFreq + leg.phase * 2.3) * NAT.tipCurlAmp * 0.4 * legAmpMul;
          var k = (0.22 - si * 0.03) * dt;
          var d = Math.pow(0.78, dt);
          seg.userData.avx = (seg.userData.avx + (targetX - seg.rotation.x) * k) * d;
          seg.userData.avz = (seg.userData.avz + (targetZ - seg.rotation.z) * k) * d;
          seg.rotation.x += seg.userData.avx * dt;
          seg.rotation.z += seg.userData.avz * dt;
        });
      });
      // ear fins flap in counter-phase, calm down during sleep
      fins.forEach(function (f, fi) {
        f.mesh.rotation.z = f.baseRot + Math.sin(t * 0.0021 + fi * Math.PI * 0.6) * 0.16 * (1 - sleepK * 0.6) * f.side;
      });
      // plankton drift: slow uneven float + per-mote shimmer (frequencies deliberately uneven)
      for (var mm = 0; mm < motes.length; mm++) {
        var mo2 = motes[mm];
        mo2.position.y += Math.sin(t * 0.00037 + mo2.userData.ph) * 0.0011 * dt;
        mo2.position.x += Math.cos(t * 0.00029 + mo2.userData.ph * 1.7) * 0.0008 * dt;
        mo2.material.opacity = mo2.userData.baseOp * (0.65 + 0.35 * Math.sin(t * 0.0011 + mo2.userData.ph * 2.3));
      }
      var wanderActive = !dragging && (t - lastPointer > 4000);
      var gazeActive = !dragging && t < gazeUntil;
      var curLookX = dragging ? lookX : lookOverrideX !== null ? lookOverrideX : gazeActive ? gazeX : wanderActive ? wanderX : lookX;
      var curLookY = dragging ? lookY : lookOverrideY !== null ? lookOverrideY : gazeActive ? gazeY : wanderActive ? wanderY : lookY;
      // саккады только при живом слежении - сценарные взгляды (lookAround/gaze) точны
      var sOffX = (lookOverrideX === null && !sleeping) ? sacX : 0;
      var sOffY = (lookOverrideY === null && !sleeping) ? sacY : 0;
      // двухфазное моргание: быстро закрыл, медленнее открыл
      var bT = t - blinkStart, bTot = NAT.blinkClose + NAT.blinkOpen;
      var blinkAmt = (bT >= 0 && bT < bTot && name !== 'surprise')
        ? (bT < NAT.blinkClose ? bT / NAT.blinkClose : 1 - (bT - NAT.blinkClose) / NAT.blinkOpen)
        : 0;
      eyes.forEach(function (g, idx) {
        var pu = g.userData.pupil, wh = g.userData.white;
        pu.position.x = THREE.MathUtils.clamp(curLookX + sOffX, -1.1, 1.1) * 0.05;
        pu.position.y = THREE.MathUtils.clamp(curLookY + sOffY, -1.1, 1.1) * 0.05;
        var isWinking = name === 'wink' && idx === winkSide;
        var closeAmt = sleeping ? sleepK : isWinking ? env(p) : blinkAmt;
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

    // bubbles - rise, drift, fade, then return to the pool (no dispose churn)
    for (var bi = 0; bi < bubbles.length; bi++) {
      var bm = bubbles[bi];
      if (!bm.userData.live) continue;
      var life = (t - bm.userData.born) / bm.userData.life;
      if (life >= 1) { bm.userData.live = false; bm.visible = false; bm.material.opacity = 0; continue; }
      bm.position.x += bm.userData.vx * dt;
      bm.position.y += bm.userData.vy * dt;
      bm.material.opacity = 0.7 * (1 - life);
    }

    // ink cloud flipbook: frame by UV offset, expand + fade
    if (inkBorn >= 0) {
      var ip = (t - inkBorn) / INK_DUR;
      if (ip >= 1) {
        inkBorn = -1;
        inkSprite.visible = false;
        inkMat.opacity = 0;
      } else {
        inkTex.offset.x = Math.min(3, Math.floor(ip * 4)) * 0.25;
        inkSprite.scale.setScalar((0.8 + ip * 2.4) * HEAD_R * 2);
        inkMat.opacity = ip < 0.15 ? (ip / 0.15) * 0.85 : 0.85 * (1 - (ip - 0.15) / 0.85);
      }
    }

    shadow.position.x = pos.x;
    // the higher the lift-off, the smaller AND lighter the contact shadow
    var lift = (pos.y + bob + yE) - home.y;
    shadow.scale.setScalar(THREE.MathUtils.clamp(1 - lift * 0.15, 0.7, 1.15));
    shadowMat.opacity = THREE.MathUtils.clamp(1 - lift * 0.4, 0.3, 1);

    // under reduced-motion the ambient animation is all zeroed - don't re-render identical
    // frames 60/s (battery); draw only while something user-driven can actually change.
    // The loop itself must stay alive: dragging has to redraw (see note below).
    var needsRender = !reduced || dragging || inkBorn >= 0 || wAngry > 0.01 || wBlush > 0.01
      || (t - lastInteract < 3000);
    if (needsRender) renderer.render(scene, camera);
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
      document.removeEventListener('visibilitychange', onVis);
      document.removeEventListener('pointerdown', onDocDown);
      window.removeEventListener('scroll', onScroll);
      ctaEls.forEach(function (el) { el.removeEventListener('pointerenter', onCtaEnter); });
      if (raf) cancelAnimationFrame(raf);
      renderer.dispose();
    },
  };
}
