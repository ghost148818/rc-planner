// RC Planner · Навигация и отрисовка.
'use strict';

/* ============================================================
   9. НАВИГАЦИЯ И ОТРИСОВКА
============================================================ */

const RENDERERS = {
  today: viewToday, fleet: viewFleet, model: viewModel,
  flight: viewFlight, prep: viewPrep, session: viewSession,
  journal: viewJournal,
  packing: viewPacking, pack: viewPack, weather: viewWeather,
  more: viewMore, tools: viewTools, sites: viewSites,
  batteries: viewBatteries, templates: viewTemplates,
  backup: viewBackup, privacy: viewPrivacy, help: viewHelp,
  battcalc: viewBattCalc,
};

// Старые адреса (закладки, ссылки в changelog): #/log и #/stats
// открывают «Журнал» на нужном сегменте. Псевдоним разрешается ОДИН раз
// при разборе маршрута в onRoute, а не в рендерере: рендерер зовётся при
// каждой перерисовке, и сегмент «Полёты · Статистика» на таком адресе
// был мёртв — render(true) возвращал его назад (финальное ревью 2.0).
const ROUTE_ALIAS = {
  log: { view: 'journal', journalTab: 'log' },
  stats: { view: 'journal', journalTab: 'stats' },
};

// Тап по текущему адресу — перерисовать и прокрутить к началу. Сравниваем
// нормализованный адрес: при старте hash пустой, а onRoute уже считает
// его '#/today' — иначе первый тап по «Сегодня» глотался дедупликацией.
// Направление перехода задаёт navDirection() в onRoute, здесь его не ставим.
function go(hash) {
  if ((location.hash || '#/today') === hash) onRoute(true);
  else location.hash = hash;
}

// Корневой экран вкладки (#/today, #/fleet…): переход между ними — «tab».
function isTabRoot(view) {
  return TABS.some((t) => t.id === view);
}

// Направление перехода для View Transitions. Короткий стек маршрутов
// отличает «назад» (новый маршрут — предыдущий в стеке) от «вперёд»;
// history.back() и запасной маршрут кнопки «Назад» — тоже back.
// Переход между корневыми экранами вкладок — всегда «tab» (только
// прозрачность), даже если это возврат на предыдущую вкладку: панель
// не должна ездить то сбоку, то растворяться. Стек при этом правится
// как обычно — возврат снимает вершину.
function navDirection(hash, prevView, view) {
  const st = UI.navStack;
  const isPrev = st.length > 1 && st[st.length - 2] === hash;
  const tabHop = isTabRoot(prevView) && isTabRoot(view);
  const back = UI.navBackHint || (isPrev && !tabHop);
  UI.navBackHint = false;
  if (isPrev) st.pop();
  else if (st[st.length - 1] !== hash) st.push(hash);
  if (st.length > 40) st.shift();
  if (back) return 'back';
  return tabHop ? 'tab' : 'forward';
}

// force — перерисовать даже тот же маршрут (go на текущий адрес). Без
// него повтор того же адреса пропускается: на смену hash браузер шлёт
// и popstate, и hashchange — второй вызов ломал направление перехода
// и дважды собирал экран.
function onRoute(force) {
  const hash = location.hash || '#/today';
  if (!force && hash === UI.routeHash) return;
  UI.routeHash = hash;
  const parts = hash.replace(/^#\/?/, '').split('/');
  let view = parts[0] || 'today';
  const alias = ROUTE_ALIAS[view];
  if (alias) { UI.journalTab = alias.journalTab; view = alias.view; }
  const prevView = UI.view;
  UI.view = RENDERERS[view] ? view : 'today';
  UI.arg = parts[1] ? decodeURIComponent(parts[1]) : null;
  UI.navCount++;
  UI.navDir = navDirection(hash, prevView, UI.view);
  UI.modalReturn = null; // ушли со страницы — восстанавливать нечего
  if (UI.view !== 'model' || UI.arg !== UI.justCreated) UI.justCreated = null;
  closeModal(true);
  render(false, true);
}

// Точка у иконки «Полёт» — идёт незавершённый полёт (в воздухе или сел
// без итога): видно с любой вкладки.
function renderTabbar() {
  const active = TAB_OF[UI.view] || 'today';
  const live = activeSessions().length > 0;
  $('#tabbar').innerHTML = TABS.map((t) =>
    `<button class="tab" data-nav="#/${t.id}" ${t.id === active ? 'aria-current="page"' : ''}${t.id === 'flight' && live ? ' aria-label="Полёт — идёт полёт"' : ''}>
      ${t.id === active ? '<i class="tab-ind" aria-hidden="true"></i>' : ''}${ICONS[t.id]}${t.id === 'flight' && live ? '<i class="live" aria-hidden="true"></i>' : ''}<span>${t.label}</span></button>`).join('');
}

// render — обёртка над paint(): при поддержке View Transitions и без
// prefers-reduced-motion смена разметки идёт внутри
// document.startViewTransition, направление — html[data-vt]
// (forward|back|tab, для render(true) — update: корень не моргает,
// анимируются только элементы с view-transition-name). Разметка
// обновляется асинхронно (в колбэке) — код после render() на новый DOM
// рассчитывать не должен. toTop — прокрутить к началу (новый маршрут).
function render(keepScroll, toTop) {
  if (!document.startViewTransition || reducedMotion() || document.hidden) {
    paint(keepScroll, toTop);
    return;
  }
  document.documentElement.dataset.vt = keepScroll ? 'update' : UI.navDir;
  const vt = document.startViewTransition(() => paint(keepScroll, toTop));
  // Второй render() до конца первого перехода — переход пропускается,
  // а ready отклоняется; это штатно, но без catch — ошибка в консоли.
  vt.ready.catch(() => {});
}

function paint(keepScroll, toTop) {
  const y = window.scrollY;
  const focused = document.activeElement;
  // Кнопка меню клетки (ck-set) исчезает вместе с меню — фокус возвращаем
  // на клетку той же строки (ck-menu), иначе с клавиатуры он уйдёт на body.
  // Ключ элемента — data-i (клетки, строки), data-h (сегменты полоски
  // «Окон»), data-day (чипы дней): без него активный элемент после
  // Enter уходил на body (ревью пакета 5).
  const fAct = focused && focused.dataset && focused.dataset.act;
  const focusAct = fAct === 'ck-set' ? 'ck-menu' : fAct === 'wx-alt-set' ? 'wx-alt-menu' : fAct;
  const focusKey = focusAct && ['i', 'h', 'day', 'alt'].find((k) => focused.dataset[k] != null);
  const focusSel = focusKey
    ? `[data-act="${focusAct}"][data-${focusKey}="${focused.dataset[focusKey]}"]` : null;

  if (TIMER) { clearInterval(TIMER); TIMER = null; }
  const views = $('#views');
  views.innerHTML = (RENDERERS[UI.view] || viewToday)();
  // «Сегодня» — две колонки от 900 px (основная + aside); на телефоне
  // класс тот же, колонки складывает CSS.
  views.classList.toggle('two-col', UI.view === 'today');
  renderTabbar();
  applyNext(); // подсветка следующего шага — на готовой разметке

  if (keepScroll) {
    window.scrollTo(0, y);
    if (focusSel) { const el = $(focusSel); if (el) el.focus(); }
  } else if (toTop) {
    window.scrollTo(0, 0);
    // «Инструкция» по адресу #/help/<id> (кнопка «?» экрана): открытый
    // раздел — в начало окна. id проверяется по списку разделов.
    if (UI.view === 'help' && helpSectionId(UI.arg)) {
      const sec = $('#help-' + UI.arg);
      if (sec) sec.scrollIntoView({ block: 'start' });
    }
  }

  // Живой таймер: #timer с data-sid есть на экране полёта и в карточке
  // полёта на «Сегодня» — интервал один на любой экран.
  const tm = $('#timer[data-sid]');
  const s = tm && S.sessions.find((x) => x.id === tm.dataset.sid);
  if (s && !s.end && !s.landedAt) {
    TIMER = setInterval(() => {
      const t = $('#timer');
      const cur = S.sessions.find((x) => x.id === s.id);
      if (t && cur && !cur.end && !cur.landedAt) {
        const ms = Date.now() - cur.start;
        t.innerHTML = clockHtml(ms);
        // кольцо экрана полёта: заполнение относительно цели (сигнал
        // таймера или обычная длительность); цель пройдена — .over
        const ring = $('#ring-fill');
        if (ring) {
          const target = +ring.dataset.target || 0;
          ring.setAttribute('stroke-dashoffset', ringOffset(ms, target));
          const over = target > 0 && ms >= target;
          const box = $('#ring');
          if (box && box.classList.contains('over') !== over) {
            box.classList.toggle('over', over);
            const pill = $('#air-pill');
            if (pill) { pill.classList.toggle('alarm', over); pill.textContent = over ? 'Время вышло' : 'В воздухе'; }
          }
        }
      } else { clearInterval(TIMER); TIMER = null; }
    }, 1000);
  }
  syncAlarms();
  // Экран не гаснет только на экране полёта в воздухе; в остальных
  // случаях (посадка, отмена, уход с экрана) замок отпускается здесь.
  syncWakeLock();
}
