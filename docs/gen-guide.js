// Собирает docs/user-guide.md из data/help.js — того же контента, что
// показывает экран «Инструкция». Без зависимостей: node docs/gen-guide.js
// (npm run guide). test/checks.js сверяет файл с выводом генератора:
// устаревший user-guide.md — красный тест. Править только data/help.js.
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'docs', 'user-guide.md');

// data/help.js — браузерный файл (window.RC): читаем его в песочнице,
// как это делает test/checks.js.
function loadHelp() {
  const sandbox = {};
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'data', 'help.js'), 'utf8'), sandbox, { filename: 'data/help.js' });
  return sandbox.RC.HELP;
}

// Якорь заголовка по правилам GitHub/GitVerse: строчные буквы, пробелы —
// дефисы, пунктуация убирается (кириллица остаётся).
function anchor(title) {
  return title.toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, '').trim().replace(/\s+/g, '-');
}

function blockMd(b) {
  if (typeof b === 'string') return [b, ''];
  if (b.h) return ['### ' + b.h, ''];
  if (b.list) return b.list.map((t) => '- ' + t).concat(['']);
  if (b.tip) return ['> ' + b.tip, ''];
  if (b.go) return ['_' + b.text + '._', ''];
  return [];
}

function generate(help) {
  help = help || loadHelp();
  const out = [];
  out.push('# RC Planner — руководство пользователя');
  out.push('');
  out.push('<!-- Файл собран из data/help.js командой `npm run guide`. Править исходник,');
  out.push('     не этот файл: набор test:data сверяет их между собой. -->');
  out.push('');
  out.push('Локальный офлайн-помощник авиамоделиста и FPV-пилота: флот, чек-листы,');
  out.push('полёты, обслуживание, конфигурации и окна для полётов. Данные хранятся');
  out.push('только на вашем устройстве. То же руководство открывается в приложении:');
  out.push('«Ещё → Инструкция», а кнопка «?» в шапке экрана ведёт в его раздел.');
  out.push('');
  out.push('## Три вещи о приложении');
  out.push('');
  help.welcome.forEach((w, i) => out.push(`${i + 1}. **${w.title}.** ${w.text}`));
  out.push('');
  out.push('## Содержание');
  out.push('');
  help.sections.forEach((s) => out.push(`- [${s.title}](#${anchor(s.title)})`));
  out.push('');
  for (const s of help.sections) {
    out.push('## ' + s.title);
    out.push('');
    for (const b of s.blocks) out.push(...blockMd(b));
  }
  // хвостовые пустые строки — в одну
  while (out.length > 1 && out[out.length - 1] === '' && out[out.length - 2] === '') out.pop();
  return out.join('\n') + '\n';
}

module.exports = { generate, loadHelp };

if (require.main === module) {
  const md = generate();
  fs.writeFileSync(OUT, md);
  console.log('docs/user-guide.md: ' + md.split('\n').length + ' строк');
}
