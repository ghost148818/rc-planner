// Набор 1: данные и инварианты. Самый быстрый, браузер не нужен.
// Читает исходники в корне (не сборку).
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { ok, finish } = require('./helpers');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

// Загрузка data/*.js в песочницу.
const sandbox = {};
sandbox.window = sandbox; // как в браузере: window — глобальный объект
vm.createContext(sandbox);
for (const f of ['data/checklists.js', 'data/presets.js', 'data/tools.js', 'data/firmware.js',
  'data/packing.js', 'data/changelog.js', 'data/help.js']) {
  vm.runInContext(read(f), sandbox, { filename: f });
}
const RC = sandbox.RC;

console.log('Чек-листы:');
ok(Array.isArray(RC.CHECKLISTS) && RC.CHECKLISTS.length >= 3, 'есть встроенные шаблоны');
const types = RC.CHECKLISTS.map((c) => c.type);
for (const t of ['quad', 'plane', 'wing']) ok(types.includes(t), 'покрыт тип ' + t);
ok(!types.includes('heli'), 'вертолёта нет (не планируется)');
const ids = new Set();
for (const c of RC.CHECKLISTS) {
  ok(c.id && c.name && Array.isArray(c.items) && c.items.length >= 5, `шаблон «${c.name}» полон`);
  ok(!ids.has(c.id), `id ${c.id} уникален`);
  ids.add(c.id);
  ok(c.items.every((i) => i.t && typeof i.t === 'string'), `пункты «${c.name}» непустые`);
}

console.log('Слоты оборудования:');
// Литерал COMPONENTS из app.js исполняем в песочнице — он самодостаточен
// (типы бортов записаны литералами). Так проверка видит настоящие ключи
// и типы, а не разбор регуляркой.
const appSrc = read('app.js');
const compBlock = (appSrc.match(/const COMPONENTS = \[[\s\S]*?\n\];/) || [])[0];
ok(!!compBlock, 'блок COMPONENTS найден в app.js');
const cbox = {};
vm.createContext(cbox);
vm.runInContext(compBlock + '\nthis.OUT = COMPONENTS;', cbox, { filename: 'app.js:COMPONENTS' });
const SLOTS = cbox.OUT;
const slotTypes = new Map(SLOTS.map(([k, , o]) => [k, o ? o.types : null]));
ok(SLOTS.every(([, label]) => label && label.trim()), 'у каждого слота есть подпись');
ok(new Set(SLOTS.map(([k]) => k)).size === SLOTS.length, 'ключи слотов уникальны');
// Опции без списка типов уронили бы карточку борта, если бы не страховка
// в compSlots: держим договор явным.
ok(SLOTS.every(([, , o]) => !o || Array.isArray(o.types)), 'у каждого слота с опциями есть список типов');
for (const k of ['pitot', 'pak']) {
  const t = slotTypes.get(k) || null;
  ok(Array.isArray(t) && t.includes('plane') && t.includes('wing'), `слот ${k} есть у самолёта и крыла`);
  ok(Array.isArray(t) && !t.includes('quad') && !t.includes('other'), `слот ${k} не показывается кваду и «другому»`);
}
// Убранный «Передатчик» остаётся в справочнике ради подписи, но ни одному
// типу не положен: он виден только борту, где запись уже есть.
ok(Array.isArray(slotTypes.get('tx')) && slotTypes.get('tx').length === 0,
  'слот «Передатчик» убран из всех типов, подпись сохранена для старых записей');

// Поле «Высота полёта» и клэмп сохранения должны говорить одно и то же:
// разъехавшись, они молча резали бы введённое значение.
ok(/name="maxAlt"[^>]*min="10"[^>]*max="\$\{WX_ALT_MAX\}"/.test(appSrc) &&
   /Math\.min\(WX_ALT_MAX, Math\.max\(10, maxAlt\)\)/.test(appSrc),
  'карточка борта: поле «Высота полёта» и клэмп сохранения согласованы');
ok(/const WX_ALT_MAX = 3000;/.test(appSrc), 'потолок высоты полёта — 3000 м');
// Список переменных запроса строится из списка уровней, а не литералом:
// иначе новый уровень попал бы в расчёт, но не в запрос.
const hourlyBlock = appSrc.slice(appSrc.indexOf('const WX_HOURLY'), appSrc.indexOf('const WX_HOURLY') + 600);
ok(/WX_PRESSURE\.map/.test(hourlyBlock) && /WX_SURF\.map/.test(hourlyBlock),
  'переменные запроса погоды строятся из списков уровней');
ok(!/wind_gusts_(?!10m)/.test(hourlyBlock), 'порывы запрашиваются только у земли (выше API их не отдаёт)');

console.log('Готовые платформы:');
ok(Array.isArray(RC.AIRCRAFT_PRESETS) && RC.AIRCRAFT_PRESETS.length >= 3, 'есть готовые платформы');
const presetIds = new Set();
for (const p of RC.AIRCRAFT_PRESETS) {
  ok(p.id && p.name && p.desc && p.notes, `«${p.name || p.id}» описана`);
  ok(['quad', 'plane', 'wing', 'other'].includes(p.type), `«${p.name}»: тип известен`);
  ok(p.weight > 300 && p.weight <= 10000, `«${p.name}»: сухой вес правдоподобен (${p.weight} г)`);
  ok(p.wingspan > 100 && p.wingspan <= 4000, `«${p.name}»: размах/диагональ правдоподобны`);
  ok(p.maxWind >= 6 && p.maxWind <= 30, `«${p.name}»: порог ветра в разумных пределах`);
  ok(p.maxAlt >= 10 && p.maxAlt <= 3000, `«${p.name}»: высота полёта в пределах карточки (10…3000 м)`);
  ok(p.maxAlt <= 300, `«${p.name}»: у готовой платформы типовая высота, а не рекордная (${p.maxAlt} м)`);
  ok(p.components && Object.values(p.components).every((c) => c && c.name), `«${p.name}»: компоненты заполнены`);
  for (const k of Object.keys(p.components || {})) {
    ok(slotTypes.has(k), `«${p.name}»: слот ${k} есть в COMPONENTS`);
    const t = slotTypes.get(k);
    ok(!t || t.includes(p.type), `«${p.name}»: слот ${k} положен типу ${p.type}`);
  }
  ok(!presetIds.has(p.id), `«${p.id}» уникален`);
  presetIds.add(p.id);
}

console.log('Готовые аккумуляторы:');
ok(Array.isArray(RC.BATTERY_PRESETS) && RC.BATTERY_PRESETS.length >= 3, 'есть готовые аккумуляторы');
const battIds = new Set();
for (const b of RC.BATTERY_PRESETS) {
  ok(b.id && b.label && b.desc, `«${b.label || b.id}» описан`);
  ok(['LiPo', 'Li-Ion', 'LiFe', 'NiMH'].includes(b.chem), `«${b.label}»: химия известна`);
  ok(b.cells >= 1 && b.cells <= 14 && b.p >= 1 && b.p <= 10, `«${b.label}»: банки S/P правдоподобны`);
  ok(b.capacity > 100 && b.capacity <= 60000, `«${b.label}»: ёмкость правдоподобна`);
  ok(b.weight > 30 && b.weight <= 5000, `«${b.label}»: вес правдоподобен (${b.weight} г)`);
  ok(!battIds.has(b.id), `«${b.id}» уникален`);
  battIds.add(b.id);
}

console.log('Инструменты:');
ok(Array.isArray(RC.TOOLS) && RC.TOOLS.length >= 10, 'каталог не пустой');
const catIds = RC.TOOL_CATS.map((c) => c.id);
const toolIds = new Set();
for (const t of RC.TOOLS) {
  ok(t.id && t.name && t.desc && t.src, `инструмент «${t.name || t.id}» описан и с источником`);
  ok(/^https:\/\//.test(t.url), `«${t.name}»: ссылка https`);
  ok(catIds.includes(t.cat), `«${t.name}»: категория известна`);
  ok(!toolIds.has(t.id), `«${t.id}» уникален`);
  toolIds.add(t.id);
}

// Список прошивок правится руками (Google Диск не даёт прочитать папку
// из приложения), поэтому инварианты здесь — единственная страховка от
// опечатки: без source экран «Инструменты» падает целиком, а кривая
// дата сверки молча показывается пользователю как есть.
console.log('Прошивки:');
const fw = RC.FIRMWARE;
ok(fw && Array.isArray(fw.items) && fw.items.length >= 1, 'список прошивок не пустой');
ok(/^\d{4}-\d{2}-\d{2}$/.test(fw.checked), 'дата сверки в формате YYYY-MM-DD');
ok(fw.source && fw.source.name && /^https:\/\//.test(fw.source.url || ''), 'источник списка указан, ссылка https');
ok(!fw.warn || typeof fw.warn === 'string', 'предупреждение — строка');
const fwIds = new Set();
for (const f of fw.items) {
  ok(f.id && f.name && f.version, `прошивка «${f.name || f.id}»: есть название и версия`);
  ok(/^https:\/\//.test(f.url || ''), `«${f.name}»: ссылка на скачивание https`);
  ok(!f.all || /^https:\/\//.test(f.all), `«${f.name}»: ссылка «все версии» https`);
  ok(!fwIds.has(f.id), `«${f.id}» уникален`);
  fwIds.add(f.id);
}

console.log('Сборы:');
ok(RC.PACKING_PRESETS.length >= 2, 'есть стартовые наборы');
for (const p of RC.PACKING_PRESETS) {
  ok(p.name && p.items.length >= 5 && p.items.every((i) => typeof i === 'string' && i.trim()),
    `набор «${p.name}» полон`);
}

console.log('Что нового:');
ok(RC.CHANGELOG.length >= 1 && RC.CHANGELOG.length <= 12, 'записей от 1 до 12');
const vs = RC.CHANGELOG.map((c) => c.v);
ok(vs.every((v) => typeof v === 'string' && v.trim()), 'версии — непустые строки');
ok(new Set(vs).size === vs.length, 'версии не повторяются');
const dates = RC.CHANGELOG.map((c) => c.date);
ok(dates.slice().sort().reverse().join() === dates.join(), 'выпуски идут от свежего к старому');
for (const c of RC.CHANGELOG) {
  ok(/^\d{4}-\d{2}-\d{2}$/.test(c.date), `v${c.v}: дата в формате YYYY-MM-DD`);
  ok(c.title && c.items.length >= 1, `v${c.v}: есть заголовок и пункты`);
  ok(c.items.every((t) => t.length <= 160), `v${c.v}: пункты не превращаются в стену текста`);
}

console.log('Каркас:');
const html = read('index.html');
for (const m of ['build:css', 'build:js', 'build:pwa']) ok(html.includes('<!-- ' + m + ' -->'), 'маркер ' + m);
ok(html.includes('Content-Security-Policy'), 'CSP задан');
ok(html.includes('name="build"'), 'meta build есть');
// Хэши inline-скриптов в CSP собранных файлов совпадают с их содержимым:
// разошлись — приложение не стартует ни в одном браузере с CSP2.
const crypto = require('crypto');
for (const out of ['public/index.html', 'dist/rc-planner.html']) {
  const p = path.join(ROOT, out);
  if (!fs.existsSync(p)) { ok(false, out + ' не собран (npm run build)'); continue; }
  const built = fs.readFileSync(p, 'utf8');
  const csp = (built.match(/http-equiv="Content-Security-Policy" content="([^"]*)"/) || [])[1] || '';
  const inCsp = new Set((csp.match(/'sha256-[^']+'/g) || []));
  const want = [];
  const re = /<script(\s[^>]*)?>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(built))) {
    if (m[1] && /\bsrc=/i.test(m[1])) continue;
    want.push("'sha256-" + crypto.createHash('sha256').update(m[2], 'utf8').digest('base64') + "'");
  }
  ok(want.length >= 2 && want.every((h) => inCsp.has(h)), out + ': CSP содержит хэши всех ' + want.length + ' inline-скриптов');
}

const app = read('app.js');
// Каждый экран из TAB_OF обязан иметь отрисовщик в RENDERERS.
const tabOf = (app.match(/const TAB_OF = \{([\s\S]*?)\};/) || [])[1] || '';
const renderers = (app.match(/const RENDERERS = \{([\s\S]*?)\};/) || [])[1] || '';
const keys = (src) => [...src.matchAll(/(?:^|[\s{,])(?:'([\w-]+)'|([\w]+))\s*:/g)].map((m) => m[1] || m[2]);
const rKeys = new Set(keys(renderers));
ok(rKeys.size >= 10, 'RENDERERS распознан (' + rKeys.size + ' экранов)');
// Псевдонимы маршрутов (#/log, #/stats → journal) разрешаются в onRoute:
// маршрут считается существующим, если его цель — экран из RENDERERS.
const aliases = (app.match(/const ROUTE_ALIAS = \{([\s\S]*?)\n\};/) || [])[1] || '';
for (const m of aliases.matchAll(/(\w+):\s*\{\s*view:\s*'(\w+)'/g)) {
  ok(rKeys.has(m[2]), 'псевдоним #/' + m[1] + ' ведёт на существующий экран ' + m[2]);
  rKeys.add(m[1]);
}
for (const k of new Set(keys(tabOf))) ok(rKeys.has(k), 'экран ' + k + ' имеет отрисовщик');
// Каждый маршрут data-nav="#/x" ведёт на существующий экран.
for (const m of app.matchAll(/data-nav="#\/([\w-]+)/g)) {
  ok(rKeys.has(m[1]), 'маршрут #/' + m[1] + ' существует');
}
ok(app.includes('function esc('), 'esc() определён');
ok(!/skipWaiting\(\)/.test(read('pwa/sw.js').split('message')[0]), 'в install нет skipWaiting');

// Инструкция и приветствие (data/help.js): id разделов латиницей и
// уникальны, у каждого — заголовок и блоки известного вида; всё, на что
// app.js ссылается через help: '<id>' и #/help/<id>, существует; иконки
// шагов приветствия есть в ICONS; docs/user-guide.md не отстал от данных.
console.log('Инструкция:');
const H = RC.HELP;
ok(H && Array.isArray(H.welcome) && H.welcome.length === 3, 'приветствие — три шага');
// Ключ ищем внутри блока ICONS: по всему app.js регулярка `^\s+key:`
// совпадала и с записями TAB_OF/RENDERERS, и маршрут без иконки проходил.
const iconsBlock = (app.match(/const ICONS = \{([\s\S]*?)\n\};/) || [])[1] || '';
ok(iconsBlock.length > 0, 'блок ICONS найден');
for (const w of H.welcome) {
  ok(w.title && w.text && w.text.length <= 320, `шаг «${w.title || '?'}»: заголовок и короткий текст`);
  if (w.key) ok(new RegExp('^  ' + w.key + ': ic\\(', 'm').test(iconsBlock), `шаг «${w.title}»: иконка ${w.key} есть в ICONS`);
}
const helpIds = new Set();
const blockOk = (b) => typeof b === 'string' ? !!b.trim()
  : !!(b && (b.h || b.tip || (Array.isArray(b.list) && b.list.length) || (b.go && b.text)));
for (const s of H.sections) {
  ok(/^[a-z][a-z0-9-]*$/.test(s.id || ''), `раздел «${s.title || s.id}»: id латиницей`);
  ok(!helpIds.has(s.id), `раздел ${s.id}: id уникален`);
  helpIds.add(s.id);
  ok(s.title && Array.isArray(s.blocks) && s.blocks.length >= 1, `раздел ${s.id}: заголовок и хотя бы один блок`);
  ok(s.blocks.every(blockOk), `раздел ${s.id}: блоки известного вида и непустые`);
  for (const b of s.blocks) {
    if (b && b.go) ok(rKeys.has(b.go.replace(/^#\//, '').split('/')[0]), `раздел ${s.id}: ссылка ${b.go} ведёт на существующий экран`);
  }
  const text = JSON.stringify(s.blocks);
  ok(!/[\u{1F300}-\u{1FAFF}]/u.test(text), `раздел ${s.id}: без эмодзи`);
}
for (const id of ['start', 'today', 'fleet', 'flight', 'journal', 'packing', 'weather', 'maintenance',
  'configs', 'sites', 'tools', 'data', 'privacy', 'faq']) ok(helpIds.has(id), 'раздел ' + id + ' на месте');
// TAB_OF содержит `help: 'more'` — это вкладка экрана, не раздел; вырезаем блок.
const appNoTabs = app.replace(/const TAB_OF = \{[\s\S]*?\};/, '');
const helpRefs = new Set([...appNoTabs.matchAll(/help:\s*'([\w-]+)'/g)].map((m) => m[1])
  .concat([...appNoTabs.matchAll(/#\/help\/([\w-]+)/g)].map((m) => m[1])));
for (const id of helpRefs) ok(helpIds.has(id), 'app.js ссылается на существующий раздел ' + id);
ok(helpRefs.size >= 8, 'кнопки «?» ведут не меньше чем в восемь разделов (' + helpRefs.size + ')');
const { generate } = require('../docs/gen-guide');
ok(read('docs/user-guide.md') === generate(H), 'docs/user-guide.md совпадает с генератором (иначе: npm run guide)');

finish('test:data');
