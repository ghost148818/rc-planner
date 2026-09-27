// Набор «картинки»: файлы в assets/art/ против слотов assets/art/slots.json.
// Нет ни одного файла — не ошибка: приложение показывает запасной вид.
// Проверки: имя из списка слотов, размер файла, формат и точные размеры
// растра (sharp — только dev), для SVG — безопасность и форма.
// Запуск: npm run art:check (входит в npm test).
'use strict';

const fs = require('fs');
const path = require('path');
const { ok, finish } = require('./helpers');

const DIR = path.join(__dirname, '..', 'assets', 'art');
const { slots } = JSON.parse(fs.readFileSync(path.join(DIR, 'slots.json'), 'utf8'));
const byFile = new Map(slots.map((s) => [s.file, s]));
const SERVICE = new Set(['slots.json', 'README.md', '.gitkeep']);

// SVG грузится как картинка (mask-image) — скрипты там не исполняются,
// но файл всё равно обязан быть чистым рисунком: без скриптов,
// обработчиков, внешних ссылок, вложенных картинок и сущностей.
const SVG_BAD = [
  [/<script/i, 'тег <script>'],
  [/\son[a-z]+\s*=/i, 'обработчик on…='],
  [/javascript:/i, 'javascript:'],
  [/<foreignObject/i, '<foreignObject>'],
  [/<image/i, '<image>'],
  [/<use[^>]+href\s*=\s*["'](?!#)/i, '<use> на внешний файл'],
  [/(?:xlink:)?href\s*=\s*["']\s*(?:https?:|\/\/|data:)/i, 'внешняя ссылка href'],
  [/url\(\s*["']?\s*(?:https?:|\/\/|data:)/i, 'внешний url()'],
  [/@import/i, '@import'],
  [/<!ENTITY|<!DOCTYPE/i, 'DOCTYPE/ENTITY'],
  [/<(?:text|tspan)\b/i, 'текст в рисунке'],
];

(async () => {
  console.log('Картинки (assets/art):');
  const files = fs.readdirSync(DIR).filter((f) => !SERVICE.has(f));
  if (!files.length) {
    console.log('  картинок нет — используется запасной вид (процедурный фон и иконки)');
    finish('test:art');
    return;
  }
  let sharp = null;
  try { sharp = require('sharp'); } catch (e) { /* ниже — понятное сообщение */ }
  for (const f of files) {
    const slot = byFile.get(f);
    ok(!!slot, f + ': имя есть в slots.json');
    if (!slot) continue;
    const p = path.join(DIR, f);
    const kb = fs.statSync(p).size / 1024;
    ok(kb <= slot.maxKB, `${f}: ${kb.toFixed(0)} КБ ≤ ${slot.maxKB} КБ`);
    if (f.endsWith('.svg')) {
      const src = fs.readFileSync(p, 'utf8');
      ok(/^\s*(<\?xml[^>]*>\s*)?<svg\b/.test(src), f + ': начинается с <svg>');
      ok(new RegExp('viewBox\\s*=\\s*["\']0 0 ' + slot.w + ' ' + slot.h + '["\']').test(src), `${f}: viewBox="0 0 ${slot.w} ${slot.h}"`);
      for (const [re, what] of SVG_BAD) ok(!re.test(src), `${f}: нет ${what}`);
      continue;
    }
    if (!sharp) { ok(false, f + ': нужен sharp для проверки растра — npm install'); continue; }
    let meta = null;
    try { meta = await sharp(p).metadata(); } catch (e) { ok(false, f + ': файл не читается как картинка — ' + e.message); continue; }
    ok(meta.format === 'webp', `${f}: формат webp (${meta.format})`);
    ok(meta.width === slot.w && meta.height === slot.h, `${f}: ${slot.w}×${slot.h} (сейчас ${meta.width}×${meta.height})`);
    if (slot.alpha) ok(!!meta.hasAlpha, f + ': прозрачный фон (альфа-канал)');
  }
  const missing = slots.filter((s) => !files.includes(s.file)).map((s) => s.file);
  if (missing.length) console.log('  ещё нет (запасной вид): ' + missing.join(', '));
  finish('test:art');
})();
