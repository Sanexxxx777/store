/* Ember Portrait — прототип (Фаза 0). НЕ продовый файл витрины,
   черновик для визуальной сверки с референсом (yudho.xyz "Beneath the Seventh").
   Механика: живой пул мазков (не флипбук). Каждый мазок — независимый объект с
   циклом fade-in -> hold -> fade-out -> respawn (новый кластер-сэмпл, новая
   геометрия), фазы стартово разнесены, альфа — плавная огибающая + лёгкий дрейф
   и микро-мерцание. Рендерится каждый rAF-кадр (60fps) в офскрин-слой, без
   пер-кадрового ката. Силуэт-маска процедурная (bezier), реальный AI-портрет
   встанет в Фазе 1 — сэмплинг/поле ориентаций ниже не изменятся. */
(function () {
  'use strict';
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var DPR = Math.min(window.devicePixelRatio || 1, 2);

  var FALL_ANGLE = -65 * Math.PI / 180; // глобальный угол падения (вниз-влево), фолбэк там, где градиент маски слаб
  var GRAD_THRESHOLD = 0.035;

  function computeLayout(w, h) {
    var cx = w * 0.5, cy = h * 0.52;
    // 0.69 (было 0.62) - вертикальная протяжённость композиции ~90-95% высоты канваса
    // вместо прежних ~60-70% (замер референса: контент почти без чёрных полей)
    var s = Math.min(w, h) * 0.69;
    return { cx: cx, cy: cy, s: s, cometX: cx + s * 0.02, cometY: cy - s * 0.86 };
  }

  // миндалевидный контур (глаз/пламя), общий для внешнего и внутреннего (вырез) прохода
  function almondPath(ctx, s, k) {
    ctx.beginPath();
    ctx.moveTo(-s * 0.62 * k, s * 0.05 * k);
    ctx.bezierCurveTo(-s * 0.5 * k, -s * 0.32 * k, s * 0.3 * k, -s * 0.4 * k, s * 0.6 * k, -s * 0.02 * k);
    ctx.bezierCurveTo(s * 0.32 * k, s * 0.42 * k, -s * 0.3 * k, s * 0.5 * k, -s * 0.62 * k, s * 0.05 * k);
    ctx.closePath();
  }

  function paintSilhouette(ctx, w, h) {
    var layout = computeLayout(w, h);
    var s = layout.s;
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.translate(layout.cx, layout.cy);

    // reference = ОБОД частиц, не заливка: тело светится по кайме, центр остаётся
    // тёмным. Внешний контур залит мягким градиентом, затем меньшая копия того же
    // контура вырезается destination-out - остаётся кольцо. Маска ТОЛЬКО альфой,
    // RGB всегда белый.
    var g = ctx.createRadialGradient(0, s * 0.05, s * 0.1, 0, s * 0.05, s * 0.66);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.6, 'rgba(255,255,255,0.9)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    almondPath(ctx, s, 1.08);
    ctx.fill();

    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = 'rgba(0,0,0,0.94)';
    almondPath(ctx, s, 0.66);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';

    // диагональный "росчерк"-луч вверх-влево + звёздный блик на конце (как в референсе)
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = s * 0.05;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-s * 0.1, -s * 0.05);
    ctx.lineTo(s * 0.05, -s * 0.92);
    ctx.stroke();
    var fx = s * 0.02, fy = -s * 0.86;
    ctx.fillStyle = '#fff';
    for (var i = 0; i < 4; i++) {
      var a = (i / 4) * Math.PI * 2 + 0.4;
      ctx.beginPath();
      ctx.ellipse(fx + Math.cos(a) * s * 0.1, fy + Math.sin(a) * s * 0.1, s * 0.06, s * 0.015, a, 0, 7);
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(fx, fy, s * 0.05, 0, 7);
    ctx.fill();

    // "каскад": широкая мягкая полоса от нижней дуги кольца вниз до низа кадра -
    // в референсе это водопад мазков вниз. Низкая альфа, мягкие края, лёгкое
    // сужение/расширение по псевдо-шуму (сумма синусоид).
    var cascTop = s * 0.46, cascBot = h - layout.cy;
    if (cascBot > cascTop) {
      var steps = 16, midX = -s * 0.02, baseHalfW = s * 0.34;
      var leftPts = [], rightPts = [];
      for (var ci = 0; ci <= steps; ci++) {
        var tt = ci / steps;
        var y = cascTop + (cascBot - cascTop) * tt;
        var wobble = Math.sin(tt * 7.3) * s * 0.06 + Math.sin(tt * 3.1 + 1.7) * s * 0.04;
        var halfW = Math.max(s * 0.05, baseHalfW * (1 - tt * 0.4) + Math.sin(tt * 11 + 0.5) * s * 0.03);
        var cxw = midX + wobble;
        leftPts.push([cxw - halfW, y]);
        rightPts.push([cxw + halfW, y]);
      }
      ctx.beginPath();
      ctx.moveTo(leftPts[0][0], leftPts[0][1]);
      for (ci = 1; ci < leftPts.length; ci++) ctx.lineTo(leftPts[ci][0], leftPts[ci][1]);
      for (ci = rightPts.length - 1; ci >= 0; ci--) ctx.lineTo(rightPts[ci][0], rightPts[ci][1]);
      ctx.closePath();
      var cg = ctx.createLinearGradient(0, cascTop, 0, cascBot);
      cg.addColorStop(0, 'rgba(255,255,255,0.5)');
      cg.addColorStop(0.55, 'rgba(255,255,255,0.4)');
      cg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = cg;
      ctx.fill();
    }
    ctx.restore();
  }

  // --- поле ориентаций: alpha маски -> сетка -> блюр -> градиент центр. разностями ---
  function boxBlur(src, cols, rows) {
    var out = new Float32Array(cols * rows);
    for (var y = 0; y < rows; y++) {
      for (var x = 0; x < cols; x++) {
        var sum = 0, cnt = 0;
        for (var dy = -1; dy <= 1; dy++) {
          var yy = y + dy;
          if (yy < 0 || yy >= rows) continue;
          for (var dx = -1; dx <= 1; dx++) {
            var xx = x + dx;
            if (xx < 0 || xx >= cols) continue;
            sum += src[yy * cols + xx]; cnt++;
          }
        }
        out[y * cols + x] = sum / cnt;
      }
    }
    return out;
  }

  function buildOrientationField(alphaData, w, h, step) {
    var cols = Math.ceil(w / step) + 1, rows = Math.ceil(h / step) + 1;
    var field = new Float32Array(cols * rows);
    for (var ry = 0; ry < rows; ry++) {
      var py = Math.min(h - 1, ry * step);
      for (var rx = 0; rx < cols; rx++) {
        var px = Math.min(w - 1, rx * step);
        field[ry * cols + rx] = alphaData[(py * w + px) * 4 + 3] / 255;
      }
    }
    field = boxBlur(field, cols, rows);
    field = boxBlur(field, cols, rows);
    var gx = new Float32Array(cols * rows), gy = new Float32Array(cols * rows);
    for (ry = 0; ry < rows; ry++) {
      for (rx = 0; rx < cols; rx++) {
        var xl = field[ry * cols + Math.max(0, rx - 1)];
        var xr = field[ry * cols + Math.min(cols - 1, rx + 1)];
        var yt = field[Math.max(0, ry - 1) * cols + rx];
        var yb = field[Math.min(rows - 1, ry + 1) * cols + rx];
        gx[ry * cols + rx] = (xr - xl) * 0.5;
        gy[ry * cols + rx] = (yb - yt) * 0.5;
      }
    }
    return { field: field, gx: gx, gy: gy, cols: cols, rows: rows, step: step };
  }

  function sampleField(fieldObj, x, y) {
    var rx = Math.max(0, Math.min(fieldObj.cols - 1, Math.round(x / fieldObj.step)));
    var ry = Math.max(0, Math.min(fieldObj.rows - 1, Math.round(y / fieldObj.step)));
    var idx = ry * fieldObj.cols + rx;
    var gx = fieldObj.gx[idx], gy = fieldObj.gy[idx];
    var mag = Math.sqrt(gx * gx + gy * gy);
    var angle = mag > GRAD_THRESHOLD
      ? Math.atan2(gy, gx) + Math.PI / 2
      : FALL_ANGLE + (Math.random() - 0.5) * (24 * Math.PI / 180);
    return { angle: angle, density: fieldObj.field[idx] };
  }

  function pickClusterCenter(fieldObj, w, h) {
    for (var tries = 0; tries < 40; tries++) {
      var x = Math.random() * w, y = Math.random() * h;
      var d = sampleField(fieldObj, x, y).density;
      if (Math.random() < Math.pow(d, 0.6)) return { x: x, y: y };
    }
    return null;
  }

  function randInt(a, b) { return Math.round(a + Math.random() * (b - a)); }

  function smoothstep(t) { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); }

  // огибающая fade-in -> hold -> fade-out по возрасту объекта (общая для мазков и фоновых следов)
  function lifeEnvelope(o) {
    if (o.age < o.fadeIn) return smoothstep(o.age / o.fadeIn);
    if (o.age < o.fadeIn + o.hold) return 1;
    return 1 - smoothstep((o.age - o.fadeIn - o.hold) / o.fadeOut);
  }

  // палитра по heat = альфа*rand: ~70% глубокий красный, ~26.3% средний, ~3% оранж, ~0.7% почти белый
  // (доля оранж/белых вне зоны блика чуть срезана против исходных 4%/1% - "притушить яркость")
  function pickEmberColor(forceHot) {
    var r = forceHot ? 0.97 + Math.random() * 0.03 : Math.random();
    if (r > 0.993) return randInt(255, 255) + ',' + randInt(225, 255) + ',' + randInt(190, 220);
    if (r > 0.963) return randInt(255, 255) + ',' + randInt(140, 170) + ',' + randInt(50, 70);
    if (r > 0.70) return randInt(210, 240) + ',' + randInt(40, 60) + ',' + randInt(20, 30);
    return randInt(150, 190) + ',' + randInt(15, 30) + ',' + randInt(10, 20);
  }

  function dist(x1, y1, x2, y2) { var dx = x1 - x2, dy = y1 - y2; return Math.sqrt(dx * dx + dy * dy); }

  // --- живой мазок: геометрия считается один раз при spawn/respawn, в кадре только fill ---
  function pickEmberOrigin(w, h, center) {
    var a0 = Math.random() * Math.PI * 2, rad = Math.random() * 7 * DPR; // было 10 - плотнее кластер (~6-8px)
    var sx = center.x + Math.cos(a0) * rad, sy = center.y + Math.sin(a0) * rad;
    if (sx < 0 || sx >= w || sy < 0 || sy >= h) return null;
    return { x: sx, y: sy };
  }

  // угловатый полигон-осколок (5-8 вершин, радиус джиттер ±40-60%, вытянут вдоль
  // ориентации потока) вместо гладкого мазка - референс: рваные сгустки-осколки,
  // не тонкие изогнутые "волосы"
  function buildEmberGeometry(fieldObj, w, h, layout, sx, sy) {
    var o = sampleField(fieldObj, sx, sy);
    var angle = o.angle + (Math.random() - 0.5) * (30 * Math.PI / 180); // ±15° джиттер
    var dx = Math.cos(angle), dy = Math.sin(angle);
    var px = -dy, py = dx;
    var baseRadius = w * (0.003 + Math.random() * 0.011); // диаметр ~0.6-2.8% ширины канваса (замер референса) -> радиус вдвое меньше
    var stretch = 1.3 + Math.random() * 0.5; // эллиптическое вытягивание вдоль потока
    var vertCount = randInt(5, 8);
    var angleStep = (Math.PI * 2) / vertCount;
    var verts = [];
    for (var vi = 0; vi < vertCount; vi++) {
      var vAngle = vi * angleStep + (Math.random() - 0.5) * angleStep * 0.3;
      var jitter = 0.4 + Math.random() * 0.2; // ±40-60% радиуса на вершину - рваный контур
      var r = baseRadius * (1 + (Math.random() * 2 - 1) * jitter);
      var lx = Math.cos(vAngle) * r * stretch, ly = Math.sin(vAngle) * r;
      verts.push([dx * lx + px * ly, dy * lx + py * ly]);
    }
    var nearComet = dist(sx, sy, layout.cometX, layout.cometY) < layout.s * 0.13;
    var driftDist = (2 + Math.random() * 3) * DPR; // "уголёк плывёт" - за жизнь мазка, не телепорт
    var fadeIn = 150 + Math.random() * 150;
    var hold = 450 + Math.random() * 450;
    var fadeOut = 250 + Math.random() * 150;
    return {
      x: sx, y: sy,
      verts: verts,
      driftDx: dx * driftDist, driftDy: dy * driftDist,
      color: pickEmberColor(nearComet),
      alphaBase: 0.55 + Math.random() * 0.45,
      fadeIn: fadeIn, hold: hold, fadeOut: fadeOut, total: fadeIn + hold + fadeOut,
      age: 0,
      flickerFreq: 0.5 + Math.random() * 1, // 0.5-1.5 Гц тление
      flickerPhase: Math.random() * Math.PI * 2
    };
  }

  function respawnEmber(e, fieldObj, w, h, layout) {
    var carry = Math.max(0, e.age - e.total);
    var center = pickClusterCenter(fieldObj, w, h);
    var origin = center ? pickEmberOrigin(w, h, center) : null;
    var g = buildEmberGeometry(fieldObj, w, h, layout, origin ? origin.x : e.x, origin ? origin.y : e.y);
    for (var k in g) e[k] = g[k];
    e.age = carry;
  }

  function seedEmberPool(fieldObj, w, h, layout) {
    // attempts x~1.5, кластер n 4-9 (было 2-5) - плотнее упаковка, ядро потока
    // почти сплошное, амортизируется циклом жизни (не все видны одновременно)
    var attempts = Math.max(120, Math.round((w * h) / 1900));
    var pool = [];
    for (var ci = 0; ci < attempts; ci++) {
      var center = pickClusterCenter(fieldObj, w, h);
      if (!center) continue;
      var n = randInt(4, 9);
      for (var si = 0; si < n; si++) {
        var origin = pickEmberOrigin(w, h, center);
        if (!origin) continue;
        var e = buildEmberGeometry(fieldObj, w, h, layout, origin.x, origin.y);
        e.age = Math.random() * e.total; // стартовые фазы разнесены - иначе все мигнут волной
        pool.push(e);
      }
    }
    return pool;
  }

  function updateAndDrawEmbers(lctx, pool, dt, nowMs, fieldObj, w, h, layout) {
    for (var i = 0; i < pool.length; i++) {
      var e = pool[i];
      e.age += dt;
      if (e.age >= e.total) respawnEmber(e, fieldObj, w, h, layout);
      var env = lifeEnvelope(e);
      if (env <= 0) continue;
      var flicker = 1 + 0.1 * Math.sin((nowMs / 1000) * e.flickerFreq * Math.PI * 2 + e.flickerPhase);
      var alpha = Math.max(0, Math.min(1, e.alphaBase * env * flicker));
      var driftT = Math.min(1, e.age / e.total);
      var cx = e.x + e.driftDx * driftT, cy = e.y + e.driftDy * driftT;
      var verts = e.verts;
      lctx.fillStyle = 'rgba(' + e.color + ',' + alpha.toFixed(3) + ')';
      lctx.beginPath();
      lctx.moveTo(cx + verts[0][0], cy + verts[0][1]);
      for (var vi = 1; vi < verts.length; vi++) lctx.lineTo(cx + verts[vi][0], cy + verts[vi][1]);
      lctx.closePath();
      lctx.fill();
    }
  }

  // фоновый слой: тонкие пунктирные диагональные следы (далёкий дождь) - тот же
  // медленный цикл fade-in/hold/fade-out что и мазки, геометрия кэшируется при spawn
  function buildStreakGeometry(w, h) {
    var isRed = Math.random() < 0.12;
    var x0 = Math.random() * w, y0 = Math.random() * h;
    var ang = FALL_ANGLE + (Math.random() - 0.5) * 0.3;
    var len = (40 + Math.random() * 160) * DPR;
    var dotCount = randInt(4, 11);
    var pts = [];
    for (var d = 0; d < dotCount; d++) {
      var t = dotCount > 1 ? d / (dotCount - 1) : 0;
      pts.push([Math.cos(ang) * len * t, Math.sin(ang) * len * t]);
    }
    var fadeIn = 1000 + Math.random() * 1000, hold = 500 + Math.random() * 1000, fadeOut = 1000 + Math.random() * 1000;
    return {
      x0: x0, y0: y0, pts: pts, isRed: isRed,
      alphaBase: 0.15 + Math.random() * 0.2,
      fadeIn: fadeIn, hold: hold, fadeOut: fadeOut, total: fadeIn + hold + fadeOut,
      age: 0
    };
  }

  function respawnStreak(s, w, h) {
    var carry = Math.max(0, s.age - s.total);
    var g = buildStreakGeometry(w, h);
    for (var k in g) s[k] = g[k];
    s.age = carry;
  }

  function seedStreakPool(w, h) {
    var n = randInt(15, 25);
    var pool = [];
    for (var i = 0; i < n; i++) {
      var s = buildStreakGeometry(w, h);
      s.age = Math.random() * s.total; // индивидуальные фазы
      pool.push(s);
    }
    return pool;
  }

  function updateAndDrawStreaks(lctx, pool, dt, w, h) {
    var dotSize = Math.max(1, Math.round(DPR));
    for (var i = 0; i < pool.length; i++) {
      var s = pool[i];
      s.age += dt;
      if (s.age >= s.total) respawnStreak(s, w, h);
      var env = lifeEnvelope(s);
      if (env <= 0) continue;
      var alpha = s.alphaBase * env;
      lctx.fillStyle = s.isRed ? 'rgba(120,20,15,' + alpha.toFixed(3) + ')' : 'rgba(225,225,230,' + alpha.toFixed(3) + ')';
      for (var p = 0; p < s.pts.length; p++) {
        lctx.fillRect(s.x0 + s.pts[p][0], s.y0 + s.pts[p][1], dotSize, dotSize);
      }
    }
  }

  function initCanvas(canvas) {
    var ctx = canvas.getContext('2d');
    var cw = canvas.clientWidth, ch = canvas.clientHeight;
    if (cw <= 0 || ch <= 0) return;
    canvas.width = Math.round(cw * DPR);
    canvas.height = Math.round(ch * DPR);
    var w = canvas.width, h = canvas.height;

    var off = document.createElement('canvas');
    off.width = w; off.height = h;
    var octx = off.getContext('2d', { willReadFrequently: true });
    paintSilhouette(octx, w, h);
    var alphaData = octx.getImageData(0, 0, w, h).data;

    var step = Math.round(8 * DPR);
    var fieldObj = buildOrientationField(alphaData, w, h, step);
    var layout = computeLayout(w, h);

    var emberPool = seedEmberPool(fieldObj, w, h, layout);
    var streakPool = seedStreakPool(w, h);

    // офскрин-слой: мазки + фоновые следы рисуются сюда каждый кадр без фильтра,
    // геометрия у каждого объекта кэширована - в кадре только пересчёт альфы/дрейфа и stroke
    var layer = document.createElement('canvas');
    layer.width = w; layer.height = h;
    var lctx = layer.getContext('2d');

    function renderLayer(dt, nowMs) {
      lctx.clearRect(0, 0, w, h);
      updateAndDrawStreaks(lctx, streakPool, dt, w, h);
      updateAndDrawEmbers(lctx, emberPool, dt, nowMs, fieldObj, w, h, layout);
    }

    // bloom - ОДИН блит слоя через ctx.filter=blur, НЕ пер-фигурно (пер-фигурный blur
    // в софт-рендере уводит кадр в секунды - уже наступали), резкий слой поверх без фильтра
    function compositeFrame() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.globalCompositeOperation = 'lighter';
      ctx.save();
      ctx.filter = 'blur(' + (6 * DPR) + 'px)';
      ctx.globalAlpha = 0.55;
      ctx.drawImage(layer, 0, 0);
      ctx.restore();
      ctx.globalAlpha = 0.88;
      ctx.drawImage(layer, 0, 0);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }

    if (reduce) {
      // статичный кадр: заморозить всех в середине hold, без цикла rAF
      emberPool.forEach(function (e) { e.age = e.fadeIn + e.hold * 0.5; });
      streakPool.forEach(function (s) { s.age = s.fadeIn + s.hold * 0.5; });
      renderLayer(0, 0);
      compositeFrame();
      return;
    }

    var raf = 0, visible = false, lastTime = 0;
    function frame(now) {
      raf = 0;
      if (!visible || document.hidden) return;
      if (!lastTime) { lastTime = now; raf = requestAnimationFrame(frame); return; }
      var dt = Math.min(now - lastTime, 100);
      lastTime = now;
      renderLayer(dt, now);
      compositeFrame();
      raf = requestAnimationFrame(frame);
    }

    function wake() { if (!raf && visible && !document.hidden) raf = requestAnimationFrame(frame); }
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        visible = e.isIntersecting;
        if (visible) lastTime = 0;
        wake();
      });
    }, { threshold: 0.2 });
    io.observe(canvas);
    document.addEventListener('visibilitychange', wake);
  }

  function boot() {
    document.querySelectorAll('canvas[data-ember]').forEach(initCanvas);
  }
  window.addEventListener('load', boot);
  window.__EMBER_DEBUG_paintSilhouette = paintSilhouette; // debug-хук прототипа, убрать перед Фазой 1
})();
