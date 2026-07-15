// Living Octopus 3D - decorative store-hero mascot. Separate from the sellable Living Mascot
// engine (mascot.min.js / mascot/mascot.esm.js) - this is a store-only illustration, not a
// product. Real WebGL 3D (three.js): low-res render buffer + nearest-neighbor upscale for the
// "pixelated but volumetric" look (same trick as PS1-era/voxel-style three.js pieces - the
// geometry, lighting and shading stay full 3D, only the output raster is chunky), toon
// (cel) shading with a hard-stepped gradient map, inverted-hull outlines (duplicated
// back-face mesh, the standard cheap toon-outline technique - no post-processing pass
// needed), spring-physics drag (critically-damped spring, frame-rate independent).
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

  // hard 4-step gradient LUT for the N.L term - this is what turns smooth PBR shading into
  // flat cel/toon bands (the technique behind every "toon shader", not specific to any asset)
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

  var headMat = toonMat(PAL.mid);
  var bellyMat = toonMat(PAL.belly);
  var legMat = toonMat(PAL.shade);
  var eyeWhiteMat = toonMat(0xfff6ea);
  var eyeDarkMat = new THREE.MeshBasicMaterial({ color: PAL.eyeDark });
  var outlineMat = new THREE.MeshBasicMaterial({ color: PAL.outline, side: THREE.BackSide });

  function addOutline(mesh, scale) {
    var o = new THREE.Mesh(mesh.geometry, outlineMat);
    o.scale.setScalar(scale);
    mesh.add(o);
    return o;
  }

  var HEAD_R = 1.35;
  var head = new THREE.Mesh(new THREE.SphereGeometry(HEAD_R, 28, 20), headMat);
  root.add(head);
  addOutline(head, 1.13);

  var belly = new THREE.Mesh(new THREE.SphereGeometry(HEAD_R * 0.44, 16, 12), bellyMat);
  belly.position.set(0, -HEAD_R * 0.36, HEAD_R * 0.82);
  belly.scale.set(1, 0.72, 0.5);
  root.add(belly);
  addOutline(belly, 1.22);

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
    root.add(g);
    eyes.push(g);
  });

  // tentacles - segment chains hanging under the head; each segment is a child group of the
  // previous one so a sine wave applied down the chain reads as an organic wave, cheap to
  // animate (rotate a few groups per frame, no geometry rebuild)
  var LEGS = 6, SEGMENTS = 5, SEG_LEN = 0.34, SEG_R0 = 0.24;
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

  // --- spring-physics drag: critically-damped spring pulls the character back to `home`
  // after release, with a couple of settling bounces - real position/velocity integration,
  // stepped with a delta-time factor so the feel is identical on a 60Hz and a 120Hz screen.
  var home = new THREE.Vector3(0, 0.15, 0);
  var pos = home.clone();
  var vel = new THREE.Vector3();
  var dragging = false, dragTarget = new THREE.Vector3();
  var pointerNDC = new THREE.Vector2(0, -0.4);
  var lookX = 0, lookY = -0.15;
  var raycaster = new THREE.Raycaster();
  var dragPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  var STIFFNESS = 0.10, DAMPING = 0.82;

  function boundsAt(z) {
    var dist = camera.position.z - z;
    var vh = 2 * Math.tan((camera.fov * Math.PI / 180) / 2) * dist;
    var vw = vh * camera.aspect;
    var marginX = HEAD_R * 1.58, marginTop = HEAD_R * 1.68, marginBottom = HEAD_R * 0.65 + SEGMENTS * SEG_LEN + 0.55;
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
    } else {
      bumpReact();
    }
  }
  var reactT = 0;
  function bumpReact() { reactT = 1; vel.y += 0.05; }

  function onMoveWindow(e) {
    var w = pointerToWorld(e.clientX, e.clientY);
    lookX = THREE.MathUtils.clamp((e.clientX - (canvas.getBoundingClientRect().left + canvas.getBoundingClientRect().width / 2)) / 220, -1, 1);
    lookY = THREE.MathUtils.clamp(-(e.clientY - (canvas.getBoundingClientRect().top + canvas.getBoundingClientRect().height / 2)) / 220, -1, 1);
    if (!dragging) return;
    var b = boundsAt(0);
    dragTarget.set(THREE.MathUtils.clamp(w.x, b.minX, b.maxX), THREE.MathUtils.clamp(w.y, b.minY, b.maxY), 0);
  }
  function onUp() {
    if (dragging) { dragging = false; bumpReact(); }
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

    if (dragging) {
      pos.lerp(dragTarget, 1 - Math.pow(1 - 0.32, dt));
      vel.set(0, 0, 0);
    } else if (!reduced) {
      // critically-damped spring back to home - real position/velocity integration, dt-scaled
      var ax = (home.x - pos.x) * STIFFNESS;
      var ay = (home.y - pos.y) * STIFFNESS;
      var damp = Math.pow(DAMPING, dt);
      vel.x = (vel.x + ax * dt) * damp;
      vel.y = (vel.y + ay * dt) * damp;
      pos.x += vel.x * dt; pos.y += vel.y * dt;
    }

    var speed = vel.length();
    reactT = Math.max(0, reactT - 0.02 * dt);
    var bob = reduced ? 0 : Math.sin(t * 0.0016) * 0.05;
    root.position.set(pos.x, pos.y + bob, pos.z);

    var stretch = 1 + Math.min(0.16, speed * 3) + reactT * 0.08;
    var squash = 1 - Math.min(0.12, speed * 2.2) - reactT * 0.05;
    root.scale.set(1 / Math.sqrt(stretch), stretch, 1 / Math.sqrt(stretch));
    head.scale.set(1, squash, 1);

    if (!reduced) {
      var tilt = dragging ? (dragTarget.x - pos.x) * 0.25 : Math.sin(t * 0.0009) * 0.06;
      root.rotation.z = THREE.MathUtils.lerp(root.rotation.z, tilt, 1 - Math.pow(1 - 0.15, dt));
      legs.forEach(function (leg) {
        leg.chain.forEach(function (seg, si) {
          var amp = dragging ? 0.10 : 0.16;
          var w1 = Math.sin(t * 0.0026 + leg.phase + si * 0.9) * amp * (si + 1) / SEGMENTS;
          var w2 = Math.cos(t * 0.0021 + leg.phase * 1.3 + si * 0.7) * amp * 0.6 * (si + 1) / SEGMENTS;
          seg.rotation.x = w1;
          seg.rotation.z = w2 + leg.side * 0.12;
        });
      });
      eyes.forEach(function (g) {
        var p = g.userData.pupil;
        p.position.x = THREE.MathUtils.clamp(lookX, -1, 1) * 0.05;
        p.position.y = THREE.MathUtils.clamp(lookY, -1, 1) * 0.05;
      });
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
