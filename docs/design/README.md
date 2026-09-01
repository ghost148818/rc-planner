# Дизайн-канвас RC Planner 2.0

Исходники канваса «RC Planner 2.0» (Claude Design внутри Claude Code).
Сам канвас опубликован как артефакт — ссылка в `docs/redesign-2.0.md`.

- `gen.mjs` — генератор артбордов: `node docs/design/gen.mjs` пишет
  `artboards/*.dc.html` и `artboards/canvas.json` (папка в `.gitignore`,
  всё воспроизводится из генератора).
- `shots.js` — скриншоты приложения с **посеянными** данными
  (`node docs/design/shots.js` → `test/shots/seeded/`). Аудит гоняет
  пустую базу, на ней большинство экранов — пустые состояния; для
  проверки глазами нужны именно эти снимки. Наружу ничего не ходит:
  прогноз — поддельный кэш в settings.

Пересобрать канвас после правки: `node docs/design/gen.mjs`, затем
командой `/design` попросить ассистента пересеять канвас из
`docs/design/artboards/` (артборд «Сейчас» берёт четыре снимка
`cur-*.png` из `test/shots/seeded/`, их можно и не передавать).
