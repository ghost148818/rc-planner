// Сборка RC Planner. Без зависимостей: только node:fs / node:crypto.
//
// Выходы:
//   public/            — PWA: index.html со вклеенным CSS/JS, manifest, sw, иконки
//   dist/rc-planner.html — один автономный файл (по file:// SW и manifest не работают)
//
// Версия сборки — sha1 от собранного HTML и манифеста; подставляется
// в sw.js вместо __VERSION__ и в <meta name="build">.
// В CSP дописываются sha256-хэши inline-скриптов (см. withScriptHashes).
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
const ICON_FILES = ['icon-192.png', 'icon-512.png', 'maskable-512.png', 'apple-touch-180.png', 'icon.svg',
  'sc-flight.png', 'sc-journal.png', 'sc-weather.png'];
if (!fs.existsSync(ICON_DIR)) fail('нет assets/icons/gen — выполните: npm run icons');
const svgTime = fs.statSync(ICON_SRC).mtimeMs;
// Значки ярлыков (sc-*) рисуются из ICONS в src/05-ui.js: отпечаток глифов
// (sc-stamp.txt, пишет make-icons.js) обязан совпасть с текущими ICONS.
{
  const { loadIcons, iconsHash } = require('./make-icons');
  const stampPath = path.join(ICON_DIR, 'sc-stamp.txt');
  const stamp = fs.existsSync(stampPath) ? fs.readFileSync(stampPath, 'utf8').trim() : '';
  const [keys, hash] = stamp.split(':');
  if (!keys || hash !== iconsHash(loadIcons(), keys.split(','))) {
    fail('значки ярлыков не совпадают с ICONS в src/05-ui.js — выполните: npm run icons');
  }
}
for (const f of ICON_FILES) {
  const p = path.join(ICON_DIR, f);
  if (!fs.existsSync(p)) fail('нет иконки ' + f + ' — выполните: npm run icons');
  // В CI время файлов — момент checkout, а не правки: сверять нечего.
  if (!process.env.CI && fs.statSync(p).mtimeMs < svgTime) fail('иконка ' + f + ' старше app-icon.svg — выполните: npm run icons');
}

// --- Источники ---
// Стили — styles/NN-*.css по порядку номера; порядок слоёв задаёт
// @layer в первом файле, поэтому склейка ничего не перемешивает.
const CSS_FILES = fs.readdirSync(path.join(ROOT, 'styles')).filter((f) => /^\d\d-[\w-]+\.css$/.test(f)).sort();
if (!CSS_FILES.length) fail('в styles/ нет стилей');
const css = CSS_FILES.map((f) => '/* == styles/' + f + ' == */\n' + read('styles/' + f)).join('\n');

// --- Картинки (assets/art) ---
// Слоты — assets/art/slots.json: имя файла, вид и где используется.
// Сборка берёт только СУЩЕСТВУЮЩИЕ файлы: для каждого — правило CSS,
// копия в public/art/ и строка прекэша в sw.js. Нет файла — остаётся
// запасной вид (процедурный фон, иконка). Офлайн-файл dist/ картинок
// не получает: он один и без соседних файлов, пути art/… там мертвы.
// Проверки размеров, форматов и безопасности SVG — test/art.js.
const ART_DIR = path.join(ROOT, 'assets', 'art');
const ART_SLOTS = JSON.parse(read('assets/art/slots.json')).slots;
const { SLOT_FILE_RE, svgProblems } = require('./art-rules');
for (const a of ART_SLOTS) if (!SLOT_FILE_RE.test(a.file)) fail('slots.json: недопустимое имя файла «' + a.file + '»');
const artPresent = ART_SLOTS.filter((a) => fs.existsSync(path.join(ART_DIR, a.file)));
// SVG — белым списком (art-rules.js): открытый по прямому адресу, он
// документ на origin приложения без CSP. Нарушение — сборка падает, и на
// сайт такой файл не попадёт даже без npm test.
for (const a of artPresent.filter((x) => x.file.endsWith('.svg'))) {
  const bad = svgProblems(fs.readFileSync(path.join(ART_DIR, a.file), 'utf8'), a);
  if (bad.length) fail('assets/art/' + a.file + ': ' + bad.join('; '));
}
const artUrl = (a) => 'url("art/' + a.file + '")';
const artCss = artPresent.map((a) => {
  const name = a.file.replace(/\.\w+$/, '');
  const sel = '[data-art="' + name + '"]';
  if (a.kind === 'var') return ':root{' + a.var + ':' + artUrl(a) + '}';
  if (a.kind === 'img') {
    return sel + '{--art-img:' + artUrl(a) + '}' + sel + '>svg{visibility:hidden}' +
      '.welcome-art' + sel + '{display:block}.welcome-art' + sel + '+.welcome-ic{display:none}';
  }
  if (a.kind === 'mask') {
    return '.empty-art' + sel + '{display:block;width:min(240px,72vw);aspect-ratio:3/2;margin:0 auto 14px;' +
      'background:linear-gradient(135deg,var(--accent),var(--accent-2));' +
      '-webkit-mask:' + artUrl(a) + ' center/contain no-repeat;mask:' + artUrl(a) + ' center/contain no-repeat}' +
      '.empty-art' + sel + '>svg{display:none}';
  }
  fail('неизвестный вид слота ' + a.kind + ' у ' + a.file);
  return '';
}).join('\n');
// Исходники приложения — src/NN-*.js, порядок задаёт номер в имени.
// Это обычные скрипты (не ES-модули): у них общая глобальная область,
// поэтому вклейка подряд ничего не меняет в поведении. Тот же список
// в том же порядке стоит в index.html (для запуска без сборки) —
// test/checks.js сверяет их.
const SRC = fs.readdirSync(path.join(ROOT, 'src')).filter((f) => /^\d\d-[\w-]+\.js$/.test(f)).sort();
if (!SRC.length) fail('в src/ нет исходников');
const js = "'use strict';\n" + [
  'db.js',
  'data/checklists.js',
  'data/presets.js',
  'data/tools.js',
  'data/firmware.js',
  'data/packing.js',
  'data/changelog.js',
  'data/help.js',
].concat(SRC.map((f) => 'src/' + f))
  // 'use strict' ставится один раз в начале вклейки — только там он
  // директива для всего скрипта; строки в начале файлов нужны запуску без сборки.
  .map((f) => '/* == ' + f + ' == */\n' + read(f).replace(/^'use strict';\n/m, '')).join('\n');
let html = read('index.html');
const manifestSrc = read('pwa/manifest.json');
let manifest;
try { manifest = JSON.parse(manifestSrc); } catch (e) { fail('pwa/manifest.json не разбирается: ' + e.message); }
if (!manifest.name || !manifest.icons || !manifest.icons.length) fail('manifest без name или icons');

// Версия иконок: меняется src в manifest — Chrome/Android замечает
// обновление manifest и перекачивает значок установленного приложения.
// (iOS обновляет apple-touch-icon только при переустановке — это
// ограничение платформы, а не наше.)
const iconsHash = crypto.createHash('sha1');
for (const f of ICON_FILES) iconsHash.update(fs.readFileSync(path.join(ICON_DIR, f)));
const iconsVer = iconsHash.digest('hex').slice(0, 8);
const verIcon = (i) => Object.assign({}, i, { src: i.src + '?v=' + iconsVer });
manifest.icons = manifest.icons.map(verIcon);
for (const s of manifest.shortcuts || []) {
  for (const i of s.icons || []) if (!ICON_FILES.includes(i.src.replace(/^icons\//, ''))) fail('manifest: нет значка ярлыка ' + i.src);
  if (s.icons) s.icons = s.icons.map(verIcon);
}
const manifestOut = JSON.stringify(manifest, null, 2) + '\n';

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
  '<link rel="apple-touch-icon" href="icons/apple-touch-180.png?v=' + iconsVer + '">',
  '<link rel="icon" href="icons/icon.svg?v=' + iconsVer + '" type="image/svg+xml">',
].join('\n  ');

const artBlock = artCss ? '<style>\n@layer art {\n' + artCss + '\n}\n</style>' : '';
const htmlPWA = replaceBlock(replaceBlock(html, 'pwa', pwaHead), 'art', artBlock);
const htmlSingle = replaceBlock(replaceBlock(html, 'pwa', ''), 'art', '');

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

// --- CSP: хэши inline-скриптов ---
// В index.html script-src держит 'unsafe-inline' (сырой index.html с
// внешними <script src> так работает в разработке). Сборка дописывает
// sha256 каждого inline-скрипта: браузер с поддержкой CSP2+ (все
// современные, iOS Safari с 10) при наличии хэшей ИГНОРИРУЕТ
// 'unsafe-inline' — исполняются только скрипты с совпавшим хэшем, а
// inline-обработчики (onerror=, onfocus=) и javascript: блокируются.
// Это вторая линия обороны от XSS через непроверенную резервную копию
// (аудит 2026-09-05); 'unsafe-inline' остаётся лишь для древних браузеров.
// Хэш считается от текста ровно между <script> и </script>, с переводами
// строк, поэтому шаблон вклейки менять вместе с этим блоком.
function withScriptHashes(src) {
  const hashes = [];
  const re = /<script(\s[^>]*)?>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(src))) {
    if (m[1] && /\bsrc=/i.test(m[1])) continue;
    hashes.push("'sha256-" + crypto.createHash('sha256').update(m[2], 'utf8').digest('base64') + "'");
  }
  if (hashes.length < 2) fail('в сборке меньше двух inline-скриптов — CSP-хэши считать не от чего');
  const marker = "script-src 'self' 'unsafe-inline'";
  if (!src.includes(marker)) fail('в CSP нет «' + marker + '» — хэшам некуда встать');
  return src.replace(marker, marker + ' ' + hashes.join(' '));
}
const htmlPWAHashed = withScriptHashes(htmlPWA);
const htmlSingleHashed = withScriptHashes(htmlSingle);

// --- Версия ---
const version = crypto.createHash('sha1')
  .update(htmlPWAHashed).update(manifestOut)
  .digest('hex').slice(0, 10);

// __VERSION__ живёт в <meta>, не в скриптах — хэши после подстановки верны.
const outPWA = htmlPWAHashed.replace(/__VERSION__/g, version);
const outSingle = htmlSingleHashed.replace(/__VERSION__/g, version + '-single');
const swSrc = read('pwa/sw.js');
if (!swSrc.includes('/* __ART__ */')) fail('в pwa/sw.js нет метки /* __ART__ */ для прекэша картинок');
const sw = swSrc.replace(/__VERSION__/g, version)
  .replace('/* __ART__ */', artPresent.map((a) => "'./art/" + a.file + "',").join('\n  '));

// --- Запись public/ ---
const PUB = path.join(ROOT, 'public');
fs.rmSync(PUB, { recursive: true, force: true });
fs.mkdirSync(path.join(PUB, 'icons'), { recursive: true });
fs.writeFileSync(path.join(PUB, 'index.html'), outPWA);
fs.writeFileSync(path.join(PUB, 'sw.js'), sw);
fs.writeFileSync(path.join(PUB, 'manifest.json'), manifestOut);
fs.writeFileSync(path.join(PUB, '.nojekyll'), '');
for (const f of ICON_FILES) {
  fs.copyFileSync(path.join(ICON_DIR, f), path.join(PUB, 'icons', f));
}
if (artPresent.length) {
  fs.mkdirSync(path.join(PUB, 'art'), { recursive: true });
  for (const a of artPresent) fs.copyFileSync(path.join(ART_DIR, a.file), path.join(PUB, 'art', a.file));
}

// --- Запись dist/ ---
const DIST = path.join(ROOT, 'dist');
fs.mkdirSync(DIST, { recursive: true });
fs.writeFileSync(path.join(DIST, 'rc-planner.html'), outSingle);

const kb = (n) => Math.round(n / 1024) + ' КБ';
console.log('Сборка ' + version);
console.log('  public/index.html   ' + kb(outPWA.length));
console.log('  dist/rc-planner.html ' + kb(outSingle.length));
console.log('  картинки: ' + (artPresent.length ? artPresent.length + ' из ' + ART_SLOTS.length : 'нет — запасной вид'));
