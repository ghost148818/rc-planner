// RC Planner · Делегированные события документа.
'use strict';

/* ============================================================
   10. СОБЫТИЯ
   Разметка пересобирается целиком, поэтому все обработчики
   висят на document, элементы помечены data-атрибутами.
============================================================ */

document.addEventListener('click', (e) => {
  // Чип «Обслуживание» — ссылка к работам борта (лежит внутри кнопки
  // строки, поэтому перехватываем до data-nav/data-act).
  const cl = e.target.closest('.chip-link');
  if (cl) {
    e.preventDefault();
    const open = S.maintenance.filter((m) => m.aircraftId === cl.dataset.aid && !m.done);
    if (open.length === 1) openMaintForm(open[0]);
    else go('#/model/' + cl.dataset.aid);
    return;
  }
  // Я.Карты из формы локации: перед переходом подставить в href свежие
  // координаты из поля. Обычная ссылка target=_blank — iOS корректно
  // возвращает в приложение (в отличие от window.open).
  const yaLink = e.target.closest('.site-ya-link');
  if (yaLink) {
    const form = yaLink.closest('form');
    const c = form && parseCoords(new FormData(form).get('coords'));
    yaLink.href = c ? yaMapUrl(c.lat, c.lon)
      : 'https://yandex.ru/maps/'; // поле очищено — не вести на старую точку
    return; // не preventDefault: пусть ссылка работает как в списке локаций
  }
  // Меню действий (popover="manual"): тап мимо закрывает его; тап по
  // кнопке «⋯» ведёт в toggleMenu, тап по пункту — ниже, через data-act.
  const inMenu = e.target.closest('.menu');
  if (!inMenu && !e.target.closest('[aria-haspopup="menu"]')) closeMenus();
  // Снимок в строке лежит ВНУТРИ кнопки строки (data-nav ведёт в карточку
  // борта, data-act — в форму работы): перехватываем до неё, иначе тап по
  // фото уводил бы с экрана. Кнопкой снимок там сделать нельзя — вложенных
  // кнопок в HTML нет; крупное превью в героях кнопкой быть может, у него
  // data-photo висит на самой кнопке, и путь тот же.
  const ph = e.target.closest('[data-photo]');
  if (ph) {
    e.preventDefault();
    openPhotoView(ph.dataset.photo, ph.dataset.id, ph.dataset.cap || '');
    return;
  }
  const nav = e.target.closest('[data-nav]');
  if (nav) { e.preventDefault(); go(nav.dataset.nav); return; }
  const act = e.target.closest('[data-act]');
  if (act && ACTIONS[act.dataset.act]) {
    e.preventDefault();
    if (inMenu) closeMenus(); // пункт выбран — меню закрывается до действия
    ACTIONS[act.dataset.act](act);
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeMenus();
});

// Калькулятор АКБ: пересчёт на каждый ввод без перерисовки экрана;
// Enter в поле не отправляет форму (иначе браузер перезагрузил бы страницу).
document.addEventListener('input', (e) => {
  const form = e.target.closest('form[data-calc]');
  if (form) calcUpdate(form);
});

document.addEventListener('submit', (e) => {
  if (e.target.closest('form[data-calc]')) { e.preventDefault(); return; }
  const form = e.target.closest('form[data-form]');
  if (!form) return;
  e.preventDefault();
  const fn = FORMS[form.dataset.form];
  if (fn) fn(form);
});

document.addEventListener('change', (e) => {
  const el = e.target.closest('[data-change]');
  if (!el) return;
  const kind = el.dataset.change;
  // «+ Добавить…» обрабатывается ОДНИМ гардом для всех селектов:
  // вернуть прежний выбор и открыть нужную форму. Ветки ниже про
  // NEW_OPT знать не обязаны.
  if (el.value === NEW_OPT) {
    if (kind === 'form-model-batt') {
      // прервали форму борта ради новой АКБ: значения (кроме фото)
      // вернутся, новая АКБ подставится в поле
      const form = el.closest('form');
      const orig = form.dataset.id ? S.aircraft.find((x) => x.id === form.dataset.id) : null;
      const preset = form.dataset.preset || null;
      const clone = form.dataset.clone || null; // копия борта: образец не терять
      const values = Object.fromEntries(new FormData(form));
      delete values.photo;
      // отмена диалога АКБ возвращает ПОСЛЕДНИЙ выбор в форме
      // (data-prev), а не сохранённое значение и не «__new»
      values.batteryId = el.dataset.prev || (orig && orig.batteryId) || '';
      UI.modalReturn = {
        field: 'batteryId',
        reopen: (patch) => openModelForm(orig, preset, Object.assign({}, values, patch), clone),
      };
      openBattPicker();
      return;
    }
    if (kind === 'finish-site' || kind === 'finish-batt') {
      const form = el.closest('form');
      if (form) openFromFinish(form, kind === 'finish-site' ? 'site' : 'batt');
      return;
    }
    el.value = kind === 'prep-site' ? (UI.prep && UI.prep.siteId) || ''
      : kind === 'prep-batt' ? (armedBattery(S.aircraft.find((x) => x.id === (UI.prep || {}).aircraftId)) || {}).id || ''
      : kind === 'model-batt' ? ((S.aircraft.find((x) => x.id === el.dataset.id) || {}).batteryId || '')
      : kind === 'weather-site' ? UI.wx.siteId || '' : '';
    (kind.endsWith('site') ? openSiteForm : openBattPicker)(null);
    return;
  }
  if (kind === 'form-model-batt') {
    el.dataset.prev = el.value; // на случай «+ Добавить…» с отменой
  } else if (kind === 'status-manual') {
    const a = S.aircraft.find((x) => x.id === el.dataset.id);
    if (a) { a.statusManual = el.value; put('aircraft', a).then(() => render(true)); }
  } else if (kind === 'model-batt') {
    installBattery(el.dataset.id, el.value).then(() => render(true));
  } else if (kind === 'prep-template') {
    if (!UI.prep) return;
    const a = S.aircraft.find((x) => x.id === UI.prep.aircraftId);
    const tpl = templatesFor(a.type).find((t) => t.id === el.value);
    if (tpl) {
      UI.prep.tplId = tpl.id;
      UI.prep.items = tpl.items.map((i) => ({ t: i.t, hint: i.hint || '', state: null }));
      UI.prep.menuIdx = null;
      UI.prep.lastIdx = null;
      render();
    }
  } else if (kind === 'prep-site') {
    if (!UI.prep) return;
    UI.prep.siteId = el.value;
  } else if (kind === 'prep-batt') {
    if (!UI.prep) return;
    const cur = (armedBattery(S.aircraft.find((x) => x.id === UI.prep.aircraftId)) || {}).id || '';
    if (el.value === '' && cur) {
      // снятие тоже «дублируется везде», но не молча: случайный тап
      // перед вылетом не должен незаметно разоружить модель
      el.value = cur;
      confirmModal('Снять аккумулятор с борта? Он уйдёт из «К вылету».', 'prep-batt-clear', '', 'Снять');
    } else {
      // выбор на чек-листе = установка в модель (дублируется везде)
      installBattery(UI.prep.aircraftId, el.value).then(() => render(true));
    }
  } else if (kind === 'fleet-sort') {
    S.settings.fleetSort = el.value;
    saveSettings().then(() => render(true));
  } else if (kind === 'batt-sort') {
    S.settings.battSort = el.value;
    saveSettings().then(() => render(true));
  } else if (kind === 'import-file') {
    handleImportFile(el);
  } else if (kind === 'weather-site') {
    UI.wx.siteId = el.value;
  } else if (kind === 'weather-model') {
    UI.wx.aircraftId = el.value;
    // АКБ, привязанная к модели, подставляется сама (можно переопределить)
    const wa = S.aircraft.find((x) => x.id === el.value);
    UI.wx.batteryId = (armedBattery(wa) || {}).id || '';
    UI.wx.alt = null; // высота — тоже переопределение экрана, у нового борта своя
    render(true);
  } else if (kind === 'weather-batt') {
    UI.wx.batteryId = el.value;
    render(true);
  } else if (kind === 'journal-aircraft') {
    UI.journalAircraft = el.value;
    render(true);
  } else if (kind === 'calc-batt') {
    calcPickBattery(el.value);
  }
});

// Нативная вставка в поле координат (долгое нажатие → «Вставить»
// на телефоне, Ctrl/Cmd+V): вычленяем пару чисел из любого текста —
// работает даже там, где кнопка чтения буфера упирается в систему.
document.addEventListener('paste', (e) => {
  const inp = e.target && e.target.closest && e.target.closest('input[name="coords"]');
  if (!inp || !e.clipboardData) return;
  const c = parseCoords(e.clipboardData.getData('text'));
  if (c) {
    e.preventDefault();
    inp.value = c.lat + ', ' + c.lon;
  }
});

window.addEventListener('hashchange', () => onRoute());
window.addEventListener('popstate', () => onRoute());
// Замок экрана браузер снимает, когда вкладка уходит в фон; по
// возвращении на экран полёта запрашиваем его заново.
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) syncWakeLock();
});
