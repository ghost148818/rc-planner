// Генерирует PNG-иконки приложения из assets/icons/app-icon.svg и значки
// ярлыков (manifest.shortcuts) из ICONS в src/05-ui.js.
// Нужен только при изменении SVG или иконок ярлыков: npm run icons.
// Требует sharp (devDependency).
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const sharp = require('sharp');

const SRC = path.join(__dirname, 'assets/icons/app-icon.svg');
const OUT = path.join(__dirname, 'assets/icons/gen');

// full — фон до краёв без скругления (#bg без rx): maskable-иконку Android
// и apple-touch-icon система скругляет сама, своё скругление дало бы
// тёмные углы. fg — масштаб рисунка (#fg): maskable держит его в
// безопасном круге 80 % (шкала кольца доходит до 84 % — сжимаем).
const SIZES = [
  { file: 'icon-192.png', size: 192 },
  { file: 'icon-512.png', size: 512 },
  { file: 'maskable-512.png', size: 512, full: true, fg: 0.88 },
  { file: 'apple-touch-180.png', size: 180, full: true },
];

// Ярлыки: значок иконки интерфейса на фоне приложения.
const SHORTCUTS = [
  { file: 'sc-flight.png', icon: 'flight' },
  { file: 'sc-journal.png', icon: 'journal' },
  { file: 'sc-weather.png', icon: 'weather' },
];

function variant(svg, full, fg) {
  let s = svg;
  if (full) s = s.replace(/(<rect id="bg"[^>]*?)\s+rx="[^"]*"/, '$1');
  if (fg && fg !== 1) {
    const t = (256 * (1 - fg)).toFixed(1);
    s = s.replace('<g id="fg">', `<g id="fg" transform="translate(${t} ${t}) scale(${fg})">`);
  }
  return Buffer.from(s);
}

// ICONS из src/05-ui.js: файл — обычный скрипт без обращений к DOM на
// верхнем уровне, его можно выполнить в пустом контексте.
function loadIcons() {
  const code = fs.readFileSync(path.join(__dirname, 'src/05-ui.js'), 'utf8');
  const ctx = { window: {}, document: {} };
  vm.createContext(ctx);
  vm.runInContext(code + ';globalThis.__ICONS = ICONS;', ctx);
  return ctx.__ICONS;
}

// Классы двутона (i-t, i-a, i-as) раскрываются в атрибуты: у PNG нет CSS.
function shortcutSvg(icon) {
  const fgc = '#eaf0f7', acc = '#3fd6f0';
  const glyph = icon
    .replace('<svg ', '<svg x="20" y="20" width="56" height="56" ')
    .replace(/currentColor/g, fgc)
    .replace(/class="i-t"/g, `fill="${fgc}" fill-opacity=".18" stroke="none"`)
    .replace(/class="i-a"/g, `fill="${acc}" stroke="none"`)
    .replace(/class="i-as"/g, `stroke="${acc}"`);
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">
    <defs><radialGradient id="b" cx=".3" cy=".2" r="1.1"><stop offset="0" stop-color="#17222f"/><stop offset=".6" stop-color="#0b1119"/><stop offset="1" stop-color="#05080d"/></radialGradient></defs>
    <rect width="96" height="96" fill="url(#b)"/>
    <circle cx="48" cy="48" r="36" fill="none" stroke="#3fd6f0" stroke-opacity=".22" stroke-width="2"/>
    ${glyph}</svg>`);
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const svg = fs.readFileSync(SRC, 'utf8');
  for (const { file, size, full, fg } of SIZES) {
    await sharp(variant(svg, full, fg), { density: 300 }).resize(size, size).png().toFile(path.join(OUT, file));
    console.log('ok', file);
  }
  fs.copyFileSync(SRC, path.join(OUT, 'icon.svg'));
  const ICONS = loadIcons();
  for (const { file, icon } of SHORTCUTS) {
    if (!ICONS[icon]) throw new Error('нет иконки ' + icon + ' в ICONS');
    await sharp(shortcutSvg(ICONS[icon]), { density: 300 }).resize(96, 96).png().toFile(path.join(OUT, file));
    console.log('ok', file);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
