// RC Planner · Экран «Сегодня»: четыре состояния дня.
'use strict';

/* ============================================================
   6. ЭКРАНЫ
============================================================ */

/* ---------- «Сегодня»: один экран, четыре состояния дня ----------
   flying — идёт полёт (или сел без итога); field — есть борт с
   пройденным чек-листом (takeoffReady); debrief — сегодня уже летали;
   home — всё остальное. Одна главная кнопка на состояние. */
function todayState() {
  if (activeSessions().length) return 'flying';
  if (S.aircraft.some((a) => takeoffReady(a))) return 'field';
  if (S.sessions.some((s) => s.end && s.date === todayISO())) return 'debrief';
  return 'home';
}

// Строка борта на «Сегодня»: превью, имя, тип и АКБ; справа — right
// (кнопка «Чек-лист»/«Взлёт» или чип статуса). Тап по строке — карточка.
function todayAircraftRow(a, right) {
  const b = armedBattery(a);
  return `<div class="row">
    <button class="grow row-main" data-nav="#/model/${a.id}">
      ${aircraftThumb(a)}<span class="grow"><span class="t">${esc(a.name)}</span>
      <span class="d">${TYPES[a.type] || ''}${b ? ' · ' + battTag(b) + (CHARGE_LABEL[b.charge] ? ' · ' + CHARGE_LABEL[b.charge] : '') : ''}</span></span></button>
    ${right}
  </div>`;
}

// Правая часть строки борта: подготовлен — «Взлёт» (только через
// takeoffReady), готов — «Чек-лист», иначе чип статуса.
function todayAircraftAction(a) {
  // Заряд не отмечен — вместо «Взлёт» чип: борт остаётся готовым, тап
  // прямо здесь отмечает состояние и возвращает кнопку.
  if (takeoffReady(a)) {
    const b = armedBattery(a);
    return chargeKnown(b) ? `<button class="btn btn-sm btn-primary" data-act="takeoff-prepared" data-id="${a.id}">Взлёт</button>` : chargeChip(b);
  }
  const st = statusOf(a);
  return st === 'ready' || st === 'unknown'
    ? `<button class="btn btn-sm" data-act="start-prep" data-id="${a.id}">Чек-лист</button>`
    : chip(st, a.id);
}

// Блок бортов: title — заголовок, list — борта, cnt — счётчик в заголовке.
function todayFleetBlock(title, list, cnt) {
  if (!list.length) return '';
  return `<div class="h2">${title}${cnt ? ` <span class="cnt">${cnt}</span>` : ''}</div><div class="card flat">` +
    list.map((a) => todayAircraftRow(a, todayAircraftAction(a))).join('') + '</div>';
}

// Строка «Пора осмотреть» по регламенту — на «Сегодня» в трёх состояниях.
function todayDueRow(a, sv) {
  return `<div class="row"><span class="row-ic">${ICONS.tools}</span>
    <button class="grow row-main" data-nav="#/model/${a.id}"><span class="grow">
      <span class="t" style="color:var(--maint)">Пора осмотреть: ${esc(a.name)}</span>
      <span class="d">${svcSinceText(sv)} с последнего обслуживания · регламент ${svcEveryText(sv)}</span></span></button>
    <button class="btn btn-sm" data-act="add-maint" data-id="${a.id}" data-kind="inspection" data-title="Осмотр по регламенту">Осмотр</button>
  </div>`;
}

function todayOpenMaintRow(m) {
  const a = S.aircraft.find((x) => x.id === m.aircraftId);
  return rowBtn(`data-act="edit-maint" data-id="${m.id}"`,
    `<span class="grow"><span class="t">${esc(m.title)}</span>
     <span class="d">${esc(a ? a.name : '')} · ${fmtDate(m.date)}${m.next ? ' · далее: ' + esc(m.next) : ''}</span></span>`, 'tools');
}

// «Обслуживание»: подошедший регламент + открытые работы (до пяти).
// late — блок идёт после «Полётов сегодня» из правой колонки (телефон).
function todayMaintBlock(withDue, skipIds, late) {
  const open = S.maintenance.filter((m) => !m.done && !(skipIds && skipIds.has(m.id)));
  const due = withDue ? S.aircraft.map((a) => [a, svcState(a)]).filter(([, sv]) => sv && sv.due) : [];
  if (!open.length && !due.length) return '';
  const l = late ? ' late' : '';
  return `<div class="h2${l}">Обслуживание <span class="cnt">${open.length + due.length}</span></div><div class="card flat${l}">` +
    due.map(([a, sv]) => todayDueRow(a, sv)).join('') +
    open.slice(0, 5).map(todayOpenMaintRow).join('') + '</div>';
}

// Баннер резервной копии (home/field): копии не было или она старше 14 дней.
function backupBannerHtml() {
  if (!backupDue()) return '';
  const days = backupAgeDays();
  return `<div class="banner backup">${ICONS.backup}<span class="grow">${days == null
    ? 'Резервной копии ещё не было'
    : `Резервная копия — ${days} ${plural(days, 'день', 'дня', 'дней')} назад`}</span>
    <button class="btn-sm btn" data-act="export-all">Сохранить</button></div>`;
}

// Подпись под датой в шапке: состояние дня словами.
const TODAY_HINT = {
  field: '<span style="color:var(--ok)">на поле</span>',
  flying: '<span style="color:var(--ok)">в полёте</span>',
  debrief: '<span class="muted">разбор дня</span>',
};

// «Начало работы»: пять шагов, каждый ведёт прямо к действию.
// Первый запуск — засчитано всё, что уже есть (since = 0, предикаты те же,
// что были до 2.0.2). «Пройти обучение заново» кладёт в rcp.tour метку
// времени перезапуска, и тогда засчитывается только сделанное ПОСЛЕ неё:
// createdAt борта, АКБ и локации, end полёта, lastBackupAt. Записи без
// createdAt (заведённые до 2.0.2 или пришедшие из копии) в обучении не
// считаются — это и есть «заново». Старое значение '1' — как первый запуск.
function onboardingSteps() {
  const raw = +lsGet('rcp.tour') || 0;
  const since = raw > 1e12 ? raw : 0;
  const fresh = (t) => (+t || 0) >= since;
  const steps = [
    ['Добавьте борт', 'во «Флоте»: готовая платформа или свой',
      S.aircraft.some((a) => fresh(a.createdAt)), 'data-act="add-model"', 'fleet'],
    // Засчитывается собранный борт, у которого нов сам борт ИЛИ его АКБ:
    // на обучении заново можно поставить в новый борт старую батарею —
    // «поставьте в борт» выполнено. При since = 0 это armedFleet().length > 0.
    ['Заведите аккумулятор и поставьте в борт', 'борт с АКБ считается собранным к вылету',
      armedFleet().some((a) => fresh(a.createdAt) || fresh(armedBattery(a).createdAt)), 'data-act="add-batt"', 'batteries'],
    ['Запомните локацию с координатами', 'GPS или карта — для прогноза и окон полётов',
      S.sites.some((s) => s.lat != null && fresh(s.createdAt)), 'data-act="add-site"', 'sites'],
    ['Пройдите чек-лист и слетайте', 'кнопка «Начать полёт» — журнал заполнится сам',
      S.sessions.some((s) => s.end && fresh(s.end)), 'data-act="start-prep"', 'flight'],
    ['Сохраните резервную копию', 'один файл со всем — единственная страховка данных',
      +S.settings.lastBackupAt > 0 && fresh(S.settings.lastBackupAt), 'data-act="export-all"', 'backup'],
  ];
  return { steps, todo: steps.filter((s) => !s[2]).length, tour: raw > 0 };
}

function viewToday() {
  const state = todayState();
  const date = new Date().toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });
  let h = pageHead('Сегодня', { sub: date + (TODAY_HINT[state] ? ' · ' + TODAY_HINT[state] : ''), help: 'today' });

  if (UI.updateReady) {
    h += `<div class="banner ok">Доступно обновление приложения.
      <button class="btn-sm btn right" data-act="update-app">Обновить</button></div>`;
  }

  // Блок сам исчезает, когда весь путь пройден, — ничего не настраивается.
  // Приветствие первого запуска — отдельное окно (openWelcome в старте).
  const { steps, todo, tour } = onboardingSteps();
  // Экскурсия пройдена до конца — метка снимается сама, как гаснет блок
  // при первом запуске; «Завершить обучение» делает то же раньше времени.
  if (tour && !todo) lsSet('rcp.tour', '');
  const onboarding = todo > 0;

  // В полёте герой — сам полёт; в остальных состояниях баннеры идущих
  // полётов невозможны (иначе состояние было бы flying).
  const live = state === 'flying' ? activeSessions()[0] : null;
  h += activeFlightBanners(live && live.id);

  if (onboarding) {
    // «Обучение заново» — тот же путь, что при первом запуске: пройденные
    // шаги зачёркиваются, блок исчезает, когда не осталось ни одного.
    h += `<div class="h2">${tour ? 'Обучение' : 'Начало работы'} · осталось ${todo} из ${steps.length}</div><div class="card flat">`;
    h += steps.map(([t, d, ok2, attrs, icon]) => ok2
      ? `<div class="row" style="opacity:0.55"><span class="row-ic" style="color:var(--ok)">${ICONS.templates}</span>
         <span class="grow"><span class="t" style="text-decoration:line-through">${t}</span></span></div>`
      : rowBtn(attrs, `<span class="grow"><span class="t">${t}</span><span class="d wrap">${d}</span></span>`, icon)).join('');
    if (tour) h += rowBtn('data-act="dismiss-tour"', `<span class="grow"><span class="t">Завершить обучение</span><span class="d wrap">Скрыть этот блок</span></span>`);
    h += '</div>';
  }

  // Две колонки (2.0): .today-main — шапка, баннеры и блоки состояния,
  // aside.today-side — условия, полёты за день, баннер копии. От 900 px
  // колонки стоят рядом; на телефоне их складывает CSS (display: contents
  // + order): условия — сразу под шапкой, остальное — следом за основной.
  if (!S.aircraft.length && state !== 'flying') {
    return `<div class="today-main"><div class="today-top">${h}</div></div>`;
  }
  const part = state === 'flying' ? todayFlying(live)
    : state === 'field' ? todayField()
    : state === 'debrief' ? todayDebrief()
    : todayHome(onboarding);
  return `<div class="today-main"><div class="today-top">${h}</div>${part.main}</div>
    <aside class="today-side">${part.side}</aside>`;
}

// Правая колонка «Сегодня»: условия (герой или строка), полёты за день,
// баннер копии. Заголовок «Условия» показывается только на десктопе —
// на телефоне карточка погоды и так стоит под шапкой.
// Дома полётов за день нет — вместо них «Последние» (три последних),
// но только на десктопе (.side-only): на телефоне этот блок с «Сегодня»
// убран осознанно (пакет 3), а правую колонку иначе нечем занять.
function todaySide(wx, flights, backup) {
  let h = '';
  if (wx) h += `<div class="wx-slot"><div class="h2 side-only">Условия</div>${wx}</div>`;
  if (flights && flights.length) {
    const mins = flights.reduce((n, s) => n + (s.durationMin || 0), 0);
    h += `<div class="h2">Полёты сегодня <span class="cnt">${flights.length} ${plural(flights.length, 'полёт', 'полёта', 'полётов')} · ${fmtDur(mins)}</span></div>`;
    h += logGroupedHtml(flights, null, true);
  } else if (!flights) {
    const recent = S.sessions.filter((s) => s.end).sort((x, y) => y.start - x.start).slice(0, 3);
    if (recent.length) {
      h += `<div class="side-only recent-slot"><div class="h2">Последние <span class="cnt">${S.sessions.filter((s) => s.end).length}</span></div>
        ${logGroupedHtml(recent, S.sessions)}
        <div class="card flat">${rowBtn('data-nav="#/journal"', '<span class="grow"><span class="t">Весь журнал</span></span>', 'journal')}</div></div>`;
    }
  }
  if (backup) h += backup;
  return h;
}

// Завершённые полёты за сегодня — для правой колонки.
function todayFlights() {
  return S.sessions.filter((s) => s.end && s.date === todayISO()).sort((x, y) => y.start - x.start);
}

// Дома: погода из кэша, «Перед выездом», главная кнопка, «К вылету»,
// открытое обслуживание, напоминание о копии.
function todayHome(onboarding) {
  let h = '';
  const armed = armedFleet();

  // Перед выездом: сборы, разряженные АКБ, подошедший регламент.
  // Сборы без шума: строкой с «Продолжить» — только начатые наборы;
  // нетронутые («0 из N») схлопываются в одну строку «Собраться на
  // выезд», и она показывается лишь когда начатых нет; полностью
  // собранные — строкой с подписью «собран», без кнопки.
  const packDone = (p) => p.items.filter((i) => i.done).length;
  const packFull = (p) => p.items.length > 0 && packDone(p) === p.items.length;
  const started = S.packing.filter((p) => !packFull(p) && packDone(p) > 0);
  const untouched = S.packing.filter((p) => !packFull(p) && packDone(p) === 0);
  const fullPacks = S.packing.filter(packFull);
  const flown = S.batteries.filter((b) => b.charge === 'flown' && b.status !== 'retired');
  const due = S.aircraft.map((a) => [a, svcState(a)]).filter(([, sv]) => sv && sv.due);
  if (S.packing.length || flown.length || due.length) {
    h += '<div class="h2">Перед выездом</div><div class="card flat">';
    h += started.map((p) => `<div class="row"><span class="row-ic">${ICONS.packing}</span>
        <button class="grow row-main" data-nav="#/pack/${p.id}"><span class="grow">
          <span class="t">${esc(p.name)}</span>
          <span class="d">${packDone(p)} из ${p.items.length} собрано</span></span></button>
        <button class="btn btn-sm" data-nav="#/pack/${p.id}">Продолжить</button>
      </div>`).join('');
    if (!started.length && untouched.length) {
      const n = untouched.length;
      h += rowBtn('data-nav="#/packing"', `<span class="grow"><span class="t">Собраться на выезд</span>
        <span class="d">${n} ${plural(n, 'набор', 'набора', 'наборов')}</span></span>`, 'packing');
    }
    h += fullPacks.map((p) => `<div class="row"><span class="row-ic">${ICONS.packing}</span>
        <button class="grow row-main" data-nav="#/pack/${p.id}"><span class="grow">
          <span class="t">${esc(p.name)}</span>
          <span class="d">собран</span></span></button>
        <span class="chip st-ready">собран</span>
      </div>`).join('');
    h += flown.map((b) => {
      const cyc = Math.round(+b.cycles) || 0; // из копии — не обязательно число
      return `<div class="row"><span class="row-ic">${ICONS.bolt}</span>
        <button class="grow row-main" data-act="edit-batt" data-id="${b.id}"><span class="grow">
          <span class="t">Зарядить: ${esc(b.label)}</span>
          <span class="d">после полёта · ${cyc} ${plural(cyc, 'цикл', 'цикла', 'циклов')}</span></span></button>
        <button class="chip st-flown" data-act="batt-charge" data-id="${b.id}">${CHARGE_LABEL.flown}</button>
      </div>`;
    }).join('');
    h += due.map(([a, sv]) => todayDueRow(a, sv)).join('');
    h += '</div>';
  }

  if (armed.length) h += `<button class="btn btn-primary" data-act="start-prep">Начать полёт</button>`;

  // К вылету: только собранные борта (с установленным АКБ) — весь флот
  // живёт во вкладке «Флот». Пустой блок при видимом «Начале работы»
  // не показываем — шаг 2 говорит то же самое.
  if (armed.length) {
    h += todayFleetBlock('К вылету', armed, `${armed.length} из ${S.aircraft.length}`);
  } else if (!onboarding) {
    h += '<div class="h2">К вылету</div><div class="card flat">' +
      rowBtn('data-nav="#/fleet"', `<span class="grow"><span class="t">Соберите борт к вылету</span>
      <span class="d wrap">Установите аккумулятор в карточке борта — он появится здесь</span></span>`, 'batteries') + '</div>';
  }

  h += todayMaintBlock(false);
  return { main: h, side: todaySide(wxHeroOrRow(armed[0]), null, backupBannerHtml()) };
}

// На поле: герой — подготовленный борт с кнопкой «Взлёт», ниже
// полоска погоды, остальные собранные борта и обслуживание.
function todayField() {
  const ready = S.aircraft.filter((a) => takeoffReady(a))
    .sort((x, y) => (y.prepared.at || 0) - (x.prepared.at || 0));
  const hero = ready[0];
  const b = armedBattery(hero);
  const site = S.sites.find((s) => s.id === hero.prepared.siteId);
  let h = `<div class="card hero">
    <div class="hero-top">
      ${aircraftThumb(hero, true)}
      <span class="grow">
        <span class="hero-name">${esc(hero.name)}</span>
        <span class="d">${TYPES[hero.type] || ''}${b ? ' · ' + battTag(b) + (CHARGE_LABEL[b.charge] ? ' · ' + CHARGE_LABEL[b.charge] : '') : ''}</span>
        <span class="d hero-ok"><span class="ico14">${ICONS.check}</span>Чек-лист пройден в ${fmtTime(hero.prepared.at)}${site ? ' · ' + esc(site.name) : ''}</span>
      </span>
    </div>
    ${chargeKnown(b)
      ? `<button class="btn btn-primary" data-act="takeoff-prepared" data-id="${hero.id}">${ICONS.takeoff}Взлёт</button>`
      : `<div class="banner warn nocharge">${ICONS.batteries}<span class="grow">Отметьте заряд аккумулятора — и появится «Взлёт».</span>${chargeChip(b)}</div>`}
  </div>`;
  const rest = armedFleet().filter((a) => a.id !== hero.id);
  h += todayFleetBlock('Остальные борта', rest, String(rest.length));
  h += todayMaintBlock(true);
  return { main: h, side: todaySide(wxHeroOrRow(hero, true), todayFlights(), backupBannerHtml()) };
}

// В полёте: карточка полёта с живым таймером, «Открыть полёт» и
// «Посадка»; ниже — как на поле, без героя взлёта.
function todayFlying(s) {
  const a = S.aircraft.find((x) => x.id === s.aircraftId);
  const landed = !!s.landedAt;
  const ms = (landed ? s.landedAt : Date.now()) - s.start;
  let h = `<div class="card hero hero-flight">
    <div class="hero-top">
      ${a ? aircraftThumb(a, true) : ''}
      <span class="grow">
        <span class="hero-name">${esc(a ? a.name : 'Борт удалён')} <span class="mono muted">${flightNoText(s)}</span></span>
        <span class="d">${landed ? 'сел — осталось записать итог' : staleSession(s) ? 'идёт уже очень долго — забыли завершить?' : 'полёт идёт, таймер не потеряется'}</span>
      </span>
    </div>
    <div class="timer${landed ? ' landed' : ''}" id="timer" data-sid="${s.id}">${clockHtml(ms)}</div>
    ${landed
      ? `<button class="btn btn-primary" data-act="finish-flight" data-id="${s.id}">Записать итог</button>
         <button class="btn" data-nav="#/session/${s.id}">Открыть полёт</button>`
      : `<button class="btn btn-primary btn-land" data-act="land-flight" data-id="${s.id}">${ICONS.landing}Посадка</button>
         <button class="btn" data-nav="#/session/${s.id}">Открыть полёт</button>`}
  </div>`;
  const rest = armedFleet().filter((x) => !activeSessionOf(x.id));
  h += todayFleetBlock('Остальные борта', rest, String(rest.length));
  h += todayMaintBlock(true);
  return { main: h, side: todaySide(wxHeroOrRow(a, true), todayFlights(), '') };
}

// Разбор: итоги дня, «Разобраться», полёты за сегодня, «Ещё один полёт».
function todayDebrief() {
  const today = todayFlights();
  const mins = today.reduce((n, s) => n + (s.durationMin || 0), 0);
  const trouble = today.filter((s) => s.result && s.result !== 'normal');
  let h = `<div class="stat-line">
    <div class="stat"><div class="v">${today.length}</div><div class="k">${plural(today.length, 'полёт сегодня', 'полёта сегодня', 'полётов сегодня')}</div></div>
    <div class="stat"><div class="v">${fmtDur(mins)}</div><div class="k">налёт</div></div>
    <div class="stat"><div class="v${trouble.length ? ' warn' : ''}">${trouble.length}</div><div class="k">с проблемой</div></div>
  </div>`;

  // Разобраться: проблемные полёты без закрытой работы новее них,
  // разряженные АКБ, резервная копия, сборы.
  let rows = '';
  const shown = new Set(); // осмотры, уже показанные в «Разобраться»
  for (const s of trouble) {
    const a = S.aircraft.find((x) => x.id === s.aircraftId);
    if (!a) continue;
    const fixed = S.maintenance.some((m) => m.aircraftId === a.id && m.done && m.createdAt >= s.start);
    if (fixed) continue;
    // Авто-осмотр после итога уже создан (открытая работа новее полёта) —
    // кнопка ведёт в него, а не заводит второй.
    const open = S.maintenance.find((m) => m.aircraftId === a.id && !m.done && (m.createdAt || 0) >= s.start);
    if (open) shown.add(open.id);
    const btn = open
      ? `<button class="btn btn-sm" data-act="edit-maint" data-id="${open.id}">Осмотр</button>`
      : `<button class="btn btn-sm" data-act="add-maint" data-id="${a.id}" data-kind="inspection" data-title="Осмотр после полёта ${flightNoText(s)}">Осмотр</button>`;
    rows += `<div class="row"><span class="row-ic">${ICONS.tools}</span>
      <button class="grow row-main" data-act="session-info" data-id="${s.id}"><span class="grow">
        <span class="t" style="color:var(--warn)">Полёт <span class="mono">${flightNoText(s)}</span> · ${esc(a.name)}</span>
        <span class="d">${s.problems ? 'проблема: «' + esc(s.problems) + '»' : resultLabel(s, '').toLowerCase()}</span></span></button>
      ${btn}
    </div>`;
  }
  const flown = S.batteries.filter((b) => b.charge === 'flown' && b.status !== 'retired');
  if (flown.length) {
    rows += `<div class="row"><span class="row-ic">${ICONS.bolt}</span>
      <button class="grow row-main" data-nav="#/batteries"><span class="grow">
        <span class="t">${flown.length === 1 ? 'Зарядить: ' + esc(flown[0].label) : `Зарядить ${flown.length} ${plural(flown.length, 'аккумулятор', 'аккумулятора', 'аккумуляторов')}`}</span>
        <span class="d">${flown.length === 1 ? 'после полёта' : flown.map((b) => esc(b.label)).join(' · ')}</span></span></button>
      ${flown.length === 1
        ? `<button class="chip st-flown" data-act="batt-charge" data-id="${flown[0].id}">${CHARGE_LABEL.flown}</button>`
        : `<button class="btn btn-sm" data-act="batts-charged-all">Все заряжены</button>`}
    </div>`;
  }
  const since = flightsSinceBackup();
  if (since || backupDue()) {
    const days = backupAgeDays();
    rows += `<div class="row"><span class="row-ic">${ICONS.backup}</span>
      <button class="grow row-main" data-nav="#/backup"><span class="grow">
        <span class="t">Сохранить резервную копию</span>
        <span class="d wrap">${since ? `${since} ${plural(since, 'полёт', 'полёта', 'полётов')} с последней копии` : 'полётов после копии нет'}${days == null ? ' · копии ещё не было' : ` · ${days} ${plural(days, 'день', 'дня', 'дней')} назад`}</span></span></button>
      <button class="btn btn-sm" data-act="export-all">Сохранить</button>
    </div>`;
  }
  if (S.packing.length) {
    rows += rowBtn('data-nav="#/packing"', `<span class="grow"><span class="t">Проверить, что всё собрано</span>
      <span class="d wrap">Сборы: ничего не забыть на поле</span></span>`, 'packing');
  }
  if (rows) h += `<div class="h2">Разобраться</div><div class="card flat">${rows}</div>`;

  // «Полёты сегодня» живут в правой колонке; на телефоне они встают между
  // «Разобраться» и кнопкой — блоки после них помечены .late (CSS order).
  h += `<button class="btn late" data-act="start-prep">${ICONS.flight}Ещё один полёт</button>`;
  // Открытые работы, не связанные с сегодняшними полётами (старый ремонт
  // другого борта), иначе пропали бы с «Сегодня» до конца дня; те, что
  // уже в «Разобраться», не повторяем.
  h += todayMaintBlock(false, shown, true);
  return { main: h, side: todaySide(wxHeroOrRow(armedFleet()[0]), today, '') };
}

function sessionRow(s) {
  const a = S.aircraft.find((x) => x.id === s.aircraftId);
  return rowBtn(`data-act="session-info" data-id="${s.id}"`,
    `<span class="grow"><span class="t"><span class="mono">${flightNoText(s)}</span> ${esc(a ? a.name : 'Борт удалён')}</span>
     <span class="d">${fmtDate(s.date)} · ${fmtDur(s.durationMin)} · <span class="result-${esc(s.result || 'normal')}">${resultLabel(s)}</span></span></span>`);
}
