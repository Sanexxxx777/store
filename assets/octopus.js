// Living Octopus - decorative store-hero mascot. Separate from the sellable Living Mascot
// engine (mascot.min.js / mascot/mascot.esm.js) - this is a store-only illustration, not a
// product. Semi-pixel/voxel look: drawn small to an offscreen buffer with flat shading bands,
// then scaled up onto the visible canvas with image smoothing off (blocky edges = "pixel art"
// without hand-authoring a sprite sheet). Zero dependencies.
(function (global) {
  function createOctopus(canvas, opts) {
    opts = opts || {};
    var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var BW = 96, BH = 104; // low-res buffer - this resolution IS the pixel-art grain
    var buf = document.createElement('canvas');
    buf.width = BW; buf.height = BH;
    var bctx = buf.getContext('2d');
    var ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;

    var PAL = Object.assign({
      light: '#f2a565',   // top-lit band
      mid: '#d9793a',     // base
      shade: '#a4501f',   // shadow band
      dark: '#6e300f',    // deep shadow / tentacle tips
      belly: '#ffd9a0',   // warm highlight patch
      eye: 'rgba(24, 12, 6, 0.9)',
      spark: '#ffb178',
    }, opts.colors ? opts.colors() : {});

    var LEGS = 6;
    var t0 = performance.now();
    var mx = 0, my = -0.2, wanderX = 0, wanderY = -0.2, wanderT = 0, lastPointer = 0;
    var blink = 0, lastBlink = 0, nextBlink = 2600;
    var bounce = 0; // 0..1 decays after click
    var raf = 0, visible = true, destroyed = false;
    var sparks = [];

    function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
    function lerp(a, b, k) { return a + (b - a) * k; }

    function drawFrame(t) {
      var dt = t - t0;
      bctx.clearRect(0, 0, BW, BH);

      var bob = reduced ? 0 : Math.sin(dt * 0.0016) * 2.2;
      var squash = 1 - bounce * 0.12;
      var stretch = 1 + bounce * 0.10;
      var headCX = BW / 2, headCY = 40 + bob - bounce * 6;
      var headR = 26;

      // ground shadow
      bctx.globalAlpha = 0.30;
      bctx.fillStyle = '#1a0d05';
      bctx.beginPath();
      bctx.ellipse(headCX, BH - 8, 24 - bounce * 3, 4, 0, 0, Math.PI * 2);
      bctx.fill();
      bctx.globalAlpha = 1;

      // tentacles - tapered curved strokes, independent sway
      for (var i = 0; i < LEGS; i++) {
        var u = (i + 0.5) / LEGS - 0.5; // -0.5..0.5
        var baseX = headCX + u * headR * 1.7;
        var baseY = headCY + headR * 0.62;
        var sway = reduced ? 0 : Math.sin(dt * 0.0022 + i * 1.1) * (5 + Math.abs(u) * 4);
        var len = 30 + Math.abs(u) * 6;
        var tipX = baseX + sway * 0.6 + u * 6;
        var tipY = baseY + len * stretch;
        var midX = baseX + sway;
        var midY = baseY + len * 0.55 * stretch;
        var lit = u < 0.05;
        bctx.strokeStyle = lit ? PAL.mid : PAL.shade;
        bctx.lineCap = 'round';
        bctx.lineWidth = 7 - Math.abs(u) * 4;
        bctx.beginPath();
        bctx.moveTo(baseX, baseY);
        bctx.quadraticCurveTo(midX, midY, tipX, tipY);
        bctx.stroke();
        bctx.strokeStyle = PAL.dark;
        bctx.lineWidth = 2;
        bctx.beginPath();
        bctx.arc(tipX, tipY, 1.4, 0, Math.PI * 2);
        bctx.stroke();
      }

      // head - banded flat shading for a posterized / voxel feel
      var hx = headR * (1 + (stretch - 1) * 0.4), hy = headR * squash;
      bctx.fillStyle = PAL.shade;
      bctx.beginPath();
      bctx.ellipse(headCX, headCY, hx, hy, 0, 0, Math.PI * 2);
      bctx.fill();
      bctx.fillStyle = PAL.mid;
      bctx.beginPath();
      bctx.ellipse(headCX - hx * 0.06, headCY - hy * 0.08, hx * 0.92, hy * 0.90, 0, 0, Math.PI * 2);
      bctx.fill();
      bctx.fillStyle = PAL.light;
      bctx.beginPath();
      bctx.ellipse(headCX - hx * 0.28, headCY - hy * 0.42, hx * 0.46, hy * 0.36, -0.3, 0, Math.PI * 2);
      bctx.fill();
      // warm belly patch
      bctx.fillStyle = PAL.belly;
      bctx.globalAlpha = 0.85;
      bctx.beginPath();
      bctx.ellipse(headCX, headCY + hy * 0.32, hx * 0.42, hy * 0.28, 0, 0, Math.PI * 2);
      bctx.fill();
      bctx.globalAlpha = 1;

      // eyes - follow pointer, blink, wink-happy on bounce
      var shut = blink > 0 ? Math.min(1, blink / 90) : 0;
      var happy = bounce > 0.35;
      var gx = clamp(mx, -1, 1), gy = clamp(my, -1, 1);
      for (var s = -1; s <= 1; s += 2) {
        var ex = headCX + s * hx * 0.36 + gx * 1.6;
        var ey = headCY - hy * 0.05 + gy * 1.4;
        if (happy) {
          bctx.strokeStyle = PAL.eye;
          bctx.lineWidth = 2;
          bctx.lineCap = 'round';
          bctx.beginPath();
          bctx.arc(ex, ey + 2, 3.6, Math.PI * 1.15, Math.PI * 1.85);
          bctx.stroke();
          continue;
        }
        var eh = 5.2 * (1 - shut * 0.94);
        bctx.fillStyle = '#fff';
        bctx.beginPath();
        bctx.ellipse(ex, ey, 3.6, Math.max(0.6, eh), 0, 0, Math.PI * 2);
        bctx.fill();
        if (eh > 1.6) {
          bctx.fillStyle = PAL.eye;
          bctx.beginPath();
          bctx.arc(ex + gx * 1.1, ey + gy * 1.1, 1.7, 0, Math.PI * 2);
          bctx.fill();
        }
      }

      // sparks (click reaction)
      for (var k = sparks.length - 1; k >= 0; k--) {
        var q = sparks[k];
        q.x += q.vx; q.y += q.vy; q.vy += 0.02; q.a -= 0.03;
        if (q.a <= 0) { sparks.splice(k, 1); continue; }
        bctx.globalAlpha = Math.max(0, q.a);
        bctx.fillStyle = PAL.spark;
        bctx.beginPath();
        bctx.arc(q.x, q.y, 1.3, 0, Math.PI * 2);
        bctx.fill();
      }
      bctx.globalAlpha = 1;

      // blit low-res buffer onto the real canvas ("contain" fit), scaled up with
      // smoothing off = chunky pixel-art edges
      var Z = Math.min(canvas.width / BW, canvas.height / BH) * (opts.zoom || 1);
      var outW = BW * Z, outH = BH * Z;
      var outX = (canvas.width - outW) / 2, outY = (canvas.height - outH) / 2;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(buf, 0, 0, BW, BH, outX, outY, outW, outH);
    }

    function loop(t) {
      raf = 0;
      if (destroyed || !canvas.isConnected || !visible || document.hidden) return;
      if (t - lastBlink > nextBlink) { blink = 90; lastBlink = t; nextBlink = 2400 + Math.random() * 3600; }
      if (blink > 0) blink -= 16.7;
      if (bounce > 0) bounce = Math.max(0, bounce - 0.02);
      if (t - lastPointer > 3500) {
        wanderT -= 16.7;
        if (wanderT <= 0) {
          wanderT = 1800 + Math.random() * 2400;
          wanderX = (Math.random() - 0.5) * 1.2; wanderY = -0.4 + Math.random() * 0.7;
        }
        mx += (wanderX - mx) * 0.02; my += (wanderY - my) * 0.02;
      }
      drawFrame(t);
      raf = requestAnimationFrame(loop);
    }

    function onMove(e) {
      var r = canvas.getBoundingClientRect();
      if (!r.width) return;
      lastPointer = performance.now();
      mx = clamp((e.clientX - (r.left + r.width / 2)) / 220, -1, 1);
      my = clamp((e.clientY - (r.top + r.height / 2)) / 220, -1, 1);
    }
    function onDown() {
      bounce = 1;
      for (var i = 0; i < 6; i++) {
        var a = Math.random() * Math.PI * 2;
        sparks.push({ x: BW / 2, y: 40, vx: Math.cos(a) * 0.6, vy: Math.sin(a) * 0.6 - 0.4, a: 1 });
      }
    }
    canvas.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove, { passive: true });

    var io = new IntersectionObserver(function (es) {
      visible = es[0].isIntersecting;
      if (visible && !reduced && !raf) raf = requestAnimationFrame(loop);
    });
    io.observe(canvas);
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden && visible && !raf && !reduced) raf = requestAnimationFrame(loop);
    });

    if (reduced) drawFrame(0); else raf = requestAnimationFrame(loop);

    return {
      destroy: function () {
        destroyed = true;
        io.disconnect();
        canvas.removeEventListener('pointerdown', onDown);
        window.removeEventListener('pointermove', onMove);
        if (raf) cancelAnimationFrame(raf);
      },
    };
  }
  global.LivingOctopus = { createOctopus: createOctopus };
})(window);
