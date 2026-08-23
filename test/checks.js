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
for (const f of ['data/checklists.js', 'data/tools.js', 'data/packing.js', 'data/changelog.js']) {
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

console.log('Сборы:');
ok(RC.PACKING_PRESETS.length >= 2, 'есть стартовые наборы');
for (const p of RC.PACKING_PRESETS) {
  ok(p.name && p.items.length >= 5 && p.items.every((i) => typeof i === 'string' && i.trim()),
    `набор «${p.name}» полон`);
}

console.log('Что нового:');
ok(RC.CHANGELOG.length >= 1 && RC.CHANGELOG.length <= 12, 'записей от 1 до 12');
let prev = Infinity;
for (const c of RC.CHANGELOG) {
  ok(Number.isInteger(c.v) && c.v < prev, `v${c.v} убывает сверху вниз`);
  prev = c.v;
  ok(/^\d{4}-\d{2}-\d{2}$/.test(c.date), `v${c.v}: дата в формате YYYY-MM-DD`);
  ok(c.title && c.items.length >= 1, `v${c.v}: есть заголовок и пункты`);
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
for (const k of new Set(keys(tabOf))) ok(rKeys.has(k), 'экран ' + k + ' имеет отрисовщик');
// Каждый маршрут data-nav="#/x" ведёт на существующий экран.
for (const m of app.matchAll(/data-nav="#\/([\w-]+)/g)) {
  ok(rKeys.has(m[1]), 'маршрут #/' + m[1] + ' существует');
}
ok(app.includes('function esc('), 'esc() определён');
ok(!/skipWaiting\(\)/.test(read('pwa/sw.js').split('message')[0]), 'в install нет skipWaiting');

finish('test:data');
