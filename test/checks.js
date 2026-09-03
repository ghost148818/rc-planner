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
  'data/packing.js', 'data/changelog.js']) {
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

console.log('Готовые платформы:');
ok(Array.isArray(RC.AIRCRAFT_PRESETS) && RC.AIRCRAFT_PRESETS.length >= 3, 'есть готовые платформы');
const presetIds = new Set();
for (const p of RC.AIRCRAFT_PRESETS) {
  ok(p.id && p.name && p.desc && p.notes, `«${p.name || p.id}» описана`);
  ok(['quad', 'plane', 'wing', 'other'].includes(p.type), `«${p.name}»: тип известен`);
  ok(p.weight > 300 && p.weight <= 10000, `«${p.name}»: сухой вес правдоподобен (${p.weight} г)`);
  ok(p.wingspan > 100 && p.wingspan <= 4000, `«${p.name}»: размах/диагональ правдоподобны`);
  ok(p.maxWind >= 6 && p.maxWind <= 30, `«${p.name}»: порог ветра в разумных пределах`);
  ok(p.maxAlt >= 10 && p.maxAlt <= 200, `«${p.name}»: высота полёта до 200 м`);
  ok(p.components && Object.values(p.components).every((c) => c && c.name), `«${p.name}»: компоненты заполнены`);
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

finish('test:data');
