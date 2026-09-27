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
      <span class="d">чек-лист пройден в ${fmtTime(a.prepared.at)}</span></span>
      ${chargeKnown(armedBattery(a))
        ? `<button class="btn btn-sm btn-primary" data-act="takeoff-prepared" data-id="${a.id}">Взлёт</button>`
        : chargeChip(armedBattery(a))}
    </div>`).join('');
    h += '</div>';
  }

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
      <span class="d wrap">${done.length ? `${done.length} ${plural(done.length, 'полёт', 'полёта', 'полётов')} · статистика, печать, CSV` : 'Полётов пока не было'}</span></span>`, 'journal') +
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
    sub: esc(a.name) + (TYPES[a.type] ? ' · ' + TYPES[a.type] : '') + (kept ? ' · подготовлен в ' + fmtTime(a.prepared.at) : '') });
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
    return `<div class="ck" data-state="${it.state || ''}">
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
    h += `<div class="banner warn">${ICONS.x}<span class="grow">${plural(n, 'Отмечена', 'Отмечены', 'Отмечено')} ${n} ${plural(n, 'проблема', 'проблемы', 'проблем')}: ${failed.map((i) => esc(lower(i.t))).join(', ')}</span></div>`;
  }
  if (!pbat) {
    h += `<div class="banner warn">Без аккумулятора не летаем: выберите АКБ выше — он встанет в борт, и кнопки появятся.</div>`;
  } else {
    // Полёт не начать без отметки заряда; «Отметить готовым» это
    // требование не затрагивает (решение владельца 2026-09-07).
    if (chargeKnown(pbat)) {
      h += `<button class="btn btn-primary" data-act="start-flight">${ICONS.takeoff}Начать полёт</button>`;
    } else {
      h += `<div class="banner warn nocharge">${ICONS.batteries}<span class="grow">Отметьте заряд аккумулятора — и появится «Начать полёт».</span>${chargeChip(pbat)}</div>`;
    }
    h += `<button class="btn" data-act="prep-done">Отметить готовым — взлёт позже</button>`;
  }
  h += `<button class="btn" data-act="cancel-prep">${kept ? 'Сбросить подготовку' : 'Отменить подготовку'}</button></div>`;
  return h;
}

/* ---------- Экран полёта: кольцо, пилюли, посадка ----------
   Кольцо — прошедшее время относительно средней длительности
   завершённых полётов этого борта; нет полётов — кольцо пустое,
   подпись «первый полёт». Живое обновление — в интервале paint(). */
const RING_R = 102;
const RING_C = 2 * Math.PI * RING_R;

function avgFlightMs(aircraftId) {
  const done = sessionsOf(aircraftId).filter((s) => s.end && +s.durationMin > 0);
  if (!done.length) return 0;
  return done.reduce((n, s) => n + +s.durationMin, 0) / done.length * 60000;
}

function ringOffset(ms, avgMs) {
  if (!avgMs) return RING_C.toFixed(1);
  const p = Math.min(1, Math.max(0, ms / avgMs));
  return (RING_C * (1 - p)).toFixed(1);
}

function ringHtml(s, a) {
  const landed = !!s.landedAt;
  const ms = (landed ? s.landedAt : Date.now()) - s.start;
  const avg = a ? avgFlightMs(a.id) : 0;
  return `<div class="ring${landed ? ' landed' : ''}">
    <svg class="r" viewBox="0 0 220 220" aria-hidden="true">
      <circle class="ring-track" cx="110" cy="110" r="${RING_R}"/>
      <circle class="ring-fill" id="ring-fill" cx="110" cy="110" r="${RING_R}" data-avg="${Math.round(avg)}"
        stroke-dasharray="${RING_C.toFixed(1)}" stroke-dashoffset="${ringOffset(ms, avg)}"/>
    </svg>
    <div class="ring-in">
      <div class="timer${landed ? ' landed' : ''}" id="timer" data-sid="${s.id}">${clockHtml(ms)}</div>
      <div class="small muted ring-sub">${avg ? `обычно <span class="mono">${fmtClock(avg)}</span>` : 'первый полёт'}</div>
    </div>
  </div>`;
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

  h += ringHtml(s, a);
  // Пилюли контекста: АКБ, локация, ветер у земли из кэша (если свежий)
  const b = S.batteries.find((x) => x.id === s.batteryId);
  const site = S.sites.find((x) => x.id === s.siteId);
  const wind = wxWindNowText(site, a);
  const pills = [
    b ? `<span class="pill">${ICONS.batteries}${battTag(b)}</span>` : '',
    site ? `<span class="pill">${ICONS.sites}<span>${esc(site.name)}</span></span>` : '',
    wind ? `<span class="pill">${ICONS.weather}<span>${wind}</span></span>` : '',
  ].filter(Boolean).join('');
  if (pills) h += `<div class="pills">${pills}</div>`;

  // Два шага (2.0): «Посадка» только останавливает таймер (land-flight),
  // итог записывают отдельной кнопкой — в поле руки заняты бортом.
  if (s.landedAt) {
    h += `<button class="btn btn-primary" data-act="finish-flight" data-id="${s.id}">Записать итог</button>
      <button class="btn" data-act="resume-flight" data-id="${s.id}">Продолжить полёт</button>
      <p class="small muted session-hint">Посадка зафиксирована, таймер остановлен. «Продолжить полёт» снова запустит его.</p>`;
  } else {
    h += `<button class="btn btn-primary btn-land" data-act="land-flight" data-id="${s.id}">${ICONS.landing}Посадка</button>
      <button class="btn" data-act="discard-flight" data-id="${s.id}">Отменить — полёта не было</button>
      <p class="small muted session-hint">После посадки таймер остановится, а итог — результат, заметки, проблемы — можно записать позже. Можно свернуть приложение — время не потеряется.</p>`;
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
      '</div></div></details>';
  }
  return h;
}

// Список полётов, сгруппированный по датам: заголовок дня с числом
// полётов и налётом. Используется в журнале и на вкладке «Полёт».
// noDayHead — без заголовков дней (вызывающий рисует свой, «Сегодня»).
function logGroupedHtml(list, totalsFrom, noDayHead) {
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
      if (!noDayHead) {
        h += `<div class="grp-head"><span class="grow">${fmtDate(cur)}</span>
        <span class="muted small">${dayList.length} ${plural(dayList.length, 'полёт', 'полёта', 'полётов')} · ${fmtDur(dayList.reduce((n, x) => n + (x.durationMin || 0), 0))}</span></div>`;
      }
      h += `<div class="card flat${lazy}"${lazy ? ` style="--n:${rowsOf.get(cur)}"` : ''}>`;
      open = true;
    }
    h += sessionRow(sess);
  }
  if (open) h += '</div>';
  return h;
}
