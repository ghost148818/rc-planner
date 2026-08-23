// Сборка RC Planner. Без зависимостей: только node:fs / node:crypto.
//
// Выходы:
//   public/            — PWA: index.html со вклеенным CSS/JS, manifest, sw, иконки
//   dist/rc-planner.html — один автономный файл (по file:// SW и manifest не работают)
//
// Версия сборки — sha1 от собранного HTML и манифеста; подставляется
// в sw.js вместо __VERSION__ и в <meta name="build">.
// Сборка падает, если: остались внешние ссылки на ресурсы, не разбирается
// manifest, иконки старше своего SVG-исходника.
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = __dirname;
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

function fail(msg) {
  console.error('СБОРКА ПРОВАЛЕНА: ' + msg);
  process.exit(1);
}

// --- Иконки: должны существовать и быть свежее SVG ---
const ICON_SRC = path.join(ROOT, 'assets/icons/app-icon.svg');
const ICON_DIR = path.join(ROOT, 'assets/icons/gen');
const ICON_FILES = ['icon-192.png', 'icon-512.png', 'maskable-512.png', 'apple-touch-180.png', 'icon.svg'];
if (!fs.existsSync(ICON_DIR)) fail('нет assets/icons/gen — выполните: npm run icons');
const svgTime = fs.statSync(ICON_SRC).mtimeMs;
for (const f of ICON_FILES) {
  const p = path.join(ICON_DIR, f);
  if (!fs.existsSync(p)) fail('нет иконки ' + f + ' — выполните: npm run icons');
  if (fs.statSync(p).mtimeMs < svgTime) fail('иконка ' + f + ' старше app-icon.svg — выполните: npm run icons');
}

// --- Источники ---
const css = read('styles.css');
const js = [
  'db.js',
  'data/checklists.js',
  'data/tools.js',
  'data/packing.js',
  'data/changelog.js',
  'app.js',
].map((f) => '/* == ' + f + ' == */\n' + read(f)).join('\n');
let html = read('index.html');
const manifestSrc = read('pwa/manifest.json');
let manifest;
try { manifest = JSON.parse(manifestSrc); } catch (e) { fail('pwa/manifest.json не разбирается: ' + e.message); }
if (!manifest.name || !manifest.icons || !manifest.icons.length) fail('manifest без name или icons');

// --- Вклейка по маркерам ---
function replaceBlock(src, name, replacement) {
  const re = new RegExp('<!-- build:' + name + ' -->[\\s\\S]*?<!-- /build:' + name + ' -->');
  if (!re.test(src)) fail('в index.html нет маркера build:' + name);
  return src.replace(re, replacement);
}

// </script> внутри вклеиваемого кода разорвал бы страницу.
const jsSafe = js.replace(/<\/script/gi, '<\\/script');
html = replaceBlock(html, 'css', '<style>\n' + css + '\n</style>');
html = replaceBlock(html, 'js', '<script>\n' + jsSafe + '\n</script>');

const pwaHead = [
  '<link rel="manifest" href="manifest.json">',
  '<link rel="apple-touch-icon" href="icons/apple-touch-180.png">',
  '<link rel="icon" href="icons/icon.svg" type="image/svg+xml">',
].join('\n  ');

const htmlPWA = replaceBlock(html, 'pwa', pwaHead);
const htmlSingle = replaceBlock(html, 'pwa', '');

// --- Проверка внешних ссылок на ресурсы ---
// Ссылки в каталоге инструментов (внутри JS-строк, открываются пользователем) —
// допустимы. Недопустимы внешние РЕСУРСЫ, которые страница грузит сама.
const badPatterns = [
  [/<script[^>]+src=["']https?:/i, 'внешний <script src>'],
  [/<link[^>]+href=["']https?:/i, 'внешний <link href>'],
  [/<img[^>]+src=["']https?:/i, 'внешний <img src>'],
  [/<iframe/i, '<iframe> запрещён'],
  [/url\(\s*["']?https?:/i, 'внешний url() в CSS'],
  [/@import/i, '@import в CSS'],
];
for (const [re, what] of badPatterns) {
  if (re.test(htmlPWA)) fail('в сборке ' + what + ' — приложение обязано работать офлайн');
}

// --- Версия ---
const version = crypto.createHash('sha1')
  .update(htmlPWA).update(manifestSrc)
  .digest('hex').slice(0, 10);

const outPWA = htmlPWA.replace(/__VERSION__/g, version);
const outSingle = htmlSingle.replace(/__VERSION__/g, version + '-single');
const sw = read('pwa/sw.js').replace(/__VERSION__/g, version);

// --- Запись public/ ---
const PUB = path.join(ROOT, 'public');
fs.rmSync(PUB, { recursive: true, force: true });
fs.mkdirSync(path.join(PUB, 'icons'), { recursive: true });
fs.writeFileSync(path.join(PUB, 'index.html'), outPWA);
fs.writeFileSync(path.join(PUB, 'sw.js'), sw);
fs.writeFileSync(path.join(PUB, 'manifest.json'), manifestSrc);
fs.writeFileSync(path.join(PUB, '.nojekyll'), '');
for (const f of ICON_FILES) {
  fs.copyFileSync(path.join(ICON_DIR, f), path.join(PUB, 'icons', f));
}

// --- Запись dist/ ---
const DIST = path.join(ROOT, 'dist');
fs.mkdirSync(DIST, { recursive: true });
fs.writeFileSync(path.join(DIST, 'rc-planner.html'), outSingle);

const kb = (n) => Math.round(n / 1024) + ' КБ';
console.log('Сборка ' + version);
console.log('  public/index.html   ' + kb(outPWA.length));
console.log('  dist/rc-planner.html ' + kb(outSingle.length));
