/* Qwerty Switcher: сцены в окнах и проба в hero.
   Без JS и при prefers-reduced-motion в окнах остаётся статичный итог сцены из HTML.
   Перевод в пробе = прямая замена по клавишам ЙЦУКЕН ↔ QWERTY, как двойной Shift в приложении.
   Угадывания по словарю здесь нет: оно живёт только в приложении (словарь 697 тыс. слов). */
(function () {
  'use strict';

  var EN = "qwertyuiop[]asdfghjkl;'zxcvbnm,.`";
  var RU = 'йцукенгшщзхъфывапролджэячсмитьбюё';
  var EN_UP = 'QWERTYUIOP{}ASDFGHJKL:"ZXCVBNM<>~';
  var RU_UP = 'ЙЦУКЕНГШЩЗХЪФЫВАПРОЛДЖЭЯЧСМИТЬБЮЁ';
  var toRu = {}, toEn = {};
  for (var i = 0; i < EN.length; i++) {
    toRu[EN[i]] = RU[i]; toEn[RU[i]] = EN[i];
    toRu[EN_UP[i]] = RU_UP[i]; toEn[RU_UP[i]] = EN_UP[i];
  }

  function convert(s, target) {
    var map = target === 'ru' ? toRu : toEn;
    return Array.from(s, function (ch) { return map[ch] || ch; }).join('');
  }
  function targetOf(s) {
    var lat = (s.match(/[a-z]/gi) || []).length;
    var cyr = (s.match(/[а-яё]/gi) || []).length;
    if (lat > cyr) return 'ru';
    if (cyr > 0) return 'en';
    return null;
  }
  function keyFor(ch) {
    if (ch === ' ') return ' ';
    var j = EN.indexOf(ch);
    if (j < 0) j = EN_UP.indexOf(ch);
    if (j < 0) j = RU.indexOf(ch);
    if (j < 0) j = RU_UP.indexOf(ch);
    return j < 0 ? null : EN[j];
  }

  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var STOP = {};

  /* Экран одной сцены. Текст держим в трёх узлах (до отметки, отметка, после), чтобы
     отметка жила между перерисовками и её затухание шло переходом, а не скачком. */
  function Screen(mac, kb) {
    this.mac = mac;
    this.name = mac.getAttribute('data-scene');
    this.t = mac.querySelector('.t');
    this.badge = mac.querySelector('.mac-layout');
    this.tag = mac.querySelector('.tag');
    this.ds = mac.querySelector('.ds');
    this.kb = kb || mac.querySelector('.wasd');
    this.buf = '';
    this.mark = null;
    this.layout = 'en';
    this.alive = false;
    this.gen = 0;
    this.blocked = false;
    if (this.t) {
      this.pre = document.createTextNode('');
      this.mid = document.createElement('span');
      this.post = document.createTextNode('');
    }
  }
  Screen.prototype.mount = function () {
    if (!this.t || this.mounted) return;
    this.t.textContent = '';
    this.t.append(this.pre, this.mid, this.post);
    this.mounted = true;
  };
  Screen.prototype.render = function () {
    if (!this.t) return;
    var b = this.buf, m = this.mark;
    if (!m) { this.pre.data = b; this.mid.textContent = ''; this.post.data = ''; return; }
    this.pre.data = b.slice(0, m.from);
    this.mid.textContent = b.slice(m.from, m.to);
    this.post.data = b.slice(m.to);
  };
  Screen.prototype.setMark = function (from, to, cls) {
    this.mark = { from: from, to: to };
    var el = this.mid;
    el.style.transition = 'none';
    el.className = cls;
    this.render();
    void el.offsetWidth;
    el.style.transition = '';
  };
  Screen.prototype.wait = function (ms) {
    var self = this, g = this.gen;
    return new Promise(function (res, rej) {
      setTimeout(function () { if (self.alive && self.gen === g) res(); else rej(STOP); }, ms);
    });
  };
  Screen.prototype.press = function (k) {
    if (!this.kb || k == null) return;
    var el = this.kb.querySelector('[data-k="' + CSS.escape(k) + '"]');
    if (!el) return;
    el.classList.add('on');
    setTimeout(function () { el.classList.remove('on'); }, 150);
  };
  Screen.prototype.lang = function (l) {
    this.layout = l;
    if (!this.badge) return;
    this.badge.textContent = l.toUpperCase();
    var b = this.badge;
    b.classList.add('flash');
    setTimeout(function () { b.classList.remove('flash'); }, 650);
  };
  Screen.prototype.put = function (s) { this.buf += s; this.render(); };
  Screen.prototype.type = async function (s, speed) {
    for (var ch of s) {
      this.buf += ch;
      this.render();
      var letter = /[a-zа-яё]/i.test(ch) || ch === ' ' || (this.layout === 'en' && EN.indexOf(ch) >= 0);
      if (letter) this.press(keyFor(ch));
      await this.wait(ch === ' ' ? 130 : (speed || 75) + Math.random() * 60);
    }
  };
  /* Замена куска текста: короткое выделение, затем новый текст с янтарной отметкой, которая гаснет. */
  Screen.prototype.replace = async function (from, to, rep, lang) {
    this.setMark(from, to, 'sel');
    await this.wait(280);
    this.buf = this.buf.slice(0, from) + rep + this.buf.slice(to);
    this.setMark(from, from + rep.length, 'fx');
    if (lang) this.lang(lang);
    var el = this.mid, g = this.gen;
    var self = this;
    setTimeout(function () { if (self.gen === g) el.className = 'fx fade'; }, 1100);
  };
  Screen.prototype.fixLast = function (n, rep, lang) {
    return this.replace(this.buf.length - n, this.buf.length, rep, lang);
  };
  Screen.prototype.shift2 = async function () {
    if (this.ds) this.ds.classList.add('on');
    this.press('shiftl'); await this.wait(170);
    this.press('shiftl'); await this.wait(220);
    if (this.ds) this.ds.classList.remove('on');
  };
  Screen.prototype.show = function (on) { if (this.tag) this.tag.classList.toggle('hide', !on); };
  Screen.prototype.reset = function () {
    this.buf = ''; this.mark = null;
    if (this.mid) this.mid.className = '';
    this.render();
    this.show(this.name === 'game');
    if (this.ds) this.ds.classList.remove('on');
  };
  Screen.prototype.start = function () {
    if (this.alive || this.blocked || !SCENES[this.name]) return;
    this.alive = true;
    this.gen++;
    this.mount();
    var self = this, g = this.gen;
    (async function () {
      try {
        while (self.alive && self.gen === g) {
          self.reset();
          await SCENES[self.name](self);
        }
      } catch (e) { if (e !== STOP) throw e; }
    })();
  };
  Screen.prototype.stop = function () { this.alive = false; this.gen++; };

  var SCENES = {
    hero: async function (s) {
      s.lang('en'); await s.wait(500);
      await s.type('ghbd'); await s.wait(140);
      await s.fixLast(4, 'прив', 'ru');
      await s.type('ет, как дела?');
      await s.wait(2800);
      s.reset(); s.lang('ru'); await s.wait(600);
      await s.type('Ьууе'); await s.wait(140);
      await s.fixLast(4, 'Meet', 'en');
      await s.type('ing at 5?');
      await s.wait(2800);
    },
    instant: async function (s) {
      s.lang('en'); await s.wait(400);
      await s.type('pfdn'); await s.wait(140);
      await s.fixLast(4, 'завт', 'ru');
      await s.type('ра в 10');
      await s.wait(3000);
    },
    select: async function (s) {
      var src = 'Dfif pfzdrf ghbyznf';
      s.lang('en'); await s.wait(300);
      await s.type(src, 35); await s.wait(700);
      s.setMark(0, src.length, 'sel'); await s.wait(600);
      await s.shift2();
      await s.replace(0, src.length, convert(src, 'ru'), 'ru');
      await s.wait(3000);
    },
    term: async function (s) {
      s.lang('en'); s.show(false); await s.wait(300);
      s.put('~ % '); await s.type('git status'); await s.wait(500);
      s.put('\n~ % '); await s.type('npm run dev'); await s.wait(400);
      s.show(true);
      await s.wait(2600);
    },
    learn: async function (s) {
      var w = 'dfq,rjl', ru = convert(w, 'ru');
      s.show(false);
      for (var n = 0; n < 2; n++) {
        if (n) s.put('\n');
        s.lang('en'); await s.wait(300);
        await s.type(w); await s.wait(300);
        await s.shift2();
        await s.fixLast(w.length, ru, 'ru'); await s.wait(700);
      }
      s.put('\n'); s.lang('en'); await s.wait(300);
      await s.type(w + ' '); await s.wait(160);
      await s.replace(s.buf.length - w.length - 1, s.buf.length - 1, ru, 'ru');
      s.show(true);
      await s.wait(3000);
    },
    game: async function (s) {
      var seq = 'wwwaawwddsswwwdd';
      for (var ch of seq) { s.press(ch); await s.wait(190); }
      await s.wait(600);
    }
  };

  var heroKb = document.querySelector('.kb');
  var screens = [];
  document.querySelectorAll('.mac[data-scene]').forEach(function (mac) {
    var sc = new Screen(mac, mac.id === 'hero-scene' ? heroKb : null);
    mac._screen = sc;
    screens.push(sc);
  });

  if (!reduce && 'IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        var sc = en.target._screen;
        if (en.isIntersecting) sc.start(); else sc.stop();
      });
    }, { threshold: 0.35 });
    screens.forEach(function (sc) { io.observe(sc.mac); });
  }

  /* Оглавление слева подсвечивает сцену, которая сейчас посередине экрана. */
  var index = document.querySelectorAll('.fs-index li');
  if (index.length && 'IntersectionObserver' in window) {
    var mark = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        index.forEach(function (li) { li.classList.toggle('on', li.getAttribute('data-for') === en.target.id); });
      });
    }, { rootMargin: '-45% 0px -45% 0px' });
    document.querySelectorAll('.cap').forEach(function (c) { mark.observe(c); });
  }

  /* Проба: поле в окне hero. Двойной Shift = два чистых нажатия Shift без других клавиш за 600 мс. */
  var heroMac = document.getElementById('hero-scene');
  var field = document.getElementById('try-field');
  var toggle = document.getElementById('try-toggle');
  var convBtn = document.getElementById('try-convert');
  var cap = document.getElementById('try-cap');
  if (!heroMac || !field || !toggle) return;
  var hero = heroMac._screen;
  var typed = heroMac.querySelector('.typed');
  var badge = heroMac.querySelector('.mac-layout');
  toggle.hidden = false;

  function setBadge(l) {
    if (!badge) return;
    badge.textContent = l.toUpperCase();
    badge.classList.add('flash');
    setTimeout(function () { badge.classList.remove('flash'); }, 650);
  }

  toggle.addEventListener('click', function () {
    hero.stop();
    hero.blocked = true;
    typed.hidden = true;
    field.hidden = false;
    toggle.hidden = true;
    convBtn.hidden = false;
    cap.textContent = 'Наберите слово не в той раскладке и дважды нажмите Shift. Здесь работает только ручной перевод, угадывать слово по словарю умеет само приложение.';
    field.focus();
  });

  function convertInField() {
    var a = field.selectionStart, b = field.selectionEnd, v = field.value;
    var from, to;
    if (a !== b) { from = a; to = b; }
    else {
      /* Как «последний кусок» в приложении: от последнего слова назад, пока слова набраны
         тем же алфавитом. «привет rfr ltkf» → переводится «rfr ltkf». */
      var words = [], re = /\S+/g, m, before = v.slice(0, a);
      while ((m = re.exec(before))) words.push({ s: m[0], i: m.index });
      if (!words.length) return;
      var last = words[words.length - 1], t = targetOf(last.s), k = words.length - 1;
      if (!t) return;
      while (k > 0 && targetOf(words[k - 1].s) === t) k--;
      from = words[k].i; to = last.i + last.s.length;
    }
    var part = v.slice(from, to), target = targetOf(part);
    if (!target) return;
    /* 'preserve' уводит каретку в начало заменённого куска, если она стояла на его конце.
       Перевод не меняет длину, поэтому каретку просто возвращаем на место. */
    field.setRangeText(convert(part, target), from, to, a !== b ? 'select' : 'end');
    if (a === b) field.setSelectionRange(a, a);
    setBadge(target);
    heroMac.classList.add('hit');
    setTimeout(function () { heroMac.classList.remove('hit'); }, 600);
  }

  var CODE = { BracketLeft: '[', BracketRight: ']', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Backquote: '`', Space: ' ', ShiftLeft: 'shiftl', ShiftRight: 'shiftr' };
  function kbKey(code) {
    if (/^Key[A-Z]$/.test(code)) return code.slice(3).toLowerCase();
    return CODE[code] || null;
  }
  function light(code, on) {
    var k = kbKey(code);
    if (!k || !heroKb) return;
    var el = heroKb.querySelector('[data-k="' + CSS.escape(k) + '"]');
    if (el) el.classList.toggle('on', on);
  }

  var lastTap = 0, other = false;
  field.addEventListener('keydown', function (e) {
    light(e.code, true);
    if (e.key === 'Shift') { if (!e.repeat) other = false; return; }
    other = true;
    lastTap = 0;
    if (/^[a-z]$/i.test(e.key)) badge.textContent = 'EN';
    else if (/^[а-яё]$/i.test(e.key)) badge.textContent = 'RU';
  });
  field.addEventListener('keyup', function (e) {
    light(e.code, false);
    if (e.key !== 'Shift' || other) return;
    var now = performance.now();
    if (lastTap && now - lastTap < 600) { lastTap = 0; convertInField(); }
    else lastTap = now;
  });
  field.addEventListener('blur', function () {
    if (heroKb) heroKb.querySelectorAll('.on').forEach(function (el) { el.classList.remove('on'); });
  });
  convBtn.addEventListener('click', function () { convertInField(); field.focus(); });
})();
