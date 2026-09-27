// RC Planner · Действия (ACTIONS) по data-act.
'use strict';

/* ============================================================
   7. ДЕЙСТВИЯ
============================================================ */

const MAINT_KINDS = {
  repair: 'Ремонт', replace: 'Замена', firmware: 'Прошивка',
  inspection: 'Осмотр', task: 'Задача',
};

// Сохранить прогон чек-листа из UI.prep. Прогон подготовленного борта
// переписывается на месте (UI.prep.runId) — иначе каждое «Отметить готовым»
// оставляло бы в базе лишний прогон. Прогон, на который уже ссылается
// полёт, — история: ему выдаётся новый id.
async function savePrepRun(p) {
  const tpl = templatesFor((S.aircraft.find((a) => a.id === p.aircraftId) || {}).type).find((t) => t.id === p.tplId) || {};
  const reuse = p.runId && !S.sessions.some((s) => s.checklistRunId === p.runId);
  const run = {
    id: reuse ? p.runId : uid(), aircraftId: p.aircraftId, date: todayISO(),
    tplId: p.tplId || '', templateName: tpl.name || '',
    items: p.items.map((i) => ({ t: i.t, state: i.state })),
  };
  await put('runs', run);
  return run;
}

// Начать полёт: общая точка для «Начать полёт» с чек-листа и взлёта подготовленного
// борта. Снимает пометку «подготовлен» — она одноразовая.
async function takeoff(aircraftId, runId, siteId) {
  const a = S.aircraft.find((x) => x.id === aircraftId);
  // Полёт без аккумулятора невозможен: и вес не учтён, и циклы не
  // посчитаются. Кнопки эту ситуацию не показывают, гард — страховка.
  if (!armedBattery(a)) { alert('Без аккумулятора не летаем: установите АКБ в борт.'); return; }
  // Заряд обязан быть отмечен: кнопок в этом случае не рисуют, гард —
  // страховка для пути «Взлёт» подготовленного борта. Путь с чек-листа
  // проверяется РАНЬШЕ, в start-flight: здесь черновик уже потерян бы.
  if (!chargeKnown(armedBattery(a))) { alert('Отметьте заряд аккумулятора: «заряжен» или «после полёта».'); return; }
  const dup = activeSessionOf(aircraftId);
  if (dup) { go('#/session/' + dup.id); return; }
  // Черновик чек-листа этого борта потреблён взлётом: иначе «Отметить
  // готовым» из оставшегося в памяти UI.prep пометило бы летящий борт
  // подготовленным и переписало бы прогон уже состоявшегося полёта.
  if (UI.prep && UI.prep.aircraftId === aircraftId) UI.prep = null;
  if (a && a.prepared) { a.prepared = null; await put('aircraft', a); }
  const s = {
    id: uid(), aircraftId, date: todayISO(),
    start: Date.now(), end: null, durationMin: null,
    flightNo: sessionsOf(aircraftId).length + 1,
    batteryId: (armedBattery(a) || {}).id || '',
    siteId: siteId || (S.sites.find((x) => x.isDefault) || {}).id || '',
    weather: '', result: '', notes: '', problems: '', checklistRunId: runId,
  };
  await put('sessions', s);
  go('#/session/' + s.id);
}

const ACTIONS = {
  'close-modal': () => dismissModal(),
  /* --- Приветствие --- */
  'welcome-next': (el) => openWelcome(+el.dataset.step),
  'welcome-done': () => {
    lsSet('rcp.hi', '1');
    closeModal();
    // после «Обучения заново» из «Ещё» — к шагам на «Сегодня»
    if (UI.view !== 'today') go('#/today');
  },
  'welcome-open': () => openWelcome(0),
  // Проверка обновлений по кнопке: SW сходит за свежим sw.js; если есть
  // новая версия — появится привычная кнопка «Обновить приложение».
  'check-updates': async () => {
    if (!SWREG) {
      alert('Обновления проверяются в установленном приложении (PWA). В офлайн-файле обновите файл вручную.');
      return;
    }
    UI.checkingUpdate = true;
    render(true);
    try {
      await SWREG.update();
      // Ждём не фиксированные 2 секунды, а реальное состояние воркера:
      // на медленной связи установка (прекэш ассетов) идёт дольше, и
      // «у вас последняя версия» рядом с кнопкой обновления — враньё.
      // UI.updateReady выставит существующий слушатель setupSW.
      for (let i = 0; i < 40 && !UI.updateReady; i++) {
        if (i > 3 && !SWREG.installing && !SWREG.waiting) break; // обновления нет
        await new Promise((r) => setTimeout(r, 500));
      }
      if (!UI.updateReady && SWREG.waiting && navigator.serviceWorker.controller) UI.updateReady = true;
      if (!UI.updateReady) {
        alert(SWREG.installing
          ? 'Обновление скачивается — кнопка «Обновить приложение» появится через минуту.'
          : 'У вас последняя версия — ' + ((RC.CHANGELOG[0] || {}).v || ''));
      }
    } catch (e) {
      // TypeError у fetch — сети нет; всё прочее — проблема на сервере
      alert(e instanceof TypeError
        ? 'Не удалось проверить обновления: похоже, нет сети.'
        : 'Сервер обновлений ответил ошибкой — попробуйте позже.');
    }
    UI.checkingUpdate = false;
    render(true);
  },
  // Обучение заново: приветствие открывается сразу (окно поверх «Ещё»),
  // блок «Начало работы» на «Сегодня» показывается снова — шаги считаются
  // от этой метки времени (onboardingSteps), поэтому у опытного пилота они
  // снова не пройдены. «Начать» ведёт на «Сегодня». Переход здесь не
  // делаем: hashchange приходит позже и закрыл бы только что открытое окно.
  'restart-tour': () => {
    lsSet('rcp.tour', String(Date.now()));
    openWelcome(0);
  },
  'dismiss-tour': () => { lsSet('rcp.tour', ''); render(); },
  // «Назад» ведёт туда, откуда пришли; на глубокой ссылке — по запасному маршруту.
  'nav-back': (el) => {
    UI.navBackHint = true; // и по истории, и по запасному маршруту — это «назад»
    if (UI.navCount > 1) history.back();
    else go(el.dataset.fallback || '#/today');
  },
  'type-pick': (el) => {
    const form = el.closest('form');
    const hidden = form && form.querySelector('input[name="type"]');
    if (!hidden) return;
    hidden.value = el.dataset.type;
    form.querySelectorAll('[data-act="type-pick"]').forEach((b) => {
      b.setAttribute('aria-pressed', String(b.dataset.type === el.dataset.type));
    });
  },

  /* --- Модели --- */
  'add-model': () => {
    openModal('Новый борт', `<div class="card flat">` +
      rowBtn('data-act="model-empty"',
        `<span class="grow"><span class="t">Пустой борт</span><span class="d">Заполню сам</span></span>`) +
      (S.aircraft.length ? rowBtn('data-act="clone-pick"',
        `<span class="grow"><span class="t">Копия имеющегося борта</span>
        <span class="d">Те же ТТХ и комплектация, без фото и истории</span></span>`, 'paste') : '') +
      RC.AIRCRAFT_PRESETS.map((p, i) => rowBtn(`data-act="model-preset" data-i="${i}"`,
        `<span class="grow"><span class="t">${esc(p.name)}</span><span class="d">${esc(p.desc)}</span></span>`,
        ICONS[p.type] ? p.type : 'plane')).join('') +
      `</div><p class="small muted" style="margin-top:8px">Готовые платформы приходят с заводскими ТТХ
      и типовой комплектацией — всё можно поменять в карточке.</p>`);
  },
  // Выбор образца для копии. Строки БЕЗ превью фото: окно в приложении
  // одно, и просмотр фото закрыл бы этот же список.
  'clone-pick': () => {
    openModal('Копия борта', `<p class="small muted">ТТХ и комплектация перейдут в новый борт.
      Фото, аккумулятор, заметки, регламент и история — нет.</p><div class="card flat">` +
      S.aircraft.map((a) => rowBtn(`data-act="clone-model" data-id="${esc(a.id)}"`,
        `<span class="grow"><span class="t">${esc(a.name)}</span>
        <span class="d">${TYPES[a.type] || ''}${a.manufacturer ? ' · ' + esc(a.manufacturer) : ''}</span></span>`,
        ICONS[a.type] ? a.type : 'plane')).join('') + '</div>');
  },
  // Копия борта: форма предзаполнена полями образца, комплектацию
  // протаскивает data-clone (полем формы она не является — как и у
  // пресетов). НЕ копируем (решение владельца 2026-09-10): фото,
  // аккумулятор (одна АКБ — один борт), заметки, регламент осмотра,
  // группу флота, пометку «подготовлен», статус и всю историю —
  // у нового id полётов, работ и прогонов просто нет. Конфигурации
  // копируются вместе с бортом, в FORMS.model.
  'clone-model': (el) => {
    const src = S.aircraft.find((x) => x.id === el.dataset.id);
    if (!src) return;
    closeModal();
    openModelForm({
      name: cloneName(src.name), type: src.type, manufacturer: src.manufacturer,
      weight: src.weight, wingspan: src.wingspan,
      maxWind: src.maxWind, maxAlt: src.maxAlt, alarmMin: src.alarmMin,
    }, null, null, src.id);
  },
  'model-empty': () => { closeModal(); openModelForm(null); },
  'model-preset': (el) => {
    // Форма предзаполняется ТТХ платформы — всё можно поправить до создания.
    const p = RC.AIRCRAFT_PRESETS[+el.dataset.i];
    if (!p) return;
    closeModal();
    openModelForm({
      name: p.name, type: p.type, manufacturer: p.manufacturer,
      weight: p.weight, wingspan: p.wingspan,
      maxWind: p.maxWind, maxAlt: p.maxAlt, notes: p.notes,
    }, p.id);
  },
  'edit-model': () => openModelForm(S.aircraft.find((a) => a.id === UI.arg)),
  'del-model': (el) => confirmModal(
    'Удалить борт вместе с историей полётов, обслуживанием и конфигурациями? Это нельзя отменить.',
    'del-model-yes', `data-id="${el.dataset.id}"`),
  'del-model-yes': async (el) => {
    const id = el.dataset.id;
    for (const st of ['sessions', 'runs', 'maintenance', 'configs']) {
      for (const r of S[st].filter((x) => x.aircraftId === id)) await RCDB.del(st, r.id);
      await refresh(st);
    }
    dropPhotoURL(id);
    await del('aircraft', id);
    closeModal();
    go('#/fleet');
  },
  'edit-comp': (el) => {
    const a = S.aircraft.find((x) => x.id === el.dataset.id);
    const key = el.dataset.key;
    const c = (a.components || {})[key] || {};
    // Подпись и подсказка — из ПОЛНОГО справочника, а не из списка типа:
    // у убранного слота своя подпись, и форма обязана открыться и для него.
    const slot = COMPONENTS.find((x) => x[0] === key) || [];
    const label = slot[1] || key;
    const hint = (slot[2] && slot[2].hint) || '';
    openModal(label, `<form data-form="comp" data-id="${a.id}" data-key="${key}">
      ${field('Название / модель', `<input type="text" name="name" value="${esc(c.name || '')}" placeholder="напр. T-Motor F60 2550KV">`, hint)}
      ${field('Версия прошивки', `<input type="text" name="fw" value="${esc(c.fw || '')}" placeholder="напр. 4.5.1">`, 'Показывается в «Обзоре» рядом с компонентом')}
      ${field('Заметки', `<textarea name="notes" placeholder="настройки, особенности, дата установки">${esc(c.notes || '')}</textarea>`)}
      <button class="btn btn-primary" type="submit">Сохранить</button>
    </form>`);
  },
  'export-model': async (el) => {
    const a = S.aircraft.find((x) => x.id === el.dataset.id);
    if (!a) return;
    const data = {
      aircraft: [a],
      sessions: S.sessions.filter((s) => s.aircraftId === a.id),
      runs: S.runs.filter((r) => r.aircraftId === a.id),
      maintenance: S.maintenance.filter((m) => m.aircraftId === a.id),
      configs: S.configs.filter((c) => c.aircraftId === a.id),
    };
    await exportData(data, (a.name || 'model').replace(/[^\wа-яё-]+/gi, '-').toLowerCase() + '.rcpilot', 'aircraft');
  },

  /* --- Подготовка и полёт --- */
  'start-prep': (el) => {
    const act = el.dataset.id && activeSessionOf(el.dataset.id);
    if (act) { go('#/session/' + act.id); return; }
    if (el.dataset.id) beginPrep(el.dataset.id);
    else UI.prep = null;
    go('#/prep');
  },
  'prep-model': (el) => {
    const act = activeSessionOf(el.dataset.id);
    if (act) { go('#/session/' + act.id); return; }
    beginPrep(el.dataset.id);
    render();
  },
  // Тап по строке: ок ↔ пусто. Проблема и пропуск — через меню клетки;
  // у такой строки тап открывает меню, а не стирает отметку (в поле
  // случайное касание не должно молча снять «проблему»).
  'ck-toggle': (el) => {
    const it = UI.prep && UI.prep.items[+el.dataset.i];
    if (!it) return;
    const i = +el.dataset.i;
    if (it.state === 'fail' || it.state === 'skip') {
      UI.prep.menuIdx = UI.prep.menuIdx === i ? null : i;
      render(true);
      return;
    }
    it.state = it.state === 'ok' ? null : 'ok';
    if (it.state) haptic();
    UI.prep.lastIdx = i; // эта клетка получит анимацию отметки
    UI.prep.menuIdx = null;
    render(true);
  },
  // Тап по клетке: встроенное меню трёх состояний; повторный тап закрывает.
  'ck-menu': (el) => {
    if (!UI.prep) return;
    const i = +el.dataset.i;
    UI.prep.menuIdx = UI.prep.menuIdx === i ? null : i;
    render(true);
  },
  'ck-set': (el) => {
    const it = UI.prep && UI.prep.items[+el.dataset.i];
    if (!it) return;
    it.state = ['ok', 'fail', 'skip'].includes(el.dataset.state) ? el.dataset.state : null;
    UI.prep.lastIdx = +el.dataset.i;
    UI.prep.menuIdx = null;
    render(true);
  },
  // «Отменить подготовку» ничего не сохраняло и не сохраняет. У борта,
  // отмеченного готовым, та же кнопка — «Сбросить подготовку»: она стирает
  // сохранённое, поэтому спрашивает подтверждение.
  'cancel-prep': () => {
    // Условие ТО ЖЕ, по которому нарисована подпись кнопки (kept в viewPrep):
    // иначе после полуночи МСК кнопка «Отменить подготовку» открывала бы
    // окно «Сбросить подготовку?» — подпись и вопрос противоречили бы.
    const a = UI.prep && S.aircraft.find((x) => x.id === UI.prep.aircraftId);
    if (UI.prep && UI.prep.runId && preparedFresh(a)) {
      confirmModal('Сбросить подготовку? Пометка «подготовлен» и отметки чек-листа будут удалены.',
        'cancel-prep-reset', '', 'Сбросить');
      return;
    }
    UI.prep = null;
    go('#/flight');
  },
  // Единственный ручной сброс подготовки: снимает пометку, удаляет прогон
  // (кроме привязанного к полёту — это история) и открывает чистый
  // чек-лист того же борта: сброс в поле почти всегда идёт перед повтором.
  'cancel-prep-reset': async () => {
    const p = UI.prep;
    if (!p) return;
    UI.prep = null; // сразу, до await: двойной тап не должен сбросить дважды
    const a = S.aircraft.find((x) => x.id === p.aircraftId);
    if (a && a.prepared && a.prepared.runId === p.runId) { a.prepared = null; await put('aircraft', a); }
    if (p.runId && !S.sessions.some((s) => s.checklistRunId === p.runId)) await del('runs', p.runId);
    beginPrep(p.aircraftId); // пометка снята — чек-лист откроется пустым
    go('#/prep');            // тот же адрес: onRoute закроет окно и перерисует
  },
  'start-flight': async () => {
    const p = UI.prep;
    if (!p) return;
    if (chargeJustTapped()) return; // кнопка встала на место чипа заряда
    // Гарды — ДО обнуления черновика и сохранения прогона: иначе
    // застарелая разметка оставила бы прогон записанным, отметки
    // потерянными, а полёта не случилось бы. render(true) — чтобы не
    // сбрасывать прокрутку длинного чек-листа.
    const pb = armedBattery(S.aircraft.find((x) => x.id === p.aircraftId));
    if (!pb) { alert('Без аккумулятора не летаем: установите АКБ в борт.'); render(true); return; }
    if (!chargeKnown(pb)) { alert('Отметьте заряд аккумулятора: «заряжен» или «после полёта».'); render(true); return; }
    UI.prep = null; // сразу, до await: двойной тап не должен создать два полёта
    audioUnlockFor(p.aircraftId);
    haptic(20);
    const run = await savePrepRun(p);
    await takeoff(p.aircraftId, run.id, p.siteId);
  },
  // «Готов»: чек-лист сохраняется, борт помечен подготовленным, а мы
  // возвращаемся к выбору модели — можно готовить несколько подряд.
  // Взлёт подготовленного — с «Сегодня» (герой на поле) или с «Полёта»,
  // без повторного чек-листа.
  'prep-done': async () => {
    const p = UI.prep;
    if (!p) return;
    UI.prep = null; // сразу, до await: двойной тап не должен создать два прогона
    const run = await savePrepRun(p);
    const a = S.aircraft.find((x) => x.id === p.aircraftId);
    if (a) {
      a.prepared = { runId: run.id, at: Date.now(), siteId: p.siteId || '' };
      await put('aircraft', a);
    }
    go('#/prep');
  },
  // Тап по чипу заряда: «после полёта»/«заряд?» → «заряжен», и обратно
  // (если отметили заряд по ошибке).
  'batt-charge': async (el) => {
    const b = S.batteries.find((x) => x.id === el.dataset.id);
    if (!b) return;
    if (chargeJustTapped()) return; // промашка двойным касанием
    chargeTapAt = Date.now();
    b.charge = b.charge === 'ready' ? 'flown' : 'ready';
    await put('batteries', b);
    render(true);
  },
  /* --- Группы флота --- */
  'add-group': () => openGroupForm(null),
  'edit-group': (el) => openGroupForm(fleetGroups().find((g) => g.id === el.dataset.id)),
  'move-model': (el) => {
    const a = S.aircraft.find((x) => x.id === el.dataset.id);
    if (a) openMoveModal(a);
  },
  'move-model-to': async (el) => {
    const a = S.aircraft.find((x) => x.id === el.dataset.id);
    if (!a) return;
    a.groupId = el.dataset.gid || null;
    await put('aircraft', a);
    closeModal();
    render();
  },
  'move-new-group': (el) => openGroupForm(null, el.dataset.id),
  'del-group': (el) => confirmModal('Удалить группу? Борта останутся во флоте (без группы), подгруппы станут корневыми.',
    'del-group-yes', `data-id="${el.dataset.id}"`),
  'del-group-yes': async (el) => {
    const id = el.dataset.id;
    S.settings.fleetGroups = fleetGroups().filter((g) => g.id !== id);
    for (const g of S.settings.fleetGroups) if (g.parentId === id) g.parentId = null;
    await saveSettings();
    for (const a of S.aircraft.filter((x) => x.groupId === id)) {
      a.groupId = null;
      await RCDB.put('aircraft', a);
    }
    await refresh('aircraft');
    closeModal();
    render();
  },
  'maint-done': async (el) => {
    const m = S.maintenance.find((x) => x.id === el.dataset.id);
    if (!m) return;
    m.done = true;
    m.doneAt = Date.now(); // от неё считается регламент осмотра (svcState)
    await put('maintenance', m);
    render(true);
  },
  'takeoff-prepared': async (el) => {
    if (chargeJustTapped()) return; // кнопка встала на место чипа заряда
    const act = activeSessionOf(el.dataset.id);
    if (act) { go('#/session/' + act.id); return; } // у борта один полёт за раз
    const a = S.aircraft.find((x) => x.id === el.dataset.id);
    if (!a || !takeoffReady(a)) { render(); return; }
    audioUnlockFor(a.id);
    haptic(20);
    const pr = a.prepared;
    await takeoff(a.id, pr.runId, pr.siteId);
  },
  /* --- Карточка борта --- */
  'model-tab': (el) => { UI.modelTab = el.dataset.tab; render(true); },
  /* --- Журнал --- */
  'journal-tab': (el) => { UI.journalTab = el.dataset.tab === 'stats' ? 'stats' : 'log'; render(true); },
  'journal-menu': (el) => toggleMenu(el, 'journal-menu'),
  'print-log': () => printLog(),
  'export-log-csv': () => exportLogCsv(),
  'export-stats-csv': () => exportStatsCsv(),
  // «Посадка» только фиксирует момент посадки (landedAt): таймер стоит,
  // форма итога НЕ открывается — её вызывают отдельно («Записать итог»).
  'land-flight': async (el) => {
    const s = S.sessions.find((x) => x.id === el.dataset.id);
    if (!s || s.end || s.landedAt) return;
    haptic(30);
    s.landedAt = Date.now();
    await put('sessions', s);
    render();
  },
  // «Записать итог»/«Итог»/«Изменить итог»: для ещё летящего борта
  // (баннер забытого полёта) сначала фиксирует посадку, затем открывает форму.
  'finish-flight': async (el) => {
    const s = S.sessions.find((x) => x.id === el.dataset.id);
    if (s && !s.end && !s.landedAt) {
      s.landedAt = Date.now();
      await put('sessions', s);
      render(); // фон под формой: остановленный таймер и баннер посадки
    }
    openFinishForm(el.dataset.id);
  },
  'resume-flight': async (el) => {
    const s = S.sessions.find((x) => x.id === el.dataset.id);
    if (s && !s.end) { audioUnlockFor(s.aircraftId); s.landedAt = null; await put('sessions', s); render(); }
  },
  'discard-flight': (el) => confirmModal('Удалить эту запись? Полёт не будет засчитан.',
    'discard-flight-yes', `data-id="${el.dataset.id}"`),
  'discard-flight-yes': async (el) => {
    await del('sessions', el.dataset.id);
    closeModal();
    go('#/flight');
  },
  'session-info': (el) => {
    const s = S.sessions.find((x) => x.id === el.dataset.id);
    if (!s) return;
    openModal(`Полёт <span class="mono">${flightNoText(s)}</span>`,
      sessionDetailHtml(s) + `<div class="spacer"></div>
      <button class="btn" data-act="finish-flight" data-id="${s.id}">Изменить итог</button>
      <button class="btn btn-danger" data-act="del-session" data-id="${s.id}">Удалить запись</button>`);
  },
  'del-session': (el) => confirmModal('Удалить запись о полёте?', 'del-session-yes', `data-id="${el.dataset.id}"`),
  'del-session-yes': async (el) => { await del('sessions', el.dataset.id); closeModal(); render(); },

  /* --- Обслуживание --- */
  // data-title/data-kind — предзаполнение с «Сегодня» («Осмотр после полёта #N»)
  'add-maint': (el) => openMaintForm(null, el.dataset.id, { title: el.dataset.title || '', kind: el.dataset.kind || '' }),
  'edit-maint': (el) => openMaintForm(S.maintenance.find((m) => m.id === el.dataset.id)),
  'del-maint': (el) => confirmModal('Удалить запись обслуживания?', 'del-maint-yes', `data-id="${el.dataset.id}"`),
  'del-maint-yes': async (el) => {
    dropPhotoURL(el.dataset.id);
    await del('maintenance', el.dataset.id);
    closeModal();
    render();
  },

  /* --- Конфигурации --- */
  'add-config': (el) => {
    const a = S.aircraft.find((x) => x.id === el.dataset.id);
    const std = ['Betaflight (FC)', 'Прошивка FC', 'Прошивка RX', 'Прошивка VTX', 'ELRS', 'OSD'];
    const groups = [...new Set(std.concat(S.configs.filter((c) => c.aircraftId === a.id).map((c) => c.group)))];
    openModal('Сохранить конфигурацию', `<form data-form="config" data-id="${a.id}">
      ${field('Раздел', `<input type="text" name="group" list="cfg-groups" value="" placeholder="напр. Betaflight, ELRS, VTX" required>
        <datalist id="cfg-groups">${groups.map((g) => `<option value="${esc(g)}">`).join('')}</datalist>`,
        'Версии внутри одного раздела можно сравнивать')}
      ${field('Комментарий', `<input type="text" name="label" placeholder="что изменилось, напр. «поднял rates»">`)}
      ${field('Текст (CLI dump / diff)', `<textarea name="text" placeholder="вставьте diff all из CLI…" style="min-height:120px"></textarea>`)}
      ${field('Или файл', `<input type="file" name="file">`, 'Дампы и файлы прошивок (FC, приёмник, VTX) хранятся локально на устройстве и попадают в резервную копию')}
      <button class="btn btn-primary" type="submit">Сохранить</button>
    </form>`);
  },
  'config-group': (el) => {
    const list = S.configs
      .filter((c) => c.aircraftId === el.dataset.id && c.group === el.dataset.group)
      .sort((x, y) => x.createdAt - y.createdAt);
    const texts = list.filter((c) => c.text);
    let h = '<div class="card flat">' + list.map((c, i) => `<div class="row">
        <span class="grow"><span class="t"><span class="mono">v${i + 1}</span> ${esc(c.label || '')}</span>
        <span class="d">${fmtDate(c.date)}${c.fileName ? ' · ' + esc(c.fileName) : ''}</span></span>
        ${c.text ? `<button class="btn btn-sm" data-act="config-view" data-id="${c.id}">Текст</button>` : ''}
        ${c.file ? `<button class="btn btn-sm" data-act="config-dl" data-id="${c.id}">Файл</button>` : ''}
        <button class="ic-btn" data-act="del-config" data-id="${c.id}" aria-label="Удалить">${ICONS.x}</button>
      </div>`).join('') + '</div>';
    if (texts.length >= 2) {
      h += `<div class="spacer"></div><form data-form="cfg-compare">
        <div class="grid2">
          ${field('Сравнить', selectHtml('a', texts.map((c, i) => [c.id, 'v' + (list.indexOf(c) + 1) + ' · ' + fmtDate(c.date)]), texts[texts.length - 2].id))}
          ${field('с', selectHtml('b', texts.map((c) => [c.id, 'v' + (list.indexOf(c) + 1) + ' · ' + fmtDate(c.date)]), texts[texts.length - 1].id))}
        </div>
        <button class="btn" type="submit">Что изменилось</button></form>`;
    }
    openModal(esc(el.dataset.group), h);
  },
  'config-view': (el) => {
    const c = S.configs.find((x) => x.id === el.dataset.id);
    if (c) openModal(esc(c.group), `<div class="pre">${esc(c.text)}</div>`);
  },
  'config-dl': (el) => {
    const c = S.configs.find((x) => x.id === el.dataset.id);
    if (c && c.file) download(c.fileName || 'config.bin', c.file);
  },
  'del-config': (el) => confirmModal('Удалить эту версию конфигурации?', 'del-config-yes', `data-id="${el.dataset.id}"`),
  'del-config-yes': async (el) => { await del('configs', el.dataset.id); closeModal(); render(); },

  /* --- Сборы --- */
  'add-pack': () => {
    openModal('Новый набор', `<div class="card flat">` +
      RC.PACKING_PRESETS.map((p, i) => rowBtn(`data-act="pack-preset" data-i="${i}"`,
        `<span class="grow"><span class="t">${esc(p.name)}</span><span class="d">${p.items.length} пунктов</span></span>`)).join('') +
      rowBtn('data-act="pack-empty"', `<span class="grow"><span class="t">Пустой набор</span><span class="d">Соберу сам</span></span>`) +
      '</div>');
  },
  'pack-preset': async (el) => {
    const p = RC.PACKING_PRESETS[+el.dataset.i];
    const pack = { id: uid(), name: p.name, items: p.items.map((t) => ({ t, done: false })) };
    await put('packing', pack);
    closeModal();
    go('#/pack/' + pack.id);
  },
  'pack-empty': () => {
    closeModal();
    openModal('Пустой набор', `<form data-form="pack-new">
      ${field('Название', `<input type="text" name="name" required placeholder="напр. Командировка">`)}
      <button class="btn btn-primary" type="submit">Создать</button></form>`);
  },
  'pack-toggle': async (el) => {
    const p = S.packing.find((x) => x.id === UI.arg);
    if (!p) return;
    p.items[+el.dataset.i].done = !p.items[+el.dataset.i].done;
    UI.packLastIdx = +el.dataset.i;
    await put('packing', p);
    render(true);
  },
  'pack-del-item': async (el) => {
    const p = S.packing.find((x) => x.id === UI.arg);
    if (!p) return;
    p.items.splice(+el.dataset.i, 1);
    await put('packing', p);
    render(true);
  },
  'pack-reset': async () => {
    const p = S.packing.find((x) => x.id === UI.arg);
    if (!p) return;
    p.items.forEach((i) => { i.done = false; });
    await put('packing', p);
    render(true);
  },
  'del-pack': (el) => confirmModal('Удалить набор?', 'del-pack-yes', `data-id="${el.dataset.id}"`),
  'del-pack-yes': async (el) => { await del('packing', el.dataset.id); closeModal(); go('#/packing'); },

  /* --- Локации, батареи, шаблоны --- */
  // Мини-карта выбора точки в форме локации (online, тайлы OSM).
  'site-map': () => {
    const box = $('#modal-root .site-map-box');
    toggleBox(box, (b) => openMapPicker(b, b.closest('form')));
  },
  // Вставить координаты из буфера обмена (нужен жест пользователя —
  // кнопка и есть жест; на http/file буфер недоступен — честно скажем).
  'site-paste': async () => {
    const form = $('#modal-root form[data-form="site"]');
    const input = form && form.querySelector('input[name="coords"]');
    if (!input) return;
    try {
      const text = await navigator.clipboard.readText();
      const c = parseCoords(text);
      if (c) {
        input.value = c.lat + ', ' + c.lon;
      } else {
        // не затирать уже введённое мусором из буфера
        alert('В буфере не нашлось координат (пары чисел «широта, долгота»).');
        input.focus();
      }
    } catch (e) {
      // iOS: системная плашка «Вставить» или отказ. Фокусируем поле —
      // нативная вставка (долгое нажатие) перехватывается ниже и сама
      // разберёт координаты из любого текста.
      input.focus();
    }
  },
  'prep-batt-clear': () => {
    if (!UI.prep) return;
    installBattery(UI.prep.aircraftId, '').then(() => { closeModal(); render(); });
  },
  // С чек-листа: открыть выбранную локацию (или новую) сразу с картой.
  'prep-site-map': () => {
    if (!UI.prep) return;
    const s = S.sites.find((x) => x.id === UI.prep.siteId) || null;
    openSiteForm(s, true);
  },
  'site-gps': (el) => {
    const form = el.closest('form');
    if (!form || !('geolocation' in navigator)) return;
    el.textContent = 'Определяю…';
    navigator.geolocation.getCurrentPosition((pos) => {
      form.elements.coords.value =
        pos.coords.latitude.toFixed(5) + ', ' + pos.coords.longitude.toFixed(5);
      el.textContent = 'Определить по GPS';
    }, () => {
      el.textContent = 'GPS недоступен — разрешите геопозицию';
    }, { timeout: 12000, enableHighAccuracy: true });
  },

  /* --- Погода --- */
  'photo-zoom': (el) => pvZoom(+el.dataset.d, 0, 0),
  // Меню высоты открывается тем же toggleMenu, что и меню журнала;
  // выбранное значение подкручиваем в видимую часть — значений тридцать.
  'wx-alt-menu': (el) => {
    toggleMenu(el, 'wx-alt-menu');
    const m = $('#wx-alt-menu');
    const cur = m && menuOpen(m) && m.querySelector('[aria-checked="true"]');
    if (cur) m.scrollTop = Math.max(0, cur.offsetTop - m.clientHeight / 2);
  },
  // Временный выбор высоты — как переопределение АКБ: карточка борта
  // не меняется (решение владельца 2026-09-10). Чтобы выбор сохранялся
  // в карточку, достаточно дописать сюда put('aircraft', …).
  'wx-alt-set': (el) => {
    const v = +el.dataset.alt;
    UI.wx.alt = el.dataset.alt === '' || !(v >= WX_ALT_STEP && v <= WX_ALT_MAX)
      ? null : Math.round(v / WX_ALT_STEP) * WX_ALT_STEP;
    closeMenus();
    render(true);
  },
  'wx-help': () => openModal('Как считается окно', wxHelpHtml()),
  // Сигнал таймера с экрана полёта: меню минут, выбор — в карточку борта.
  'alarm-menu': (el) => {
    toggleMenu(el, 'alarm-menu');
    const m = $('#alarm-menu');
    const cur = m && menuOpen(m) && m.querySelector('[aria-checked="true"]');
    if (cur) m.scrollTop = Math.max(0, cur.offsetTop - m.clientHeight / 2);
  },
  'alarm-set': async (el) => {
    const s = S.sessions.find((x) => x.id === UI.arg);
    const a = s && S.aircraft.find((x) => x.id === s.aircraftId);
    closeMenus();
    if (!a) return;
    const v = +el.dataset.min;
    a.alarmMin = el.dataset.min !== '' && v > 0 && v <= 120 ? v : null;
    if (a.alarmMin) audioUnlock(); // касание — единственный момент, когда звук можно разбудить
    // Новый сигнал раньше уже прошедшего времени не должен гудеть задним числом
    if (s && Date.now() - s.start > alarmMs(a) + ALARM_WINDOW_MS) ALARM_FIRED.add(s.id);
    else if (s) ALARM_FIRED.delete(s.id);
    await put('aircraft', a);
    render(true);
  },
  // Превью Windy прямо на странице (embed-виджет; iframe через DOM —
  // сборка сторожит литерал как офлайн-ресурс, а это online по кнопке).
  'wx-windy': (el) => {
    toggleBox($('.windy-box'), (box) => {
      const lat = el.dataset.lat, lon = el.dataset.lon;
      const fr = document.createElement('iframe');
      fr.src = 'https://embed.windy.com/embed2.html?lat=' + lat + '&lon=' + lon +
        '&detailLat=' + lat + '&detailLon=' + lon +
        '&zoom=10&overlay=wind&level=surface&menu=&message=true&marker=true' +
        '&metricWind=m%2Fs&metricTemp=%C2%B0C';
      fr.setAttribute('loading', 'lazy');
      fr.style.cssText = 'width:100%;height:380px;border:0;border-radius:10px';
      box.appendChild(fr);
      box.insertAdjacentHTML('beforeend',
        `<a class="small" style="display:block;margin-top:4px;text-align:right" href="https://www.windy.com/?${esc(lat)},${esc(lon)},11" target="_blank" rel="noopener noreferrer">Открыть Windy полностью</a>`);
    });
  },
  'weather-load': () => {
    UI.wx.loading = true;
    UI.wx.error = '';
    render(true);
    wxLoad();
  },
  // Чип дня: другой день — выбранный час сбрасывается на умолчание.
  'weather-day': (el) => {
    const d = +el.dataset.day;
    if (!(d >= 0 && d < WX_DAYS)) return;
    if (UI.wx.day !== d) UI.wx.hour = null;
    UI.wx.day = d;
    render(true);
  },
  // Сегмент полоски или строка «Обратить внимание»: выбрать час.
  'weather-hour': (el) => {
    const hh = +el.dataset.h;
    if (!(hh >= 0 && hh < 24)) return;
    UI.wx.hour = hh;
    render(true);
  },

  'add-site': () => openSiteForm(null),
  'edit-site': (el) => openSiteForm(S.sites.find((s) => s.id === el.dataset.id)),
  'del-site': (el) => confirmModal('Удалить локацию?', 'del-site-yes', `data-id="${el.dataset.id}"`),
  'del-site-yes': async (el) => { await del('sites', el.dataset.id); closeModal(); render(); },

  'add-batt': () => openBattPicker(),
  'batt-empty': () => { closeModal(); openBattForm(null); },
  'batt-pick': (el) => {
    // Форма предзаполняется сборкой — всё можно поправить до создания.
    const p = RC.BATTERY_PRESETS[+el.dataset.i];
    if (!p) return;
    closeModal();
    openBattForm({ label: p.label, chem: p.chem, cells: p.cells, p: p.p, capacity: p.capacity, weight: p.weight, status: 'ok' }, p.id);
  },
  'edit-batt': (el) => openBattForm(S.batteries.find((b) => b.id === el.dataset.id)),
  'del-batt': (el) => confirmModal('Удалить аккумулятор?', 'del-batt-yes', `data-id="${el.dataset.id}"`),
  'del-batt-yes': async (el) => { await del('batteries', el.dataset.id); closeModal(); render(); },

  'add-template': () => openTemplateForm(null),
  'edit-template': (el) => openTemplateForm(S.templates.find((t) => t.id === el.dataset.id)),
  'del-template': (el) => confirmModal('Удалить шаблон?', 'del-template-yes', `data-id="${el.dataset.id}"`),
  'del-template-yes': async (el) => { await del('templates', el.dataset.id); closeModal(); render(); },

  /* --- Инструменты --- */
  'tool-fav': async (el) => {
    const fav = S.settings.favTools || (S.settings.favTools = []);
    const i = fav.indexOf(el.dataset.id);
    if (i >= 0) fav.splice(i, 1); else fav.push(el.dataset.id);
    await saveSettings();
    render(true);
  },

  /* --- Данные --- */
  'export-all': async () => {
    const snap = await RCDB.snapshot();
    const saved = await exportData(snap, 'rc-planner-backup-' + todayISO() + '.rcpilot', 'full');
    // Дата копии — только если файл действительно ушёл (лист «Поделиться»
    // закрыт — копии не было). От неё считается напоминание backupDue().
    if (saved) {
      S.settings.lastBackupAt = Date.now();
      await saveSettings();
      render(true);
    }
  },
  // «Разобраться»: все АКБ «после полёта» разом помечаются заряженными.
  'batts-charged-all': async () => {
    for (const b of S.batteries.filter((x) => x.charge === 'flown' && x.status !== 'retired')) {
      b.charge = 'ready';
      await RCDB.put('batteries', b);
    }
    await refresh('batteries');
    render(true);
  },
  'import-replace': async () => { await doImport('replace'); },
  'import-merge': async () => { await doImport('merge'); },
  'wipe-all': () => confirmModal(
    'Стереть ВСЕ данные приложения с этого устройства? Копий нигде нет.',
    'wipe-all-yes', '', 'Стереть всё'),
  'wipe-all-yes': async () => {
    await RCDB.wipe();
    PHOTO_URLS.forEach((u) => URL.revokeObjectURL(u));
    PHOTO_URLS.clear();
    await loadAll();
    S.settings = { id: 'main', pilot: '', favTools: [] };
    await saveSettings();
    closeModal();
    go('#/today');
  },

  /* --- Оболочка --- */
  'theme-set': (el) => {
    const t = el.dataset.theme;
    if (t === 'light' || t === 'dark') lsSet('rcp.theme', t);
    else lsDel('rcp.theme'); // «как в системе» — ключа нет
    applyTheme();
    render(true);
  },
  // Режим интерфейса: «В перчатках» · «Стандарт» · «Максимум».
  'ui-set': (el) => {
    const m = el.dataset.ui;
    if (!UI_MODES.includes(m)) return;
    // «Максимум» — умолчание: ключ снимается, остальные режимы запоминаются
    if (m === 'max') lsDel('rcp.ui'); else lsSet('rcp.ui', m);
    applyTheme();
    render(true);
  },
  'whatsnew': () => showWhatsNew(true),
  'update-app': () => {
    if (SWREG && SWREG.waiting) SWREG.waiting.postMessage({ type: 'SKIP_WAITING' });
  },
};

// Открыть чек-лист борта. У подготовленного борта (a.prepared, пока
// подготовка свежая) отметки НЕ начинаются заново: они берутся из
// сохранённого прогона по ТЕКСТУ пункта — шаблон мог измениться с
// выпуском, новые пункты просто останутся пустыми. Прогон запоминается
// в UI.prep.runId: savePrepRun перепишет его, а не создаст второй.
function beginPrep(aircraftId) {
  const a = S.aircraft.find((x) => x.id === aircraftId);
  if (!a) return;
  const tpls = templatesFor(a.type);
  const pr = preparedFresh(a);
  const run = pr && S.runs.find((r) => r.id === pr.runId && r.aircraftId === aircraftId);
  const tpl = (run && (tpls.find((t) => t.id === run.tplId)
    || (run.templateName && tpls.find((t) => t.name === run.templateName)))) || tpls[0];
  // Одинаковые тексты в своём шаблоне получат одно состояние — своя цена
  // отказа от id у пунктов; встроенные шаблоны дублей не содержат.
  const states = new Map(run ? run.items.map((it) => [it.t, it.state]) : []);
  UI.prep = {
    aircraftId,
    tplId: tpl.id,
    runId: run ? run.id : null,
    items: tpl.items.map((i) => ({ t: i.t, hint: i.hint || '', state: states.get(i.t) || null })),
    siteId: run && S.sites.some((x) => x.id === pr.siteId) ? pr.siteId
      : (S.sites.find((x) => x.isDefault) || {}).id || '',
    // АКБ здесь не копируется: чек-лист и полёт читают её из модели
    // (armedBattery) — источник истины один.
  };
}
