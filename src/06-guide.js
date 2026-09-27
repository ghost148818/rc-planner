// RC Planner · Следующий шаг: что сделать сейчас и какая кнопка это делает.
'use strict';

/* ============================================================
   СЛЕДУЮЩИЙ ШАГ (3.0)
   nextStep() — один источник «что дальше» для всего приложения: полёт
   в воздухе → посадка → итог → заряд → взлёт → осмотр после проблемы →
   шаг обучения → зарядить АКБ → резервная копия → начать полёт →
   собрать борт → добавить борт. Возвращает { key, sels, views, tab }:
     sels  — селекторы кнопки по приоритету (с id записи, чтобы попасть
             ровно в свою строку, а не в первую похожую);
     views — экраны, где шаг уместен (нет — везде);
     tab   — вкладка, которую подсветить, если кнопки на экране нет
             (только срочное: идёт полёт).
   Экранные шаги (чек-лист, сборы, окна) — localStep(): внутри экрана
   «что дальше» своё, и оно важнее общего.
   Подсветку ставит paint() атрибутом data-next ровно на ОДИН элемент —
   шаг не решает за пилота, а показывает, куда смотреть. Разметка
   экранов про подсветку не знает.
============================================================ */

function nextStep() {
  const act = activeSessions();
  const inAir = act.find((s) => !s.landedAt);
  if (inAir) {
    return { key: 'land', views: null, tab: 'flight',
      sels: [`[data-act="land-flight"][data-id="${inAir.id}"]`, `[data-nav="#/session/${inAir.id}"]`] };
  }
  const landed = act[0];
  if (landed) {
    return { key: 'finish', views: null, tab: 'flight',
      sels: [`[data-act="finish-flight"][data-id="${landed.id}"]`, `[data-nav="#/session/${landed.id}"]`] };
  }
  const ready = S.aircraft.filter((a) => takeoffReady(a))
    .sort((x, y) => (y.prepared.at || 0) - (x.prepared.at || 0));
  if (ready.length) {
    const a = ready[0];
    const b = armedBattery(a);
    if (!chargeKnown(b)) {
      return { key: 'charge', views: ['today', 'flight', 'model', 'batteries'],
        sels: [`.hero [data-act="batt-charge"][data-id="${b.id}"]`, `[data-act="batt-charge"][data-id="${b.id}"]`] };
    }
    return { key: 'takeoff', views: ['today', 'flight', 'model'],
      sels: [`[data-act="takeoff-prepared"][data-id="${a.id}"]`] };
  }
  // Сегодняшний полёт с проблемой без закрытой работы новее него
  const today = S.sessions.filter((s) => s.end && s.date === todayISO() && s.result && s.result !== 'normal');
  for (const s of today) {
    const fixed = S.maintenance.some((m) => m.aircraftId === s.aircraftId && m.done && m.createdAt >= s.start);
    if (fixed || !S.aircraft.some((a) => a.id === s.aircraftId)) continue;
    const open = S.maintenance.find((m) => m.aircraftId === s.aircraftId && !m.done && (m.createdAt || 0) >= s.start);
    return { key: 'inspect', views: ['today', 'model'],
      sels: open ? [`[data-act="edit-maint"][data-id="${open.id}"]`] : [`[data-act="add-maint"][data-id="${s.aircraftId}"]`] };
  }
  const onb = onboardingSteps();
  if (onb.todo) {
    // На «Сегодня» — строка шага, на других экранах — та же кнопка
    // действия (шаг «Добавьте борт» подсветит «Добавить» во «Флоте»).
    const i = onb.steps.findIndex((st) => !st[2]);
    return { key: 'onboarding', views: null, sels: [`[data-onb="${i}"]`, `.head [${onb.steps[i][3]}]`, `[${onb.steps[i][3]}]`] };
  }
  const flown = S.batteries.find((b) => b.charge === 'flown' && b.status !== 'retired');
  if (flown) {
    return { key: 'recharge', views: ['today', 'batteries'],
      sels: [`[data-act="batt-charge"][data-id="${flown.id}"]`, '[data-act="batts-charged-all"]'] };
  }
  if (backupDue()) return { key: 'backup', views: ['today', 'backup', 'more'], sels: ['[data-act="export-all"]'] };
  if (armedFleet().length) {
    return { key: 'start', views: ['today', 'flight', 'journal'],
      sels: ['.btn-primary[data-act="start-prep"]', '[data-act="start-prep"]'] };
  }
  if (S.aircraft.length) return { key: 'arm', views: ['today', 'model'], sels: ['[data-next-arm]'] };
  return { key: 'add', views: ['today', 'fleet', 'flight'], sels: ['[data-act="add-model"]'] };
}

// Шаг внутри экрана: чек-лист — выбрать АКБ, отметить заряд, первый
// пустой пункт, затем «Начать полёт»; сборы — первый несобранный пункт;
// окна — «Показать прогноз», пока его нет.
function localStep() {
  if (UI.view === 'prep' && UI.prep) {
    const a = S.aircraft.find((x) => x.id === UI.prep.aircraftId);
    const b = armedBattery(a);
    if (!b) return { key: 'prep-batt', sels: ['select[name="prepBatt"]'] };
    if (!chargeKnown(b)) return { key: 'prep-charge', sels: [`.prep-batt [data-act="batt-charge"][data-id="${b.id}"]`] };
    const i = UI.prep.items.findIndex((it) => !it.state);
    if (i >= 0) return { key: 'prep-item', sels: [`.ck[data-ck="${i}"]`] };
    if (UI.prep.items.some((it) => it.state === 'fail')) return { key: 'prep-fail', sels: [] };
    return { key: 'prep-go', sels: ['[data-act="start-flight"]'] };
  }
  if (UI.view === 'pack') {
    const p = S.packing.find((x) => x.id === UI.arg);
    const i = p ? p.items.findIndex((it) => !it.done) : -1;
    if (i >= 0) return { key: 'pack-item', sels: [`.ck[data-ck="${i}"]`] };
    return null;
  }
  if (UI.view === 'weather' && !UI.wx.data && !UI.wx.loading) {
    return { key: 'wx-load', sels: ['[data-act="weather-load"]'] };
  }
  return null;
}

// Подсветка шага на свежей разметке. Фаза анимаций — общая для всех
// перерисовок (см. 05-effects.css): рамка не прыгает в начало.
const GLOW_PERIOD_MS = 3200;
function applyNext() {
  const now = performance.now();
  const root = document.documentElement.style;
  root.setProperty('--glow-phase', -(now % GLOW_PERIOD_MS).toFixed(0) + 'ms');
  let step = null;
  try { step = localStep() || nextStep(); } catch (e) { step = null; }
  UI.next = step;
  if (!step) return;
  const here = !step.views || step.views.includes(UI.view);
  if (here) {
    for (const sel of step.sels) {
      const el = document.querySelector('#views ' + sel);
      if (el) { el.setAttribute('data-next', step.key); return; }
    }
  }
  if (step.tab && TAB_OF[UI.view] !== step.tab) {
    const t = document.querySelector(`#tabbar .tab[data-nav="#/${step.tab}"]`);
    if (t) t.setAttribute('data-next', step.key);
  }
}

// Короткий отклик вибрацией на важные касания (отметка пункта, взлёт,
// посадка). Локальный API; где его нет (iPhone) — просто ничего.
function haptic(ms) {
  try { if (navigator.vibrate) navigator.vibrate(ms || 12); } catch (e) { /* нет — и не надо */ }
}
