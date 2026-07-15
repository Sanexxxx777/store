// Living Octopus - decorative store-hero mascot. Separate from the sellable Living Mascot
// engine (mascot.min.js / mascot/mascot.esm.js) - this is a store-only illustration, not a
// product. Soft voxel-clay shading (smooth gradients, no hard pixel edges), draggable within
// the canvas bounds. Zero dependencies.
(function (global) {
  function createOctopus(canvas, opts) {
    opts = opts || {};
    var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // logical space is fixed regardless of zoom, so the draggable playground never shrinks -
    // zoom only scales the character's own size within it
    var Z = canvas.width / 480;
    var W = canvas.width / Z, H = canvas.height / Z;
    var ctx = canvas.getContext('2d');
    var zoom = opts.zoom || 1;

    var PAL = Object.assign({
      light: '#ffb87a',   // top-lit highlight
      mid: '#e8813f',     // base
      shade: '#b85a24',   // core shadow
      dark: '#7a3812',    // deep shadow / tentacle tips
      belly: '#ffe0ad',   // warm highlight patch
      eye: 'rgba(28, 14, 6, 0.92)',
      spark: '#ffb178',
    }, opts.colors ? opts.colors() : {});

    var LEGS = 6;
    var headR = 62 * zoom;
    var LEG_LEN = 78 * zoom;

    // home position (drag target rests here between drags) + live offset while animating
    var homeX = 0, homeY = 0, x = 0, y = 0;
    var mx = 0, my = -0.2, wanderX = 0, wanderY = -0.2, wanderT = 0, lastPointer = 0;
    var blink = 0, lastBlink = 0, nextBlink = 2600;
    var bounce = 0;
    var raf = 0, visible = true, destroyed = false;
    var sparks = [];
    var dragging = false, dragDX = 0, dragDY = 0, wasDragged = false;

    function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
    function lerp(a, b, k) { return a + (b - a) * k; }

    // keep the whole silhouette (glow halo above/sides, longest swaying tentacle below)
    // inside the canvas at all times - measured against the actual paint extents in
    // drawFrame (glow radius headR*1.9, tentacles LEG_LEN with stretch+sway margin)
    var TOP_MARGIN = headR * 1.9 + 10;
    var SIDE_MARGIN = headR * 1.9 + 10;
    var BOTTOM_MARGIN = LEG_LEN * 1.3 + 24;
    function clampPos(px, py) {
      return {
        x: clamp(px, SIDE_MARGIN, W - SIDE_MARGIN),
        y: clamp(py, TOP_MARGIN, H - BOTTOM_MARGIN),
      };
    }

    function initHome() {
      var p = clampPos(W / 2, H * 0.42);
      homeX = p.x; homeY = p.y; x = p.x; y = p.y;
    }
    initHome();

    function drawFrame(t) {
      ctx.setTransform(Z, 0, 0, Z, 0, 0);
      ctx.clearRect(0, 0, W, H);

      var bob = (reduced || dragging) ? 0 : Math.sin(t * 0.0016) * 3;
      var squash = 1 - bounce * 0.12;
      var stretch = 1 + bounce * 0.10;
      var cx = x, cy = y + bob - bounce * 8;

      // ground shadow - fades a little while lifted (dragging)
      var liftK = dragging ? 0.5 : 1;
      ctx.save();
      ctx.globalAlpha = 0.28 * liftK;
      ctx.fillStyle = '#150a04';
      ctx.beginPath();
      ctx.ellipse(cx, homeY + LEG_LEN * 0.75, (headR - bounce * 3) * liftK, 9 * liftK, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // soft ambient glow behind the body (voxel-clay warmth, not a hard rim)
      var glow = ctx.createRadialGradient(cx, cy - 6, headR * 0.6, cx, cy - 6, headR * 1.9);
      glow.addColorStop(0, 'rgba(232, 129, 63, 0.20)');
      glow.addColorStop(1, 'rgba(232, 129, 63, 0)');
      ctx.fillStyle = glow;
      ctx.fillRect(cx - headR * 2, cy - headR * 2, headR * 4, headR * 4);

      // tentacles - tapered curved strokes with a smooth lengthwise gradient (light->dark)
      for (var i = 0; i < LEGS; i++) {
        var u = (i + 0.5) / LEGS - 0.5;
        var baseX = cx + u * headR * 1.55;
        var baseY = cy + headR * 0.6;
        var sway = (reduced || dragging) ? 0 : Math.sin(t * 0.0022 + i * 1.1) * (6 + Math.abs(u) * 5);
        var len = LEG_LEN * (0.86 + Math.abs(u) * 0.12) * stretch;
        var tipX = baseX + sway * 0.6 + u * 6;
        var tipY = baseY + len;
        var midX = baseX + sway;
        var midY = baseY + len * 0.55;
        var lg = ctx.createLinearGradient(baseX, baseY, tipX, tipY);
        var litTop = u < 0.05 ? PAL.mid : PAL.shade;
        lg.addColorStop(0, litTop);
        lg.addColorStop(1, PAL.dark);
        ctx.strokeStyle = lg;
        ctx.lineCap = 'round';
        ctx.lineWidth = 15 - Math.abs(u) * 7;
        ctx.beginPath();
        ctx.moveTo(baseX, baseY);
        ctx.quadraticCurveTo(midX, midY, tipX, tipY);
        ctx.stroke();
      }

      // head - smooth radial shading, soft highlight, no hard bands
      var hx = headR * (1 + (stretch - 1) * 0.4), hy = headR * squash;
      var hg = ctx.createRadialGradient(cx - hx * 0.32, cy - hy * 0.42, hx * 0.12, cx, cy, hx * 1.05);
      hg.addColorStop(0, PAL.light);
      hg.addColorStop(0.45, PAL.mid);
      hg.addColorStop(0.8, PAL.shade);
      hg.addColorStop(1, PAL.dark);
      ctx.fillStyle = hg;
      ctx.beginPath();
      ctx.ellipse(cx, cy, hx, hy, 0, 0, Math.PI * 2);
      ctx.fill();

      // warm belly patch, soft-edged
      var bg = ctx.createRadialGradient(cx, cy + hy * 0.34, 2, cx, cy + hy * 0.34, hx * 0.44);
      bg.addColorStop(0, PAL.belly);
      bg.addColorStop(1, 'rgba(255, 224, 173, 0)');
      ctx.fillStyle = bg;
      ctx.beginPath();
      ctx.ellipse(cx, cy + hy * 0.32, hx * 0.44, hy * 0.30, 0, 0, Math.PI * 2);
      ctx.fill();

      // eyes - follow pointer, blink, wink-happy on bounce, wide when grabbed
      var shut = blink > 0 ? Math.min(1, blink / 90) : 0;
      var happy = bounce > 0.35 && !dragging;
      var wide = dragging;
      var gx = clamp(mx, -1, 1), gy = clamp(my, -1, 1);
      if (dragging) { gx = 0; gy = -0.15; }
      for (var s = -1; s <= 1; s += 2) {
        var ex = cx + s * hx * 0.36 + gx * 2.4;
        var ey = cy - hy * 0.05 + gy * 2.2;
        if (happy) {
          ctx.strokeStyle = PAL.eye;
          ctx.lineWidth = 2.4;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.arc(ex, ey + 2, 4.6, Math.PI * 1.15, Math.PI * 1.85);
          ctx.stroke();
          continue;
        }
        var baseEh = wide ? 6.6 : 6.0;
        var eh = baseEh * (1 - shut * 0.94);
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.ellipse(ex, ey, wide ? 4.6 : 4.2, Math.max(0.6, eh), 0, 0, Math.PI * 2);
        ctx.fill();
        if (eh > 1.6) {
          ctx.fillStyle = PAL.eye;
          ctx.beginPath();
          ctx.arc(ex + gx * 1.3, ey + gy * 1.3, wide ? 2.1 : 2.0, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // sparks (click / release reaction)
      for (var k = sparks.length - 1; k >= 0; k--) {
        var q = sparks[k];
        q.x += q.vx; q.y += q.vy; q.vy += 0.02; q.a -= 0.03;
        if (q.a <= 0) { sparks.splice(k, 1); continue; }
        ctx.globalAlpha = Math.max(0, q.a);
        ctx.fillStyle = PAL.spark;
        ctx.beginPath();
        ctx.arc(q.x, q.y, 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    function spawnSparks(px, py) {
      for (var i = 0; i < 6; i++) {
        var a = Math.random() * Math.PI * 2;
        sparks.push({ x: px, y: py, vx: Math.cos(a) * 0.6, vy: Math.sin(a) * 0.6 - 0.4, a: 1 });
      }
    }

    function loop(t) {
      raf = 0;
      if (destroyed || !canvas.isConnected || !visible || document.hidden) return;
      if (t - lastBlink > nextBlink) { blink = 90; lastBlink = t; nextBlink = 2400 + Math.random() * 3600; }
      if (blink > 0) blink -= 16.7;
      if (bounce > 0) bounce = Math.max(0, bounce - 0.02);
      if (!dragging) {
        // idle wander around the current home position
        if (t - lastPointer > 3500) {
          wanderT -= 16.7;
          if (wanderT <= 0) {
            wanderT = 1800 + Math.random() * 2400;
            wanderX = (Math.random() - 0.5) * 1.2; wanderY = -0.4 + Math.random() * 0.7;
          }
          mx += (wanderX - mx) * 0.02; my += (wanderY - my) * 0.02;
        }
        x += (homeX - x) * 0.08;
        y += (homeY - y) * 0.08;
      }
      drawFrame(t);
      raf = requestAnimationFrame(loop);
    }

    function localPoint(e) {
      var r = canvas.getBoundingClientRect();
      return { x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H };
    }

    function onMove(e) {
      var r = canvas.getBoundingClientRect();
      if (!r.width) return;
      lastPointer = performance.now();
      if (dragging) {
        var p = localPoint(e);
        var clamped = clampPos(p.x - dragDX, p.y - dragDY);
        x = clamped.x; y = clamped.y;
        // the rAF loop already redraws every frame when running; a manual redraw is only
        // needed here when reduced-motion turned that loop off, so drag still tracks live
        if (reduced) drawFrame(performance.now());
        return;
      }
      mx = clamp((e.clientX - (r.left + r.width / 2)) / 220, -1, 1);
      my = clamp((e.clientY - (r.top + r.height / 2)) / 220, -1, 1);
    }

    function onDown(e) {
      var p = localPoint(e);
      var d = Math.hypot(p.x - x, p.y - (y - headR * 0.15));
      if (d <= headR * 1.5) {
        dragging = true; wasDragged = false;
        dragDX = p.x - x; dragDY = p.y - y;
        canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId);
      } else {
        bounce = 1;
        spawnSparks(x, y - headR * 0.6);
      }
      if (reduced) drawFrame(performance.now());
    }
    function onUp(e) {
      if (dragging) {
        dragging = false;
        homeX = x; homeY = y; // stay wherever it was dropped
        bounce = 1;
        spawnSparks(x, y - headR * 0.6);
        if (reduced) drawFrame(performance.now());
      }
    }
    canvas.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerup', onUp);
    canvas.style.touchAction = 'none';
    canvas.style.cursor = 'grab';

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
        window.removeEventListener('pointerup', onUp);
        if (raf) cancelAnimationFrame(raf);
      },
    };
  }
  global.LivingOctopus = { createOctopus: createOctopus };
})(window);
