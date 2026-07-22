# Product Lab — store.shulgin.is-a.dev

Storefront for ready-made code and short, fixed-scope work: the Living Mascot canvas engine, product sprints (mascot, landing, automation, VPS audit), and an Open Lab of free MIT repos. Static site (no build step), RU/EN.

## Structure

- `index.html` / `en/index.html` — the store, RU and EN
- `app.js` — reveal-on-scroll and the contact-modal/mailto flow
- `assets/octopus3d.js` — decorative hero mascot (three.js, WebGL)
- `mascot/` — live demo of the sellable Living Mascot engine (`mascot.esm.js`), with a color/emotion playground
- `style.css` — brutalist styling, shared across RU/EN

<!-- TODO: demo GIF (20-40s) -->

## Run locally

Static files, no build. Serve the folder with anything that speaks HTTP, e.g.:

```bash
python3 -m http.server 8080
```

## License

Storefront code (site, styles, sprint descriptions) is proprietary — © Aleksandr Shulgin. The `mascot/` demo showcases the paid Living Mascot engine, licensed separately per sale; it is not open source. Standalone MIT repos are listed under Open Lab and linked from the site.

## Contact

Aleksandr Shulgin · sanexxx777@gmail.com · [Telegram](https://t.me/Aleksandr_NFA) · [Portfolio](https://shulgin.is-a.dev)

---

## RU (кратко)

Витрина готового кода и короткой работы с фиксированным объёмом: движок Living Mascot, продуктовые спринты (маскот, лендинг, автоматизация, аудит VPS) и Open Lab — бесплатные MIT-репозитории. Статический сайт без сборки, RU/EN.
