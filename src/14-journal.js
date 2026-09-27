// RC Planner · Журнал: полёты, статистика, печать, CSV.
'use strict';

/* ---------- Журнал: полёты + статистика одной вкладкой ---------- */

// Действующий фильтр журнала: id борта, если он ещё существует, иначе
// '' (все). Борт могли удалить или он не приехал с импортом копии —
// тогда UI.journalAircraft сбрасывается, чтобы селект не рисовался
// «выбранным» при показе всех полётов (ревью 2.0).
function journalFilterId() {
  const id = UI.journalAircraft;
  if (id && !S.aircraft.some((a) => a.id === id)) UI.journalAircraft = '';
  return UI.journalAircraft;
}

// Завершённые полёты с учётом фильтра по борту (UI.journalAircraft).
// Печать и CSV фильтр НЕ учитывают — выгрузка всегда полная.
function journalDone() {
  const all = S.sessions.filter((s) => s.end);
  const id = journalFilterId();
  return id ? all.filter((s) => s.aircraftId === id) : all;
}

function viewJournal() {
  const total = S.sessions.filter((s) => s.end);
  const mins = total.reduce((n, s) => n + (s.durationMin || 0), 0);
  // Без полётов меню «⋯» не рисуем вовсе: печатать и выгружать нечего,
  // а меню из одних отключённых пунктов не закрывалось бы по тапу
  // (disabled-кнопка события click не даёт).
  let h = pageHead('Журнал', total.length ? {
    sub: `${total.length} ${plural(total.length, 'полёт', 'полёта', 'полётов')} · ${fmtDur(mins)}`,
    act: 'journal-menu', actLabel: 'Меню журнала', actIcon: 'more', help: 'journal',
  } : { sub: 'Полётов пока не было', help: 'journal' });
  // Меню «⋯»: печать и выгрузки — существующие действия. Атрибут hidden —
  // запасной режим для браузеров без popover (см. toggleMenu).
  if (total.length) {
    h += `<div class="menu" popover="manual" id="journal-menu" role="menu" hidden>
      <button role="menuitem" data-act="print-log">${ICONS.print}Печать журнала</button>
      <button role="menuitem" data-act="export-log-csv">${ICONS.backup}Журнал в CSV</button>
      <button role="menuitem" data-act="export-stats-csv">${ICONS.backup}Статистика в CSV</button>
    </div>`;
  }
  const tab = UI.journalTab === 'stats' ? 'stats' : 'log';
  h += `<div class="seg" style="margin-bottom:10px">
    <button data-act="journal-tab" data-tab="log" aria-pressed="${tab === 'log'}">Полёты</button>
    <button data-act="journal-tab" data-tab="stats" aria-pressed="${tab === 'stats'}">Статистика</button>
  </div>`;
  if (!total.length) return h + emptyState('Полётов пока не было.', 'start-prep', 'Начать полёт', 'journal');
  const fid = journalFilterId();
  if (S.aircraft.length > 1) {
    h += `<div class="pill-row">${pillSelect('journalAircraft',
      [['', 'Все борта']].concat(S.aircraft.map((a) => [a.id, a.name])),
      fid, `class="sel-pill${fid ? ' sel' : ''}" data-change="journal-aircraft" aria-label="Фильтр по борту"`)}</div>`;
  }
  const done = journalDone();
  if (!done.length) return h + emptyState('У этого борта полётов пока не было.', '', '', 'journal');
  return h + (tab === 'stats' ? journalStatsHtml(done) : journalLogHtml(done));
}

function journalLogHtml(done) {
  return logGroupedHtml(done.slice().sort((a, b) => b.start - a.start));
}

// Кнопка правки итога — в деталях завершённого полёта (finish-flight
// открывает ту же форму; end не сдвигается, циклы не задваиваются).

// Печатная таблица журнала: временно вставляется в документ, печатается
// системным диалогом (@media print прячет остальное) и убирается.
// Всё локально — никакие данные никуда не отправляются.
function printLog() {
  const done = S.sessions.filter((x) => x.end).sort((a, b) => a.start - b.start);
  if (!done.length) return;
  const cell = (v) => `<td>${esc(v == null || v === '' ? '—' : v)}</td>`;
  const rows = done.map((x) => {
    const a = S.aircraft.find((y) => y.id === x.aircraftId);
    const b = S.batteries.find((y) => y.id === x.batteryId);
    const site = S.sites.find((y) => y.id === x.siteId);
    return `<tr>${cell(flightNoText(x))}${cell(fmtDate(x.date))}${cell(a ? a.name : '')}` +
      `${cell(x.durationMin != null ? x.durationMin + ' мин' : '')}${cell(b ? b.label : '')}${cell(site ? site.name : '')}` +
      `${cell(resultLabel(x, ''))}${cell(x.notes || x.problems || '')}</tr>`;
  }).join('');
  const area = document.createElement('div');
  area.id = 'print-area';
  area.innerHTML = `<h1>RC Planner — журнал полётов</h1>
    <p>${esc(S.settings.pilot || '')} · всего ${done.length} ${plural(done.length, 'полёт', 'полёта', 'полётов')} · напечатано ${fmtDate(todayISO())}</p>
    <table><thead><tr><th>№</th><th>Дата</th><th>Борт</th><th>Время</th><th>АКБ</th><th>Локация</th><th>Итог</th><th>Заметки</th></tr></thead>
    <tbody>${rows}</tbody></table>`;
  document.body.appendChild(area);
  const cleanup = () => { area.remove(); window.removeEventListener('afterprint', cleanup); };
  window.addEventListener('afterprint', cleanup);
  window.print();
  setTimeout(cleanup, 60000); // страховка, если afterprint не пришёл
}

/* ---------- Статистика ---------- */

// Всё считается на лету из журнала: своего хранилища у статистики нет,
// наружу ничего не уходит. Полоски — доля от максимума в списке.
function statBars(rows) {
  const max = rows.reduce((n, r) => Math.max(n, r.v), 0) || 1;
  return '<div class="card">' + rows.map((r) => `<div class="bar-row">
    <span class="n">${esc(r.k)}</span>
    <span class="bar-track"><i style="width:${Math.max(2, Math.round(r.v / max * 100))}%"></i></span>
    <span class="v">${esc(r.label)}</span></div>`).join('') + '</div>';
}

// Свод по ключу: [{k, v, label, n, min}] — полёты и налёт, крупные сверху.
// v/label рисуют полоску, n/min уходят в CSV сырыми числами: экран
// и выгрузка обязаны считаться из одного места, иначе разойдутся.
function statGroup(list, keyFn, nameFn) {
  const by = new Map();
  list.forEach((s) => {
    const k = keyFn(s);
    const o = by.get(k) || { n: 0, min: 0 };
    o.n++;
    o.min += s.durationMin || 0;
    by.set(k, o);
  });
  return [...by.entries()]
    .sort((x, y) => y[1].min - x[1].min || y[1].n - x[1].n)
    .map(([k, o]) => ({ k: nameFn(k), v: o.min, label: `${o.n} · ${fmtDur(o.min)}`, n: o.n, min: o.min }));
}

// Месяцы от первого полёта до текущего, включая пустые: провалы видно.
// Последние двенадцать — экран не должен расти без предела.
function statMonths(list) {
  const first = new Date(list[0].date + 'T00:00:00');
  if (isNaN(first.getTime())) return [];
  const now = new Date();
  const keys = [];
  let y = first.getFullYear(), m = first.getMonth();
  while (keys.length < 600 && (y < now.getFullYear() || (y === now.getFullYear() && m <= now.getMonth()))) {
    keys.push(y + '-' + String(m + 1).padStart(2, '0'));
    if (++m > 11) { m = 0; y++; }
  }
  const by = new Map();
  list.forEach((s) => {
    const k = String(s.date || '').slice(0, 7);
    const o = by.get(k) || { n: 0, min: 0 };
    o.n++;
    o.min += s.durationMin || 0;
    by.set(k, o);
  });
  return keys.slice(-12).map((k) => {
    const o = by.get(k) || { n: 0, min: 0 };
    // «сен 2026» — из своего списка месяцев, а не из локали: одинаково
    // на любом устройстве и без точки после сокращения. MONTHS_RU —
    // родительный падеж для дат («5 мая»); месяц сам по себе — «май».
    const mon = MONTHS_RU[+k.slice(5, 7) - 1];
    return { k: (mon === 'мая' ? 'май' : mon) + ' ' + k.slice(0, 4), v: o.min,
      label: o.n ? `${o.n} · ${fmtDur(o.min)}` : '—', n: o.n, min: o.min };
  });
}

// Разделы статистики — один источник для экрана и для выгрузки в CSV.
// Строка везде одна и та же: k — подпись, v/label — полоска,
// n/min/cycles — сырые числа для таблицы. key — для кода (заголовок
// переименуют, и привязка по тексту тихо отвалится), title — для глаз.
function statSections(done) {
  const out = [];
  // Месяцы пропадают только если у всех полётов битая дата — пустой раздел не нужен.
  const months = statMonths(done);
  if (months.length) out.push({ key: 'months', title: 'По месяцам', rows: months });

  out.push({ key: 'aircraft', title: 'По бортам', rows: statGroup(done, (s) => s.aircraftId, (id) => {
    const a = S.aircraft.find((x) => x.id === id);
    return a ? a.name : 'Борт удалён';
  }) });

  out.push({ key: 'sites', title: 'По локациям', rows: statGroup(done, (s) => s.siteId || '', (id) => {
    const site = S.sites.find((x) => x.id === id);
    return site ? site.name : 'Без локации';
  }) });

  // Итоги: считаем доли честно, «рейтинга» не рисуем.
  out.push({ key: 'results', title: 'Чем заканчивались', rows: Object.keys(RESULTS).map((k) => {
    const n = done.filter((s) => (s.result || 'normal') === k).length;
    return { k: RESULTS[k], v: n, label: String(n), n };
  }).filter((r) => r.v) });

  // Аккумуляторы: циклы = износ, изношенные сверху.
  const batts = S.batteries.filter((b) => b.cycles).sort((x, y) => y.cycles - x.cycles).slice(0, 10);
  if (batts.length) {
    out.push({ key: 'batteries', title: 'Износ аккумуляторов', rows: batts.map((b) => ({
      k: b.label, v: b.cycles, cycles: b.cycles,
      label: b.cycles + ' ' + plural(b.cycles, 'цикл', 'цикла', 'циклов'),
    })) });
  }
  return out;
}

// Календарь лётных дней (3.0): последние 12 недель, столбец — неделя
// с понедельника, яркость клетки — налёт дня. Считается из того же
// отфильтрованного списка, что и остальная статистика; даты — локальные,
// как у полёта (s.date = todayISO() при взлёте).
const HEAT_WEEKS = 12;
function heatHtml(done) {
  const byDay = new Map();
  for (const s of done) byDay.set(s.date, (byDay.get(s.date) || 0) + (s.durationMin || 0));
  const iso = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const today = new Date(todayISO() + 'T12:00:00');
  const start = new Date(today);
  start.setDate(today.getDate() - ((today.getDay() + 6) % 7) - 7 * (HEAT_WEEKS - 1));
  let cells = '', days = 0;
  for (let i = 0; i < HEAT_WEEKS * 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const key = iso(d);
    const min = byDay.get(key) || 0;
    if (min || byDay.has(key)) days++;
    const l = !byDay.has(key) ? 0 : min < 15 ? 1 : min < 45 ? 2 : 3;
    const cls = d > today ? ' class="future"' : key === iso(today) ? ' class="today"' : '';
    cells += `<i${cls}${l ? ` data-l="${l}"` : ''}></i>`;
  }
  return `<div class="h2 opt">Лётные дни <span class="cnt">${HEAT_WEEKS} недель · ${days} ${plural(days, 'день', 'дня', 'дней')}</span></div>
    <div class="card opt"><div class="heat" role="img" aria-label="Календарь полётов за ${HEAT_WEEKS} недель: ${days} ${plural(days, 'лётный день', 'лётных дня', 'лётных дней')}">${cells}</div>
    <div class="heat-legend"><span>пн — вс по столбцам, неделя за неделей</span>
      <span class="sw">меньше <i></i><i data-l="1"></i><i data-l="2"></i><i data-l="3"></i> больше</span></div></div>`;
}

// Вкладка «Статистика» журнала: list — уже отфильтрованный по борту
// список; statSections не меняется, фильтр применён до расчёта.
function journalStatsHtml(list) {
  const done = list.slice().sort((a, b) => a.start - b.start);
  let h = '';
  const total = done.reduce((n, s) => n + (s.durationMin || 0), 0);
  const days = new Set(done.map((s) => s.date)).size;
  h += `<div class="stat-line four">
    <div class="stat"><div class="v">${done.length}</div><div class="k">${plural(done.length, 'полёт', 'полёта', 'полётов')}</div></div>
    <div class="stat"><div class="v">${fmtDur(total)}</div><div class="k">общий налёт</div></div>
    <div class="stat"><div class="v">${fmtDur(total / done.length)}</div><div class="k">средний полёт</div></div>
    <div class="stat"><div class="v">${days}</div><div class="k">${plural(days, 'лётный день', 'лётных дня', 'лётных дней')}</div></div>
  </div>`;

  h += heatHtml(done);

  for (const sec of statSections(done)) {
    if (!sec.rows.length) continue;
    h += `<div class="h2">${esc(sec.title)}</div>` + statBars(sec.rows);
    // Доля нормальных полётов — честный показатель, а не «рейтинг».
    if (sec.key === 'results') {
      const okCount = done.filter((s) => !s.result || s.result === 'normal').length;
      h += `<p class="small muted">Без происшествий ${Math.round(okCount / done.length * 100)}% полётов.</p>`;
    }
  }

  h += `<p class="small muted" style="margin-top:12px">Считается из журнала на этом устройстве. Выгрузка в CSV — в меню вверху справа.</p>`;
  return h;
}

// CSV для таблиц: разделитель «;» и BOM — так файл открывается в Excel
// и Numbers с русской локалью без «мастера импорта». Собирается в памяти
// и сохраняется на устройство, никуда не отправляется.
// Комментарии тут держим ОТДЕЛЬНЫМИ строками: в 1.3 пояснение про BOM
// стояло в хвосте строки сборки и проглотило `.concat(rows)` — в файл
// уходил один заголовок без единого полёта.
function csvSave(name, head, rows) {
  const q = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  const line = (cells) => cells.map(q).join(';');
  const csv = '﻿' + [line(head)].concat(rows.map(line)).join('\r\n') + '\r\n';
  saveFile(name + '-' + todayISO() + '.csv', new Blob([csv], { type: 'text/csv;charset=utf-8' }));
}

function exportLogCsv() {
  const done = S.sessions.filter((x) => x.end).sort((a, b) => a.start - b.start);
  if (!done.length) return;
  const head = ['№', 'Дата', 'Борт', 'Минуты', 'Аккумулятор', 'Локация', 'Итог', 'Погода', 'Заметки', 'Проблемы'];
  const rows = done.map((x) => {
    const a = S.aircraft.find((y) => y.id === x.aircraftId);
    const b = S.batteries.find((y) => y.id === x.batteryId);
    const site = S.sites.find((y) => y.id === x.siteId);
    return [
      String(x.flightNo == null ? '' : x.flightNo), x.date, a ? a.name : '',
      x.durationMin == null ? '' : x.durationMin, b ? b.label : '', site ? site.name : '',
      resultLabel(x, ''), x.weather || '', x.notes || '', x.problems || '',
    ];
  });
  csvSave('rc-planner-log', head, rows);
}

// Статистика в CSV — ровно то же, что на экране (statSections), одной
// длинной таблицей: раздел, подпись, полёты, налёт, циклы. Пустые клетки
// там, где показателя у раздела нет: выдумывать числа нельзя.
function exportStatsCsv() {
  const done = S.sessions.filter((x) => x.end).sort((a, b) => a.start - b.start);
  if (!done.length) return;
  const head = ['Раздел', 'Название', 'Полётов', 'Налёт, мин', 'Циклов'];
  const total = done.reduce((n, s) => n + (s.durationMin || 0), 0);
  // Лётные дни сюда не кладём: их некуда положить, кроме колонки
  // «Полётов», а число дней в колонке полётов — враньё в таблице.
  const rows = [['Итого', 'Все полёты', done.length, total, '']];
  for (const sec of statSections(done)) {
    for (const r of sec.rows) {
      rows.push([sec.title, r.k, r.n == null ? '' : r.n, r.min == null ? '' : r.min,
        r.cycles == null ? '' : r.cycles]);
    }
  }
  csvSave('rc-planner-stats', head, rows);
}
