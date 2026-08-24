// RC Planner — локальный офлайн-помощник авиамоделиста.
// Разделы файла:
//   1. Состояние   2. Утилиты   3. Статусы   4. Данные
//   5. Примитивы   6. Экраны    7. Действия  8. Формы
//   9. Навигация  10. События  11. PWA      12. Старт
'use strict';

/* ============================================================
   1. СОСТОЯНИЕ
   S — снимок базы в памяти (флот маленький, целиком в памяти
   дешевле и проще, чем точечные запросы). UI — эфемерное.
============================================================ */

const S = {
  aircraft: [],
  batteries: [],
  sites: [],
  sessions: [],
  templates: [],
  runs: [],
  packing: [],
  maintenance: [],
  configs: [],
  settings: { id: 'main', pilot: '', favTools: [] },
};

const UI = {
  view: 'today',
  arg: null,          // id из маршрута (#/model/<id> и т.п.)
  prep: null,         // { aircraftId, tplId, items:[{t,hint,state}] }
  importData: null,   // разобранный файл импорта до подтверждения
  updateReady: false, // service worker ждёт активации
  wx: {               // экран «Окна для полётов»
    siteId: '', aircraftId: '', batteryId: '', day: 0,
    loading: false, error: '', data: null, // data: {fetched, place, json}
  },
  navCount: 0,        // сколько маршрутов прошли — для кнопки «Назад»
  modalReturn: null,  // форма, к которой вернуться после вложенного диалога
};

const WX_DEFAULT_WIND = 16; // м/с, порог без выбранной модели
const WX_DEFAULT_ALT = { quad: 60, plane: 150, wing: 150, other: 100 }; // м, типичная высота полёта
const WX_API = 'https://api.open-meteo.com/v1/forecast';
const WX_DAYS = 7;

let SWREG = null;
let TIMER = null;

/* ============================================================
   2. УТИЛИТЫ
============================================================ */

const $ = (sel, el) => (el || document).querySelector(sel);

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function uid() {
  return (crypto.randomUUID && crypto.randomUUID()) ||
    'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

function todayISO() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') +
    '-' + String(d.getDate()).padStart(2, '0');
}

// Всё время в приложении — московское (решение владельца, 2026-08-25):
// прогноз запрашивается в Europe/Moscow, дата «сегодня» для привязки
// к дням прогноза тоже берётся по МСК, а не по поясу устройства.
const WX_TZ = 'Europe/Moscow';
function wxTodayISO() {
  return new Date().toLocaleDateString('en-CA', { timeZone: WX_TZ });
}

const MONTHS_RU = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

function fmtDate(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  const now = new Date();
  return d + ' ' + MONTHS_RU[m - 1] + (y === now.getFullYear() ? '' : ' ' + y);
}

function fmtDur(min) {
  if (min == null || isNaN(min)) return '—';
  min = Math.round(min);
  if (min < 60) return min + ' мин';
  return Math.floor(min / 60) + ' ч ' + (min % 60 ? (min % 60) + ' мин' : '').trim();
}

function fmtClock(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return (mm < 100 ? String(mm).padStart(2, '0') : mm) + ':' + String(ss).padStart(2, '0');
}

function plural(n, one, few, many) {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}

function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

function dataURLtoBlob(url) {
  const [head, data] = url.split(',');
  const type = (head.match(/data:([^;]*)/) || [])[1] || '';
  const bin = atob(data);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type });
}

function download(name, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

// Кэш object URL для фото моделей.
const PHOTO_URLS = new Map();
function photoURL(a) {
  if (!a.photo) return null;
  let u = PHOTO_URLS.get(a.id);
  if (!u) { u = URL.createObjectURL(a.photo); PHOTO_URLS.set(a.id, u); }
  return u;
}
function dropPhotoURL(id) {
  const u = PHOTO_URLS.get(id);
  if (u) { URL.revokeObjectURL(u); PHOTO_URLS.delete(id); }
}

// Построчное сравнение конфигураций. Для больших файлов — грубое
// сравнение множеств строк, иначе LCS.
function lineDiff(aText, bText) {
  const A = aText.split('\n');
  const B = bText.split('\n');
  const n = A.length, m = B.length;
  if (n * m > 4e6) {
    const setA = new Set(A), setB = new Set(B);
    const lines = [];
    A.forEach((l) => { if (!setB.has(l)) lines.push(['del', l]); });
    B.forEach((l) => { if (!setA.has(l)) lines.push(['add', l]); });
    return { rough: true, lines };
  }
  const W = m + 1;
  const dp = new Uint16Array((n + 1) * W);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i * W + j] = A[i] === B[j]
        ? dp[(i + 1) * W + j + 1] + 1
        : Math.max(dp[(i + 1) * W + j], dp[i * W + j + 1]);
    }
  }
  const lines = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (A[i] === B[j]) { lines.push(['same', A[i]]); i++; j++; }
    else if (dp[(i + 1) * W + j] >= dp[i * W + j + 1]) { lines.push(['del', A[i]]); i++; }
    else { lines.push(['add', B[j]]); j++; }
  }
  while (i < n) lines.push(['del', A[i++]]);
  while (j < m) lines.push(['add', B[j++]]);
  return { rough: false, lines };
}

function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

/* ============================================================
   3. СТАТУСЫ МОДЕЛЕЙ
============================================================ */

const STATUS = {
  ready: { label: 'Готова', cls: 'st-ready' },
  check: { label: 'Проверить', cls: 'st-check' },
  maintenance: { label: 'Обслуживание', cls: 'st-maintenance' },
  grounded: { label: 'Полёты запрещены', cls: 'st-grounded' },
  unknown: { label: 'Нет данных', cls: 'st-unknown' },
};

const TYPES = { quad: 'FPV квад', plane: 'Самолёт', wing: 'Крыло', other: 'Другое' };

const RESULTS = {
  normal: 'Нормальный',
  problem: 'С проблемой',
  crash: 'Краш',
  emergency: 'Аварийная посадка',
  maintenance: 'Нужно обслуживание',
};

function sessionsOf(id) {
  return S.sessions.filter((s) => s.aircraftId === id).sort((a, b) => b.start - a.start);
}

function statusOf(a) {
  if (a.statusManual && STATUS[a.statusManual]) return a.statusManual;
  if (S.maintenance.some((m) => m.aircraftId === a.id && !m.done)) return 'maintenance';
  const last = sessionsOf(a.id).find((s) => s.end);
  if (last && last.result && last.result !== 'normal') return 'check';
  if (last) return 'ready';
  if (S.runs.some((r) => r.aircraftId === a.id)) return 'ready';
  return 'unknown';
}

function chip(st) {
  const s = STATUS[st] || STATUS.unknown;
  return `<span class="chip ${s.cls}">${s.label}</span>`;
}

function activeSession() {
  return S.sessions.find((s) => !s.end) || null;
}

/* ============================================================
   4. ДАННЫЕ
============================================================ */

async function loadAll() {
  const snap = await RCDB.snapshot();
  Object.keys(snap).forEach((k) => {
    if (k === 'settings') return;
    S[k] = snap[k];
  });
  const st = snap.settings.find((x) => x.id === 'main');
  if (st) S.settings = Object.assign({ favTools: [] }, st);
}

async function put(store, obj) {
  await RCDB.put(store, obj);
  S[store === 'settings' ? 'settings' : store] = store === 'settings'
    ? S.settings
    : await RCDB.all(store);
}

async function del(store, id) {
  await RCDB.del(store, id);
  S[store] = await RCDB.all(store);
}

async function saveSettings() {
  await RCDB.put('settings', S.settings);
}

async function seedIfNeeded() {
  if (lsGet('rcp.seeded')) return;
  if (!S.packing.length) {
    for (const p of RC.PACKING_PRESETS) {
      await put('packing', {
        id: uid(),
        name: p.name,
        items: p.items.map((t) => ({ t, done: false })),
      });
    }
  }
  if (!(await RCDB.get('settings', 'main'))) await saveSettings();
  lsSet('rcp.seeded', '1');
}

// Разовые миграции данных. Шкала порогов ветра удвоена 2026-08-24
// (пользователи — опытные пилоты); старые явные пороги подтягиваем один раз.
async function migrateIfNeeded() {
  if (!S.settings.migrWind2) {
    for (const a of S.aircraft) {
      if (a.maxWind) {
        a.maxWind = Math.min(60, a.maxWind * 2);
        await put('aircraft', a);
      }
    }
    S.settings.migrWind2 = true;
    await saveSettings();
  }
}

/* ============================================================
   5. ПРИМИТИВЫ РАЗМЕТКИ
============================================================ */

// Контурные иконки 24×24, штрих ~1.8 (Lucide-подобный стиль; композиция
// погодных и служебных сюжетов сверялась с наборами Lucide (ISC) и
// dqev/reicon (MIT)). Вставлять ТОЛЬКО как ICONS[key] — никогда не
// интерполировать в SVG пользовательские строки.
const ic = (inner, sw) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw || 1.8}" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
const ICONS = {
  today: ic('<path d="M3 11l9-8 9 8"/><path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5"/>'),
  // самолёт главный (на них летают больше), мультиротор рядом
  fleet: ic('<g transform="translate(-1.2 3.2) scale(0.85)"><path d="M12 3.5v16"/><path d="M12 8 3.5 10.8v1.7L12 11.6l8.5.9v-1.7L12 8Z"/><path d="M9.3 19.5h5.4"/></g><g transform="translate(13.4 0.6) scale(0.44)"><circle cx="5.2" cy="5.2" r="2.7"/><circle cx="18.8" cy="5.2" r="2.7"/><circle cx="5.2" cy="18.8" r="2.7"/><circle cx="18.8" cy="18.8" r="2.7"/><path d="m7.1 7.1 9.8 9.8M16.9 7.1 7.1 16.9"/><circle cx="12" cy="12" r="2.6"/></g>'),
  // летящий самолёт
  flight: ic('<path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2Z"/>', 1.6),
  // рюкзак: ручка, клапан, передний карман
  packing: ic('<rect x="5" y="7" width="14" height="14.5" rx="3"/><path d="M9.5 7V5.5a2.5 2.5 0 0 1 5 0V7"/><path d="M5 12.5h14"/><path d="M8.5 21.5v-4.5a1.5 1.5 0 0 1 1.5-1.5h4a1.5 1.5 0 0 1 1.5 1.5v4.5"/>'),
  more: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.9"/><circle cx="12" cy="12" r="1.9"/><circle cx="19" cy="12" r="1.9"/></svg>',
  chev: ic('<path d="m9 6 6 6-6 6"/>', 2),
  back: ic('<path d="M15 6 9 12l6 6"/>', 2),
  // классы моделей
  quad: ic('<circle cx="5.2" cy="5.2" r="2.7"/><circle cx="18.8" cy="5.2" r="2.7"/><circle cx="5.2" cy="18.8" r="2.7"/><circle cx="18.8" cy="18.8" r="2.7"/><path d="m7.1 7.1 9.8 9.8M16.9 7.1 7.1 16.9"/><circle cx="12" cy="12" r="2.6"/>'),
  plane: ic('<path d="M12 3.5v16"/><path d="M12 8 3.5 10.8v1.7L12 11.6l8.5.9v-1.7L12 8Z"/><path d="M9.3 19.5h5.4"/>'),
  wing: ic('<path d="M12 4.5 19.8 18c-2.6-1.1-5.2-1.7-7.8-1.7S6.8 16.9 4.2 18L12 4.5Z"/><circle cx="12" cy="13.4" r="1" fill="currentColor" stroke="none"/>'),
  other: ic('<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5v17M3.5 12h17" stroke-dasharray="2.4 3.4"/>'),
  // погодные условия
  wxSun: ic('<circle cx="12" cy="12" r="4"/><path d="M12 3v1.8M12 19.2V21M3 12h1.8M19.2 12H21M5.6 5.6l1.3 1.3M17.1 17.1l1.3 1.3M18.4 5.6l-1.3 1.3M6.9 17.1l-1.3 1.3"/>'),
  wxPartly: ic('<path d="M12 2v2M4.93 4.93l1.41 1.41M20 12h2M19.07 4.93l-1.41 1.41M15.947 12.65a4 4 0 0 0-5.925-4.128"/><path d="M13 22H7a5 5 0 1 1 4.9-6H13a3 3 0 0 1 0 6Z"/>'),
  wxCloud: ic('<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>'),
  wxRain: ic('<path d="M4 14.9A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.24"/><path d="M16 14v5M8 14v5M12 16.5v5"/>'),
  wxSnow: ic('<path d="M4 14.9A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.24"/><path d="M8 15h.01M8 19h.01M12 17h.01M12 21h.01M16 15h.01M16 19h.01" stroke-width="2.6"/>'),
  wxFog: ic('<path d="M4 14.9A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.24"/><path d="M16.5 17.5H7M15 21H9.5"/>'),
  wxMoon: ic('<path d="M20 12.5A8 8 0 1 1 11.5 4a6.5 6.5 0 0 0 8.5 8.5Z"/>'),
  // «Ещё» и разное
  weather: ic('<path d="M9.6 4.6A2 2 0 1 1 11 8H2.5M12.6 19.4A2 2 0 1 0 14 16H2.5M17.3 7.3a2.5 2.5 0 1 1 1.8 4.3H2.5"/>'),
  tools: ic('<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76Z"/>'),
  sites: ic('<path d="M20 10c0 6-8 11.5-8 11.5S4 16 4 10a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>'),
  batteries: ic('<rect x="2.5" y="7.5" width="17" height="9" rx="2"/><path d="M22 10.5v3M6.5 10.75v2.5M10.25 10.75v2.5M14 10.75v2.5"/>'),
  templates: ic('<rect x="5" y="4" width="14" height="17.5" rx="2"/><path d="M9 4.5V3.4A1.4 1.4 0 0 1 10.4 2h3.2A1.4 1.4 0 0 1 15 3.4v1.1"/><path d="m8.8 13.2 2.2 2.2 4.2-4.2"/>'),
  backup: ic('<rect x="3" y="4.5" width="18" height="4.5" rx="1"/><path d="M5 9v9.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V9"/><path d="M10 13h4"/>'),
  privacy: ic('<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1 1 0 0 1 1.52 0C14.5 3.8 17 5 19 5a1 1 0 0 1 1 1Z"/>'),
  whatsnew: ic('<path d="M10 3.6 11.3 8a1.6 1.6 0 0 0 1.1 1.1l4.4 1.3-4.4 1.3a1.6 1.6 0 0 0-1.1 1.1L10 17.2l-1.3-4.4a1.6 1.6 0 0 0-1.1-1.1L3.2 10.4l4.4-1.3A1.6 1.6 0 0 0 8.7 8L10 3.6Z"/><path d="M18 13.5l.8 2.7 2.7.8-2.7.8-.8 2.7-.8-2.7-2.7-.8 2.7-.8.8-2.7Z"/>'),
  update: ic('<path d="M21 12a9 9 0 1 1-2.64-6.36L21 8"/><path d="M21 3v5h-5"/>'),
};

const TABS = [
  { id: 'today', label: 'Сегодня' },
  { id: 'fleet', label: 'Флот' },
  { id: 'flight', label: 'Полёт' },
  { id: 'packing', label: 'Сборы' },
  { id: 'more', label: 'Ещё' },
];

// Какая вкладка активна для каждого экрана.
const TAB_OF = {
  today: 'today', weather: 'today',
  fleet: 'fleet', model: 'fleet', batteries: 'fleet',
  flight: 'flight', prep: 'flight', session: 'flight', log: 'flight',
  packing: 'packing', pack: 'packing',
  more: 'more', tools: 'more', sites: 'more',
  backup: 'more', privacy: 'more', templates: 'more',
};

function pageHead(title, opts) {
  opts = opts || {};
  return `<div class="head">
    ${opts.back ? `<button class="back" data-act="nav-back" data-fallback="${opts.back}" aria-label="Назад">${ICONS.back}</button>` : ''}
    <div class="grow"><h1>${title}</h1>${opts.sub ? `<div class="sub">${opts.sub}</div>` : ''}</div>
    ${opts.act ? `<button class="head-act" data-act="${opts.act}">${opts.actLabel}</button>` : ''}
  </div>`;
}

// icon — только КЛЮЧ из ICONS (не сырой SVG): пользовательские данные
// в этот слот попадать не должны.
function rowBtn(attrs, inner, icon) {
  const i = icon && ICONS[icon] ? `<span class="row-ic">${ICONS[icon]}</span>` : '';
  return `<button class="row" ${attrs}>${i}${inner}<span class="chev">${ICONS.chev}</span></button>`;
}

function emptyState(text, btnAct, btnLabel) {
  return `<div class="empty">${ICONS.plane}<p>${text}</p>
    ${btnAct ? `<button class="btn btn-sm" data-act="${btnAct}">${btnLabel}</button>` : ''}</div>`;
}

function field(label, control, hint) {
  return `<div class="field"><label>${label}</label>${control}
    ${hint ? `<div class="hint">${hint}</div>` : ''}</div>`;
}

function selectHtml(name, options, current, extra) {
  return `<select name="${name}" ${extra || ''}>` +
    options.map(([v, t]) => `<option value="${esc(v)}" ${String(v) === String(current) ? 'selected' : ''}>${esc(t)}</option>`).join('') +
    '</select>';
}

function openModal(title, body) {
  closeModal();
  const root = $('#modal-root');
  root.innerHTML = `<dialog aria-label="${esc(title)}">
    <div class="dlg-head"><h2>${title}</h2>
      <button class="dlg-close" data-act="close-modal" aria-label="Закрыть">×</button></div>
    <div class="dlg-body">${body}</div>
  </dialog>`;
  const d = $('dialog', root);
  try { d.showModal(); } catch (e) { d.setAttribute('open', ''); }
  document.body.classList.add('locked');
  d.addEventListener('cancel', (ev) => { ev.preventDefault(); dismissModal(); });
  d.addEventListener('click', (ev) => { if (ev.target === d) dismissModal(); });
}

function closeModal() {
  const d = $('#modal-root dialog');
  if (d) { try { d.close(); } catch (e) {} d.remove(); }
  document.body.classList.remove('locked');
}

// Закрытие по кнопке/Esc/фону: если под диалогом ждёт незаконченная форма
// (открыли «+ Добавить локацию» из итога полёта) — возвращаемся к ней.
// ВНИМАНИЕ: внутри openModal остаётся именно closeModal, иначе рекурсия.
function dismissModal() {
  const r = UI.modalReturn;
  if (r && r.kind === 'finish') {
    UI.modalReturn = null;
    openFinishForm(r.sessionId, r.values);
    return;
  }
  closeModal();
}

function confirmModal(text, act, dataAttrs, btnLabel) {
  openModal('Подтверждение', `<p>${text}</p><div class="spacer"></div>
    <div class="btn-line">
      <button class="btn" data-act="close-modal">Отмена</button>
      <button class="btn btn-danger" data-act="${act}" ${dataAttrs || ''}>${btnLabel || 'Удалить'}</button>
    </div>`);
}

function aircraftThumb(a) {
  const u = photoURL(a);
  return u
    ? `<img class="thumb" src="${u}" alt="">`
    : `<span class="thumb ph">${ICONS[a.type] || ICONS.plane}</span>`;
}

/* ============================================================
   6. ЭКРАНЫ
============================================================ */

function viewToday() {
  let h = pageHead('RC Planner', { sub: new Date().toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' }) });

  if (UI.updateReady) {
    h += `<div class="banner ok">Доступно обновление приложения.
      <button class="btn-sm btn right" data-act="update-app">Обновить</button></div>`;
  }

  if (!lsGet('rcp.hi')) {
    h += `<div class="banner">Ваши данные хранятся на этом устройстве. Приложение не отправляет
      их в интернет и работает без сети. <button class="btn-sm btn" data-act="dismiss-hi">Понятно</button></div>`;
  }

  const act = activeSession();
  if (act) {
    const a = S.aircraft.find((x) => x.id === act.aircraftId);
    h += `<div class="banner warn">Идёт полёт: ${esc(a ? a.name : '')}.
      <button class="btn-sm btn right" data-nav="#/session/${act.id}">Открыть</button></div>`;
  }

  if (!S.aircraft.length) {
    h += emptyState('Добавьте первую модель — и RC Planner поможет готовить её к полётам.', 'add-model', 'Добавить модель');
    return h;
  }

  h += `<button class="btn btn-primary" data-act="start-prep">Начать полёт</button>`;

  h += `<div class="card flat" style="margin-top:8px">` +
    rowBtn('data-nav="#/weather"', `<span class="grow"><span class="t">Окна для полётов
      <span class="badge online">online</span></span>
      <span class="d">Ветер до 200 м и осадки по вашей локации</span></span>`, 'weather') + '</div>';

  // Флот со статусами
  h += '<div class="h2">Флот</div><div class="card flat">';
  h += S.aircraft.map((a) => rowBtn(`data-nav="#/model/${a.id}"`,
    `${aircraftThumb(a)}<span class="grow"><span class="t">${esc(a.name)}</span>
     <span class="d">${TYPES[a.type] || ''} · ${sessionsOf(a.id).filter((s) => s.end).length} ${plural(sessionsOf(a.id).filter((s) => s.end).length, 'полёт', 'полёта', 'полётов')}</span></span>
     ${chip(statusOf(a))}`)).join('');
  h += '</div>';

  // Незакрытое обслуживание
  const open = S.maintenance.filter((m) => !m.done);
  if (open.length) {
    h += '<div class="h2">Обслуживание</div><div class="card flat">';
    h += open.slice(0, 5).map((m) => {
      const a = S.aircraft.find((x) => x.id === m.aircraftId);
      return rowBtn(`data-nav="#/model/${m.aircraftId}"`,
        `<span class="grow"><span class="t">${esc(m.title)}</span>
         <span class="d">${esc(a ? a.name : '')} · ${fmtDate(m.date)}</span></span>`);
    }).join('');
    h += '</div>';
  }

  // Последние полёты
  const recent = S.sessions.filter((s) => s.end).sort((a, b) => b.start - a.start).slice(0, 3);
  if (recent.length) {
    h += '<div class="h2">Последние полёты</div><div class="card flat">';
    h += recent.map(sessionRow).join('');
    h += '</div>';
  }
  return h;
}

function sessionRow(s) {
  const a = S.aircraft.find((x) => x.id === s.aircraftId);
  return rowBtn(`data-act="session-info" data-id="${s.id}"`,
    `<span class="grow"><span class="t"><span class="mono">#${String(s.flightNo).padStart(3, '0')}</span> ${esc(a ? a.name : 'Модель удалена')}</span>
     <span class="d">${fmtDate(s.date)} · ${fmtDur(s.durationMin)} · <span class="result-${esc(s.result || 'normal')}">${RESULTS[s.result] || '—'}</span></span></span>`);
}

// Флот — это модели и батареи: два списка одной вкладки.
function fleetSeg(active) {
  return `<div class="seg" style="margin-bottom:10px">
    <button data-nav="#/fleet" aria-pressed="${active === 'fleet'}">Модели</button>
    <button data-nav="#/batteries" aria-pressed="${active === 'batteries'}">Аккумуляторы</button>
  </div>`;
}

function viewFleet() {
  let h = pageHead('Флот', { act: 'add-model', actLabel: 'Добавить' }) + fleetSeg('fleet');
  if (!S.aircraft.length) {
    return h + emptyState('Пока нет ни одной модели.', 'add-model', 'Добавить модель');
  }
  h += '<div class="card flat">';
  h += S.aircraft.map((a) => rowBtn(`data-nav="#/model/${a.id}"`,
    `${aircraftThumb(a)}<span class="grow"><span class="t">${esc(a.name)}</span>
     <span class="d">${TYPES[a.type] || ''}${a.manufacturer ? ' · ' + esc(a.manufacturer) : ''}</span></span>
     ${chip(statusOf(a))}`)).join('');
  h += '</div>';
  return h;
}

const COMPONENTS = [
  ['motor', 'Мотор'], ['esc', 'ESC'], ['fc', 'Полётный контроллер'],
  ['rx', 'Приёмник (RX)'], ['gps', 'GPS'], ['servo', 'Сервоприводы'],
  ['prop', 'Пропеллер'], ['vtx', 'VTX'], ['camera', 'Камера'],
  ['tx', 'Передатчик'], ['battery', 'Аккумулятор'],
];

function viewModel() {
  const a = S.aircraft.find((x) => x.id === UI.arg);
  if (!a) return pageHead('Модель не найдена', { back: '#/fleet' });
  const flights = sessionsOf(a.id).filter((s) => s.end);
  const total = flights.reduce((n, s) => n + (s.durationMin || 0), 0);
  const st = statusOf(a);

  let h = pageHead(esc(a.name), { back: '#/fleet', act: 'edit-model', actLabel: 'Изменить' });

  const u = photoURL(a);
  if (u) h += `<img src="${u}" alt="" style="width:100%;max-height:240px;object-fit:cover;border-radius:12px;margin-bottom:10px">`;

  h += `<div class="card"><div style="display:flex;align-items:center;gap:10px">
    ${chip(st)}
    <select data-change="status-manual" data-id="${a.id}" style="flex:1;min-height:40px">
      <option value="" ${!a.statusManual ? 'selected' : ''}>Статус: авто</option>
      ${Object.keys(STATUS).filter((k) => k !== 'unknown').map((k) =>
        `<option value="${k}" ${a.statusManual === k ? 'selected' : ''}>Вручную: ${STATUS[k].label}</option>`).join('')}
    </select></div>
    <div class="stat-line" style="margin-bottom:0">
      <div class="stat"><div class="v">${flights.length}</div><div class="k">${plural(flights.length, 'полёт', 'полёта', 'полётов')}</div></div>
      <div class="stat"><div class="v">${fmtDur(total)}</div><div class="k">налёт</div></div>
      <div class="stat"><div class="v">${flights[0] ? fmtDate(flights[0].date) : '—'}</div><div class="k">последний полёт</div></div>
    </div></div>`;

  h += `<button class="btn btn-primary" data-act="start-prep" data-id="${a.id}">Подготовка к полёту</button>`;

  // Паспорт
  const specs = [
    ['Тип', TYPES[a.type] || '—'], ['Производитель', a.manufacturer],
    ['Вес', a.weight ? a.weight + ' г' : ''], ['Размах', a.wingspan ? a.wingspan + ' мм' : ''],
  ].filter((x) => x[1]);
  if (specs.length) {
    h += '<div class="h2">Паспорт</div><div class="card">' +
      specs.map(([k, v]) => `<div style="display:flex;justify-content:space-between;padding:4px 0"><span class="muted">${k}</span><span>${esc(v)}</span></div>`).join('') +
      '</div>';
  }

  // Компоненты
  const comps = a.components || {};
  h += '<div class="h2">Компоненты</div><div class="card flat">';
  h += COMPONENTS.map(([key, label]) => {
    const c = comps[key];
    return rowBtn(`data-act="edit-comp" data-id="${a.id}" data-key="${key}"`,
      `<span class="grow"><span class="t">${label}</span>
       <span class="d">${c && c.name ? esc(c.name) : '<span class="muted">не указано</span>'}</span></span>`);
  }).join('');
  h += '</div>';

  // Обслуживание
  const maint = S.maintenance.filter((m) => m.aircraftId === a.id).sort((x, y) => (y.date || '').localeCompare(x.date || ''));
  const openM = maint.filter((m) => !m.done);
  h += `<div class="h2">Обслуживание</div><div class="card flat">`;
  if (openM.length) {
    h += openM.map((m) => rowBtn(`data-act="edit-maint" data-id="${m.id}"`,
      `<span class="grow"><span class="t">${esc(m.title)}</span>
       <span class="d">${MAINT_KINDS[m.kind] || ''} · ${fmtDate(m.date)}${m.next ? ' · далее: ' + esc(m.next) : ''}</span></span>`)).join('');
  } else {
    h += '<div class="row"><span class="grow muted small">Открытых работ нет</span></div>';
  }
  h += '</div>';
  h += `<button class="btn" data-act="add-maint" data-id="${a.id}">Добавить запись обслуживания</button>`;
  const doneM = maint.filter((m) => m.done);
  if (doneM.length) {
    h += `<details class="fold"><summary>История обслуживания (${doneM.length})</summary><div class="fold-body"><div class="card flat">`;
    h += doneM.map((m) => rowBtn(`data-act="edit-maint" data-id="${m.id}"`,
      `<span class="grow"><span class="t" style="color:var(--mut)">${esc(m.title)}</span>
       <span class="d">${MAINT_KINDS[m.kind] || ''} · ${fmtDate(m.date)}</span></span>`)).join('');
    h += '</div></div></details>';
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

  // Полёты
  if (flights.length) {
    h += `<div class="h2">Полёты</div><div class="card flat">` +
      flights.slice(0, 5).map(sessionRow).join('') + '</div>';
    if (flights.length > 5) h += `<button class="btn" data-nav="#/log">Весь журнал</button>`;
  }

  // Заметки
  if (a.notes) h += `<div class="h2">Заметки</div><div class="card" style="white-space:pre-wrap">${esc(a.notes)}</div>`;

  h += `<hr class="sep">
    <div class="btn-line">
      <button class="btn" data-act="export-model" data-id="${a.id}">Экспорт модели</button>
      <button class="btn btn-danger" data-act="del-model" data-id="${a.id}">Удалить</button>
    </div>`;
  return h;
}

/* ---------- Полёт ---------- */

function viewFlight() {
  let h = pageHead('Полёт');
  const act = activeSession();
  if (act) {
    const a = S.aircraft.find((x) => x.id === act.aircraftId);
    h += `<div class="banner warn">Идёт полёт: ${esc(a ? a.name : '')}.
      <button class="btn-sm btn right" data-nav="#/session/${act.id}">Открыть</button></div>`;
  } else if (UI.prep) {
    const a = S.aircraft.find((x) => x.id === UI.prep.aircraftId);
    h += `<div class="banner">Подготовка не закончена: ${esc(a ? a.name : '')}.
      <button class="btn-sm btn right" data-nav="#/prep">Продолжить</button></div>`;
  }
  if (!act) h += `<button class="btn btn-primary" data-act="start-prep">Начать подготовку</button>`;

  const done = S.sessions.filter((s) => s.end).sort((a, b) => b.start - a.start);
  if (done.length) {
    h += `<div class="h2">Журнал полётов</div><div class="card flat">` +
      done.slice(0, 10).map(sessionRow).join('') + '</div>';
    if (done.length > 10) h += `<button class="btn" data-nav="#/log">Весь журнал (${done.length})</button>`;
  } else if (!act && !S.aircraft.length) {
    h += emptyState('Сначала добавьте модель во «Флоте».', 'add-model', 'Добавить модель');
  }
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
    let h = pageHead('Подготовка', { back: '#/flight', sub: 'Выберите модель' });
    if (!S.aircraft.length) return h + emptyState('Нет моделей.', 'add-model', 'Добавить модель');
    h += '<div class="card flat">';
    h += S.aircraft.map((a) => rowBtn(`data-act="prep-model" data-id="${a.id}"`,
      `${aircraftThumb(a)}<span class="grow"><span class="t">${esc(a.name)}</span>
       <span class="d">${TYPES[a.type] || ''}</span></span>${chip(statusOf(a))}`)).join('');
    h += '</div>';
    return h;
  }

  // Шаг 2 — чек-лист.
  const a = S.aircraft.find((x) => x.id === UI.prep.aircraftId);
  if (!a) { UI.prep = null; return viewPrep(); }
  const tpls = templatesFor(a.type);
  const items = UI.prep.items;
  const doneCount = items.filter((i) => i.state).length;
  const fails = items.filter((i) => i.state === 'fail').length;

  let h = pageHead('Чек-лист', { back: '#/flight', sub: esc(a.name) });
  if (statusOf(a) === 'grounded') {
    h += `<div class="banner warn">Полёты этой модели запрещены вами. Снимите запрет в карточке модели, если готовы летать.</div>`;
  }
  if (tpls.length > 1) {
    h += field('Шаблон', selectHtml('tpl',
      tpls.map((t) => [t.id, t.name + (t.builtin ? '' : ' (свой)')]),
      UI.prep.tplId, 'data-change="prep-template"'));
  }
  h += `<div class="grid2">
    ${field('Локация', selectHtml('prepSite', siteOptions(), UI.prep.siteId, 'data-change="prep-site"'))}
    ${field('Аккумулятор', selectHtml('prepBatt', battOptions(), UI.prep.batteryId, 'data-change="prep-batt"'))}
  </div>`;
  h += `<div class="progress"><i style="width:${items.length ? Math.round(doneCount / items.length * 100) : 0}%"></i></div>
    <div class="small muted" style="margin-bottom:8px">${doneCount} из ${items.length} · касание: ок → проблема → пропуск</div>`;
  h += '<div class="card flat">';
  h += items.map((it, i) => `<button class="ck" data-act="ck-toggle" data-i="${i}" data-state="${it.state || ''}" style="width:100%;text-align:left">
      <span class="grow"><span class="t">${esc(it.t)}</span>${it.hint ? `<span class="d">${esc(it.hint)}</span>` : ''}</span>
      <span class="st">${it.state === 'ok' ? '✓' : it.state === 'fail' ? '✕' : it.state === 'skip' ? '—' : ''}</span>
    </button>`).join('');
  h += '</div>';
  if (fails) h += `<div class="banner warn">Отмечены проблемы: ${fails}. Убедитесь, что лететь безопасно, или устраните их.</div>`;
  h += `<button class="btn btn-primary" data-act="start-flight">START FLIGHT</button>
    <button class="btn" data-act="cancel-prep">Отменить подготовку</button>`;
  return h;
}

function viewSession() {
  const s = S.sessions.find((x) => x.id === UI.arg);
  if (!s) return pageHead('Полёт не найден', { back: '#/flight' });
  const a = S.aircraft.find((x) => x.id === s.aircraftId);
  let h = pageHead('Полёт', { back: '#/flight', sub: esc(a ? a.name : '') + ` · <span class="mono">#${String(s.flightNo).padStart(3, '0')}</span>` });
  if (!s.end) {
    h += `<div class="timer" id="timer">${fmtClock(Date.now() - s.start)}</div>
      <button class="btn btn-primary" data-act="finish-flight" data-id="${s.id}">Завершить полёт</button>
      <button class="btn" data-act="discard-flight" data-id="${s.id}">Отменить (не был полёт)</button>
      <p class="small muted center" style="margin-top:12px">Таймер идёт. Можно свернуть приложение — время не потеряется.</p>`;
  } else {
    h += sessionDetailHtml(s);
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
    ['Модель', a ? a.name : '—'],
    ['Длительность', fmtDur(s.durationMin)],
    ['Аккумулятор', b ? b.label : '—'],
    ['Локация', site ? site.name : '—'],
    ['Погода', s.weather || '—'],
    ['Результат', RESULTS[s.result] || '—'],
  ];
  let h = '<div class="card">' + rows.map(([k, v]) =>
    `<div style="display:flex;justify-content:space-between;gap:12px;padding:4px 0"><span class="muted">${k}</span><span style="text-align:right">${esc(v)}</span></div>`).join('') + '</div>';
  if (s.notes) h += `<div class="h2">Заметки</div><div class="card" style="white-space:pre-wrap">${esc(s.notes)}</div>`;
  if (s.problems) h += `<div class="h2">Проблемы</div><div class="card" style="white-space:pre-wrap;color:var(--warn)">${esc(s.problems)}</div>`;
  if (run) {
    h += `<details class="fold"><summary>Чек-лист перед полётом</summary><div class="fold-body"><div class="card flat">` +
      run.items.map((it) => `<div class="ck" data-state="${it.state || ''}">
        <span class="grow"><span class="t">${esc(it.t)}</span></span>
        <span class="st">${it.state === 'ok' ? '✓' : it.state === 'fail' ? '✕' : '—'}</span></div>`).join('') +
      '</div></div></details>';
  }
  return h;
}

function viewLog() {
  const done = S.sessions.filter((s) => s.end).sort((a, b) => b.start - a.start);
  let h = pageHead('Журнал полётов', { back: '#/flight', sub: `${done.length} ${plural(done.length, 'полёт', 'полёта', 'полётов')}` });
  if (!done.length) return h + emptyState('Полётов пока не было.');
  h += '<div class="card flat">' + done.map(sessionRow).join('') + '</div>';
  return h;
}

/* ---------- Сборы ---------- */

function viewPacking() {
  let h = pageHead('Сборы', { act: 'add-pack', actLabel: 'Новый набор' });
  if (!S.packing.length) return h + emptyState('Создайте набор «что взять с собой».', 'add-pack', 'Новый набор');
  h += '<div class="card flat">';
  h += S.packing.map((p) => {
    const done = p.items.filter((i) => i.done).length;
    return rowBtn(`data-nav="#/pack/${p.id}"`,
      `<span class="grow"><span class="t">${esc(p.name)}</span>
       <span class="d">${done} из ${p.items.length} собрано</span></span>`);
  }).join('');
  h += '</div>';
  return h;
}

function viewPack() {
  const p = S.packing.find((x) => x.id === UI.arg);
  if (!p) return pageHead('Набор не найден', { back: '#/packing' });
  const done = p.items.filter((i) => i.done).length;
  let h = pageHead(esc(p.name), { back: '#/packing', act: 'pack-reset', actLabel: 'Сбросить' });
  h += `<div class="progress"><i style="width:${p.items.length ? Math.round(done / p.items.length * 100) : 0}%"></i></div>
    <div class="small muted" style="margin-bottom:8px">${done} из ${p.items.length}</div>`;
  h += '<div class="card flat">';
  h += p.items.map((it, i) => `<div class="ck" data-state="${it.done ? 'ok' : ''}">
      <button class="grow" data-act="pack-toggle" data-i="${i}" style="text-align:left;min-height:36px">
        <span class="t">${esc(it.t)}</span></button>
      <button class="st" data-act="pack-toggle" data-i="${i}">${it.done ? '✓' : ''}</button>
      <button style="color:var(--dim);width:32px;min-height:36px" data-act="pack-del-item" data-i="${i}" aria-label="Удалить пункт">✕</button>
    </div>`).join('');
  h += '</div>';
  h += `<form data-form="pack-item" class="btn-line" style="margin-bottom:8px">
      <input type="text" name="t" placeholder="Свой пункт…" required style="flex:1">
      <button class="btn btn-sm" type="submit" style="min-height:48px">Добавить</button>
    </form>
    <button class="btn btn-danger" data-act="del-pack" data-id="${p.id}">Удалить набор</button>`;
  return h;
}

/* ---------- Окна для полётов (погода, online) ---------- */

// Оценка допустимого ветра (м/с), если пилот не задал свой порог.
// Считается от ПОЛНОГО веса (сухая модель + выбранная АКБ) и габаритов:
// лёгкие парусят, тяжёлые пробивают ветер; большой long-range квад
// (диагональ > 300 мм) инертнее и тяговооружён слабее фристайла.
// Шкала рассчитана на опытных пилотов (решение владельца, 2026-08-24).
// Калибровка по парку владельца (2026-08-25): Talon Pro + 6S3P ≈ 18,
// X8 ≈ 20, T2 + 6S2P ≈ 18, 5″ + 6S 1450 ≈ 20, 10″ + 6S 8000 ≈ 18.
function wxEstimate(a, battWeight) {
  let w = { quad: 20, plane: 16, wing: 18, other: 16 }[a.type] || WX_DEFAULT_WIND;
  const total = (a.weight || 0) + (battWeight || 0);
  if (total) {
    if (total < 250) w -= 6;
    else if (total < 600) w -= 2;
    else if (total > 2000) w += 2;
  }
  if (a.type === 'quad' && a.wingspan > 300) w -= 4;
  return Math.max(6, w);
}

// Порог ветра и высота полёта текущей выбранной модели (+ АКБ).
function wxLimits() {
  const a = S.aircraft.find((x) => x.id === UI.wx.aircraftId);
  if (!a) return { maxW: WX_DEFAULT_WIND, alt: 100, est: false, name: '', battName: '' };
  const b = S.batteries.find((x) => x.id === UI.wx.batteryId);
  return {
    maxW: a.maxWind || wxEstimate(a, b && b.weight),
    alt: a.maxAlt || WX_DEFAULT_ALT[a.type] || 100,
    est: !a.maxWind,
    name: a.name,
    battName: b ? b.label : '',
  };
}

// Уровни ветра Open-Meteo, попадающие в высоту полёта модели.
// Ветер выше высоты полёта модель не касается.
function wxLevels(alt) {
  const levels = [];
  if (alt > 40) levels.push(80);
  if (alt > 90) levels.push(120);
  if (alt > 140) levels.push(180);
  return levels;
}

// Иконка часа. Код WMO (weather_code) точнее всего различает туман и снег;
// если его нет (старый сохранённый прогноз) — обходимся осадками и облачностью.
// 45/48 — туман, 71-77 и 85/86 — снег, 51-67 и 80-82 — дождь, 95+ — гроза.
function wxIcon(hr) {
  const c = hr.code;
  let name;
  if (c != null) {
    if (c === 45 || c === 48) name = 'wxFog';
    else if ((c >= 71 && c <= 77) || c === 85 || c === 86) name = 'wxSnow';
    else if ((c >= 51 && c <= 67) || (c >= 80 && c <= 82) || c >= 95) name = 'wxRain';
    else if (c === 3) name = 'wxCloud';
    else if (c === 1 || c === 2) name = 'wxPartly';
    else name = 'wxSun';
  } else if (hr.pp >= 15 || hr.prec > 0.1) name = 'wxRain';
  else if (hr.cloud >= 85) name = 'wxCloud';
  else if (hr.cloud >= 40) name = 'wxPartly';
  else name = 'wxSun';
  // Ночью ясное и малооблачное небо — луна.
  if (!hr.light && (name === 'wxSun' || name === 'wxPartly')) name = 'wxMoon';
  return name;
}

// Окно «Как считается»: те же числа, что и в wxVerdict, — если правите
// пороги, поправьте и таблицу, иначе объяснение разойдётся с расчётом.
function wxHelpHtml() {
  const lim = wxLimits();
  const w = lim.maxW;
  const n = (x) => (Math.round(x * 10) / 10);
  const row = (what, bad, warn) => `<tr><td>${what}</td><td class="wx-bad">${bad}</td><td class="wx-warn">${warn}</td></tr>`;
  return `<p class="small muted">Порядок такой: <b>модель → место → дата</b>. Ограничения берутся
    из карточки модели, а не из общей константы.</p>
    <p class="small">Сейчас считаем для: <b>${lim.name ? esc(lim.name) : 'без модели'}</b>${lim.battName ? ' + <b>' + esc(lim.battName) + '</b>' : ''} —
    порог ${lim.est && lim.name ? 'примерно ' : ''}<b>${w} м/с</b>, высота полёта <b>${lim.alt} м</b>.
    ${lim.est && lim.name ? 'Порог оценён по полному весу (сухая модель + АКБ) и габаритам: задайте «Макс. ветер» в карточке, чтобы считать по-своему.' : ''}</p>

    <div class="h2">Вердикт часа</div>
    <p class="small muted">Достаточно одного сработавшего условия — берётся худшее.
    Пороги ниже — для простых условий (день, ясно).</p>
    <div class="tbl-wrap"><table class="tbl">
      <thead><tr><th>Что смотрим</th><th>Не стоит</th><th>На пределе</th></tr></thead>
      <tbody>
        ${row('Ветер у земли', `> ${w} м/с`, `> ${n(w * 0.8)} м/с`)}
        ${row('Ветер на высоте полёта', `> ${w} м/с`, `> ${n(w * 0.8)} м/с`)}
        ${row('Порывы', `> ${n(w * 1.4)} м/с`, `> ${n(w * 1.15)} м/с`)}
        ${row('Вероятность осадков', 'от 60 %', 'от 40 %')}
      </tbody>
    </table></div>

    <div class="h2">Сложные условия — порог ниже</div>
    <p class="small">Ночь не запрещает полёт, но управлять сложнее. В непростых условиях
    порог ветра умножается на коэффициент (условия перемножаются: ночь + морось = 0.8 × 0.85 ≈ 0.7):</p>
    <div class="tbl-wrap"><table class="tbl">
      <thead><tr><th>Условие</th><th></th><th>Порог для «${lim.name ? esc(lim.name) : 'модели'}»</th></tr></thead>
      <tbody>
        <tr><td>Темнота (ночь)</td><td>× 0.8</td><td>${n(w * 0.8)} м/с</td></tr>
        <tr><td>Туман днём</td><td>× 0.75</td><td>${n(w * 0.75)} м/с</td></tr>
        <tr><td>Морось, слабый дождь</td><td>× 0.85</td><td>${n(w * 0.85)} м/с</td></tr>
        <tr><td>Слабый снег</td><td>× 0.8</td><td>${n(w * 0.8)} м/с</td></tr>
      </tbody>
    </table></div>

    <div class="h2">Точно не стоит — при любом ветре</div>
    <p class="small">Явный дождь (от 0,2 мм/ч или коды умеренного и сильного дождя),
    снегопад, <b>метель</b> (снег при ветре сильнее 8 м/с), гроза и <b>туман ночью</b> —
    час всегда «не стоит».</p>

    <div class="h2">Ветер на высоте</div>
    <p class="small">Прогноз даёт ветер на 10, 80, 120 и 180 м. Берём только уровни в пределах
    высоты полёта модели и худший из них: выше 40 м — добавляется 80 м, выше 90 м — ещё 120 м,
    выше 140 м — ещё 180 м. Поэтому низколетящий квад не бракуется ветром на 180 метрах.</p>

    <div class="h2">Как складывается окно</div>
    <p class="small">Окно — это подряд идущие часы без вердикта «не стоит», ночные тоже.
    Часы «на пределе» в окно входят: решение за вами. Полоска у часа показывает худшее из
    ветра у земли, ветра на высоте и порывов (порывы делятся на 1,4) в долях от порога
    С УЧЁТОМ сложности условий этого часа.</p>

    <p class="small muted">Данные: Open-Meteo. Прогноз — ориентир, решение о вылете всегда за пилотом.</p>
    <button class="btn btn-primary" data-act="close-modal">Понятно</button>`;
}

// Ночью летают. Но в темноте, тумане и осадках управлять сложнее —
// вместо запрета порог ветра умножается на коэффициент сложности k.
// Возвращает {k, why}: множитель и человекочитаемые причины.
function wxDifficulty(hr) {
  let k = 1;
  const why = [];
  const c = hr.code;
  if (!hr.light) { k *= 0.8; why.push('ночь'); }
  if (c === 45 || c === 48) { k *= 0.75; why.push('туман'); }
  const drizzle = (c >= 51 && c <= 61) || c === 80
    || (c == null && hr.prec > 0 && hr.prec < 0.2);
  if (drizzle) { k *= 0.85; why.push('морось'); }
  else if (c === 71 || c === 85) { k *= 0.8; why.push('снег'); }
  return { k, why };
}

// Жёсткие запреты: час «не стоит» независимо от ветра и порогов.
// Коды WMO сверены с Open-Meteo (Context7 + живой запрос, 2026-08-25).
function wxHardStop(hr) {
  const c = hr.code;
  if (hr.prec >= 0.2 || hr.pp >= 60) return 'осадки';
  if (c == null) return '';
  if (c >= 95) return 'гроза';
  if (c === 63 || c === 65 || c === 66 || c === 67 || c === 81 || c === 82) return 'дождь';
  if (c === 73 || c === 75 || c === 77 || c === 86) return 'снегопад';
  if ((c === 71 || c === 85) && hr.w10 > 8) return 'метель';
  if ((c === 45 || c === 48) && !hr.light) return 'туман ночью';
  return '';
}

// Оценка часа: ok / warn / bad. Ветер сравнивается с эффективным
// порогом maxW × k (k — сложность условий: темнота, туман, осадки).
// alt — максимальный ветер на уровнях в пределах высоты полёта.
function wxVerdict(hr, maxW) {
  if (wxHardStop(hr)) return 'bad';
  const wEff = maxW * wxDifficulty(hr).k;
  if (hr.w10 > wEff || hr.alt > wEff || hr.gust > wEff * 1.4) return 'bad';
  if (hr.w10 > wEff * 0.8 || hr.alt > wEff * 0.8 || hr.gust > wEff * 1.15 || hr.pp >= 40) return 'warn';
  return 'ok';
}

function wxDay(json, dayIdx, maxW, altM) {
  const H = json.hourly;
  const date = (json.daily.time || [])[dayIdx];
  if (!date) return null;
  const levels = wxLevels(altM);
  const sunrise = json.daily.sunrise[dayIdx];
  const sunset = json.daily.sunset[dayIdx];
  const riseH = parseInt(sunrise.slice(11, 13), 10);
  const setH = parseInt(sunset.slice(11, 13), 10);
  const hours = [];
  for (let i = 0; i < H.time.length; i++) {
    if (!H.time[i].startsWith(date)) continue;
    const hh = parseInt(H.time[i].slice(11, 13), 10);
    const hr = {
      hh,
      light: hh >= riseH && hh <= setH,
      temp: H.temperature_2m[i],
      w10: H.wind_speed_10m[i],
      gust: H.wind_gusts_10m[i],
      alt: levels.length
        ? Math.max(...levels.map((l) => H['wind_speed_' + l + 'm'][i]))
        : H.wind_speed_10m[i],
      prec: H.precipitation[i],
      pp: H.precipitation_probability[i] || 0,
      cloud: H.cloud_cover[i],
      // Сохранённый прогноз мог быть запрошен без weather_code — отсюда защита.
      code: (H.weather_code || [])[i],
    };
    hr.verdict = wxVerdict(hr, maxW);
    hours.push(hr);
  }
  // Окна: подряд идущие часы без вердикта bad. Ночь не запрещает
  // полёт — она уже учтена коэффициентом сложности в вердикте.
  const windows = [];
  let run = null;
  hours.forEach((hr) => {
    if (hr.verdict !== 'bad') {
      if (!run) run = { from: hr.hh, to: hr.hh };
      else run.to = hr.hh;
    } else if (run) { windows.push(run); run = null; }
  });
  if (run) windows.push(run);
  return {
    date, hours, windows,
    topLevel: levels.length ? levels[levels.length - 1] : 0,
    sunrise: sunrise.slice(11, 16), sunset: sunset.slice(11, 16),
  };
}

async function wxLoad() {
  const wx = UI.wx;
  let lat, lon, place;
  if (wx.siteId === 'gps') {
    try {
      const pos = await new Promise((res, rej) =>
        navigator.geolocation.getCurrentPosition(res, rej, { timeout: 12000, maximumAge: 60000 }));
      lat = +pos.coords.latitude.toFixed(4);
      lon = +pos.coords.longitude.toFixed(4);
      place = 'Моё местоположение';
    } catch (e) {
      wx.error = 'Не удалось получить местоположение. Разрешите доступ к геопозиции или выберите локацию.';
      wx.loading = false;
      render();
      return;
    }
  } else {
    const s = S.sites.find((x) => x.id === wx.siteId);
    if (!s || s.lat == null) {
      wx.error = 'Выберите локацию с координатами или «Моё местоположение».';
      wx.loading = false;
      render();
      return;
    }
    lat = s.lat; lon = s.lon; place = s.name;
  }
  const url = WX_API + '?latitude=' + lat + '&longitude=' + lon +
    '&hourly=temperature_2m,precipitation,precipitation_probability,wind_speed_10m,wind_gusts_10m,wind_speed_80m,wind_speed_120m,wind_speed_180m,cloud_cover,weather_code' +
    '&daily=sunrise,sunset&wind_speed_unit=ms&timezone=' + encodeURIComponent(WX_TZ) + '&forecast_days=' + WX_DAYS;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const json = await res.json();
    if (!json.hourly || !json.daily) throw new Error('неожиданный ответ');
    wx.data = { fetched: Date.now(), place, json };
    wx.error = '';
    S.settings.weatherCache = wx.data;
    await saveSettings();
  } catch (e) {
    // TypeError у fetch — нет сети; navigator.onLine ненадёжен, на него не смотрим.
    wx.error = (e instanceof TypeError)
      ? 'Погода недоступна офлайн: нет связи с сервисом погоды. Приложение работает дальше.'
      : 'Не удалось загрузить прогноз: ' + (e && e.message);
  }
  wx.loading = false;
  render();
}

function wxDayOptions() {
  // 7 дней от «сегодня» ПО МСК; индекс совпадает с daily-массивами прогноза.
  const names = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
  const out = [];
  for (let i = 0; i < WX_DAYS; i++) {
    const d = new Date(wxTodayISO() + 'T12:00:00');
    d.setDate(d.getDate() + i);
    const label = i === 0 ? 'Сегодня' : i === 1 ? 'Завтра'
      : names[d.getDay()] + ', ' + d.getDate() + ' ' + MONTHS_RU[d.getMonth()];
    out.push([String(i), label]);
  }
  return out;
}

function viewWeather() {
  const wx = UI.wx;
  if (!wx.data && S.settings.weatherCache) wx.data = S.settings.weatherCache;
  const lim = wxLimits();
  const sitesWithCoords = S.sites.filter((s) => s.lat != null);

  let h = pageHead('Окна для полётов', {
    back: '#/today', sub: 'Модель · место · дата · <span class="badge online">online</span>',
    act: 'wx-help', actLabel: 'Пояснение',
  });

  if (!navigator.onLine && !wx.data) {
    h += `<div class="banner warn">Погода недоступна офлайн. Приложение продолжает работать —
      прогноз появится при подключении к сети.</div>`;
  }

  h += `<div class="card">`;
  h += field('Модель', selectHtml('wxmodel',
    [['', `Без модели (порог ${WX_DEFAULT_WIND} м/с, высота 100 м)`]]
      .concat(S.aircraft.map((a) => {
        const w = a.maxWind || wxEstimate(a, (S.batteries.find((x) => x.id === wx.batteryId) || {}).weight);
        const alt = a.maxAlt || WX_DEFAULT_ALT[a.type] || 100;
        return [a.id, `${a.name} · ${a.maxWind ? '' : '≈'}${w} м/с · до ${alt} м`];
      })),
    wx.aircraftId, 'data-change="weather-model"'),
    'Порог и высота — из карточки модели; «≈» — оценка по весу с АКБ и габаритам');
  if (wx.aircraftId && !(S.aircraft.find((a) => a.id === wx.aircraftId) || {}).maxWind) {
    h += field('Аккумулятор', selectHtml('wxbatt',
      [['', '— без АКБ (сухой вес) —']]
        .concat(S.batteries.filter((b) => b.status !== 'retired').map((b) => [b.id, b.label + (b.weight ? ' · ' + b.weight + ' г' : '')])),
      wx.batteryId, 'data-change="weather-batt"'),
      'Вес АКБ прибавляется к сухому весу модели в оценке порога');
  }
  h += field('Место', selectHtml('wxsite',
    [['', '— выберите —']]
      .concat(sitesWithCoords.map((s) => [s.id, s.name]))
      .concat([['gps', 'Моё местоположение (GPS)'], [NEW_OPT, '+ Добавить локацию…']]),
    wx.siteId, 'data-change="weather-site"'),
    sitesWithCoords.length ? '' : 'У локаций пока нет координат — выберите «+ Добавить локацию…»');
  h += field('Дата', selectHtml('wxday', wxDayOptions(), String(wx.day), 'data-change="weather-day"'));
  h += `<button class="btn btn-primary" data-act="weather-load" ${wx.loading ? 'disabled' : ''}>
    ${wx.loading ? 'Запрашиваю прогноз…' : 'Показать прогноз'}</button>`;
  h += '</div>';

  if (wx.error) h += `<div class="banner warn">${esc(wx.error)}</div>`;

  if (wx.data) {
    // Индекс дня привязан к датам прогноза: вчерашний кэш не сдвигает дни.
    const baseIdx = (wx.data.json.daily.time || []).indexOf(wxTodayISO());
    const day = baseIdx < 0 ? null : wxDay(wx.data.json, baseIdx + wx.day, lim.maxW, lim.alt);
    const age = Date.now() - wx.data.fetched;
    const ago = age < 90000 ? 'только что'
      : age < 3600000 ? Math.round(age / 60000) + ' мин назад'
      : Math.round(age / 3600000) + ' ч назад';
    h += `<p class="small muted">${esc(wx.data.place)} · прогноз получен ${ago}
      ${age > 3 * 3600 * 1000 ? ' — <span style="color:var(--warn)">устарел, обновите</span>' : ''}</p>`;
    if (!day) {
      h += `<div class="banner warn">Сохранённый прогноз устарел или не покрывает эту дату — нажмите «Показать прогноз».</div>`;
    } else {
      if (day.windows.length) {
        h += `<div class="banner ok" style="font-size:16px"><span>Можно лететь:
          <strong>${day.windows.map((w) =>
            `${String(w.from).padStart(2, '0')}:00–${String(w.to + 1).padStart(2, '0')}:00`).join('</strong> и <strong>')}</strong></span></div>`;
      } else {
        h += `<div class="banner warn" style="font-size:16px">Сегодня лучше не лететь${lim.name ? ' на «' + esc(lim.name) + '»' : ''}:
          весь день ветер выше ${lim.maxW} м/с или осадки.</div>`;
      }
      h += `<div class="small muted" style="margin-bottom:8px">
        ${lim.name ? '«' + esc(lim.name) + '» держит' : 'Порог'} ${lim.est && lim.name ? 'примерно ' : ''}до ${lim.maxW} м/с ·
        летает до ${lim.alt} м · восход ${day.sunrise} · закат ${day.sunset}</div>`;

      h += `<div class="h2">Час за часом</div>
        <p class="small muted" style="margin-bottom:8px">Полоска — сколько «съедено» от допустимого ветра
        модели: берём худшее из ветра у земли${day.topLevel ? `, ветра на высоте (${day.topLevel} м)` : ''}
        и порывов. Короткая зелёная — спокойно; полная красная — за пределом.</p>`;
      h += '<div class="card flat">';
      h += day.hours.map((hr) => {
        const diff = wxDifficulty(hr);
        const stop = wxHardStop(hr);
        const wEff = lim.maxW * diff.k;
        const worst = Math.max(hr.w10, hr.alt, hr.gust / 1.4);
        const load = Math.min(1.15, worst / wEff);
        const col = hr.verdict === 'ok' ? 'var(--ok)' : hr.verdict === 'warn' ? 'var(--warn)' : 'var(--bad)';
        const word = hr.verdict === 'ok' ? 'можно' : hr.verdict === 'warn' ? 'на пределе' : 'не стоит';
        const chipCls = hr.verdict === 'ok' ? 'st-ready' : hr.verdict === 'warn' ? 'st-check' : 'st-grounded';
        const rain = !stop && (hr.pp >= 15 || hr.prec > 0.1) ? ` · дождь ${hr.pp}%` : '';
        const marks = (stop ? [stop] : diff.why).map((t) => ' · ' + t).join('');
        return `<div class="wxr${hr.light ? '' : ' night'}">
          <div class="wxr-top">
            <span class="mono nowrap">${String(hr.hh).padStart(2, '0')}:00</span>
            <span class="wx-ic">${ICONS[wxIcon(hr)]}</span>
            <div class="gauge"><i style="width:${Math.round(load * 100 / 1.15)}%;background:${col}"></i></div>
            <span class="chip ${chipCls}">${word}</span>
          </div>
          <div class="wxr-sub">ветер у земли ${hr.w10.toFixed(0)} м/с${day.topLevel
            ? ` · на высоте ${hr.alt.toFixed(0)}` : ''} · порывы до ${hr.gust.toFixed(0)} · ${Math.round(hr.temp)}°${rain}${marks}</div>
        </div>`;
      }).join('');
      h += '</div>';
      const wlat = wx.data.json.latitude, wlon = wx.data.json.longitude;
      h += `<a class="btn" style="margin-top:8px" href="https://www.windy.com/?${wlat},${wlon},11"
        target="_blank" rel="noopener noreferrer">Открыть в Windy <span class="badge online">online</span></a>`;
      h += `<p class="small muted" style="margin-top:8px">Данные: Open-Meteo (бесплатно, без регистрации).
        Прогноз — ориентир, решение о вылете всегда за пилотом.</p>`;
    }
  }
  return h;
}

/* ---------- Ещё ---------- */

function viewMore() {
  const ver = ($('meta[name="build"]') || {}).content || 'dev';
  let h = pageHead('Ещё');
  h += '<div class="card flat">';
  h += rowBtn('data-nav="#/weather"', `<span class="grow"><span class="t">Окна для полётов <span class="badge online">online</span></span><span class="d">Погода по локации: когда можно лететь</span></span>`, 'weather');
  h += rowBtn('data-nav="#/tools"', `<span class="grow"><span class="t">Инструменты</span><span class="d">Конфигураторы, прошивки, калькуляторы</span></span>`, 'tools');
  h += rowBtn('data-nav="#/sites"', `<span class="grow"><span class="t">Локации</span><span class="d">Запомненные места полётов</span></span>`, 'sites');
  h += rowBtn('data-nav="#/templates"', `<span class="grow"><span class="t">Шаблоны чек-листов</span><span class="d">Свои предполётные проверки</span></span>`, 'templates');
  h += rowBtn('data-nav="#/backup"', `<span class="grow"><span class="t">Данные и резервная копия</span><span class="d">Экспорт, импорт, восстановление</span></span>`, 'backup');
  h += '</div>';

  h += '<div class="h2">Настройки</div><div class="card">';
  h += field('Тема', `<div class="seg">
    <button data-act="theme-set" data-theme="dark" aria-pressed="${document.documentElement.dataset.theme !== 'light'}">Тёмная</button>
    <button data-act="theme-set" data-theme="light" aria-pressed="${document.documentElement.dataset.theme === 'light'}">Светлая</button>
  </div>`);
  h += `<form data-form="pilot">` + field('Имя пилота / позывной',
    `<input type="text" name="pilot" value="${esc(S.settings.pilot || '')}" placeholder="необязательно">`) +
    `<button class="btn btn-sm" type="submit">Сохранить</button></form>`;
  h += '</div>';

  h += '<div class="card flat">';
  if (UI.updateReady) {
    h += rowBtn('data-act="update-app"', `<span class="grow"><span class="t" style="color:var(--ok)">Обновить приложение</span><span class="d">Новая версия готова</span></span>`, 'update');
  }
  h += rowBtn('data-act="whatsnew"', `<span class="grow"><span class="t">Что нового</span><span class="d">История изменений</span></span>`, 'whatsnew');
  h += rowBtn('data-nav="#/privacy"', `<span class="grow"><span class="t">Приватность</span><span class="d">Где живут ваши данные</span></span>`, 'privacy');
  h += '</div>';

  h += `<p class="small muted center" style="margin-top:16px">RC Planner · версия ${esc((RC.CHANGELOG[0] || {}).v || '—')} · сборка <span class="mono">${esc(ver)}</span><br>
    Ваши данные хранятся на этом устройстве.</p>`;
  return h;
}

function viewTools() {
  let h = pageHead('Инструменты', { back: '#/more' });
  h += `<div class="banner">Инструменты открываются в браузере и требуют интернет.
    Само приложение работает офлайн.</div>`;
  const fav = S.settings.favTools || [];
  const favTools = RC.TOOLS.filter((t) => fav.includes(t.id));
  const toolRow = (t) => `<div class="row">
      <span class="grow"><span class="t">${esc(t.name)} <span class="badge online">online</span></span>
      <span class="d">${esc(t.desc)}</span>
      <span class="d muted">Источник: ${esc(t.src)}</span></span>
      <button style="width:40px;min-height:40px;font-size:20px;color:${fav.includes(t.id) ? 'var(--warn)' : 'var(--dim)'}"
        data-act="tool-fav" data-id="${t.id}" aria-label="В избранное">${fav.includes(t.id) ? '★' : '☆'}</button>
      <a class="btn btn-sm" href="${esc(t.url)}" target="_blank" rel="noopener noreferrer">Открыть</a>
    </div>`;
  if (favTools.length) {
    h += '<div class="h2">Избранное</div><div class="card flat">' + favTools.map(toolRow).join('') + '</div>';
  }
  RC.TOOL_CATS.forEach((cat) => {
    const list = RC.TOOLS.filter((t) => t.cat === cat.id);
    h += `<details class="fold"><summary>${esc(cat.name)} (${list.length})</summary>
      <div class="fold-body"><div class="card flat">${list.map(toolRow).join('')}</div></div></details>`;
  });
  h += `<p class="small muted" style="margin-top:12px">Каталог — ссылки на официальные источники.
    Приложение не копирует сторонние сервисы и не распространяет чужие прошивки.</p>`;
  return h;
}

function mapLinks(s) {
  if (s.lat == null || s.lon == null) return '';
  const ya = `https://yandex.ru/maps/?pt=${s.lon},${s.lat}&z=15&l=map`;
  const osm = `https://www.openstreetmap.org/?mlat=${s.lat}&mlon=${s.lon}#map=15/${s.lat}/${s.lon}`;
  return `<a class="btn btn-sm" href="${ya}" target="_blank" rel="noopener noreferrer">Я.Карты</a>
    <a class="btn btn-sm" href="${osm}" target="_blank" rel="noopener noreferrer">OSM</a>`;
}

function viewSites() {
  let h = pageHead('Локации', { back: '#/more', act: 'add-site', actLabel: 'Добавить' });
  if (!S.sites.length) return h + emptyState('Запомните места, где летаете: поле, парк, склон.', 'add-site', 'Добавить локацию');
  h += '<div class="card flat">';
  h += S.sites.map((s) => `<div class="row">
    <button class="grow" data-act="edit-site" data-id="${s.id}" style="text-align:left;min-height:40px">
      <span class="t">${esc(s.name)}${s.isDefault ? ' <span class="badge">основная</span>' : ''}</span>
      <span class="d">${esc(s.place || '')}${s.lat != null ? `${s.place ? ' · ' : ''}<span class="mono">${s.lat}, ${s.lon}</span>` : ' · без координат'}</span>
    </button>
    ${mapLinks(s)}
  </div>`).join('');
  h += '</div>';
  h += `<p class="small muted" style="margin-top:10px">Координаты открывают локацию на внешней карте
    <span class="badge online">online</span> и включают окна погоды. Проще всего — кнопка
    «Определить по GPS» прямо на поле.</p>`;
  return h;
}

function viewBatteries() {
  let h = pageHead('Флот', { act: 'add-batt', actLabel: 'Добавить' }) + fleetSeg('batteries');
  if (!S.batteries.length) return h + emptyState('Заведите парк батарей — циклы будут считаться по полётам.', 'add-batt', 'Добавить АКБ');
  h += '<div class="card flat">';
  h += S.batteries.map((b) => rowBtn(`data-act="edit-batt" data-id="${b.id}"`,
    `<span class="grow"><span class="t">${esc(b.label)}</span>
     <span class="d">${esc(b.chem || '')} ${b.cells ? b.cells + 'S' : ''}${b.p > 1 ? b.p + 'P' : ''} ${b.capacity ? '· ' + b.capacity + ' мА·ч' : ''}${b.weight ? ' · ' + b.weight + ' г' : ''} · ${b.cycles || 0} циклов</span></span>
     ${b.status === 'retired' ? '<span class="chip st-grounded">Списан</span>' : b.status === 'watch' ? '<span class="chip st-check">Следить</span>' : ''}`)).join('');
  h += '</div>';
  return h;
}

function viewTemplates() {
  let h = pageHead('Шаблоны чек-листов', { back: '#/more', act: 'add-template', actLabel: 'Создать' });
  h += '<div class="h2">Встроенные</div><div class="card flat">';
  h += RC.CHECKLISTS.map((t) => `<div class="row"><span class="grow">
    <span class="t">${esc(t.name)}</span><span class="d">${t.items.length} пунктов · ${TYPES[t.type] || ''}</span></span></div>`).join('');
  h += '</div>';
  if (S.templates.length) {
    h += '<div class="h2">Свои</div><div class="card flat">';
    h += S.templates.map((t) => rowBtn(`data-act="edit-template" data-id="${t.id}"`,
      `<span class="grow"><span class="t">${esc(t.name)}</span>
       <span class="d">${t.items.length} пунктов · ${t.type === 'any' ? 'любой тип' : TYPES[t.type] || ''}</span></span>`)).join('');
    h += '</div>';
  } else {
    h += '<p class="small muted" style="margin-top:10px">Свой шаблон появится в списке при подготовке к полёту подходящей модели.</p>';
  }
  return h;
}

function viewBackup() {
  const counts = `${S.aircraft.length} ${plural(S.aircraft.length, 'модель', 'модели', 'моделей')}, ` +
    `${S.sessions.filter((s) => s.end).length} ${plural(S.sessions.length, 'полёт', 'полёта', 'полётов')}, ` +
    `${S.configs.length} ${plural(S.configs.length, 'конфигурация', 'конфигурации', 'конфигураций')}`;
  let h = pageHead('Данные', { back: '#/more', sub: counts });
  h += `<div class="banner">Все данные RC Planner живут в этом браузере на этом устройстве.
    Резервная копия — обычный файл, вы сами решаете, где его хранить.</div>`;
  h += `<button class="btn btn-primary" data-act="export-all">Сохранить резервную копию</button>`;
  h += `<div class="card" style="margin-top:8px">` +
    field('Восстановить из файла', `<input type="file" accept=".rcpilot,.json,application/json" data-change="import-file">`,
      'Файл .rcpilot или .json, созданный RC Planner') + '</div>';
  h += `<hr class="sep"><button class="btn btn-danger" data-act="wipe-all">Стереть все данные</button>
    <p class="small muted" style="margin-top:8px">Удаляет всё с этого устройства. Копий нигде нет —
    восстановить можно будет только из вашего файла резервной копии.</p>`;
  return h;
}

function viewPrivacy() {
  let h = pageHead('Приватность', { back: '#/more' });
  h += `<div class="card">
    <p><strong>Ваши данные хранятся на этом устройстве.</strong></p>
    <p style="margin-top:8px">RC Planner работает без сервера, аккаунтов и регистрации. Модели, полёты,
    чек-листы, конфигурации и фотографии лежат в локальной базе браузера (IndexedDB) и не отправляются
    в интернет — в приложении просто нет кода, который бы это делал.</p>
    <p style="margin-top:8px">Нет аналитики, счётчиков и рекламы. Единственный сетевой запрос —
    проверка обновления самой страницы приложения.</p>
    <p style="margin-top:8px">Раздел «Инструменты» — ссылки на сторонние сайты: они открываются
    в браузере и работают по своим правилам. Такие функции помечены значком
    <span class="badge online">online</span>.</p>
    <p style="margin-top:8px">Удаление данных в настройках стирает их безвозвратно: копий нигде нет.
    Резервная копия — файл, который вы сохраняете сами.</p>
  </div>`;
  return h;
}

/* ============================================================
   7. ДЕЙСТВИЯ
============================================================ */

const MAINT_KINDS = {
  repair: 'Ремонт', replace: 'Замена', firmware: 'Прошивка',
  inspection: 'Осмотр', task: 'Задача',
};

const ACTIONS = {
  'close-modal': () => dismissModal(),
  'dismiss-hi': () => { lsSet('rcp.hi', '1'); render(); },
  // «Назад» ведёт туда, откуда пришли; на глубокой ссылке — по запасному маршруту.
  'nav-back': (el) => {
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
    openModal('Новая модель', `<div class="card flat">` +
      rowBtn('data-act="model-empty"',
        `<span class="grow"><span class="t">Пустая модель</span><span class="d">Заполню сам</span></span>`) +
      RC.AIRCRAFT_PRESETS.map((p, i) => rowBtn(`data-act="model-preset" data-i="${i}"`,
        `<span class="grow"><span class="t">${esc(p.name)}</span><span class="d">${esc(p.desc)}</span></span>`,
        ICONS[p.type] ? p.type : 'plane')).join('') +
      `</div><p class="small muted" style="margin-top:8px">Готовые платформы приходят с заводскими ТТХ
      и типовой комплектацией — всё можно поменять в карточке.</p>`);
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
    'Удалить модель вместе с историей полётов, обслуживанием и конфигурациями? Это нельзя отменить.',
    'del-model-yes', `data-id="${el.dataset.id}"`),
  'del-model-yes': async (el) => {
    const id = el.dataset.id;
    for (const st of ['sessions', 'runs', 'maintenance', 'configs']) {
      for (const r of S[st].filter((x) => x.aircraftId === id)) await RCDB.del(st, r.id);
      S[st] = await RCDB.all(st);
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
    const label = (COMPONENTS.find((x) => x[0] === key) || [])[1] || key;
    openModal(label, `<form data-form="comp" data-id="${a.id}" data-key="${key}">
      ${field('Название / модель', `<input type="text" name="name" value="${esc(c.name || '')}" placeholder="напр. T-Motor F60 2550KV">`)}
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
    if (activeSession()) { go('#/session/' + activeSession().id); return; }
    if (el.dataset.id) beginPrep(el.dataset.id);
    else UI.prep = null;
    go('#/prep');
  },
  'prep-model': (el) => { beginPrep(el.dataset.id); render(); },
  'ck-toggle': (el) => {
    const it = UI.prep && UI.prep.items[+el.dataset.i];
    if (!it) return;
    const order = [null, 'ok', 'fail', 'skip'];
    it.state = order[(order.indexOf(it.state || null) + 1) % order.length];
    render(true);
  },
  'cancel-prep': () => { UI.prep = null; go('#/flight'); },
  'start-flight': async () => {
    const p = UI.prep;
    if (!p) return;
    const run = {
      id: uid(), aircraftId: p.aircraftId, date: todayISO(),
      templateName: (templatesFor((S.aircraft.find((a) => a.id === p.aircraftId) || {}).type).find((t) => t.id === p.tplId) || {}).name || '',
      items: p.items.map((i) => ({ t: i.t, state: i.state })),
    };
    await put('runs', run);
    const flightNo = sessionsOf(p.aircraftId).length + 1;
    const s = {
      id: uid(), aircraftId: p.aircraftId, date: todayISO(),
      start: Date.now(), end: null, durationMin: null, flightNo,
      batteryId: p.batteryId || '', siteId: p.siteId || '',
      weather: '', result: '', notes: '', problems: '', checklistRunId: run.id,
    };
    await put('sessions', s);
    UI.prep = null;
    go('#/session/' + s.id);
  },
  'finish-flight': (el) => openFinishForm(el.dataset.id),
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
    openModal(`Полёт <span class="mono">#${String(s.flightNo).padStart(3, '0')}</span>`,
      sessionDetailHtml(s) + `<div class="spacer"></div>
      <button class="btn btn-danger" data-act="del-session" data-id="${s.id}">Удалить запись</button>`);
  },
  'del-session': (el) => confirmModal('Удалить запись о полёте?', 'del-session-yes', `data-id="${el.dataset.id}"`),
  'del-session-yes': async (el) => { await del('sessions', el.dataset.id); closeModal(); render(); },

  /* --- Обслуживание --- */
  'add-maint': (el) => openMaintForm(null, el.dataset.id),
  'edit-maint': (el) => openMaintForm(S.maintenance.find((m) => m.id === el.dataset.id)),
  'del-maint': (el) => confirmModal('Удалить запись обслуживания?', 'del-maint-yes', `data-id="${el.dataset.id}"`),
  'del-maint-yes': async (el) => { await del('maintenance', el.dataset.id); closeModal(); render(); },

  /* --- Конфигурации --- */
  'add-config': (el) => {
    const a = S.aircraft.find((x) => x.id === el.dataset.id);
    const groups = [...new Set(S.configs.filter((c) => c.aircraftId === a.id).map((c) => c.group))];
    openModal('Сохранить конфигурацию', `<form data-form="config" data-id="${a.id}">
      ${field('Раздел', `<input type="text" name="group" list="cfg-groups" value="" placeholder="напр. Betaflight, ELRS, VTX" required>
        <datalist id="cfg-groups">${groups.map((g) => `<option value="${esc(g)}">`).join('')}</datalist>`,
        'Версии внутри одного раздела можно сравнивать')}
      ${field('Комментарий', `<input type="text" name="label" placeholder="что изменилось, напр. «поднял rates»">`)}
      ${field('Текст (CLI dump / diff)', `<textarea name="text" placeholder="вставьте diff all из CLI…" style="min-height:120px"></textarea>`)}
      ${field('Или файл', `<input type="file" name="file">`, 'Файл конфигурации или прошивки хранится локально')}
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
        <button style="color:var(--dim);width:32px;min-height:36px" data-act="del-config" data-id="${c.id}" aria-label="Удалить">✕</button>
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
  // Карта Яндекса внутри формы локации. iframe создаётся через DOM:
  // сборка сторожит литерал «айфрейм» как офлайн-нарушение, а это —
  // online-функция по явному действию пользователя (CSP: frame-src yandex.ru).
  'site-map': () => {
    const box = $('#modal-root .site-map-box');
    if (!box) return;
    if (!box.hidden) { box.hidden = true; box.innerHTML = ''; return; }
    const form = box.closest('form');
    const nums = String(new FormData(form).get('coords') || '').match(/-?\d+\.\d+|-?\d+/g) || [];
    const lat = parseFloat(nums[0]), lon = parseFloat(nums[1]);
    const has = isFinite(lat) && isFinite(lon);
    const fr = document.createElement('iframe');
    fr.src = 'https://yandex.ru/map-widget/v1/?z=' + (has ? 15 : 9)
      + '&ll=' + (has ? lon + ',' + lat : '37.62,55.75')
      + (has ? '&pt=' + lon + ',' + lat : '');
    fr.setAttribute('loading', 'lazy');
    fr.style.cssText = 'width:100%;height:320px;border:0;border-radius:10px';
    box.hidden = false;
    box.innerHTML = '';
    box.appendChild(fr);
    fr.addEventListener('error', () => { box.innerHTML = '<div class="banner warn">Карта недоступна офлайн.</div>'; });
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
  'wx-help': () => openModal('Как считается окно', wxHelpHtml()),
  'weather-load': () => {
    UI.wx.loading = true;
    UI.wx.error = '';
    render(true);
    wxLoad();
  },

  'add-site': () => openSiteForm(null),
  'edit-site': (el) => openSiteForm(S.sites.find((s) => s.id === el.dataset.id)),
  'del-site': (el) => confirmModal('Удалить локацию?', 'del-site-yes', `data-id="${el.dataset.id}"`),
  'del-site-yes': async (el) => { await del('sites', el.dataset.id); closeModal(); render(); },

  'add-batt': () => openBattForm(null),
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
    await exportData(snap, 'rc-planner-backup-' + todayISO() + '.rcpilot', 'full');
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
    document.documentElement.dataset.theme = el.dataset.theme;
    lsSet('rcp.theme', el.dataset.theme);
    const meta = $('meta[name="theme-color"]');
    if (meta) meta.content = el.dataset.theme === 'light' ? '#f2f3f5' : '#14181e';
    render();
  },
  'whatsnew': () => showWhatsNew(true),
  'update-app': () => {
    if (SWREG && SWREG.waiting) SWREG.waiting.postMessage({ type: 'SKIP_WAITING' });
  },
};

function beginPrep(aircraftId) {
  const a = S.aircraft.find((x) => x.id === aircraftId);
  if (!a) return;
  const tpl = templatesFor(a.type)[0];
  UI.prep = {
    aircraftId,
    tplId: tpl.id,
    items: tpl.items.map((i) => ({ t: i.t, hint: i.hint || '', state: null })),
    siteId: (S.sites.find((x) => x.isDefault) || {}).id || '',
    batteryId: '',
  };
}

/* ============================================================
   8. ФОРМЫ
============================================================ */

// Класс модели выбирается иконками: quad / plane / wing / other.
// Значение уезжает в скрытое поле — форма читается как раньше.
function typePicker(current) {
  const cur = TYPES[current] ? current : 'quad';
  return `<div class="seg seg-ic">` + Object.keys(TYPES).map((t) =>
    `<button type="button" data-act="type-pick" data-type="${t}" aria-pressed="${t === cur}">
      ${ICONS[t] || ICONS.other}<span>${TYPES[t]}</span></button>`).join('') +
    `</div><input type="hidden" name="type" value="${cur}">`;
}

function openModelForm(a, presetId) {
  const isNew = !a || !a.id;
  a = a || { type: 'quad' };
  const title = a.id ? 'Изменить модель' : presetId ? 'Новая модель · проверьте ТТХ' : 'Новая модель';
  openModal(title, `<form data-form="model" ${a.id ? `data-id="${a.id}"` : ''} ${presetId ? `data-preset="${presetId}"` : ''}>
    ${field('Название', `<input type="text" name="name" required value="${esc(a.name || '')}" placeholder="напр. Mini Talon">`)}
    ${field('Тип', typePicker(a.type))}
    <div class="grid2">
      ${field('Производитель', `<input type="text" name="manufacturer" value="${esc(a.manufacturer || '')}">`)}
      ${field('Вес, г', `<input type="number" name="weight" min="0" value="${a.weight || ''}">`)}
    </div>
    ${field('Размах / диагональ, мм', `<input type="number" name="wingspan" min="0" value="${a.wingspan || ''}">`)}
    <div class="grid2">
      ${field('Макс. ветер, м/с', `<input type="number" name="maxWind" min="1" max="60" step="0.5" value="${a.maxWind || ''}" placeholder="≈${wxEstimate(a)}">`, 'пусто — оценка по ТТХ')}
      ${field('Высота полёта, м', `<input type="number" name="maxAlt" min="10" max="200" step="10" value="${a.maxAlt || ''}" placeholder="${WX_DEFAULT_ALT[a.type] || 100}">`, 'для окон погоды, до 200')}
    </div>
    ${field('Фото', `<input type="file" name="photo" accept="image/*">`, a.photo ? 'Фото уже есть — новое заменит его' : '')}
    ${field('Заметки', `<textarea name="notes">${esc(a.notes || '')}</textarea>`)}
    <button class="btn btn-primary" type="submit">${isNew ? 'Добавить' : 'Сохранить'}</button>
  </form>`);
}

function openMaintForm(m, aircraftId) {
  const isNew = !m;
  m = m || { aircraftId, date: todayISO(), kind: 'repair' };
  openModal(isNew ? 'Обслуживание' : 'Изменить запись', `<form data-form="maint" ${m.id ? `data-id="${m.id}"` : `data-aid="${m.aircraftId}"`}>
    ${field('Что сделано / нужно сделать', `<input type="text" name="title" required value="${esc(m.title || '')}" placeholder="напр. Замена мотора №3">`)}
    <div class="grid2">
      ${field('Тип', selectHtml('kind', Object.entries(MAINT_KINDS), m.kind))}
      ${field('Дата', `<input type="date" name="date" value="${esc(m.date || todayISO())}">`)}
    </div>
    ${field('Причина', `<input type="text" name="reason" value="${esc(m.reason || '')}" placeholder="напр. шум подшипника">`)}
    ${field('Следующее действие', `<input type="text" name="next" value="${esc(m.next || '')}" placeholder="напр. осмотр через 10 полётов">`)}
    ${field('', `<label style="display:flex;gap:10px;align-items:center;color:var(--text);font-size:16px">
      <input type="checkbox" name="done" ${m.done ? 'checked' : ''} style="width:22px;height:22px"> Выполнено</label>`)}
    <button class="btn btn-primary" type="submit">Сохранить</button>
    ${m.id ? `<button class="btn btn-danger" type="button" data-act="del-maint" data-id="${m.id}">Удалить</button>` : ''}
  </form>`);
}

function openSiteForm(s) {
  const isNew = !s;
  s = s || {};
  openModal(isNew ? 'Новая локация' : 'Изменить локацию', `<form data-form="site" ${s.id ? `data-id="${s.id}"` : ''}>
    ${field('Название', `<input type="text" name="name" required value="${esc(s.name || '')}" placeholder="напр. Поле за деревней">`)}
    ${field('Где это', `<input type="text" name="place" value="${esc(s.place || '')}" placeholder="адрес или описание">`)}
    ${field('Координаты', `<input type="text" name="coords" inputmode="text" value="${s.lat != null ? s.lat + ', ' + s.lon : ''}" placeholder="55.7558, 37.6176">`,
      'Вставьте одной строкой из Яндекс.Карт или Google Maps (широта, долгота)')}
    <div class="btn-line">
      <button class="btn" type="button" data-act="site-gps">Определить по GPS</button>
      <button class="btn" type="button" data-act="site-map">Карта <span class="badge online">online</span></button>
    </div>
    <div class="site-map-box" hidden></div>
    <div class="hint" style="margin:-4px 0 10px">Координаты нужны для окон погоды. GPS работает без
      интернета; карта — Яндекс, прямо здесь: найдите точку и скопируйте координаты из её карточки.</div>
    ${field('Заметки', `<textarea name="notes" placeholder="подъезд, ЛЭП, запретные зоны рядом">${esc(s.notes || '')}</textarea>`)}
    ${field('', `<label style="display:flex;gap:10px;align-items:center;color:var(--text);font-size:16px">
      <input type="checkbox" name="isDefault" ${s.isDefault ? 'checked' : ''} style="width:22px;height:22px"> Основная локация</label>`)}
    <button class="btn btn-primary" type="submit">Сохранить</button>
    ${s.id ? `<button class="btn btn-danger" type="button" data-act="del-site" data-id="${s.id}">Удалить</button>` : ''}
  </form>`);
}

// Оценка веса пакета (г) по химии, банкам и ёмкости — типовая удельная
// энергия с проводами. Всегда правится вручную в форме.
function battEstimateWeight(chem, cells, capacity) {
  if (!cells || !capacity) return 0;
  const dens = { LiPo: 145, 'Li-Ion': 220, LiFe: 110, NiMH: 75 }[chem] || 145;
  const wh = capacity / 1000 * cells * 3.7;
  return Math.round(wh / dens * 1000 / 10) * 10;
}

function openBattForm(b, presetId) {
  const isNew = !b || !b.id;
  b = b || { chem: 'LiPo', status: 'ok' };
  const title = b.id ? 'Аккумулятор' : presetId ? 'Новый аккумулятор · проверьте' : 'Новый аккумулятор';
  openModal(title, `<form data-form="batt" ${b.id ? `data-id="${b.id}"` : ''}>
    ${isNew && !presetId && RC.BATTERY_PRESETS.length ? field('Готовые сборки',
      selectHtml('battpreset', [['', '— или заполните вручную —']].concat(RC.BATTERY_PRESETS.map((p) => [p.id, p.label + ' · ' + p.desc])), '', 'data-change="batt-preset"')) : ''}
    ${field('Метка', `<input type="text" name="label" required value="${esc(b.label || '')}" placeholder="напр. LiPo 4S #3">`)}
    <div class="grid2">
      ${field('Химия', selectHtml('chem', [['LiPo', 'LiPo'], ['Li-Ion', 'Li-Ion'], ['LiFe', 'LiFe'], ['NiMH', 'NiMH']], b.chem))}
      ${field('Банки (S / P)', `<div style="display:flex;gap:8px;align-items:center">
        <input type="number" name="cells" min="1" max="14" value="${b.cells || ''}" placeholder="6" style="flex:1">
        <span class="muted">S ×</span>
        <input type="number" name="p" min="1" max="10" value="${b.p || ''}" placeholder="1" style="flex:1">
        <span class="muted">P</span></div>`)}
    </div>
    <div class="grid2">
      ${field('Ёмкость, мА·ч', `<input type="number" name="capacity" min="0" value="${b.capacity || ''}">`)}
      ${field('Вес, г', `<input type="number" name="weight" min="0" value="${b.weight || ''}" placeholder="${battEstimateWeight(b.chem, b.cells, b.capacity) || 'оценю сам'}">`,
        'пусто — оценка по химии и ёмкости')}
    </div>
    <div class="grid2">
      ${field('Циклы', `<input type="number" name="cycles" min="0" value="${b.cycles || 0}">`, 'Растут сами после каждого полёта')}
      ${field('Состояние', selectHtml('status', [['ok', 'В строю'], ['watch', 'Следить'], ['retired', 'Списан']], b.status))}
    </div>
    ${field('Заметки', `<textarea name="notes">${esc(b.notes || '')}</textarea>`)}
    <button class="btn btn-primary" type="submit">Сохранить</button>
    ${b.id ? `<button class="btn btn-danger" type="button" data-act="del-batt" data-id="${b.id}">Удалить</button>` : ''}
  </form>`);
}

function openTemplateForm(t) {
  const isNew = !t;
  t = t || { type: 'any', items: [] };
  openModal(isNew ? 'Свой шаблон' : 'Изменить шаблон', `<form data-form="template" ${t.id ? `data-id="${t.id}"` : ''}>
    ${field('Название', `<input type="text" name="name" required value="${esc(t.name || '')}" placeholder="напр. Дальнолёт">`)}
    ${field('Для типа', selectHtml('type', [['any', 'Любой']].concat(Object.entries(TYPES)), t.type))}
    ${field('Пункты — по одному на строку', `<textarea name="items" required style="min-height:160px" placeholder="Пропеллеры\nАккумулятор\nFailsafe">${esc(t.items.map((i) => i.t).join('\n'))}</textarea>`)}
    <button class="btn btn-primary" type="submit">Сохранить</button>
    ${t.id ? `<button class="btn btn-danger" type="button" data-act="del-template" data-id="${t.id}">Удалить</button>` : ''}
  </form>`);
}

// Списки локаций и батарей для селектов: последняя строка — «+ Добавить…»,
// чтобы не уходить со страницы за новой записью.
const NEW_OPT = '__new';
function battOptions() {
  return [['', '—']]
    .concat(S.batteries.filter((b) => b.status !== 'retired').map((b) => [b.id, b.label]))
    .concat([[NEW_OPT, '+ Добавить аккумулятор…']]);
}
function siteOptions(list) {
  return [['', '—']]
    .concat((list || S.sites).map((x) => [x.id, x.name]))
    .concat([[NEW_OPT, '+ Добавить локацию…']]);
}

// saved — значения формы, если её прервали ради «+ Добавить…».
function openFinishForm(sessionId, saved) {
  const s = S.sessions.find((x) => x.id === sessionId);
  if (!s) return;
  const v = saved || {};
  const mins = v.durationMin != null ? v.durationMin : Math.max(1, Math.round((Date.now() - s.start) / 60000));
  openModal('Итог полёта', `<form data-form="finish" data-id="${s.id}">
    <div class="grid2">
      ${field('Длительность, мин', `<input type="number" name="durationMin" min="0" value="${esc(mins)}">`)}
      ${field('Результат', selectHtml('result', Object.entries(RESULTS), v.result || 'normal'))}
    </div>
    ${field('Аккумулятор', selectHtml('batteryId', battOptions(),
      v.batteryId != null ? v.batteryId : s.batteryId, 'data-change="finish-batt"'),
      S.batteries.length ? 'Циклы выбранной АКБ вырастут на 1' : 'Парк батарей — во вкладке «Флот»')}
    ${field('Локация', selectHtml('siteId', siteOptions(),
      v.siteId != null ? v.siteId : s.siteId, 'data-change="finish-site"'))}
    ${field('Погода', `<input type="text" name="weather" value="${esc(v.weather || '')}" placeholder="напр. ветер 5 м/с, +18°, ясно">`)}
    ${field('Заметки', `<textarea name="notes" placeholder="как летела, что понравилось">${esc(v.notes || '')}</textarea>`)}
    ${field('Проблемы', `<textarea name="problems" placeholder="что сломалось или насторожило">${esc(v.problems || '')}</textarea>`)}
    <button class="btn btn-primary" type="submit">Записать полёт</button>
  </form>`);
}

// Открыть форму новой локации/АКБ, запомнив незаконченный «Итог полёта».
function openFromFinish(form, which) {
  UI.modalReturn = {
    kind: 'finish',
    sessionId: form.dataset.id,
    values: Object.fromEntries(new FormData(form)),
  };
  if (which === 'site') openSiteForm(null); else openBattForm(null);
}

// После сохранения локации/АКБ, открытой из другого места: подставить
// новую запись туда, откуда её вызвали. true — вернули форму сами.
function afterNested(what, id) {
  const r = UI.modalReturn;
  if (r && r.kind === 'finish') {
    UI.modalReturn = null;
    r.values[what === 'site' ? 'siteId' : 'batteryId'] = id;
    openFinishForm(r.sessionId, r.values);
    return true;
  }
  if (UI.view === 'prep' && UI.prep) {
    if (what === 'site') UI.prep.siteId = id; else UI.prep.batteryId = id;
  } else if (UI.view === 'weather' && what === 'site') {
    const s = S.sites.find((x) => x.id === id);
    if (s && s.lat != null) UI.wx.siteId = id;
  }
  return false;
}

const FORMS = {
  model: async (form) => {
    const fd = new FormData(form);
    const id = form.dataset.id;
    const preset = RC.AIRCRAFT_PRESETS.find((p) => p.id === form.dataset.preset);
    const a = id ? S.aircraft.find((x) => x.id === id) : {
      id: uid(), statusManual: '', createdAt: Date.now(),
      components: preset ? JSON.parse(JSON.stringify(preset.components)) : {},
    };
    a.name = fd.get('name').trim();
    a.type = fd.get('type');
    a.manufacturer = fd.get('manufacturer').trim();
    a.weight = +fd.get('weight') || null;
    a.wingspan = +fd.get('wingspan') || null;
    a.maxWind = +String(fd.get('maxWind')).replace(',', '.') || null;
    const maxAlt = +fd.get('maxAlt');
    a.maxAlt = maxAlt ? Math.min(200, Math.max(10, maxAlt)) : null;
    a.notes = fd.get('notes').trim();
    const photo = fd.get('photo');
    if (photo && photo.size) { a.photo = photo; dropPhotoURL(a.id); }
    await put('aircraft', a);
    closeModal();
    go('#/model/' + a.id);
  },
  comp: async (form) => {
    const a = S.aircraft.find((x) => x.id === form.dataset.id);
    const fd = new FormData(form);
    a.components = a.components || {};
    a.components[form.dataset.key] = { name: fd.get('name').trim(), notes: fd.get('notes').trim() };
    await put('aircraft', a);
    closeModal();
    render();
  },
  maint: async (form) => {
    const fd = new FormData(form);
    const m = form.dataset.id
      ? S.maintenance.find((x) => x.id === form.dataset.id)
      : { id: uid(), aircraftId: form.dataset.aid, createdAt: Date.now() };
    m.title = fd.get('title').trim();
    m.kind = fd.get('kind');
    m.date = fd.get('date') || todayISO();
    m.reason = fd.get('reason').trim();
    m.next = fd.get('next').trim();
    m.done = !!fd.get('done');
    await put('maintenance', m);
    closeModal();
    render();
  },
  site: async (form) => {
    const fd = new FormData(form);
    const s = form.dataset.id ? S.sites.find((x) => x.id === form.dataset.id) : { id: uid() };
    s.name = fd.get('name').trim();
    s.place = fd.get('place').trim();
    // Одно поле «широта, долгота» — как копируется из карт.
    const nums = String(fd.get('coords')).match(/-?\d+\.\d+|-?\d+/g) || [];
    const lat = parseFloat(nums[0]);
    const lon = parseFloat(nums[1]);
    const valid = isFinite(lat) && isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
    s.lat = valid ? +lat.toFixed(5) : null;
    s.lon = valid ? +lon.toFixed(5) : null;
    s.notes = fd.get('notes').trim();
    s.isDefault = !!fd.get('isDefault');
    if (s.isDefault) {
      for (const other of S.sites.filter((x) => x.isDefault && x.id !== s.id)) {
        other.isDefault = false;
        await RCDB.put('sites', other);
      }
    }
    await put('sites', s);
    if (afterNested('site', s.id)) return;
    closeModal();
    render();
  },
  batt: async (form) => {
    const fd = new FormData(form);
    const b = form.dataset.id ? S.batteries.find((x) => x.id === form.dataset.id) : { id: uid() };
    b.label = fd.get('label').trim();
    b.chem = fd.get('chem');
    b.cells = +fd.get('cells') || null;
    b.p = +fd.get('p') || null;
    b.capacity = +fd.get('capacity') || null;
    b.weight = +fd.get('weight') || battEstimateWeight(b.chem, b.cells, b.capacity) || null;
    b.cycles = +fd.get('cycles') || 0;
    b.status = fd.get('status');
    b.notes = fd.get('notes').trim();
    await put('batteries', b);
    if (afterNested('batt', b.id)) return;
    closeModal();
    render();
  },
  template: async (form) => {
    const fd = new FormData(form);
    const t = form.dataset.id ? S.templates.find((x) => x.id === form.dataset.id) : { id: uid() };
    t.name = fd.get('name').trim();
    t.type = fd.get('type');
    t.items = fd.get('items').split('\n').map((l) => l.trim()).filter(Boolean).map((l) => ({ t: l }));
    await put('templates', t);
    closeModal();
    render();
  },
  config: async (form) => {
    const fd = new FormData(form);
    const file = fd.get('file');
    const c = {
      id: uid(), aircraftId: form.dataset.id,
      group: fd.get('group').trim(), label: fd.get('label').trim(),
      text: fd.get('text').trim(), date: todayISO(), createdAt: Date.now(),
      file: file && file.size ? file : null,
      fileName: file && file.size ? file.name : '',
    };
    if (!c.text && !c.file) { alert('Добавьте текст или файл.'); return; }
    await put('configs', c);
    closeModal();
    render();
  },
  finish: async (form) => {
    const fd = new FormData(form);
    const s = S.sessions.find((x) => x.id === form.dataset.id);
    if (!s) return;
    s.end = Date.now();
    s.durationMin = +fd.get('durationMin') || Math.round((s.end - s.start) / 60000);
    s.result = fd.get('result');
    // «+ Добавить…» перехватывается на change; сюда попасть не должно.
    s.batteryId = fd.get('batteryId') === NEW_OPT ? '' : fd.get('batteryId');
    s.siteId = fd.get('siteId') === NEW_OPT ? '' : fd.get('siteId');
    s.weather = fd.get('weather').trim();
    s.notes = fd.get('notes').trim();
    s.problems = fd.get('problems').trim();
    await put('sessions', s);
    const b = S.batteries.find((x) => x.id === s.batteryId);
    if (b) { b.cycles = (b.cycles || 0) + 1; await put('batteries', b); }
    if (s.result === 'maintenance' || s.result === 'crash') {
      await put('maintenance', {
        id: uid(), aircraftId: s.aircraftId, date: todayISO(), kind: 'inspection',
        title: s.result === 'crash' ? 'Осмотр после краша' : 'Обслуживание после полёта #' + s.flightNo,
        reason: s.problems || RESULTS[s.result], next: '', done: false, createdAt: Date.now(),
      });
    }
    closeModal();
    go('#/model/' + s.aircraftId);
  },
  'pack-item': async (form) => {
    const p = S.packing.find((x) => x.id === UI.arg);
    const fd = new FormData(form);
    const t = String(fd.get('t')).trim();
    if (!p || !t) return;
    p.items.push({ t, done: false });
    await put('packing', p);
    render(true);
  },
  'pack-new': async (form) => {
    const fd = new FormData(form);
    const pack = { id: uid(), name: String(fd.get('name')).trim(), items: [] };
    await put('packing', pack);
    closeModal();
    go('#/pack/' + pack.id);
  },
  pilot: async (form) => {
    S.settings.pilot = String(new FormData(form).get('pilot')).trim();
    await saveSettings();
    render();
  },
  'cfg-compare': (form) => {
    const fd = new FormData(form);
    const a = S.configs.find((x) => x.id === fd.get('a'));
    const b = S.configs.find((x) => x.id === fd.get('b'));
    if (!a || !b) return;
    const d = lineDiff(a.text || '', b.text || '');
    const changed = d.lines.filter((l) => l[0] !== 'same').length;
    // Показываем изменения с контекстом в 2 строки.
    let html = '';
    if (!changed) {
      html = '<p class="muted">Версии совпадают.</p>';
    } else {
      const keep = new Set();
      d.lines.forEach((l, i) => {
        if (l[0] !== 'same') for (let k = i - 2; k <= i + 2; k++) keep.add(k);
      });
      let out = [];
      let skipping = false;
      d.lines.forEach((l, i) => {
        if (!keep.has(i)) {
          if (!skipping) { out.push('<div class="muted">···</div>'); skipping = true; }
          return;
        }
        skipping = false;
        const cls = l[0] === 'add' ? 'add' : l[0] === 'del' ? 'del' : '';
        const pre = l[0] === 'add' ? '+ ' : l[0] === 'del' ? '− ' : '  ';
        out.push(`<div class="${cls}">${pre}${esc(l[1])}</div>`);
      });
      html = (d.rough ? '<p class="small muted">Файлы большие — показаны только различающиеся строки.</p>' : '') +
        `<p class="small muted">Изменённых строк: ${changed}</p><div class="diff">${out.join('')}</div>`;
    }
    openModal('Что изменилось', html);
  },
};

/* ============================================================
   Экспорт / импорт
============================================================ */

async function exportData(data, filename, scope) {
  const out = { format: 'rcplanner', version: 1, scope, exported: new Date().toISOString(), data: {} };
  for (const store of Object.keys(data)) {
    out.data[store] = [];
    for (const rec of data[store]) {
      const copy = Object.assign({}, rec);
      for (const key of ['photo', 'file']) {
        if (copy[key] instanceof Blob) {
          copy[key] = { __blob: await blobToDataURL(copy[key]), type: copy[key].type };
        }
      }
      out.data[store].push(copy);
    }
  }
  download(filename, new Blob([JSON.stringify(out)], { type: 'application/json' }));
}

function validateBackup(obj) {
  if (!obj || typeof obj !== 'object') return 'Файл не похож на резервную копию RC Planner.';
  if (obj.format !== 'rcplanner') return 'Это не файл RC Planner (нет отметки формата).';
  if (obj.version !== 1) return 'Файл создан другой версией приложения (' + obj.version + ').';
  if (!obj.data || typeof obj.data !== 'object') return 'В файле нет данных.';
  for (const store of Object.keys(obj.data)) {
    if (!RCDB.stores.includes(store)) return 'Неизвестный раздел данных: ' + store;
    if (!Array.isArray(obj.data[store])) return 'Повреждён раздел: ' + store;
    for (const rec of obj.data[store]) {
      if (!rec || typeof rec.id !== 'string') return 'Запись без id в разделе ' + store;
    }
  }
  return null;
}

function reviveBlobs(data) {
  for (const store of Object.keys(data)) {
    for (const rec of data[store]) {
      for (const key of ['photo', 'file']) {
        if (rec[key] && rec[key].__blob) {
          try { rec[key] = dataURLtoBlob(rec[key].__blob); }
          catch (e) { rec[key] = null; }
        }
      }
    }
  }
}

async function doImport(mode) {
  const parsed = UI.importData;
  if (!parsed) return;
  reviveBlobs(parsed.data);
  await RCDB.restore(parsed.data, mode);
  PHOTO_URLS.forEach((u) => URL.revokeObjectURL(u));
  PHOTO_URLS.clear();
  await loadAll();
  UI.importData = null;
  closeModal();
  openModal('Готово', '<p>Данные восстановлены.</p><div class="spacer"></div><button class="btn btn-primary" data-act="close-modal">Ок</button>');
  render();
}

function handleImportFile(input) {
  const f = input.files && input.files[0];
  if (!f) return;
  const r = new FileReader();
  r.onload = () => {
    let parsed = null;
    let err = null;
    try { parsed = JSON.parse(r.result); } catch (e) { err = 'Файл не читается как JSON.'; }
    if (!err) err = validateBackup(parsed);
    if (err) {
      openModal('Импорт не удался', `<p>${esc(err)}</p><div class="spacer"></div>
        <button class="btn" data-act="close-modal">Понятно</button>`);
      return;
    }
    UI.importData = parsed;
    const n = Object.values(parsed.data).reduce((s, arr) => s + arr.length, 0);
    openModal('Импорт данных', `<p>В файле ${n} ${plural(n, 'запись', 'записи', 'записей')}
      (${parsed.scope === 'aircraft' ? 'экспорт одной модели' : 'полная копия'} от ${esc((parsed.exported || '').slice(0, 10))}).</p>
      <div class="spacer"></div>
      ${parsed.scope === 'aircraft'
        ? '<button class="btn btn-primary" data-act="import-merge">Добавить к моим данным</button>'
        : `<button class="btn btn-primary" data-act="import-merge">Объединить с моими данными</button>
           <button class="btn btn-danger" data-act="import-replace">Заменить всё содержимым файла</button>`}
      <button class="btn" data-act="close-modal">Отмена</button>`);
  };
  r.readAsText(f);
  input.value = '';
}

/* ============================================================
   9. НАВИГАЦИЯ И ОТРИСОВКА
============================================================ */

const RENDERERS = {
  today: viewToday, fleet: viewFleet, model: viewModel,
  flight: viewFlight, prep: viewPrep, session: viewSession, log: viewLog,
  packing: viewPacking, pack: viewPack, weather: viewWeather,
  more: viewMore, tools: viewTools, sites: viewSites,
  batteries: viewBatteries, templates: viewTemplates,
  backup: viewBackup, privacy: viewPrivacy,
};

function go(hash) {
  if (location.hash === hash) onRoute();
  else location.hash = hash;
}

function onRoute() {
  const parts = (location.hash || '#/today').replace(/^#\/?/, '').split('/');
  const view = parts[0] || 'today';
  UI.view = RENDERERS[view] ? view : 'today';
  UI.arg = parts[1] ? decodeURIComponent(parts[1]) : null;
  UI.navCount++;
  UI.modalReturn = null; // ушли со страницы — восстанавливать нечего
  closeModal();
  render();
  window.scrollTo(0, 0);
}

function renderTabbar() {
  const active = TAB_OF[UI.view] || 'today';
  $('#tabbar').innerHTML = TABS.map((t) =>
    `<button class="tab" data-nav="#/${t.id}" ${t.id === active ? 'aria-current="page"' : ''}>
      ${ICONS[t.id]}<span>${t.label}</span></button>`).join('');
}

function render(keepScroll) {
  const y = window.scrollY;
  const focused = document.activeElement;
  const focusSel = focused && focused.dataset && focused.dataset.act && focused.dataset.i != null
    ? `[data-act="${focused.dataset.act}"][data-i="${focused.dataset.i}"]` : null;

  if (TIMER) { clearInterval(TIMER); TIMER = null; }
  $('#views').innerHTML = (RENDERERS[UI.view] || viewToday)();
  renderTabbar();

  if (keepScroll) {
    window.scrollTo(0, y);
    if (focusSel) { const el = $(focusSel); if (el) el.focus(); }
  }

  // Живой таймер на экране активного полёта.
  if (UI.view === 'session') {
    const s = S.sessions.find((x) => x.id === UI.arg);
    if (s && !s.end) {
      TIMER = setInterval(() => {
        const t = $('#timer');
        if (t) t.textContent = fmtClock(Date.now() - s.start);
        else { clearInterval(TIMER); TIMER = null; }
      }, 1000);
    }
  }
}

/* ============================================================
   10. СОБЫТИЯ
   Разметка пересобирается целиком, поэтому все обработчики
   висят на document, элементы помечены data-атрибутами.
============================================================ */

document.addEventListener('click', (e) => {
  const nav = e.target.closest('[data-nav]');
  if (nav) { e.preventDefault(); go(nav.dataset.nav); return; }
  const act = e.target.closest('[data-act]');
  if (act && ACTIONS[act.dataset.act]) {
    e.preventDefault();
    ACTIONS[act.dataset.act](act);
  }
});

document.addEventListener('submit', (e) => {
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
  if (kind === 'status-manual') {
    const a = S.aircraft.find((x) => x.id === el.dataset.id);
    if (a) { a.statusManual = el.value; put('aircraft', a).then(() => render(true)); }
  } else if (kind === 'prep-template') {
    if (!UI.prep) return;
    const a = S.aircraft.find((x) => x.id === UI.prep.aircraftId);
    const tpl = templatesFor(a.type).find((t) => t.id === el.value);
    if (tpl) {
      UI.prep.tplId = tpl.id;
      UI.prep.items = tpl.items.map((i) => ({ t: i.t, hint: i.hint || '', state: null }));
      render();
    }
  } else if (kind === 'prep-site') {
    if (!UI.prep) return;
    if (el.value === NEW_OPT) { el.value = UI.prep.siteId || ''; openSiteForm(null); }
    else UI.prep.siteId = el.value;
  } else if (kind === 'prep-batt') {
    if (!UI.prep) return;
    if (el.value === NEW_OPT) { el.value = UI.prep.batteryId || ''; openBattForm(null); }
    else UI.prep.batteryId = el.value;
  } else if (kind === 'batt-preset') {
    const p = RC.BATTERY_PRESETS.find((x) => x.id === el.value);
    if (p) openBattForm({ label: p.label, chem: p.chem, cells: p.cells, p: p.p, capacity: p.capacity, weight: p.weight, status: 'ok' }, p.id);
  } else if (kind === 'finish-site' || kind === 'finish-batt') {
    if (el.value !== NEW_OPT) return;
    const form = el.closest('form');
    if (form) openFromFinish(form, kind === 'finish-site' ? 'site' : 'batt');
  } else if (kind === 'import-file') {
    handleImportFile(el);
  } else if (kind === 'weather-site') {
    if (el.value === NEW_OPT) { el.value = UI.wx.siteId || ''; openSiteForm(null); return; }
    UI.wx.siteId = el.value;
  } else if (kind === 'weather-model') {
    UI.wx.aircraftId = el.value;
    render(true);
  } else if (kind === 'weather-batt') {
    UI.wx.batteryId = el.value;
    render(true);
  } else if (kind === 'weather-day') {
    UI.wx.day = +el.value || 0;
    render(true);
  }
});

window.addEventListener('hashchange', onRoute);
window.addEventListener('popstate', onRoute);

/* ============================================================
   11. PWA И ОБНОВЛЕНИЯ
============================================================ */

function setupSW() {
  if (!('serviceWorker' in navigator)) return;
  if (!/^https?:$/.test(location.protocol)) return; // file:// — офлайн-файл без PWA
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then((reg) => {
    SWREG = reg;
    if (reg.waiting && navigator.serviceWorker.controller) { UI.updateReady = true; render(); }
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      if (!w) return;
      w.addEventListener('statechange', () => {
        if (w.state === 'installed' && navigator.serviceWorker.controller) {
          UI.updateReady = true;
          render();
        }
      });
    });
  }).catch(() => {});
  // При первой установке controllerchange тоже приходит — не перезагружаем.
  let had = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (had) location.reload();
    had = true;
  });
}

function showWhatsNew(manual) {
  const log = RC.CHANGELOG;
  if (!log.length) return;
  const latest = log[0];
  const entry = (c) => `<div style="margin-bottom:14px">
    <div style="display:flex;gap:8px;align-items:baseline">
      <strong>Версия ${esc(c.v)}</strong><span class="small muted">${fmtDate(c.date)}</span></div>
    <div class="small muted" style="margin-bottom:4px">${esc(c.title)}</div>
    <ul style="padding-left:18px">${c.items.map((i) => `<li class="small">${esc(i)}</li>`).join('')}</ul></div>`;
  let h = entry(latest);
  const past = log.slice(1, 6);
  if (past.length) {
    h += `<details class="fold"><summary>Что было раньше</summary><div class="fold-body">${past.map(entry).join('')}</div></details>`;
  }
  h += '<button class="btn btn-primary" data-act="close-modal">Понятно</button>';
  openModal('Что нового', h);
  if (!manual) lsSet('rcp.seen', String(latest.v));
}

// Версии — строки; никакой арифметики: ищем просмотренную по положению
// в списке. Не нашли (старый формат, копия из будущего) — показываем раз.
function maybeWhatsNew() {
  const latest = RC.CHANGELOG[0];
  if (!latest) return;
  const seen = lsGet('rcp.seen') || '';
  if (!seen) { lsSet('rcp.seen', String(latest.v)); return; } // первый запуск — без окна
  const i = RC.CHANGELOG.findIndex((c) => String(c.v) === seen);
  if (i !== 0) { showWhatsNew(false); lsSet('rcp.seen', String(latest.v)); }
}

/* ============================================================
   12. СТАРТ
============================================================ */

(async function start() {
  try {
    await loadAll();
    await seedIfNeeded();
    await migrateIfNeeded();
  } catch (e) {
    $('#views').innerHTML = `<div class="empty"><p>Не удалось открыть локальную базу данных.<br>
      <span class="small muted">${esc(e && e.message)}</span></p>
      <p class="small muted">Проверьте, что браузер не в приватном режиме.</p></div>`;
    return;
  }
  onRoute();
  setupSW();
  maybeWhatsNew();
})();
