// RC Planner · Карточка борта: герой и сегменты.
'use strict';

/* ---------- Карточка борта: герой + сегменты ----------
   Герой — статус, АКБ-пилюля, три числа, полоска регламента и одна
   кнопка «Чек-лист и полёт». Ниже сегменты «Обзор · Компоненты ·
   Обслуживание · История» (UI.modelTab): сегмент живёт при render(true)
   и сбрасывается на «Обзор» при смене борта (UI.modelTabFor). */
const MODEL_TABS = [
  ['overview', 'Обзор'], ['components', 'Компоненты'],
  ['maint', 'Обслуживание'], ['history', 'История'],
];

function viewModel() {
  const a = S.aircraft.find((x) => x.id === UI.arg);
  if (!a) return pageHead('Борт не найден', { back: '#/fleet' });
  if (UI.modelTabFor !== a.id) { UI.modelTab = 'overview'; UI.modelTabFor = a.id; }
  const tab = MODEL_TABS.some(([id]) => id === UI.modelTab) ? UI.modelTab : 'overview';
  const flights = sessionsOf(a.id).filter((s) => s.end);

  let h = pageHead(esc(a.name), {
    back: '#/fleet', act: 'edit-model', actLabel: 'Изменить', help: 'fleet',
    sub: [TYPES[a.type], a.manufacturer ? esc(a.manufacturer) : ''].filter(Boolean).join(' · '),
  });

  if (UI.justCreated === a.id) {
    const learning = onboardingSteps().todo > 0;
    h += `<div class="banner ok">${ICONS.check}<span class="grow">Борт добавлен. Это его карточка: статус, АКБ, компоненты, обслуживание.</span>
      <button class="btn-sm btn right" data-nav="#/fleet">Во «Флот»</button>
      ${learning ? '<button class="btn-sm btn right" data-nav="#/today">К обучению</button>' : ''}</div>`;
  }

  h += modelHeroHtml(a, flights);
  h += `<div class="seg four model-tabs">` + MODEL_TABS.map(([id, label]) =>
    `<button data-act="model-tab" data-tab="${id}" aria-pressed="${tab === id}">${label}</button>`).join('') + '</div>';
  h += tab === 'components' ? modelComponentsHtml(a)
    : tab === 'maint' ? modelMaintHtml(a)
    : tab === 'history' ? modelHistoryHtml(a, flights)
    : modelOverviewHtml(a);
  return h;
}

// Герой: превью 72 px и рядом чип статуса + компактный селект
// «авто/вручную»; ниже, на всю ширину карточки, АКБ-пилюля (тот же селект
// model-batt) с чипом заряда; три плитки, полоска регламента, кнопка
// «Чек-лист и полёт». Строка АКБ вынесена из-под превью: рядом с ним
// остаётся ~270 px, и пилюля с чипом в одну строку не помещались —
// герой складывался в четыре строки, превью висело посреди столбца.
function modelHeroHtml(a, flights) {
  const st = statusOf(a);
  const bat = armedBattery(a);
  const total = flights.reduce((n, s) => n + (s.durationMin || 0), 0);
  const svc = svcState(a);
  return `<div class="card hero model-hero">
    <div class="hero-top">
      ${aircraftThumb(a, true)}
      <span class="grow hero-line">${chip(st, a.id)}
        ${pillSelect('statusManual', [['', 'авто']].concat(Object.keys(STATUS).filter((k) => k !== 'unknown')
          .map((k) => [k, 'вручную: ' + STATUS[k].label])), a.statusManual || '',
          `class="sel-sm" data-change="status-manual" data-id="${a.id}" aria-label="Статус: авто или вручную"`, true)}</span>
    </div>
    <div class="hero-line hero-batt">
      ${pillSelect('modelBatt', battOptions({ freeOnly: true, keepId: a.batteryId, emptyLabel: 'Без АКБ', addNew: true, noWeight: true }), a.batteryId || '',
        `class="sel-pill${bat ? ' sel' : ''}" data-change="model-batt" data-id="${a.id}" aria-label="Аккумулятор борта"${bat ? '' : ' data-next-arm'}`)}
      ${chargeChip(bat)}
    </div>
    ${bat ? '' : `<div class="hint">Борт с установленным АКБ считается собранным к вылету
      и попадает на «Сегодня»; вес АКБ учитывается в окнах погоды.</div>`}
    <div class="stat-line">
      <div class="stat"><div class="v">${flights.length}</div><div class="k">${plural(flights.length, 'полёт', 'полёта', 'полётов')}</div></div>
      <div class="stat"><div class="v">${fmtDurShort(total)}</div><div class="k">налёт</div></div>
      <div class="stat"><div class="v">${flights[0] ? fmtDate(flights[0].date) : '—'}</div><div class="k">последний</div></div>
    </div>
    ${svc ? svcLineHtml(a, svc) : ''}
    <button class="btn btn-primary" data-act="start-prep" data-id="${a.id}">${ICONS.templates}Чек-лист и полёт</button>
  </div>`;
}

// Регламент осмотра полоской: заполнение — доля пройденного по тому
// счётчику, что ближе к сроку; при due — цвет --maint и кнопка «Осмотр».
// Регламент — напоминание, полёты не запрещает.
function svcLineHtml(a, svc) {
  const frac = Math.max(svc.every ? svc.flights / svc.every : 0, svc.everyMin ? svc.minutes / svc.everyMin : 0);
  const pct = Math.round(Math.min(1, frac) * 100);
  return `<div class="svc-line">
      <span class="small nowrap" style="color:var(--${svc.due ? 'maint' : 'mut'})">${svc.due ? 'Пора осмотреть' : `До осмотра ${svcLeftText(svc)}`}</span>
      <span class="progress"><i style="width:${pct}%${svc.due ? ';background:var(--maint)' : ''}"></i></span>
    </div>
    <div class="svc-sub"><span class="grow">пройдено ${svcSinceText(svc)} · регламент ${svcEveryText(svc)}</span>
      ${svc.due ? `<button class="btn btn-sm" data-act="add-maint" data-id="${a.id}" data-kind="inspection" data-title="Осмотр по регламенту">Осмотр</button>` : ''}
    </div>`;
}

// Строка компонента: название и версия прошивки (c.fw), если есть.
function compRow(a, key, label, c) {
  const d = c && c.name
    ? esc(c.name) + (c.fw ? ` · <span style="color:var(--info)">${esc(c.fw)}</span>` : '')
    : '<span class="muted">не указано</span>';
  return rowBtn(`data-act="edit-comp" data-id="${a.id}" data-key="${key}"`,
    `<span class="grow"><span class="t">${label}</span><span class="d">${d}</span></span>`);
}

// «Аккумулятор» — информационная строка: показывает установленную АКБ
// (или подсказку), отдельно не редактируется — источник один.
function compBatteryRow(a) {
  const comps = a.components || {};
  const ab = armedBattery(a);
  const legacy = comps.battery && (comps.battery.name || comps.battery.notes)
    ? ` · <span class="muted">заметка: ${esc([comps.battery.name, comps.battery.notes].filter(Boolean).join(' — '))}</span>` : '';
  return `<div class="row"><span class="grow"><span class="t">Аккумулятор</span>
    <span class="d">${ab
      ? `${battTag(ab)} · ${esc(ab.chem || '')} ${ab.cells ? ab.cells + 'S' : ''}${ab.p > 1 ? ab.p + 'P' : ''}${ab.capacity ? ' · ' + ab.capacity + ' мА·ч' : ''}`
      : '<span class="muted">не установлен — ставится в карточке выше</span>'}${legacy}</span></span></div>`;
}

// Открытые работы с «Выполнено» одним касанием — после краша это
// следующий очевидный шаг.
function maintOpenRows(list) {
  return list.map((m) => `<div class="row">
    ${maintThumb(m, true)}<button class="grow" data-act="edit-maint" data-id="${m.id}" style="text-align:left;min-height:var(--seg)">
      <span class="t">${esc(m.title)}</span>
      <span class="d">${MAINT_KINDS[m.kind] || ''} · ${fmtDate(m.date)}${m.next ? ' · далее: ' + esc(m.next) : ''}</span></button>
    <button class="btn btn-sm" data-act="maint-done" data-id="${m.id}">Выполнено</button>
  </div>`).join('');
}

function maintOf(a) {
  return S.maintenance.filter((m) => m.aircraftId === a.id)
    .sort((x, y) => (y.date || '').localeCompare(x.date || ''));
}

// Обзор: паспорт, заполненные компоненты, открытые работы, конфигурации,
// заметки, внизу «Экспорт борта» / «Удалить».
function modelOverviewHtml(a) {
  const bat = armedBattery(a);
  const svc = svcState(a);
  let h = '';

  // Паспорт — сетка 2 колонки. Числа нормализованы в loadAll (число или
  // null), но в разметку всё равно идут через esc() — привычка дешевле.
  const kv = [];
  if (a.weight) {
    kv.push(['Вес сухой' + (bat && bat.weight ? ' / взлётный' : ''),
      `${esc(a.weight)} г` + (bat && bat.weight ? ` / ${esc(a.weight + bat.weight)} г` : '')]);
  }
  if (a.wingspan) kv.push(['Размах', `${esc(a.wingspan)} мм`]);
  const own = wxOwnWind(a);
  kv.push(['Ветер · высота', `${own ? 'до ' + own : '≈' + wxEstimate(a, bat && bat.weight)} м/с · до ${wxOwnAlt(a)} м`]);
  if (svc) kv.push(['Регламент', svcEveryText(svc)]);
  if (alarmMs(a)) kv.push(['Сигнал таймера', fmtClock(alarmMs(a))]);
  h += `<div class="card"><div class="kv">${kv.map(([k, v]) =>
    `<div><span class="k">${k}</span><span class="v">${v}</span></div>`).join('')}</div></div>`;

  // Заполненные компоненты (с версией прошивки); пустые — за «Добавить»
  const comps = a.components || {};
  const filled = compSlots(a).filter(([key]) => key !== 'battery' && comps[key] && comps[key].name);
  h += `<div class="h2">Компоненты${filled.length ? ` <span class="cnt">${filled.length}</span>` : ''}</div><div class="card flat">`;
  h += filled.map(([key, label]) => compRow(a, key, label, comps[key])).join('');
  h += rowBtn('data-act="model-tab" data-tab="components"',
    `<span class="grow"><span class="t muted">${filled.length ? 'Все компоненты' : 'Добавить компонент'}</span></span>`, 'plus');
  h += '</div>';

  // Открытые работы
  const openM = maintOf(a).filter((m) => !m.done);
  if (openM.length) {
    h += `<div class="h2">Обслуживание <span class="cnt">${openM.length}</span></div><div class="card flat">${maintOpenRows(openM)}</div>`;
  }

  // Конфигурации
  const cfgs = S.configs.filter((c) => c.aircraftId === a.id).sort((x, y) => y.createdAt - x.createdAt);
  const groups = {};
  cfgs.forEach((c) => { (groups[c.group] = groups[c.group] || []).push(c); });
  h += '<div class="h2">Конфигурации и прошивки</div>';
  if (cfgs.length) {
    h += '<div class="card flat">';
    h += Object.keys(groups).map((g) => {
      const list = groups[g];
      return rowBtn(`data-act="config-group" data-id="${a.id}" data-group="${esc(g)}"`,
        `<span class="grow"><span class="t">${esc(g)}</span>
         <span class="d">${list.length} ${plural(list.length, 'версия', 'версии', 'версий')} · ${fmtDate(list[0].date)}</span></span>`);
    }).join('');
    h += '</div>';
  }
  h += `<button class="btn" data-act="add-config" data-id="${a.id}">Сохранить конфигурацию</button>`;

  // Заметки
  if (a.notes) h += `<div class="h2">Заметки</div><div class="card" style="white-space:pre-wrap">${esc(a.notes)}</div>`;

  h += `<hr class="sep">
    <div class="btn-line">
      <button class="btn" data-act="clone-model" data-id="${a.id}">Копия борта</button>
      <button class="btn" data-act="export-model" data-id="${a.id}">Экспорт борта</button>
    </div>
    <div class="btn-line">
      <button class="btn btn-danger" data-act="del-model" data-id="${a.id}">Удалить</button>
    </div>`;
  return h;
}

// Компоненты: строки по типу борта, АКБ — информационная.
function modelComponentsHtml(a) {
  const comps = a.components || {};
  return '<div class="card flat">' + compSlots(a).map(([key, label]) =>
    key === 'battery' ? compBatteryRow(a) : compRow(a, key, label, comps[key])).join('') +
    '</div><p class="small muted" style="margin-top:8px">Состав зависит от типа борта: у самолёта и крыла есть «Трубка Пито» и «ПАК». У компонента есть поле «Версия прошивки» — она видна в «Обзоре».</p>';
}

// Обслуживание: открытые работы, «Добавить запись», история закрытых.
function modelMaintHtml(a) {
  const maint = maintOf(a);
  const openM = maint.filter((m) => !m.done);
  const doneM = maint.filter((m) => m.done);
  let h = '<div class="card flat">';
  h += openM.length ? maintOpenRows(openM)
    : '<div class="row"><span class="grow muted small">Открытых работ нет</span></div>';
  h += '</div>';
  h += `<button class="btn" data-act="add-maint" data-id="${a.id}">Добавить запись обслуживания</button>`;
  if (doneM.length) {
    h += `<div class="h2">История <span class="cnt">${doneM.length}</span></div><div class="card flat">`;
    h += doneM.map((m) => rowBtn(`data-act="edit-maint" data-id="${m.id}"`,
      `${maintThumb(m)}<span class="grow"><span class="t" style="color:var(--mut)">${esc(m.title)}</span>
       <span class="d">${MAINT_KINDS[m.kind] || ''} · ${fmtDate(m.date)}</span></span>`)).join('');
    h += '</div>';
  }
  return h;
}

// История: все полёты борта по дням, кнопка «Весь журнал».
function modelHistoryHtml(a, flights) {
  if (!flights.length) {
    return `<div class="empty">${ICONS.flight}<p>Полётов у этого борта ещё не было.</p>
      <button class="btn btn-sm" data-act="start-prep" data-id="${a.id}">Чек-лист и полёт</button></div>`;
  }
  return logGroupedHtml(flights) + `<button class="btn" data-nav="#/journal">Весь журнал</button>`;
}
