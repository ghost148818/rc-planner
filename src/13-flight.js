// RC Planner · Полёт: вкладка, чек-лист, экран полёта, детали.
'use strict';

/* ---------- Полёт ---------- */

function viewFlight() {
  let h = pageHead('Полёт', { help: 'flight' });
  h += activeFlightBanners();
  // Подготовленный борт ниже показан как «Готов к вылету» — баннер
  // «Подготовка не закончена» о том же борте противоречил бы ему.
  const pa = UI.prep && S.aircraft.find((x) => x.id === UI.prep.aircraftId);
  if (UI.prep && !activeSessionOf(UI.prep.aircraftId) && !preparedFresh(pa)) {
    h += `<div class="banner">Подготовка не закончена: ${esc(pa ? pa.name : '')}.
      <button class="btn-sm btn right" data-nav="#/prep">Продолжить</button></div>`;
  }
  if (!S.aircraft.length && !activeSessions().length) {
    return h + emptyState('Сначала добавьте борт во «Флоте».', 'add-model', 'Добавить борт', 'fleet');
  }
  h += `<button class="btn btn-primary" data-act="start-prep">Начать полёт</button>`;

  // Подготовленные борта: чек-лист пройден, взлёт в одно нажатие.
  const prepared = S.aircraft.filter((a) => takeoffReady(a));
  if (prepared.length) {
    h += '<div class="h2">Готовы к вылету</div><div class="card flat">';
    h += prepared.map((a) => `<div class="row">
      ${aircraftThumb(a)}<span class="grow"><span class="t">${esc(a.name)}</span>
      <span class="d">чек-лист пройден в&nbsp;${fmtTime(a.prepared.at)}</span></span>
      ${chargeKnown(armedBattery(a))
        ? `<button class="btn btn-sm btn-primary" data-act="takeoff-prepared" data-id="${a.id}">Взлёт</button>`
        : chargeChip(armedBattery(a))}
    </div>`).join('');
    h += '</div>';
  }

  // Собранные, но не подготовленные борта — чек-лист в одно касание
  // (3.0: без них вкладка без полёта за день была пустой).
  const rest = armedFleet().filter((a) => !takeoffReady(a) && !activeSessionOf(a.id));
  h += todayFleetBlock('К вылету', rest, String(rest.length));

  // Экран облегчён (2.0): только полёты за сегодня, вся история — в «Журнале».
  const done = S.sessions.filter((s) => s.end).sort((a, b) => b.start - a.start);
  const today = done.filter((s) => s.date === todayISO());
  if (today.length) {
    // Один заголовок, как на макете: счётчик дня — в нём, а не отдельной
    // строкой дня из logGroupedHtml.
    const mins = today.reduce((n, s) => n + (s.durationMin || 0), 0);
    h += `<div class="h2">Сегодня <span class="cnt">${today.length} ${plural(today.length, 'полёт', 'полёта', 'полётов')} · ${fmtDur(mins)}</span></div>`;
    h += logGroupedHtml(today, null, true);
  }
  h += '<div class="card flat" style="margin-top:10px">' +
    rowBtn('data-nav="#/journal"', `<span class="grow"><span class="t">Журнал полётов</span>
      <span class="d wrap">${done.length ? `${done.length} ${plural(done.length, 'полёт', 'полёта', 'полётов')} · статистика, печать,&nbsp;CSV` : 'Полётов пока не было'}</span></span>`, 'journal') +
    '</div>';
  return h;
}

function templatesFor(type) {
  const builtin = RC.CHECKLISTS.filter((c) => c.type === type || type === 'other');
  const custom = S.templates.filter((t) => t.type === type || t.type === 'any');
  const list = builtin.concat(custom);
  return list.length ? list : RC.CHECKLISTS;
}

function viewPrep() {
  // Шаг 1 — выбрать модель.
  if (!UI.prep) {
    let h = pageHead('Подготовка', { back: '#/flight', sub: 'Выберите борт', help: 'flight' });
    if (!S.aircraft.length) return h + emptyState('Нет бортов.', 'add-model', 'Добавить борт', 'fleet');
    h += '<div class="card flat">';
    h += S.aircraft.map((a) => rowBtn(`data-act="prep-model" data-id="${a.id}"`,
      `${aircraftThumb(a)}<span class="grow"><span class="t">${esc(a.name)}</span>
       <span class="d">${TYPES[a.type] || ''}${preparedFresh(a) ? ` · подготовлен в ${fmtTime(a.prepared.at)}` : ''}</span></span>${chip(statusOf(a), a.id, true)}`)).join('');
    h += '</div>';
    return h;
  }

  // Шаг 2 — чек-лист.
  const a = S.aircraft.find((x) => x.id === UI.prep.aircraftId);
  if (!a) { UI.prep = null; return viewPrep(); }
  const tpls = templatesFor(a.type);
  const items = UI.prep.items;
  const doneCount = items.filter((i) => i.state).length;
  const failed = items.filter((i) => i.state === 'fail');
  const pbat = armedBattery(a);
  const curBatt = pbat ? pbat.id : '';

  const kept = UI.prep.runId && preparedFresh(a);
  let h = pageHead('Чек-лист', { back: '#/flight', help: 'flight',
    act: 'prep-menu', actLabel: 'Печать чек-листа', actIcon: 'print',
    sub: esc(a.name) + (TYPES[a.type] ? ' · ' + TYPES[a.type] : '') + (kept ? ' · <span class="nowrap">подготовлен в ' + fmtTime(a.prepared.at) + '</span>' : '') });
  h += `<div class="menu" popover="manual" id="prep-menu" role="menu" hidden>
      <button role="menuitem" data-act="print-prep">${ICONS.templates}Печать с отметками</button>
      <button role="menuitem" data-act="print-blank" data-tpl="${esc(UI.prep.tplId)}">${ICONS.print}Пустой бланк…</button>
    </div>`;
  if (statusOf(a) === 'grounded') {
    h += `<div class="banner warn">Полёты этого борта запрещены вами. Снимите запрет в его карточке, если готовы летать.</div>`;
  }
  const svcPrep = svcState(a);
  if (svcPrep && svcPrep.due) {
    h += `<div class="banner warn">Подошёл регламент: ${svcSinceText(svcPrep)}
      с последнего обслуживания (${svcEveryText(svcPrep)}). Осмотрите борт внимательнее.</div>`;
  }
  // Пилюли по ширине выбранного (pillSelect); подпись АКБ без веса
  // (noWeight) — «Li-Ion 6S2P 7000 · 610 г» на телефоне не помещалась.
  // Установленная АКБ уходит во ВТОРОЙ ряд вместе с чипом заряда (как
  // строка АКБ в герое борта): вчетвером на 390 px пилюли ужимались до
  // нечитаемости (замер 2026-09-07). Без АКБ второго ряда нет — пустой
  // ряд ради одинокой пилюли стоил бы 68 px высоты. Выбор АКБ здесь
  // ставит её в борт, тап по чипу отмечает заряд.
  const battPill = pillSelect('prepBatt', battOptions({ freeOnly: true, keepId: a.batteryId, emptyLabel: 'Без АКБ', addNew: true, noWeight: true }), curBatt,
    `class="sel-pill${curBatt ? ' sel' : ''}" data-change="prep-batt" aria-label="Аккумулятор — выбор ставит его в борт"`);
  h += `<div class="pill-row prep-pills">
    ${pillSelect('prepSite', siteOptions(null, { emptyLabel: 'Локация' }), UI.prep.siteId,
      `class="sel-pill${UI.prep.siteId ? ' sel' : ''}" data-change="prep-site" aria-label="Локация"`)}
    <button type="button" class="map-btn" data-act="prep-site-map" aria-label="Карта">${ICONS.sites}</button>
    ${pbat ? '' : battPill}
  </div>`;
  if (pbat) h += `<div class="pill-row prep-pills prep-batt">${battPill}${chargeChip(pbat)}</div>`;
  if (tpls.length > 1) {
    h += field('Шаблон', selectHtml('tpl',
      tpls.map((t) => [t.id, t.name + (t.builtin ? '' : ' (свой)')]),
      UI.prep.tplId, 'data-change="prep-template"'));
  }
  h += `<div class="prog-line"><span class="progress"><i style="width:${items.length ? Math.round(doneCount / items.length * 100) : 0}%"></i></span>
      <span class="small muted mono">${doneCount} / ${items.length}</span></div>
    <div class="small muted" style="margin-bottom:8px">тап по строке — ок, по клетке — выбор</div>`;
  h += '<div class="card flat">';
  // Тап по строке — ок ↔ пусто; тап по клетке — меню трёх состояний
  // (UI.prep.menuIdx), встроенное в строку. view-transition-name получает
  // только последняя тронутая клетка: при render(true) анимируется она
  // одна, остальные не моргают. Имя уникально в пределах страницы (ck-<i>).
  h += items.map((it, i) => {
    const open = UI.prep.menuIdx === i;
    return `<div class="ck" data-ck="${i}" data-state="${it.state || ''}">
      <button class="ck-main" data-act="ck-toggle" data-i="${i}">
        <span class="grow"><span class="t">${esc(it.t)}</span>${it.hint ? `<span class="d">${esc(it.hint)}</span>` : ''}</span>
      </button>
      <button class="st" data-act="ck-menu" data-i="${i}" aria-label="Состояние пункта" aria-expanded="${open}"${UI.prep.lastIdx === i ? ` style="view-transition-name: ck-${i}"` : ''}>${ckMark(it.state)}</button>
      ${open ? `<div class="ck-menu" role="group" aria-label="Состояние пункта">
        <button data-act="ck-set" data-i="${i}" data-state="ok" aria-pressed="${it.state === 'ok'}">${ICONS.check}<span>Ок</span></button>
        <button data-act="ck-set" data-i="${i}" data-state="fail" aria-pressed="${it.state === 'fail'}">${ICONS.x}<span>Проблема</span></button>
        <button data-act="ck-set" data-i="${i}" data-state="skip" aria-pressed="${it.state === 'skip'}">${ICONS.minus}<span>Пропустить</span></button>
      </div>` : ''}
    </div>`;
  }).join('');
  h += '</div>';
  // Липкая панель действий: держится над нижней панелью, пока список
  // прокручивается. Гард «без АКБ не летаем» остаётся.
  // «RX / TX» и «VTX / VRX» в перечислении проблем остаются заглавными:
  // понижать первую букву у аббревиатуры («rX / TX») — неграмотно.
  const lower = (t) => (/^[A-ZА-ЯЁ]{2}/.test(t) ? t : t.charAt(0).toLowerCase() + t.slice(1));
  h += '<div class="act-bar">';
  if (failed.length) {
    const n = failed.length;
    h += `<div class="banner warn">${ICONS.alert}<span class="grow">${plural(n, 'Отмечена', 'Отмечены', 'Отмечено')} ${n} ${plural(n, 'проблема', 'проблемы', 'проблем')}: ${failed.map((i) => esc(lower(i.t))).join(', ')}</span></div>`;
  }
  if (!pbat) {
    h += `<div class="banner warn">Без аккумулятора не летаем: выберите АКБ выше — он встанет в борт, и кнопки появятся.</div>`;
  } else {
    // Полёт не начать без отметки заряда; «Отметить готовым» это
    // требование не затрагивает (решение владельца 2026-09-07).
    if (chargeKnown(pbat)) {
      h += `<button class="btn btn-primary" data-act="start-flight">${ICONS.takeoff}Начать полёт</button>`;
    } else {
      h += `<div class="banner warn nocharge">${ICONS.batteries}<span class="grow">Отметьте заряд АКБ&nbsp;— появится «Начать полёт».</span>${chargeChip(pbat)}</div>`;
    }
    h += `<button class="btn" data-act="prep-done">Отметить готовым&nbsp;— взлёт позже</button>`;
  }
  h += '</div>';
  // Отмена — вне липкой панели: панель держит только то, что ведёт
  // к вылету, и не занимает пол-экрана на телефоне.
  h += `<button class="btn prep-cancel" data-act="cancel-prep">${kept ? 'Сбросить подготовку' : 'Отменить подготовку'}</button>`;
  return h;
}

/* ---------- Печать чек-листа ----------
   Бланк (printChecklistBlank) — пункты шаблона и пустые клетки на 1, 3
   или 5 полётов с полями «Борт / АКБ / Время»: лист на день, отмечать
   ручкой. Заполненный (printChecklistRun) — отметки прогона, борт, АКБ,
   локация, время, итог по пунктам: протокол подготовки. Входы: меню
   с принтером на экране чек-листа, кнопка у каждого шаблона в «Шаблонах
   чек-листов», кнопка в деталях полёта. Лист собирается в браузере,
   печатает системный диалог (printArea); пользовательские тексты —
   через esc(), шаблоны и прогоны из копии нормализованы в NORM. */
const PRINT_COLS = [1, 3, 5];
const CK_PRINT = { ok: '✓ ок', fail: '✗ проблема', skip: '— пропуск' };

function allTemplates() { return RC.CHECKLISTS.concat(S.templates); }

function ckPrintItem(it) {
  return `${esc(it.t)}${it.hint ? `<div class="h">${esc(it.hint)}</div>` : ''}`;
}
function ckPrintFoot(withDate) {
  const pilot = S.settings.pilot ? esc(S.settings.pilot) : '______________________';
  return `<p class="foot"><span>Пилот: ${pilot}</span>${withDate ? '<span>Дата: ______________</span>' : ''}<span>Подпись: ______________</span></p>`;
}

function printChecklistBlank(tpl, n) {
  if (!tpl) return;
  n = PRINT_COLS.includes(n) ? n : 1;
  const items = Array.isArray(tpl.items) ? tpl.items : [];
  const cols = Array.from({ length: n }, (_, i) => i + 1);
  const empty = cols.map(() => '<td class="c w"></td>').join('');
  const box = cols.map(() => '<td class="c"><span class="box"></span></td>').join('');
  const type = tpl.type === 'any' ? 'любой тип' : TYPES[tpl.type] || '';
  printArea(`<h1>Чек-лист «${esc(tpl.name)}»</h1>
    <p>${[type, `${items.length} ${plural(items.length, 'пункт', 'пункта', 'пунктов')}`, n > 1 ? `бланк на ${n} ${plural(n, 'полёт', 'полёта', 'полётов')}` : 'бланк', 'RC Planner'].filter(Boolean).join(' · ')}</p>
    <table class="pck cols-${n}"><thead><tr><th class="n">№</th><th>Пункт</th>${cols.map((c) => `<th class="c">${n > 1 ? 'Полёт ' + c : 'Отметка'}</th>`).join('')}</tr></thead>
    <tbody>
      <tr class="meta"><td class="n"></td><td>Борт</td>${empty}</tr>
      <tr class="meta"><td class="n"></td><td>АКБ, заряд</td>${empty}</tr>
      <tr class="meta"><td class="n"></td><td>Время взлёта</td>${empty}</tr>
      ${items.map((it, i) => `<tr><td class="n">${i + 1}</td><td>${ckPrintItem(it)}</td>${box}</tr>`).join('')}
    </tbody></table>
    <p class="legend">Отметка: ✓ — ок · ✗ — проблема · — — пропуск. Пункт с проблемой — не взлетать, пока не устранено.</p>
    ${ckPrintFoot(true)}`);
}

// d: { name, items [{t, hint, state}], meta [[подпись, текст]] } — тексты
// сырые, экранируются здесь.
function printChecklistRun(d) {
  const items = d.items || [];
  const cnt = (st) => items.filter((it) => it.state === st).length;
  const marked = items.filter((it) => CK_PRINT[it.state]).length;
  const sum = [`отмечено ${marked} из ${items.length}`, cnt('fail') ? `проблем ${cnt('fail')}` : 'проблем нет', cnt('skip') ? `пропущено ${cnt('skip')}` : ''].filter(Boolean).join(' · ');
  printArea(`<h1>Чек-лист «${esc(d.name || 'Чек-лист')}»</h1>
    <p class="meta-line">${d.meta.filter(([, v]) => v).map(([k, v]) => `<span><b>${k}:</b> ${esc(v)}</span>`).join('')}</p>
    <p>${sum}</p>
    <table class="pck run"><thead><tr><th class="n">№</th><th>Пункт</th><th class="c">Отметка</th></tr></thead>
    <tbody>${items.map((it, i) => `<tr${it.state === 'fail' ? ' class="fail"' : ''}><td class="n">${i + 1}</td><td>${ckPrintItem(it)}</td><td class="c">${CK_PRINT[it.state] || 'не отмечен'}</td></tr>`).join('')}</tbody></table>
    ${ckPrintFoot(false)}`);
}

// Текущая подготовка (экран чек-листа) — заполненный лист.
function printPrep() {
  if (!UI.prep) return;
  const a = S.aircraft.find((x) => x.id === UI.prep.aircraftId);
  if (!a) return;
  const tpl = templatesFor(a.type).find((t) => t.id === UI.prep.tplId) || {};
  const b = armedBattery(a);
  const site = S.sites.find((x) => x.id === UI.prep.siteId);
  printChecklistRun({
    name: tpl.name,
    items: UI.prep.items,
    meta: [
      ['Борт', a.name + (TYPES[a.type] ? ' (' + TYPES[a.type] + ')' : '')],
      ['АКБ', b ? b.label + (CHARGE_LABEL[b.charge] ? ' — ' + CHARGE_LABEL[b.charge] : '') : 'не установлен'],
      ['Локация', site ? site.name : ''],
      ['Дата', fmtDate(todayISO()) + ', ' + fmtTime(Date.now())],
    ],
  });
}

// Чек-лист, пройденный перед полётом (детали полёта) — заполненный лист.
function printRun(s) {
  const run = s && S.runs.find((r) => r.id === s.checklistRunId);
  if (!run) return;
  const a = S.aircraft.find((x) => x.id === s.aircraftId);
  const b = S.batteries.find((x) => x.id === s.batteryId);
  const site = S.sites.find((x) => x.id === s.siteId);
  const t = +s.start;
  printChecklistRun({
    name: run.templateName,
    items: run.items,
    meta: [
      ['Полёт', flightNoText(s)],
      ['Борт', a ? a.name : 'удалён'],
      ['АКБ', b ? b.label : ''],
      ['Локация', site ? site.name : ''],
      ['Дата', fmtDate(s.date) + (t > 0 && t <= 8.64e15 ? ', ' + fmtTime(t) : '')],
    ],
  });
}

// Окно выбора бланка: сколько колонок-полётов на листе.
function openBlankPrint(tpl) {
  if (!tpl) return;
  const n = Array.isArray(tpl.items) ? tpl.items.length : 0;
  openModal('Печать бланка', `<p class="small muted" style="margin:0 0 12px">«${esc(tpl.name)}» · ${n}&nbsp;${plural(n, 'пункт', 'пункта', 'пунктов')}.
      Колонка на каждый полёт: один лист на весь день, отметки ручкой.</p>
    <div class="btn-line eq">${PRINT_COLS.map((c) => `<button class="btn" data-act="print-blank-go" data-tpl="${esc(tpl.id)}" data-n="${c}">${c}&nbsp;${plural(c, 'полёт', 'полёта', 'полётов')}</button>`).join('')}</div>`);
}

/* ---------- Экран полёта: HUD-кольцо, пилюли, посадка ----------
   Кольцо — прошедшее время относительно ЦЕЛИ: сигнала таймера борта
   (a.alarmMin, «время на аккумулятор»), а без него — средней длительности
   завершённых полётов этого борта. Цель пройдена — кольцо янтарное и
   пульсирует (.over). Нет ни сигнала, ни полётов — кольцо пустое,
   подпись «первый полёт». Живое обновление — в интервале paint(). */
const RING_R = 102;
const RING_C = 2 * Math.PI * RING_R;
const TICK_R = 88; // шкала из 60 делений внутри кольца
const TICK_C = 2 * Math.PI * TICK_R;

function avgFlightMs(aircraftId) {
  const done = sessionsOf(aircraftId).filter((s) => s.end && +s.durationMin > 0);
  if (!done.length) return 0;
  return done.reduce((n, s) => n + +s.durationMin, 0) / done.length * 60000;
}

// Сигнал таймера борта в мс (0 — не задан). Поле нормализовано в NORM.
function alarmMs(a) {
  const m = a && +a.alarmMin;
  return m > 0 ? Math.round(m * 60000) : 0;
}
function flightTargetMs(a) {
  return alarmMs(a) || (a ? avgFlightMs(a.id) : 0);
}

function ringOffset(ms, target) {
  if (!target) return RING_C.toFixed(1);
  const p = Math.min(1, Math.max(0, ms / target));
  return (RING_C * (1 - p)).toFixed(1);
}

function ringHtml(s, a) {
  const landed = !!s.landedAt;
  const ms = (landed ? s.landedAt : Date.now()) - s.start;
  const avg = a ? avgFlightMs(a.id) : 0;
  const alarm = alarmMs(a);
  const target = alarm || avg;
  const over = !landed && target > 0 && ms >= target;
  const sub = alarm
    ? `сигнал <span class="mono">${fmtClock(alarm)}</span>${avg ? ` · обычно <span class="mono">${fmtClock(avg)}</span>` : ''}`
    : avg ? `обычно <span class="mono">${fmtClock(avg)}</span>` : 'первый полёт';
  return `<div class="ring${landed ? ' landed' : ''}${over ? ' over' : ''}" id="ring">
    <svg class="r" viewBox="0 0 220 220" aria-hidden="true">
      <circle class="ring-ticks" cx="110" cy="110" r="${TICK_R}" stroke-dasharray="1.2 ${(TICK_C / 60 - 1.2).toFixed(2)}"/>
      <circle class="ring-track" cx="110" cy="110" r="${RING_R}"/>
      <circle class="ring-fill" id="ring-fill" cx="110" cy="110" r="${RING_R}" data-target="${Math.round(target)}"
        stroke-dasharray="${RING_C.toFixed(1)}" stroke-dashoffset="${ringOffset(ms, target)}"/>
    </svg>
    <div class="ring-in">
      <div class="timer${landed ? ' landed' : ''}" id="timer" data-sid="${s.id}">${clockHtml(ms)}</div>
      <div class="small muted ring-sub">${sub}</div>
    </div>
  </div>`;
}

// Кнопка и меню сигнала таймера: выбор пишется в карточку борта —
// «время на аккумулятор» у борта постоянное, а не на один полёт.
const ALARM_STEPS = [2, 3, 4, 5, 6, 7, 8, 10, 12, 15, 20, 25, 30, 40, 45, 60];
function alarmPillHtml(a) {
  if (!a) return '';
  const alarm = alarmMs(a);
  const cur = alarm ? +a.alarmMin : null;
  return `<button type="button" class="pill alarm-btn" data-act="alarm-menu" aria-haspopup="menu" aria-expanded="false"
      aria-pressed="${!!alarm}">${ICONS.bell}<span>${alarm ? 'Сигнал ' + fmtClock(alarm) : 'Сигнал'}</span></button>
    <div class="menu menu-grid" popover="manual" id="alarm-menu" role="menu" aria-label="Сигнал таймера" hidden>
      <button class="menu-head" role="menuitemradio" data-act="alarm-set" data-min="" aria-checked="${!alarm}">Без сигнала</button>
      ${ALARM_STEPS.map((m) => `<button role="menuitemradio" data-act="alarm-set" data-min="${m}" aria-checked="${cur === m}">${m} мин</button>`).join('')}
    </div>`;
}

/* ---------- Сигнал таймера: вибрация и звук ----------
   Срабатывает один раз, когда полёт борта в воздухе доходит до
   a.alarmMin, — на любом экране (проверка раз в секунду, пока такой
   полёт есть). Вибрация — Vibration API (на iPhone её нет), звук —
   короткие гудки Web Audio. Оба API локальные: ничего не уходит в сеть.
   Звук браузер разрешает только после касания: AudioContext создаётся
   и «будится» в обработчике нажатия (взлёт, выбор сигнала) — и только
   если у борта сигнал задан, чтобы не трогать чужую музыку зря.
   Открыли полёт спустя долгое время после сигнала — не гудим: окно
   срабатывания 30 секунд после отметки. */
let ALARM = null;
let AUDIO = null;
const ALARM_FIRED = new Set();
const ALARM_WINDOW_MS = 30000;

function audioUnlock() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!AUDIO) AUDIO = new AC();
    if (AUDIO.state === 'suspended') AUDIO.resume().catch(() => {});
  } catch (e) { AUDIO = null; }
}
function beep(times) {
  if (!AUDIO || AUDIO.state !== 'running') return;
  try {
    const t0 = AUDIO.currentTime + 0.02;
    for (let i = 0; i < times; i++) {
      const o = AUDIO.createOscillator();
      const g = AUDIO.createGain();
      const t = t0 + i * 0.32;
      o.type = 'square';
      o.frequency.value = i === times - 1 ? 1320 : 1760;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.22, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      o.connect(g);
      g.connect(AUDIO.destination);
      o.start(t);
      o.stop(t + 0.24);
    }
  } catch (e) { /* без звука — вибрация и кольцо всё равно есть */ }
}
function alarmSessions() {
  return S.sessions.filter((s) => !s.end && !s.landedAt &&
    alarmMs(S.aircraft.find((a) => a.id === s.aircraftId)) > 0);
}
function checkAlarms() {
  const list = alarmSessions();
  if (!list.length) { clearInterval(ALARM); ALARM = null; return; }
  for (const s of list) {
    const alarm = alarmMs(S.aircraft.find((a) => a.id === s.aircraftId));
    const ms = Date.now() - s.start;
    if (ms >= alarm && ms < alarm + ALARM_WINDOW_MS && !ALARM_FIRED.has(s.id)) {
      ALARM_FIRED.add(s.id);
      haptic([280, 120, 280, 120, 600]);
      beep(3);
    }
  }
}
// Из paint(): интервал живёт, пока есть полёт в воздухе с сигналом.
function syncAlarms() {
  const need = alarmSessions().length > 0;
  if (need && !ALARM) ALARM = setInterval(checkAlarms, 1000);
  else if (!need && ALARM) { clearInterval(ALARM); ALARM = null; }
  // Полётов нет — звук больше не нужен: отпускаем аудиоустройство.
  if (!need && AUDIO && !S.sessions.some((s) => !s.end)) {
    try { AUDIO.close(); } catch (e) { /* уже закрыт */ }
    AUDIO = null;
  }
}
// Касание перед полётом с сигналом — будим звук заранее.
function audioUnlockFor(aircraftId) {
  if (alarmMs(S.aircraft.find((a) => a.id === aircraftId))) audioUnlock();
}

function viewSession() {
  const s = S.sessions.find((x) => x.id === UI.arg);
  if (!s) return pageHead('Полёт не найден', { back: '#/flight' });
  const a = S.aircraft.find((x) => x.id === s.aircraftId);
  const inAir = !s.end && !s.landedAt;
  // Индикатор «экран не гаснет» — только пока борт в воздухе и только
  // когда замок реально получен (hidden снимает wakeIndicator).
  const wake = inAir
    ? `<span class="wake-ind" id="wake-ind"${UI.wakeLock ? '' : ' hidden'}><span class="ico14">${ICONS.eye}</span>экран не гаснет</span>` : '';
  let h = pageHead(s.end ? 'Полёт' : s.landedAt ? 'Сел' : 'В полёте', {
    back: '#/flight', right: wake, help: 'flight',
    sub: esc(a ? a.name : 'Борт удалён') + ` · <span class="mono">${flightNoText(s)}</span>`,
  });
  if (s.end) {
    h += sessionDetailHtml(s);
    h += `<button class="btn" data-act="finish-flight" data-id="${s.id}">Изменить итог</button>`;
    return h;
  }

  const over = !s.landedAt && flightTargetMs(a) > 0 && Date.now() - s.start >= flightTargetMs(a);
  h += `<div class="air-state"><span class="air-pill${s.landedAt ? ' landed' : over ? ' alarm' : ''}" id="air-pill">${
    s.landedAt ? 'Посадка' : over ? 'Время вышло' : 'В воздухе'}</span></div>`;
  h += ringHtml(s, a);
  // Пилюли контекста: АКБ, локация, ветер у земли из кэша (если свежий),
  // сигнал таймера — пока борт в воздухе
  const b = S.batteries.find((x) => x.id === s.batteryId);
  const site = S.sites.find((x) => x.id === s.siteId);
  const wind = wxWindNowText(site, a);
  const pills = [
    b ? `<span class="pill">${ICONS.batteries}${battTag(b)}</span>` : '',
    site ? `<span class="pill">${ICONS.sites}<span>${esc(site.name)}</span></span>` : '',
    wind ? `<span class="pill">${ICONS.weather}<span>${wind}</span></span>` : '',
    s.landedAt ? '' : alarmPillHtml(a),
  ].filter(Boolean).join('');
  if (pills) h += `<div class="pills">${pills}</div>`;

  // Два шага (2.0): «Посадка» только останавливает таймер (land-flight),
  // итог записывают отдельной кнопкой — в поле руки заняты бортом.
  if (s.landedAt) {
    h += `<button class="btn btn-primary" data-act="finish-flight" data-id="${s.id}">Записать итог</button>
      <button class="btn" data-act="resume-flight" data-id="${s.id}">Продолжить полёт</button>
      <p class="small muted session-hint opt">Посадка зафиксирована, таймер остановлен. «Продолжить&nbsp;полёт» снова запустит его.</p>`;
  } else {
    h += `<button class="btn btn-primary btn-land" data-act="land-flight" data-id="${s.id}">${ICONS.landing}Посадка</button>
      <button class="btn" data-act="discard-flight" data-id="${s.id}">Отменить — полёта не было</button>
      <p class="small muted session-hint opt">После посадки таймер остановится, а итог — результат, заметки, проблемы — можно записать позже. Можно свернуть приложение — время не потеряется.</p>`;
  }

  // Полёты за сегодня — как на вкладке «Полёт»
  const today = S.sessions.filter((x) => x.end && x.date === todayISO()).sort((x, y) => y.start - x.start);
  if (today.length) {
    const mins = today.reduce((n, x) => n + (x.durationMin || 0), 0);
    h += `<div class="h2">Сегодня <span class="cnt">${today.length} ${plural(today.length, 'полёт', 'полёта', 'полётов')} · ${fmtDur(mins)}</span></div>`;
    h += logGroupedHtml(today, null, true);
  }
  return h;
}

function sessionDetailHtml(s) {
  const a = S.aircraft.find((x) => x.id === s.aircraftId);
  const b = S.batteries.find((x) => x.id === s.batteryId);
  const site = S.sites.find((x) => x.id === s.siteId);
  const run = S.runs.find((r) => r.id === s.checklistRunId);
  const rows = [
    ['Дата', fmtDate(s.date)],
    ['Борт', a ? a.name : '—'],
    ['Длительность', fmtDur(s.durationMin)],
    ['Аккумулятор', b ? b.label : '—'],
    ['Локация', site ? site.name : '—'],
    ['Погода', s.weather || '—'],
    ['Результат', resultLabel(s)],
  ];
  let h = '<div class="card">' + rows.map(([k, v]) =>
    `<div style="display:flex;justify-content:space-between;gap:12px;padding:4px 0"><span class="muted">${k}</span><span style="text-align:right">${esc(v)}</span></div>`).join('') + '</div>';
  if (s.notes) h += `<div class="h2">Заметки</div><div class="card" style="white-space:pre-wrap">${esc(s.notes)}</div>`;
  if (s.problems) h += `<div class="h2">Проблемы</div><div class="card" style="white-space:pre-wrap;color:var(--warn)">${esc(s.problems)}</div>`;
  if (run) {
    h += `<details class="fold"><summary>Чек-лист перед полётом</summary><div class="fold-body"><div class="card flat">` +
      run.items.map((it) => `<div class="ck" data-state="${it.state || ''}">
        <span class="grow"><span class="t">${esc(it.t)}</span></span>
        <span class="st">${ckMark(it.state || 'skip')}</span></div>`).join('') +
      `</div><button class="btn btn-sm" data-act="print-run" data-id="${s.id}" style="margin-top:10px">${ICONS.print}Печать чек-листа</button></div></details>`;
  }
  return h;
}

// Список полётов, сгруппированный по датам: заголовок дня с числом
// полётов и налётом. Используется в журнале и на вкладке «Полёт».
// noDayHead — без заголовков дней (вызывающий рисует свой, «Сегодня»).
// Строки — внутри дня (время вместо даты); rowOpts — доп. параметры
// sessionRow (noName в карточке борта).
function logGroupedHtml(list, totalsFrom, noDayHead, rowOpts) {
  // totalsFrom: полный журнал для честных итогов дня, когда list обрезан
  const full = totalsFrom || list;
  // Длинный журнал (> 20 строк): карточки дней раскладываются лениво
  // (content-visibility: auto) — прокрутка старой истории не тормозит.
  // Заглушке нужна честная высота: число строк карточки уходит в --n,
  // CSS умножает на --row (иначе scrollHeight врёт и render(true)
  // с сохранением прокрутки прыгает — ревью пакета 5).
  const lazy = list.length > 20 ? ' cv' : '';
  const rowsOf = new Map();
  if (lazy) list.forEach((x) => rowsOf.set(x.date, (rowsOf.get(x.date) || 0) + 1));
  let h = '';
  let cur = null;
  let open = false;
  for (const sess of list) {
    if (sess.date !== cur) {
      if (open) h += '</div>';
      cur = sess.date;
      const dayList = full.filter((x) => x.date === cur);
      // Итог дня — только когда полётов больше одного: у одиночного он
      // повторял бы длительность строки под ним.
      if (!noDayHead) {
        h += `<div class="grp-head"><span class="grow">${fmtDate(cur)}</span>${dayList.length > 1
          ? `<span class="muted small">${dayList.length} ${plural(dayList.length, 'полёт', 'полёта', 'полётов')} · ${fmtDur(dayList.reduce((n, x) => n + (x.durationMin || 0), 0))}</span>` : ''}</div>`;
      }
      h += `<div class="card flat${lazy}"${lazy ? ` style="--n:${rowsOf.get(cur)}"` : ''}>`;
      open = true;
    }
    h += sessionRow(sess, Object.assign({ inDay: true }, rowOpts));
  }
  if (open) h += '</div>';
  return h;
}
