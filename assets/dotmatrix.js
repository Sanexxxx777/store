/* Dot-matrix глифы: текст собирается из точек-частиц (приём табло OpenAI Build Week).
   Любой <canvas data-dots="текст"> рендерится точечной матрицей:
   - появление в вьюпорте → точки слетаются из рассеяния в позиции глифов;
   - hover → взрыв-рассыпание и пересборка;
   - в покое — лёгкое LED-мерцание отдельных точек.
   Цвет: data-color (CSS-значение) или дефолт cream; для .dm-price — коралл цены.
   Перф: rAF живёт только пока канвас в вьюпорте и вкладка видима; reduced-motion —
   один статичный кадр без анимации и hover. */
(function () {
  'use strict';
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var DPR = Math.min(window.devicePixelRatio || 1, 2);

  function buildDots(canvas) {
    var text = canvas.dataset.dots || '';
    if (!text) return null;
    var cw = canvas.clientWidth, ch = canvas.clientHeight;
    if (!cw || !ch) return null;
    canvas.width = Math.round(cw * DPR);
    canvas.height = Math.round(ch * DPR);

    /* глиф-сэмплер: текст в offscreen, читаем альфу по сетке */
    var off = document.createElement('canvas');
    off.width = canvas.width; off.height = canvas.height;
    var octx = off.getContext('2d', { willReadFrequently: true });
    var size = ch * DPR * 0.92;
    octx.font = '600 ' + size + 'px "JetBrains Mono", monospace';
    octx.textBaseline = 'middle';
    /* вписать по ширине: моно-шрифт меряется точно */
    var w = octx.measureText(text).width;
    if (w > off.width) {
      size *= off.width / w * 0.98;
      octx.font = '600 ' + size + 'px "JetBrains Mono", monospace';
      w = octx.measureText(text).width;
    }
    octx.fillStyle = '#fff';
    var x0 = canvas.dataset.align === 'left' ? 0 : (off.width - w) / 2;
    octx.fillText(text, x0, off.height / 2);

    var gap = Math.max(3, Math.round(size / 11));
    var img = octx.getImageData(0, 0, off.width, off.height).data;
    var dots = [];
    for (var y = gap >> 1; y < off.height; y += gap) {
      for (var x = gap >> 1; x < off.width; x += gap) {
        if (img[(y * off.width + x) * 4 + 3] > 128) {
          dots.push({
            tx: x, ty: y,
            x: x + (Math.random() - .5) * 140 * DPR,
            y: y + (Math.random() - .5) * 90 * DPR,
            vx: 0, vy: 0,
            delay: (x / off.width) * 420 + Math.random() * 260,
            phase: Math.random() * Math.PI * 2,
            flick: 0.55 + Math.random() * 0.45,
          });
        }
      }
    }
    return { dots: dots, r: gap * 0.34, settledAt: 0 };
  }

  function initCanvas(canvas) {
    var ctx = canvas.getContext('2d');
    var color = canvas.dataset.color ||
      (canvas.classList.contains('dm-price') ? '#ee4e4e'
        : canvas.classList.contains('watermark-dots') ? 'rgba(255,255,255,0.13)'
          : '#b8b1a3');
    var state = buildDots(canvas);
    if (!state) return;

    // поворот телефона / resize меняет CSS-ширину канваса - буфер надо пересобрать,
    // иначе точки растягиваются вместе с канвасом
    if ('ResizeObserver' in window) {
      var lastW = canvas.clientWidth;
      new ResizeObserver(function () {
        var w = canvas.clientWidth;
        if (!w || Math.abs(w - lastW) < 5) return;
        lastW = w;
        var ns = buildDots(canvas);
        if (!ns) return;
        state = ns;
        if (reduce) { drawStatic(); } else { assembling = true; t0 = 0; wake(); }
      }).observe(canvas);
    }

    function drawStatic() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = color;
      state.dots.forEach(function (d) {
        ctx.beginPath();
        ctx.arc(d.tx, d.ty, state.r, 0, 7);
        ctx.fill();
      });
    }

    if (reduce) { drawStatic(); return; }

    var raf = 0, t0 = 0, visible = false, assembling = false;

    function frame(now) {
      raf = 0;
      if (!visible || document.hidden) return;
      if (!t0) t0 = now;
      var busy = false;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = color;
      for (var i = 0; i < state.dots.length; i++) {
        var d = state.dots[i];
        var live = assembling ? Math.max(0, Math.min(1, (now - t0 - d.delay) / 640)) : 1;
        /* пружина к цели + затухание разлёта */
        d.vx = (d.vx + (d.tx - d.x) * 0.045) * 0.82;
        d.vy = (d.vy + (d.ty - d.y) * 0.045) * 0.82;
        d.x += d.vx; d.y += d.vy;
        if (Math.abs(d.tx - d.x) > .4 || Math.abs(d.ty - d.y) > .4 || live < 1) busy = true;
        /* LED-мерцание: медленная синус-пульсация + редкие «пропадания» точки */
        var shimmer = 0.78 + 0.22 * Math.sin(now * 0.0011 * d.flick + d.phase);
        if (((now * 0.001 + d.phase) % 7) < 0.06) shimmer *= 0.25;
        ctx.globalAlpha = live * shimmer;
        ctx.beginPath();
        ctx.arc(d.x, d.y, state.r, 0, 7);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      if (busy || visible) raf = requestAnimationFrame(frame);
    }

    function wake() { if (!raf && visible && !document.hidden) raf = requestAnimationFrame(frame); }

    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        visible = e.isIntersecting;
        if (visible && !assembling) { assembling = true; t0 = 0; }
        wake();
      });
    }, { threshold: 0.2 });
    io.observe(canvas);
    document.addEventListener('visibilitychange', wake);

    /* hover-взрыв: точки разлетаются, пружина собирает обратно */
    if (matchMedia('(hover: hover) and (pointer: fine)').matches) {
      canvas.addEventListener('pointerenter', function () {
        state.dots.forEach(function (d) {
          var a = Math.random() * Math.PI * 2;
          var f = (2 + Math.random() * 5) * DPR;
          d.vx += Math.cos(a) * f;
          d.vy += Math.sin(a) * f;
        });
        wake();
      });
    }
  }

  function boot() {
    document.querySelectorAll('canvas[data-dots]').forEach(initCanvas);
  }
  /* шрифт нужен загруженным - иначе сэмплим fallback-моноширинку */
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(boot);
  } else {
    window.addEventListener('load', boot);
  }
})();
