/* Вау-слой витрины: cursor-spotlight на карточках. Текстовые эффекты портфолио
   (glitch/scramble/kinetic) с витрины сняты сознательно (17.07) — у магазина свой
   характер: dot-matrix частицы (assets/dotmatrix.js) + сцена осьминога. */
(function () {
  'use strict';
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
