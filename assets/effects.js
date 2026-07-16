/* Вау-слой витрины: scramble + kinetic type на заголовках секций, cursor-spotlight
   на карточках. Порт эталонов портфолио (scramble.ts / kinetic.ts) на vanilla JS.
   Reduced-motion: текст-эффекты не вешаются вообще; spotlight остаётся (следует за
   курсором, не автономная анимация), но без transition. */
(function () {
  'use strict';
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Text scramble ---------- */
  var POOL_LAT = 'ABCDEFGHIJKLMNPQRSTUVWXYZ#<>/*+=';
  var POOL_CYR = 'АБВГДЕЖЗИКЛМНПРСТУФХЦЧШЩЭЮЯ#<>/*';
  function poolFor(ch) { return /[Ѐ-ӿ]/.test(ch) ? POOL_CYR : POOL_LAT; }

  function scrambleElement(el, duration) {
    /* короче, чем на портфолио (1750): на витрине услуг кадр со скрёмбленной
       кириллицей в статичном скриншоте читается как опечатка, а не как эффект */
    duration = duration || 1100;
    var chunks = [];
    var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    var total = 0;
    for (var n = walker.nextNode(); n; n = walker.nextNode()) {
      var final = n.textContent || '';
      if (final.trim()) { chunks.push({ node: n, final: final }); total += final.length; }
    }
    if (!total) return;

    var t0 = performance.now();
    var lastShuffle = 0;
    var shuffled = chunks.map(function (c) { return c.final.split(''); });
    function restore() { chunks.forEach(function (c) { c.node.textContent = c.final; }); }

    function tick(now) {
      var p = Math.min(1, (now - t0) / duration);
      var eased = p * p * (3 - 2 * p); /* smoothstep */
      if (now - lastShuffle > 40) {
        lastShuffle = now;
        shuffled = chunks.map(function (c) {
          return c.final.split('').map(function (ch) {
            if (!/[\p{L}\p{N}]/u.test(ch)) return ch;
            var pool = poolFor(ch);
            return pool[(Math.random() * pool.length) | 0];
          });
        });
      }
      var offset = 0;
      for (var i = 0; i < chunks.length; i++) {
        var c = chunks[i];
        var settled = Math.max(0, Math.round(eased * total) - offset);
        c.node.textContent = settled >= c.final.length
          ? c.final
          : c.final.slice(0, settled) + shuffled[i].slice(settled).join('');
        offset += c.final.length;
      }
      if (p < 1) requestAnimationFrame(tick);
      else restore();
    }
    requestAnimationFrame(tick);
  }

  if (!reduce && 'IntersectionObserver' in window) {
    document.querySelectorAll('[data-scramble]').forEach(function (el) {
      var io = new IntersectionObserver(function (entries) {
        if (entries.some(function (e) { return e.isIntersecting; })) {
          io.disconnect();
          scrambleElement(el);
        }
      }, { threshold: 0.6, rootMargin: '0px 0px -15% 0px' });
      io.observe(el);
    });
  }

  /* ---------- Kinetic type: вес букв плывёт за курсором (variable fonts) ---------- */
  function isCyr(ch) { return /[Ѐ-ӿ]/.test(ch); }

  function kineticElement(el) {
    var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    var textNodes = [];
    for (var n = walker.nextNode(); n; n = walker.nextNode()) {
      if ((n.textContent || '').trim()) textNodes.push(n);
    }
    /* буквы-спаны группируются в слова-обёртки с nowrap — иначе inline-block спаны
       позволяют строке рваться посреди слова («Продуктов / ые») */
    var letters = [];
    textNodes.forEach(function (node) {
      var frag = document.createDocumentFragment();
      var word = null;
      Array.from(node.textContent || '').forEach(function (ch) {
        if (ch === ' ') { word = null; frag.appendChild(document.createTextNode(' ')); return; }
        if (!word) {
          word = document.createElement('span');
          word.style.display = 'inline-block';
          word.style.whiteSpace = 'nowrap';
          frag.appendChild(word);
        }
        var sp = document.createElement('span');
        sp.textContent = ch;
        sp.style.display = 'inline-block';
        /* базовый вес близок к статическому (Oswald клампится на 700, Big Shoulders 900),
           иначе заголовки заметно «худеют» в момент инициализации эффекта */
        sp.style.fontVariationSettings = '"wght" ' + (isCyr(ch) ? 640 : 800);
        letters.push(sp);
        word.appendChild(sp);
      });
      node.parentNode && node.parentNode.replaceChild(frag, node);
    });
    if (!letters.length) return;

    var raf = 0;
    var px = -1e4, py = -1e4;
    /* rect'ы кэшируются и инвалидируются по scroll/resize — иначе N букв ×
       getBoundingClientRect на каждый кадр движения мыши = layout thrash */
    var rectCache = null;
    function invalidateRects() { rectCache = null; }
    window.addEventListener('scroll', invalidateRects, { passive: true });
    window.addEventListener('resize', invalidateRects);
    function frame() {
      raf = 0;
      if (!rectCache) rectCache = letters.map(function (l) { return l.getBoundingClientRect(); });
      letters.forEach(function (l, i) {
        var r = rectCache[i];
        var dx = px - (r.left + r.width / 2);
        var dy = py - (r.top + r.height / 2);
        var f = Math.exp(-(dx * dx + dy * dy) / (2 * 110 * 110));
        var cyr = isCyr(l.textContent || '');
        var base = cyr ? 640 : 800;
        var peak = cyr ? 700 : 900;
        l.style.fontVariationSettings = '"wght" ' + Math.round(base + (peak - base) * f);
        l.style.transform = f > 0.02 ? 'translateY(' + (-3 * f).toFixed(2) + 'px)' : '';
      });
    }
    var inZone = false;
    window.addEventListener('pointermove', function (e) {
      var box = el.getBoundingClientRect();
      var near = e.clientY >= box.top - 220 && e.clientY <= box.bottom + 220;
      if (!near) {
        if (inZone) { /* кадр-сброс, иначе буквы залипают жирными */
          inZone = false;
          px = py = -1e4;
          if (!raf) raf = requestAnimationFrame(frame);
        }
        return;
      }
      inZone = true;
      px = e.clientX;
      py = e.clientY;
      if (!raf) raf = requestAnimationFrame(frame);
    }, { passive: true });
  }

  if (!reduce && matchMedia('(hover: hover) and (pointer: fine)').matches) {
    document.querySelectorAll('[data-kinetic]').forEach(kineticElement);
  }

  /* ---------- Cursor spotlight на карточках ---------- */
  /* Один делегированный listener; пишем только CSS-переменные (без чтений в горячем
     пути, кроме rect самой карточки). Touch-устройства не входят (hover: none). */
  if (matchMedia('(hover: hover) and (pointer: fine)').matches) {
    var lastSpot = null;
    document.addEventListener('pointermove', function (e) {
      var card = e.target && e.target.closest ? e.target.closest('[data-spot]') : null;
      if (lastSpot && lastSpot !== card) {
        lastSpot.classList.remove('spot-on');
        lastSpot = null;
      }
      if (!card) return;
      var r = card.getBoundingClientRect();
      card.style.setProperty('--mx', (e.clientX - r.left) + 'px');
      card.style.setProperty('--my', (e.clientY - r.top) + 'px');
      if (lastSpot !== card) {
        card.classList.add('spot-on');
        lastSpot = card;
      }
    }, { passive: true });
  }
})();
