(function () {
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var isEn = document.documentElement.lang === 'en';
  var STR = isEn ? {
    subFor: function (item) { return 'About: ' + item + '. Leave a contact and I\'ll reply.'; },
    subDefault: 'Tell me what needs to be delivered - I will reply on Telegram or email.',
    fallbackItem: 'Product Lab - question',
    myContact: 'My contact: ',
    contactRequired: 'Add a Telegram handle or email so I know where to reply.',
  } : {
    subFor: function (item) { return 'По поводу: ' + item + '. Оставьте контакт — отвечу.'; },
    subDefault: 'Расскажите, что нужно получить — отвечу в Telegram или почте.',
    fallbackItem: 'Продуктовая лаборатория — вопрос',
    myContact: 'Мой контакт: ',
    contactRequired: 'Укажите Telegram или email, чтобы я знал, куда ответить.',
  };

  // stagger rise (cards + service rows) - content is visible by default (see .rise in
  // style.css); this only hides off-screen elements first, then fades them back in, so
  // missing JS, an unsupported IntersectionObserver or a fast/instant scroll never leaves
  // content permanently invisible.
  if (!reduce && 'IntersectionObserver' in window) {
    var toReveal = [];
    document.querySelectorAll('.rise').forEach(function (el) {
      var r = el.getBoundingClientRect();
      if (r.bottom > 0 && r.top < window.innerHeight) return; // already in view, leave visible
      el.classList.add('pre');
      toReveal.push(el);
    });

    if (toReveal.length) {
      var batch = [], flush;
      var io = new IntersectionObserver(function (es) {
        es.forEach(function (e) {
          if (!e.isIntersecting) return;
          batch.push(e.target);
          io.unobserve(e.target);
        });
        if (batch.length && !flush) {
          flush = requestAnimationFrame(function () {
            batch.forEach(function (el, i) {
              el.style.transitionDelay = (i * 70) + 'ms';
              el.classList.add('in');
              el.classList.remove('pre');
              // снять stagger-задержку после reveal: иначе она остаётся на элементе
              // и тормозит hover-транзишены фона
              setTimeout(function () { el.style.transitionDelay = ''; }, 600 + i * 70);
            });
            batch = [];
            flush = null;
          });
        }
      }, { threshold: 0.12 });
      toReveal.forEach(function (el) { io.observe(el); });

      // safety net: a section skipped over by a very fast scroll/jump may never cross
      // the observer threshold - force it visible after a short delay either way
      setTimeout(function () {
        toReveal.forEach(function (el) { el.classList.remove('pre'); });
      }, 2500);
    }
  }

  // contact modal
  var modal = document.getElementById('lead-modal');
  if (modal) {
    var lastFocus = null;
    var itemField = modal.querySelector('[name="item"]');
    var contactField = modal.querySelector('[name="contact"]');
    var errorEl = document.getElementById('lm-error');
    var subEl = document.getElementById('lm-sub');

    function clearError() {
      if (errorEl) errorEl.textContent = '';
      if (contactField) contactField.removeAttribute('aria-invalid');
    }

    function openModal(e) {
      if (e) e.preventDefault();
      lastFocus = document.activeElement;
      var item = e && e.currentTarget && e.currentTarget.dataset ? e.currentTarget.dataset.item : '';
      if (item && itemField) {
        itemField.value = item;
        if (subEl) subEl.textContent = STR.subFor(item);
      } else {
        if (itemField) itemField.value = '';
        if (subEl) subEl.textContent = STR.subDefault;
      }
      clearError();
      modal.classList.add('open');
      document.body.classList.add('modal-open');
      if (contactField) contactField.focus();
    }
    function closeModal() {
      modal.classList.remove('open');
      document.body.classList.remove('modal-open');
      clearError();
      if (lastFocus) lastFocus.focus();
    }
    document.querySelectorAll('[data-modal-open]').forEach(function (el) {
      el.addEventListener('click', openModal);
    });
    modal.querySelectorAll('[data-modal-close]').forEach(function (el) {
      el.addEventListener('click', closeModal);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && modal.classList.contains('open')) closeModal();
      // focus trap: Tab циклится внутри открытой модалки, не уходит на задний план
      if (e.key === 'Tab' && modal.classList.contains('open')) {
        var focusables = modal.querySelectorAll('button, input, textarea, a[href]');
        if (!focusables.length) return;
        var first = focusables[0], last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault(); last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault(); first.focus();
        }
      }
    });

    // build the outgoing links from the filled fields right before navigation.
    // Telegram is the primary channel (RU-аудитория, mailto у многих открывает пустоту):
    // the composed text rides along via t.me/...?text= (official clients prefill the draft)
    // and is also copied to the clipboard as a fallback - written text must never be lost.
    var sendLink = document.getElementById('lm-send');
    var tgLink = modal.querySelector('.send-tg');
    var form = modal.querySelector('[data-lead-form]');
    if (form) {
      if (contactField) contactField.addEventListener('input', clearError);
      // Enter в полях = то же, что клик по главной кнопке (submit-кнопки в форме нет).
      // На ссылках/кнопках Enter НЕ перехватываем - иначе клавиатурный пользователь
      // не может активировать вторичную mailto-ссылку
      form.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter' || e.target.tagName === 'TEXTAREA') return;
        if (e.target.closest('a, button')) return;
        e.preventDefault();
        (tgLink || sendLink).click();
      });
      function composed() {
        var item = form.item.value.trim() || STR.fallbackItem;
        var contact = form.contact.value.trim();
        var msg = form.msg.value.trim();
        return {
          item: item,
          contact: contact,
          body: (contact ? STR.myContact + contact + '\n\n' : '') + msg,
          text: item + (msg ? '\n' + msg : '') + (contact ? '\n' + STR.myContact + contact : ''),
        };
      }
      if (tgLink) {
        tgLink.addEventListener('click', function () {
          var c = composed();
          // в Telegram контакт не обязателен - отправитель и есть контакт
          tgLink.href = 'https://t.me/Aleksandr_NFA?text=' + encodeURIComponent(c.text);
          if (navigator.clipboard && c.text) navigator.clipboard.writeText(c.text).catch(function () {});
        });
      }
      if (sendLink) {
        sendLink.addEventListener('click', function (e) {
          var c = composed();
          if (!c.contact) {
            e.preventDefault();
            if (errorEl) errorEl.textContent = STR.contactRequired;
            if (contactField) {
              contactField.setAttribute('aria-invalid', 'true');
              contactField.focus();
            }
            return;
          }
          clearError();
          sendLink.href = 'mailto:sanexxx777@gmail.com?subject=' + encodeURIComponent(c.item) + '&body=' + encodeURIComponent(c.body);
        });
      }
    }
  }
})();
