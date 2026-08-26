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
// Коэффициенты вердикта и сложности — ЕДИНСТВЕННЫЙ источник и для
// расчёта (wxVerdict/wxDifficulty), и для таблиц в wxHelpHtml.
const WX_K = {
  night: 0.8, fog: 0.75, drizzle: 0.85, snow: 0.8, // сложность условий
  warn: 0.8, gustBad: 1.4, gustWarn: 1.15,          // пороги вердикта
};
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

function fmtTime(ts) {
  return new Date(ts).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
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

// Цепочка после краша/аварии очевидна: полёт с проблемой → «Обслуживание»
// (создан осмотр) → осмотр отмечен выполненным → снова «Готова».
// Поэтому «Проверить» держится только пока НЕТ закрытой работы,
// сделанной после проблемного полёта.
function statusOf(a) {
  if (a.statusManual && STATUS[a.statusManual]) return a.statusManual;
  if (S.maintenance.some((m) => m.aircraftId === a.id && !m.done)) return 'maintenance';
  const last = sessionsOf(a.id).find((s) => s.end);
  if (last && last.result && last.result !== 'normal') {
    const fixed = S.maintenance.some((m) => m.aircraftId === a.id && m.done && m.createdAt >= last.start);
    if (!fixed) return 'check';
  }
  if (last) return 'ready';
  if (S.runs.some((r) => r.aircraftId === a.id)) return 'ready';
  return 'unknown';
}

// gotoHash: чип «Обслуживание» становится ссылкой к работам борта —
// клик перехватывается делегатом раньше родительской кнопки строки.
function chip(st, gotoHash) {
  const s = STATUS[st] || STATUS.unknown;
  const link = st === 'maintenance' && gotoHash;
  return `<span class="chip ${s.cls}${link ? ' chip-link' : ''}"${link ? ` data-goto="${gotoHash}"` : ''}>${s.label}</span>`;
}

// Полётов может идти несколько (два пилота, два борта) — но у одного
// борта только один открытый полёт.
function activeSessions() {
  return S.sessions.filter((s) => !s.end);
}
function activeSessionOf(aircraftId) {
  return S.sessions.find((s) => !s.end && s.aircraftId === aircraftId) || null;
}
// Забытый полёт: открыт дольше 6 часов — почти наверняка не завершили.
const STALE_FLIGHT_MIN = 360;
function staleSession(s) {
  return (Date.now() - s.start) / 60000 > STALE_FLIGHT_MIN;
}
// Общий блок баннеров об идущих полётах (Сегодня и «Полёт»).
function activeFlightBanners() {
  return activeSessions().map((s) => {
    const a = S.aircraft.find((x) => x.id === s.aircraftId);
    const mins = Math.round((Date.now() - s.start) / 60000);
    return staleSession(s)
      ? `<div class="banner warn">Полёт «${esc(a ? a.name : '')}» идёт уже ${fmtDur(mins)} — забыли завершить?
          <button class="btn-sm btn right" data-act="finish-flight" data-id="${s.id}">Завершить</button>
          <button class="btn-sm btn right" data-act="discard-flight" data-id="${s.id}">Удалить</button></div>`
      : `<div class="banner warn">Идёт полёт: ${esc(a ? a.name : '')} · ${fmtDur(mins)}.
          <button class="btn-sm btn right" data-nav="#/session/${s.id}">Открыть</button></div>`;
  }).join('');
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
  // Координаты локаций — строго числа. Импортированная копия может
  // принести в lat/lon произвольные строки; они попадают в value и href
  // без esc() — нормализуем при каждой загрузке, а не надеемся на формы.
  for (const s of S.sites || []) {
    const num = (v) => (v == null || v === '' || !isFinite(+v) ? null : +v);
    s.lat = num(s.lat);
    s.lon = num(s.lon);
    if (s.lat == null || s.lon == null) { s.lat = null; s.lon = null; }
  }
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
  let touched = false;
  if (!S.settings.migrWind2) {
    // Пишем напрямую в RCDB (put() перечитывал бы весь store на каждой
    // итерации — это стартовый путь), настройки сохраняем один раз.
    for (const a of S.aircraft) {
      if (a.maxWind) {
        a.maxWind = Math.min(60, a.maxWind * 2);
        await RCDB.put('aircraft', a);
      }
    }
    S.settings.migrWind2 = true;
    touched = true;
  }
  if (!S.settings.migrWx2) {
    // Кэш прогноза, снятый до появления weather_code, выбрасываем один
    // раз — дальше коду не нужны запасные ветки «а вдруг поля нет».
    delete S.settings.weatherCache;
    S.settings.migrWx2 = true;
    touched = true;
  }
  if (touched) await saveSettings();
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
  move: ic('<path d="M5 9l-3 3 3 3M19 9l3 3-3 3M3.5 12h17"/>'),
  paste: ic('<rect x="5" y="4" width="14" height="17.5" rx="2"/><path d="M9 4.5V3.4A1.4 1.4 0 0 1 10.4 2h3.2A1.4 1.4 0 0 1 15 3.4v1.1"/><path d="M12 9.5v7M8.8 13.3 12 16.5l3.2-3.2"/>'),
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
  if (r && r.reopen) {
    UI.modalReturn = null;
    r.reopen();
    return;
  }
  closeModal();
}

// Раскрывающийся online-блок (карта, Windy): повторное нажатие прячет
// и ОЧИЩАЕТ содержимое — тайлы/iframe не живут в скрытом блоке.
function toggleBox(box, fill) {
  if (!box) return;
  if (!box.hidden) { box.hidden = true; box.innerHTML = ''; return; }
  box.hidden = false;
  box.innerHTML = '';
  fill(box);
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

  h += activeFlightBanners();

  // «Начало работы»: четыре шага с галочками, ведут прямо к действию.
  // Блок сам исчезает, когда весь путь пройден, — ничего не настраивается.
  const steps = [
    ['Добавьте борт', 'во «Флоте»: готовая платформа или свой', S.aircraft.length > 0,
      'data-act="add-model"', 'fleet'],
    ['Заведите аккумулятор и поставьте в борт', 'борт с АКБ считается собранным к вылету', armedFleet().length > 0,
      'data-nav="#/batteries"', 'batteries'],
    ['Запомните локацию', 'координаты — для прогноза и окон полётов', S.sites.length > 0,
      'data-act="add-site"', 'sites'],
    ['Пройдите чек-лист и слетайте', 'кнопка «Начать полёт» — журнал заполнится сам', S.sessions.some((s) => s.end),
      'data-act="start-prep"', 'flight'],
  ];
  const todo = steps.filter((s) => !s[2]).length;
  if (todo) {
    h += `<div class="h2">Начало работы · осталось ${todo} из 4</div><div class="card flat">`;
    h += steps.map(([t, d, ok2, attrs, icon]) => ok2
      ? `<div class="row" style="opacity:0.55"><span class="row-ic" style="color:var(--ok)">${ICONS.templates}</span>
         <span class="grow"><span class="t" style="text-decoration:line-through">${t}</span></span></div>`
      : rowBtn(attrs, `<span class="grow"><span class="t">${t}</span><span class="d">${d}</span></span>`, icon)).join('');
    h += '</div>';
  }

  if (!S.aircraft.length) return h;

  h += `<button class="btn btn-primary" data-act="start-prep">Начать полёт</button>`;

  h += `<div class="card flat" style="margin-top:8px">` +
    rowBtn('data-nav="#/weather"', `<span class="grow"><span class="t">Окна для полётов
      <span class="badge online">online</span></span>
      <span class="d">Ветер до 200 м и осадки по вашей локации</span></span>`, 'weather') + '</div>';

  // К вылету: только собранные модели (с установленным АКБ) — весь
  // флот не дублируем, он живёт во вкладке «Флот». Пустой блок при
  // видимом «Начале работы» не показываем — шаг 2 говорит то же самое.
  const armed = S.aircraft.map((a) => [a, armedBattery(a)]).filter(([, b]) => b);
  if (armed.length || !todo) {
  h += '<div class="h2">К вылету</div><div class="card flat">';
  if (armed.length) {
    h += armed.map(([a, b]) => takeoffReady(a)
      ? `<div class="row">
          <button class="grow" data-nav="#/model/${a.id}" style="display:flex;align-items:center;gap:12px;text-align:left;min-height:40px">
            ${aircraftThumb(a)}<span class="grow"><span class="t">${esc(a.name)}</span>
            <span class="d">${TYPES[a.type] || ''} · ${battTag(b)} · чек-лист пройден</span></span></button>
          <button class="btn btn-sm btn-primary" data-act="takeoff-prepared" data-id="${a.id}" style="min-height:40px">Взлёт</button>
        </div>`
      : rowBtn(`data-nav="#/model/${a.id}"`,
        `${aircraftThumb(a)}<span class="grow"><span class="t">${esc(a.name)}</span>
         <span class="d">${TYPES[a.type] || ''} · ${battTag(b)}</span></span>
         ${chip(statusOf(a), '#/model/' + a.id)}`)).join('');
  } else {
    h += rowBtn('data-nav="#/fleet"', `<span class="grow"><span class="t">Соберите борт к вылету</span>
      <span class="d">Установите аккумулятор в карточке борта — он появится здесь</span></span>`, 'batteries');
  }
  h += '</div>';
  }

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
    `<span class="grow"><span class="t"><span class="mono">#${String(s.flightNo).padStart(3, '0')}</span> ${esc(a ? a.name : 'Борт удалён')}</span>
     <span class="d">${fmtDate(s.date)} · ${fmtDur(s.durationMin)} · <span class="result-${esc(s.result || 'normal')}">${RESULTS[s.result] || '—'}</span></span></span>`);
}

// Флот — это модели и батареи: два списка одной вкладки.
function fleetSeg(active) {
  return `<div class="seg" style="margin-bottom:10px">
    <button data-nav="#/fleet" aria-pressed="${active === 'fleet'}">Борта</button>
    <button data-nav="#/batteries" aria-pressed="${active === 'batteries'}">Аккумуляторы</button>
  </div>`;
}

/* ---------- Группы флота ----------
   Группы лежат в settings.fleetGroups [{id, name, parentId|null}],
   у борта — a.groupId. Один уровень вложенности: подгруппой может
   стать только группа без своих подгрупп, родителем — только корневая.
   Перенос борта — кнопкой на строке (два касания): на тач-экране в поле
   это надёжнее перетаскивания пальцем. */
function fleetGroups() { return S.settings.fleetGroups || []; }

// Сортировка внутри групп; группы порядок не меняют и не сбрасываются.
function fleetSortCmp() {
  const mode = S.settings.fleetSort || 'name';
  const stOrder = { ready: 0, check: 1, maintenance: 2, grounded: 3, unknown: 4 };
  const tOrder = { quad: 0, plane: 1, wing: 2, other: 3 };
  return (x, y) => {
    if (mode === 'status') {
      const d = (stOrder[statusOf(x)] || 0) - (stOrder[statusOf(y)] || 0);
      if (d) return d;
    } else if (mode === 'type') {
      const d = (tOrder[x.type] != null ? tOrder[x.type] : 9) - (tOrder[y.type] != null ? tOrder[y.type] : 9);
      if (d) return d;
    }
    return (x.name || '').localeCompare(y.name || '', 'ru');
  };
}

function fleetRow(a) {
  const b = armedBattery(a);
  return `<div class="row">
    <button class="grow" data-nav="#/model/${a.id}" style="display:flex;align-items:center;gap:12px;text-align:left;min-height:44px;min-width:0">
      ${aircraftThumb(a)}<span class="grow" style="min-width:0"><span class="t">${esc(a.name)}</span>
      <span class="d">${TYPES[a.type] || ''}${a.manufacturer ? ' · ' + esc(a.manufacturer) : ''}${b ? ' · ' + battTag(b) : ''}</span></span></button>
    ${chip(statusOf(a), '#/model/' + a.id)}
    <button class="row-move" data-act="move-model" data-id="${a.id}" aria-label="Переместить в группу">${ICONS.move}</button>
  </div>`;
}

function viewFleet() {
  let h = pageHead('Флот', { act: 'add-model', actLabel: 'Добавить' }) + fleetSeg('fleet');
  if (!S.aircraft.length) {
    return h + emptyState('Пока нет ни одного борта.', 'add-model', 'Добавить борт');
  }
  const groups = fleetGroups();
  h += `<div class="fleet-bar">
    ${selectHtml('fleetSort', [['name', 'По названию'], ['status', 'По статусу'], ['type', 'По типу']],
      S.settings.fleetSort || 'name', 'data-change="fleet-sort" style="flex:1;min-height:40px"')}
    <button class="btn btn-sm" data-act="add-group" style="min-height:40px">+ Группа</button>
  </div>`;
  const cmp = fleetSortCmp();
  const inGroup = (gid) => S.aircraft.filter((a) => (a.groupId || '') === gid).sort(cmp);
  const block = (g, sub) => {
    const list = inGroup(g.id);
    return `<div class="grp-head${sub ? ' grp-sub' : ''}">
      <span class="grow">${esc(g.name)} <span class="muted small">(${list.length})</span></span>
      <button class="grp-edit" data-act="edit-group" data-id="${g.id}" aria-label="Настроить группу">${ICONS.more}</button></div>
      ${list.length
        ? `<div class="card flat${sub ? ' grp-sub' : ''}">${list.map(fleetRow).join('')}</div>`
        : `<div class="small dim grp-empty${sub ? ' grp-sub' : ''}">пока пусто — перенесите борт кнопкой на его строке</div>`}`;
  };
  const loose = inGroup('');
  if (loose.length) {
    if (groups.length) h += `<div class="grp-head"><span class="grow muted">Без группы</span></div>`;
    h += `<div class="card flat">${loose.map(fleetRow).join('')}</div>`;
  }
  for (const g of groups.filter((x) => !x.parentId)) {
    h += block(g, false);
    for (const sg of groups.filter((x) => x.parentId === g.id)) h += block(sg, true);
  }
  return h;
}

// Форма группы: имя, родитель (для «сделать подгруппой»), удаление.
function openGroupForm(g, moveAid) {
  const isNew = !g;
  g = g || {};
  const groups = fleetGroups();
  const hasSubs = groups.some((x) => x.parentId === g.id);
  const parents = groups.filter((x) => !x.parentId && x.id !== g.id);
  openModal(isNew ? 'Новая группа' : 'Группа', `<form data-form="group" ${g.id ? `data-id="${g.id}"` : ''} ${moveAid ? `data-move-aid="${moveAid}"` : ''}>
    ${field('Название', `<input type="text" name="name" required value="${esc(g.name || '')}" placeholder="напр. Резерв или Поле у реки">`)}
    ${hasSubs
      ? `<div class="hint" style="margin-bottom:10px">У группы есть подгруппы — сделать её подгруппой нельзя.</div>`
      : parents.length
        ? field('Внутри группы', selectHtml('parentId', [['', '— корневая —']].concat(parents.map((p) => [p.id, p.name])), g.parentId || ''), 'подгруппа — один уровень вложенности')
        : ''}
    <button class="btn btn-primary" type="submit">Сохранить</button>
    ${g.id ? `<button class="btn btn-danger" type="button" data-act="del-group" data-id="${g.id}">Удалить группу</button>` : ''}
  </form>`);
}

// Перенос борта: список групп в модалке — два касания вместо drag-n-drop.
function openMoveModal(a) {
  const groups = fleetGroups();
  const row = (gid, label, sub) => rowBtn(`data-act="move-model-to" data-id="${a.id}" data-gid="${gid}" ${sub ? 'style="padding-left:28px"' : ''}`,
    `<span class="grow"><span class="t">${label}</span></span>`);
  let h = '<div class="card flat">';
  h += row('', 'Без группы');
  for (const g of groups.filter((x) => !x.parentId)) {
    h += row(g.id, esc(g.name));
    for (const sg of groups.filter((x) => x.parentId === g.id)) h += row(sg.id, esc(sg.name), true);
  }
  h += rowBtn(`data-act="move-new-group" data-id="${a.id}"`, `<span class="grow"><span class="t">+ Новая группа…</span></span>`);
  h += '</div>';
  openModal(`«${esc(a.name)}» — в группу`, h);
}

const COMPONENTS = [
  ['motor', 'Мотор'], ['esc', 'ESC'], ['fc', 'Полётный контроллер'],
  ['rx', 'Приёмник (RX)'], ['gps', 'GPS'], ['servo', 'Сервоприводы'],
  ['prop', 'Пропеллер'], ['vtx', 'VTX'], ['camera', 'Камера'],
  ['tx', 'Передатчик'], ['battery', 'Аккумулятор'],
];

// АКБ ставится только в ОДНУ модель: занятые другими исчезают из выбора.
function battOwner(bId) {
  // без guard'а battOwner(undefined) находил модель с незаполненным batteryId
  if (!bId) return undefined;
  return S.aircraft.find((x) => x.batteryId === bId);
}

// «Собранная» модель: установленный АКБ существует и не списан.
// Возвращает объект АКБ либо undefined — одна проверка для «Сегодня»,
// окон погоды и чек-листа.
function armedBattery(a) {
  const b = a && S.batteries.find((x) => x.id === a.batteryId);
  return b && b.status !== 'retired' ? b : undefined;
}

function armedFleet() { return S.aircraft.filter((a) => armedBattery(a)); }

// Подпись аккумулятора, светящаяся состоянием заряда: зелёная — заряжен,
// синяя — после полёта (разряжен). Один вид на бортах и в списке АКБ.
function battTag(b, text) {
  const cls = b.charge === 'ready' ? 'bt-ready' : b.charge === 'flown' ? 'bt-flown' : '';
  return `<span class="${cls}">${esc(text != null ? text : b.label)}</span>`;
}
const CHARGE_LABEL = { ready: 'заряжен', flown: 'после полёта' };

// Подготовка действует до конца дня (МСК): недельная пометка «чек-лист
// пройден» обесценила бы сам чек-лист.
function preparedFresh(a) {
  const p = a && a.prepared;
  return p && new Date(p.at).toLocaleDateString('en-CA', { timeZone: WX_TZ }) === wxTodayISO() ? p : null;
}

// Кнопку «Взлёт» без чек-листа показываем только когда лететь реально
// можно: подготовка свежая, нет запрета/открытого обслуживания и нет
// уже идущего полёта.
function takeoffReady(a) {
  if (!preparedFresh(a) || activeSessionOf(a.id) || !armedBattery(a)) return false;
  const st = statusOf(a);
  return st !== 'grounded' && st !== 'maintenance';
}

// Снять АКБ со всех моделей, кроме exceptId. Пишет напрямую в RCDB —
// вызывающий обязан обновить S.aircraft (или сделать это через put).
async function releaseBattery(bId, exceptId) {
  for (const other of S.aircraft.filter((x) => x.batteryId === bId && x.id !== exceptId)) {
    other.batteryId = null;
    await RCDB.put('aircraft', other);
  }
}

// Единая установка/снятие: bId в модель aId (aId пустой — просто снять
// отовсюду). Все места (карточка модели, форма модели, форма АКБ,
// чек-лист) проходят через неё либо через releaseBattery.
// Store перечитывается ОДИН раз в конце, а не после каждой записи.
async function installBattery(aId, bId) {
  if (bId) await releaseBattery(bId, aId);
  const a = aId && S.aircraft.find((x) => x.id === aId);
  if (a) { a.batteryId = bId || null; await RCDB.put('aircraft', a); }
  S.aircraft = await RCDB.all('aircraft');
}

function viewModel() {
  const a = S.aircraft.find((x) => x.id === UI.arg);
  if (!a) return pageHead('Борт не найден', { back: '#/fleet' });
  const flights = sessionsOf(a.id).filter((s) => s.end);
  const total = flights.reduce((n, s) => n + (s.durationMin || 0), 0);
  const st = statusOf(a);
  const bat = armedBattery(a);

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
    <div style="display:flex;align-items:center;gap:10px;margin-top:8px">
      <span class="row-ic">${ICONS.batteries}</span>
      ${selectHtml('modelBatt', battOptions({ freeOnly: true, keepId: a.batteryId, emptyLabel: '— без АКБ —', addNew: true }), a.batteryId || '', `data-change="model-batt" data-id="${a.id}" style="flex:1;min-height:40px"`)}
      ${bat && bat.status !== 'retired' ? `<button class="chip ${bat.charge === 'ready' ? 'st-ready' : bat.charge === 'flown' ? 'st-flown' : 'st-unknown'}"
        data-act="batt-charge" data-id="${bat.id}">${CHARGE_LABEL[bat.charge] || 'заряд?'}</button>` : ''}
    </div>
    <div class="hint" style="margin-top:4px">Борт с установленным АКБ считается собранным к вылету
      и попадает на «Сегодня»; вес АКБ учитывается в окнах погоды.</div>
    <div class="stat-line" style="margin-bottom:0">
      <div class="stat"><div class="v">${flights.length}</div><div class="k">${plural(flights.length, 'полёт', 'полёта', 'полётов')}</div></div>
      <div class="stat"><div class="v">${fmtDur(total)}</div><div class="k">налёт</div></div>
      <div class="stat"><div class="v">${flights[0] ? fmtDate(flights[0].date) : '—'}</div><div class="k">последний полёт</div></div>
    </div></div>`;

  h += `<button class="btn btn-primary" data-act="start-prep" data-id="${a.id}">Подготовка к полёту</button>`;

  // Паспорт
  const specs = [
    ['Тип', TYPES[a.type] || '—'], ['Производитель', a.manufacturer],
    ['Вес (сухой)', a.weight ? a.weight + ' г' : ''], ['Размах', a.wingspan ? a.wingspan + ' мм' : ''],
    ['АКБ борта', bat ? bat.label + (bat.weight && a.weight ? ` → взлётный ${a.weight + bat.weight} г` : bat.weight ? ` · ${bat.weight} г` : '') : ''],
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
    // «Выполнено» одним касанием — после краша это следующий очевидный шаг
    h += openM.map((m) => `<div class="row">
      <button class="grow" data-act="edit-maint" data-id="${m.id}" style="text-align:left;min-height:40px">
        <span class="t">${esc(m.title)}</span>
        <span class="d">${MAINT_KINDS[m.kind] || ''} · ${fmtDate(m.date)}${m.next ? ' · далее: ' + esc(m.next) : ''}</span></button>
      <button class="btn btn-sm" data-act="maint-done" data-id="${m.id}" style="min-height:40px">Выполнено</button>
    </div>`).join('');
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
      <button class="btn" data-act="export-model" data-id="${a.id}">Экспорт борта</button>
      <button class="btn btn-danger" data-act="del-model" data-id="${a.id}">Удалить</button>
    </div>`;
  return h;
}

/* ---------- Полёт ---------- */

function viewFlight() {
  let h = pageHead('Полёт');
  h += activeFlightBanners();
  if (UI.prep && !activeSessionOf(UI.prep.aircraftId)) {
    const a = S.aircraft.find((x) => x.id === UI.prep.aircraftId);
    h += `<div class="banner">Подготовка не закончена: ${esc(a ? a.name : '')}.
      <button class="btn-sm btn right" data-nav="#/prep">Продолжить</button></div>`;
  }
  h += `<button class="btn btn-primary" data-act="start-prep">Начать подготовку</button>`;

  // Подготовленные борта: чек-лист пройден, взлёт в одно нажатие.
  const prepared = S.aircraft.filter((a) => takeoffReady(a));
  if (prepared.length) {
    h += '<div class="h2">Готовы к вылету</div><div class="card flat">';
    h += prepared.map((a) => `<div class="row">
      ${aircraftThumb(a)}<span class="grow"><span class="t">${esc(a.name)}</span>
      <span class="d">чек-лист пройден в ${fmtTime(a.prepared.at)}</span></span>
      <button class="btn btn-sm btn-primary" data-act="takeoff-prepared" data-id="${a.id}" style="min-height:40px">Взлёт</button>
    </div>`).join('');
    h += '</div>';
  }

  const done = S.sessions.filter((s) => s.end).sort((a, b) => b.start - a.start);
  if (done.length) {
    h += `<div class="h2">Журнал полётов</div><div class="card flat">` +
      done.slice(0, 10).map(sessionRow).join('') + '</div>';
    if (done.length > 10) h += `<button class="btn" data-nav="#/log">Весь журнал (${done.length})</button>`;
  } else if (!activeSessions().length && !S.aircraft.length) {
    h += emptyState('Сначала добавьте борт во «Флоте».', 'add-model', 'Добавить борт');
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
    let h = pageHead('Подготовка', { back: '#/flight', sub: 'Выберите борт' });
    if (!S.aircraft.length) return h + emptyState('Нет бортов.', 'add-model', 'Добавить борт');
    h += '<div class="card flat">';
    h += S.aircraft.map((a) => rowBtn(`data-act="prep-model" data-id="${a.id}"`,
      `${aircraftThumb(a)}<span class="grow"><span class="t">${esc(a.name)}</span>
       <span class="d">${TYPES[a.type] || ''}${preparedFresh(a) ? ` · подготовлен в ${fmtTime(a.prepared.at)}` : ''}</span></span>${chip(statusOf(a), '#/model/' + a.id)}`)).join('');
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
    h += `<div class="banner warn">Полёты этого борта запрещены вами. Снимите запрет в его карточке, если готовы летать.</div>`;
  }
  if (tpls.length > 1) {
    h += field('Шаблон', selectHtml('tpl',
      tpls.map((t) => [t.id, t.name + (t.builtin ? '' : ' (свой)')]),
      UI.prep.tplId, 'data-change="prep-template"'));
  }
  h += `<div class="grid2">
    ${field('Локация', `<div style="display:flex;gap:8px">
      ${selectHtml('prepSite', siteOptions(), UI.prep.siteId, 'data-change="prep-site" style="flex:1;min-width:0"')}
      <button type="button" class="map-btn" data-act="prep-site-map" aria-label="Карта">${ICONS.sites}</button>
    </div>`)}
    ${field('Аккумулятор', selectHtml('prepBatt',
      battOptions({ freeOnly: true, keepId: a.batteryId, emptyLabel: '— без АКБ —', addNew: true }),
      (armedBattery(a) || {}).id || '', 'data-change="prep-batt"'), 'Выбор здесь ставит АКБ в борт')}
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
  if (armedBattery(a)) {
    h += `<button class="btn btn-primary" data-act="start-flight">START FLIGHT</button>
      <button class="btn" data-act="prep-done">Готов — подготовить следующий борт</button>`;
  } else {
    h += `<div class="banner warn">Без аккумулятора не летаем: выберите АКБ выше — и кнопки появятся.</div>`;
  }
  h += `<button class="btn" data-act="cancel-prep">Отменить подготовку</button>`;
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
    ['Борт', a ? a.name : '—'],
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
  if (c === 45 || c === 48) name = 'wxFog';
  else if ((c >= 71 && c <= 77) || c === 85 || c === 86) name = 'wxSnow';
  else if ((c >= 51 && c <= 67) || (c >= 80 && c <= 82) || c >= 95) name = 'wxRain';
  else if (c === 3) name = 'wxCloud';
  else if (c === 1 || c === 2) name = 'wxPartly';
  else name = 'wxSun';
  // Ночью ясное и малооблачное небо — луна.
  if (!hr.light && (name === 'wxSun' || name === 'wxPartly')) name = 'wxMoon';
  return name;
}

// Окно «Как считается»: коэффициенты берутся из WX_K — таблица и расчёт
// разойтись не могут. Прозаические числа (0,2 мм, ветер > 8) — литералы.
function wxHelpHtml() {
  const lim = wxLimits();
  const w = lim.maxW;
  const n = (x) => (Math.round(x * 10) / 10);
  const row = (what, bad, warn) => `<tr><td>${what}</td><td class="wx-bad">${bad}</td><td class="wx-warn">${warn}</td></tr>`;
  return `<p class="small muted">Порядок такой: <b>борт → место → дата</b>. Ограничения берутся
    из карточки борта, а не из общей константы.</p>
    <p class="small">Сейчас считаем для: <b>${lim.name ? esc(lim.name) : 'без борта'}</b>${lim.battName ? ' + <b>' + esc(lim.battName) + '</b>' : ''} —
    порог ${lim.est && lim.name ? 'примерно ' : ''}<b>${w} м/с</b>, высота полёта <b>${lim.alt} м</b>.
    ${lim.est && lim.name ? 'Порог оценён по полному весу (сухой борт + АКБ) и габаритам: задайте «Макс. ветер» в карточке, чтобы считать по-своему.' : ''}</p>

    <div class="h2">Вердикт часа</div>
    <p class="small muted">Достаточно одного сработавшего условия — берётся худшее.
    Пороги ниже — для простых условий (день, ясно).</p>
    <div class="tbl-wrap"><table class="tbl">
      <thead><tr><th>Что смотрим</th><th>Не стоит</th><th>На пределе</th></tr></thead>
      <tbody>
        ${row('Ветер у земли', `> ${w} м/с`, `> ${n(w * WX_K.warn)} м/с`)}
        ${row('Ветер на высоте полёта', `> ${w} м/с`, `> ${n(w * WX_K.warn)} м/с`)}
        ${row('Порывы', `> ${n(w * WX_K.gustBad)} м/с`, `> ${n(w * WX_K.gustWarn)} м/с`)}
        ${row('Вероятность осадков', 'от 60 %', 'от 40 %')}
      </tbody>
    </table></div>

    <div class="h2">Сложные условия — порог ниже</div>
    <p class="small">Ночь не запрещает полёт, но управлять сложнее. В непростых условиях
    порог ветра умножается на коэффициент (условия перемножаются: ночь + морось = 0.8 × 0.85 ≈ 0.7):</p>
    <div class="tbl-wrap"><table class="tbl">
      <thead><tr><th>Условие</th><th></th><th>Порог для «${lim.name ? esc(lim.name) : 'борта'}»</th></tr></thead>
      <tbody>
        ${[['Темнота (ночь)', WX_K.night], ['Туман днём', WX_K.fog],
           ['Морось, слабый дождь', WX_K.drizzle], ['Слабый снег', WX_K.snow]]
          .map(([t, k]) => `<tr><td>${t}</td><td>× ${k}</td><td>${n(w * k)} м/с</td></tr>`).join('')}
      </tbody>
    </table></div>

    <div class="h2">Точно не стоит — при любом ветре</div>
    <p class="small">Явный дождь (от 0,2 мм/ч или коды умеренного и сильного дождя),
    снегопад, <b>метель</b> (снег при ветре сильнее 8 м/с), гроза и <b>туман ночью</b> —
    час всегда «не стоит».</p>

    <div class="h2">Ветер на высоте</div>
    <p class="small">Прогноз даёт ветер на 10, 80, 120 и 180 м. Берём только уровни в пределах
    высоты полёта борта и худший из них: выше 40 м — добавляется 80 м, выше 90 м — ещё 120 м,
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
  if (!hr.light) { k *= WX_K.night; why.push('ночь'); }
  if (c === 45 || c === 48) { k *= WX_K.fog; why.push('туман'); }
  if ((c >= 51 && c <= 61) || c === 80) { k *= WX_K.drizzle; why.push('морось'); }
  else if (c === 71 || c === 85) { k *= WX_K.snow; why.push('снег'); }
  return { k, why };
}

// Жёсткие запреты: час «не стоит» независимо от ветра и порогов.
// Коды WMO сверены с Open-Meteo (Context7 + живой запрос, 2026-08-25).
function wxHardStop(hr) {
  const c = hr.code;
  if (hr.prec >= 0.2 || hr.pp >= 60) return 'осадки';
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
  const stop = hr.stop !== undefined ? hr.stop : wxHardStop(hr);
  if (stop) return 'bad';
  const wEff = maxW * (hr.diff || wxDifficulty(hr)).k;
  if (hr.w10 > wEff || hr.alt > wEff || hr.gust > wEff * WX_K.gustBad) return 'bad';
  if (hr.w10 > wEff * WX_K.warn || hr.alt > wEff * WX_K.warn || hr.gust > wEff * WX_K.gustWarn || hr.pp >= 40) return 'warn';
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
      code: H.weather_code[i],
    };
    // Запрет и сложность считаются один раз здесь; вердикт, иконка и
    // строка часа читают готовое — ничего не расходится и не считается дважды.
    hr.stop = wxHardStop(hr);
    hr.diff = wxDifficulty(hr);
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
      lat = pos.coords.latitude;
      lon = pos.coords.longitude;
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
  // Приватность: наружу уходят координаты, огрублённые до ~1 км
  // (2 знака). Сетка прогнозных моделей всё равно крупнее — на точность
  // окон это не влияет, а точное место (дом, точка взлёта) не уходит.
  lat = +(+lat).toFixed(2);
  lon = +(+lon).toFixed(2);
  const url = WX_API + '?latitude=' + lat + '&longitude=' + lon +
    '&hourly=temperature_2m,precipitation,precipitation_probability,wind_speed_10m,wind_gusts_10m,wind_speed_80m,wind_speed_120m,wind_speed_180m,weather_code' +
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
  // Сначала сбрасываем выбор разобранной модели, ПОТОМ считаем пороги —
  // иначе вердикт этого рендера использует модель, которой нет в списке.
  const wxArmed = S.aircraft.filter((a) => armedBattery(a));
  if (wx.aircraftId && !wxArmed.some((a) => a.id === wx.aircraftId)) { wx.aircraftId = ''; wx.batteryId = ''; }
  const lim = wxLimits();
  const sitesWithCoords = S.sites.filter((s) => s.lat != null);

  let h = pageHead('Окна для полётов', {
    back: '#/today', sub: 'Борт · место · дата · <span class="badge online">online</span>',
    act: 'wx-help', actLabel: 'Пояснение',
  });

  if (!navigator.onLine && !wx.data) {
    h += `<div class="banner warn">Погода недоступна офлайн. Приложение продолжает работать —
      прогноз появится при подключении к сети.</div>`;
  }

  h += `<div class="card">`;
  // Только собранные модели (с установленным АКБ): окна считаются
  // для того, что реально готово лететь. wxArmed вычислен в начале view.
  const wxSel = wxArmed.find((a) => a.id === wx.aircraftId);
  h += field('Борт', selectHtml('wxmodel',
    [['', `Без борта (порог ${WX_DEFAULT_WIND} м/с, высота 100 м)`]]
      .concat(wxArmed.map((a) => {
        // для выбранной модели действует переопределение АКБ с экрана
        const b = a === wxSel && wx.batteryId
          ? S.batteries.find((x) => x.id === wx.batteryId) : armedBattery(a);
        const w = a.maxWind || wxEstimate(a, (b || {}).weight);
        const alt = a.maxAlt || WX_DEFAULT_ALT[a.type] || 100;
        return [a.id, `${a.name} · ${a.maxWind ? '' : '≈'}${w} м/с · до ${alt} м`];
      })),
    wx.aircraftId, 'data-change="weather-model"'),
    wxArmed.length
      ? 'Здесь только собранные борта («К вылету»); «≈» — оценка по весу с АКБ и габаритам'
      : 'Соберите борт — установите АКБ в его карточке, и он появится здесь');
  if (wxSel && !wxSel.maxWind) {
    h += field('Аккумулятор', selectHtml('wxbatt',
      battOptions({ emptyLabel: '— без АКБ (сухой вес) —' }),
      wx.batteryId, 'data-change="weather-batt"'),
      'Вес АКБ прибавляется к сухому весу борта в оценке порога');
  }
  h += field('Место', selectHtml('wxsite', siteOptions(sitesWithCoords, {
      emptyLabel: '— выберите —', pre: [['gps', 'Моё местоположение (GPS)']],
    }), wx.siteId, 'data-change="weather-site"'),
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
        борта: берём худшее из ветра у земли${day.topLevel ? `, ветра на высоте (${day.topLevel} м)` : ''}
        и порывов. Короткая зелёная — спокойно; полная красная — за пределом.</p>`;
      h += '<div class="card flat">';
      h += day.hours.map((hr) => {
        const wEff = lim.maxW * hr.diff.k;
        const worst = Math.max(hr.w10, hr.alt, hr.gust / WX_K.gustBad);
        const load = Math.min(1.15, worst / wEff);
        const col = hr.verdict === 'ok' ? 'var(--ok)' : hr.verdict === 'warn' ? 'var(--warn)' : 'var(--bad)';
        const word = hr.verdict === 'ok' ? 'можно' : hr.verdict === 'warn' ? 'на пределе' : 'не стоит';
        const chipCls = hr.verdict === 'ok' ? 'st-ready' : hr.verdict === 'warn' ? 'st-check' : 'st-grounded';
        const rain = !hr.stop && (hr.pp >= 15 || hr.prec > 0.1) ? ` · дождь ${hr.pp}%` : '';
        const marks = (hr.stop ? [hr.stop] : hr.diff.why).map((t) => ' · ' + t).join('');
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
      h += `<button class="btn" style="margin-top:8px" data-act="wx-windy" data-lat="${wlat}" data-lon="${wlon}">
        Windy: карта ветра <span class="badge online">online</span></button>
        <div class="windy-box" hidden></div>`;
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

// Первая пара чисел из произвольного текста (поле, буфер, ссылка карт)
// с проверкой диапазонов — ЕДИНСТВЕННЫЙ разбор координат в приложении.
function parseCoords(text) {
  const nums = String(text || '').match(/-?\d+\.\d+|-?\d+/g) || [];
  const lat = parseFloat(nums[0]), lon = parseFloat(nums[1]);
  return isFinite(lat) && isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180
    ? { lat, lon } : null;
}

// Один формат ссылки на Яндекс.Карты для всех кнопок (порядок lon,lat!).
function yaMapUrl(lat, lon, z) {
  return `https://yandex.ru/maps/?pt=${lon},${lat}&z=${z || 15}&l=map`;
}

function mapLinks(s) {
  if (s.lat == null || s.lon == null) return '';
  const osm = `https://www.openstreetmap.org/?mlat=${s.lat}&mlon=${s.lon}#map=15/${s.lat}/${s.lon}`;
  return `<a class="btn btn-sm" href="${yaMapUrl(s.lat, s.lon)}" target="_blank" rel="noopener noreferrer">Я.Карты</a>
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
  h += S.batteries.map((b) => {
    const o = battOwner(b.id);
    const chargeChip = b.status === 'retired' ? '' :
      `<button class="chip ${b.charge === 'ready' ? 'st-ready' : b.charge === 'flown' ? 'st-flown' : 'st-unknown'}"
        data-act="batt-charge" data-id="${b.id}">${CHARGE_LABEL[b.charge] || 'заряд?'}</button>`;
    return `<div class="row">
      <button class="grow" data-act="edit-batt" data-id="${b.id}" style="text-align:left;min-height:40px">
        <span class="t">${esc(b.label)}</span>
        <span class="d">${esc(b.chem || '')} ${b.cells ? b.cells + 'S' : ''}${b.p > 1 ? b.p + 'P' : ''} ${b.capacity ? '· ' + b.capacity + ' мА·ч' : ''}${b.weight ? ' · ' + b.weight + ' г' : ''} · ${b.cycles || 0} циклов${o ? ` · ${battTag(b, 'в «' + o.name + '»')}` : ''}</span></button>
      ${chargeChip}
      ${b.status === 'retired' ? '<span class="chip st-grounded">Списан</span>' : b.status === 'watch' ? '<span class="chip st-check">Следить</span>' : ''}
    </div>`;
  }).join('');
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
    h += '<p class="small muted" style="margin-top:10px">Свой шаблон появится в списке при подготовке к полёту подходящего борта.</p>';
  }
  return h;
}

function viewBackup() {
  const counts = `${S.aircraft.length} ${plural(S.aircraft.length, 'борт', 'борта', 'бортов')}, ` +
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
    <p style="margin-top:8px">RC Planner работает без сервера, аккаунтов и регистрации. Борта, полёты,
    чек-листы, конфигурации и фотографии лежат в локальной базе браузера (IndexedDB) и не отправляются
    в интернет — в приложении просто нет кода, который бы это делал.</p>
    <p style="margin-top:8px">Нет аналитики, счётчиков и рекламы. В фоне приложение обращается
    в сеть только за обновлением самой страницы.</p>
    <p style="margin-top:8px"><strong>Online-функции — только по вашему нажатию</strong>
    (помечены <span class="badge online">online</span>). Что уходит наружу:</p>
    <ul class="small" style="padding-left:18px;margin-top:4px">
      <li><b>Прогноз</b> (Open-Meteo): координаты места, огрублённые до ~1 км. Без ключей и аккаунтов.</li>
      <li><b>Мини-карта</b> (OpenStreetMap): номера тайлов просматриваемого района.</li>
      <li><b>Поиск места</b> (Nominatim/OSM): введённый вами текст запроса.</li>
      <li><b>Карта ветра</b> (Windy): координаты выбранного места — при раскрытии карты.</li>
      <li><b>Ссылки</b> (Я.Карты, OSM, инструменты): открываются в браузере по своим правилам.</li>
    </ul>
    <p style="margin-top:8px"><strong>Геолокация</strong> запрашивается у браузера только по кнопкам
    «GPS» и «Моё местоположение». Точные координаты остаются на устройстве (в вашей локации);
    в интернет они не отправляются — прогноз получает точку с точностью ~1 км. Внешним сайтам
    приложение передаёт только своё доменное имя, без каких-либо ваших данных.</p>
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

// Сохранить прогон чек-листа из UI.prep.
async function savePrepRun(p) {
  const run = {
    id: uid(), aircraftId: p.aircraftId, date: todayISO(),
    templateName: (templatesFor((S.aircraft.find((a) => a.id === p.aircraftId) || {}).type).find((t) => t.id === p.tplId) || {}).name || '',
    items: p.items.map((i) => ({ t: i.t, state: i.state })),
  };
  await put('runs', run);
  return run;
}

// Начать полёт: общая точка для «START FLIGHT» и взлёта подготовленного
// борта. Снимает пометку «подготовлен» — она одноразовая.
async function takeoff(aircraftId, runId, siteId) {
  const a = S.aircraft.find((x) => x.id === aircraftId);
  // Полёт без аккумулятора невозможен: и вес не учтён, и циклы не
  // посчитаются. Кнопки эту ситуацию не показывают, гард — страховка.
  if (!armedBattery(a)) { alert('Без аккумулятора не летаем: установите АКБ в борт.'); return; }
  const dup = activeSessionOf(aircraftId);
  if (dup) { go('#/session/' + dup.id); return; }
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
    openModal('Новый борт', `<div class="card flat">` +
      rowBtn('data-act="model-empty"',
        `<span class="grow"><span class="t">Пустой борт</span><span class="d">Заполню сам</span></span>`) +
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
    'Удалить борт вместе с историей полётов, обслуживанием и конфигурациями? Это нельзя отменить.',
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
    UI.prep = null; // сразу, до await: двойной тап не должен создать два полёта
    const run = await savePrepRun(p);
    await takeoff(p.aircraftId, run.id, p.siteId);
  },
  // «Готов»: чек-лист сохраняется, борт помечен подготовленным, а мы
  // возвращаемся к выбору модели — можно готовить несколько подряд.
  // Взлёт подготовленного — со вкладки «Полёт», без повторного чек-листа.
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
    S.aircraft = await RCDB.all('aircraft');
    closeModal();
    render();
  },
  'maint-done': async (el) => {
    const m = S.maintenance.find((x) => x.id === el.dataset.id);
    if (!m) return;
    m.done = true;
    await put('maintenance', m);
    render(true);
  },
  'takeoff-prepared': async (el) => {
    const act = activeSessionOf(el.dataset.id);
    if (act) { go('#/session/' + act.id); return; } // у борта один полёт за раз
    const a = S.aircraft.find((x) => x.id === el.dataset.id);
    if (!a || !takeoffReady(a)) { render(); return; }
    const pr = a.prepared;
    await takeoff(a.id, pr.runId, pr.siteId);
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
  'wx-help': () => openModal('Как считается окно', wxHelpHtml()),
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
    // АКБ здесь не копируется: чек-лист и полёт читают её из модели
    // (armedBattery) — источник истины один.
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
  const title = a.id ? 'Изменить борт' : presetId ? 'Новый борт · проверьте ТТХ' : 'Новый борт';
  openModal(title, `<form data-form="model" ${a.id ? `data-id="${a.id}"` : ''} ${presetId ? `data-preset="${presetId}"` : ''}>
    ${field('Название', `<input type="text" name="name" required value="${esc(a.name || '')}" placeholder="напр. Mini Talon">`)}
    ${field('Тип', typePicker(a.type))}
    <div class="grid2">
      ${field('Производитель', `<input type="text" name="manufacturer" value="${esc(a.manufacturer || '')}">`)}
      ${field('Вес, г', `<input type="number" name="weight" min="0" value="${a.weight || ''}">`)}
    </div>
    ${field('Размах / диагональ, мм', `<input type="number" name="wingspan" min="0" value="${a.wingspan || ''}">`)}
    ${field('Аккумулятор борта', selectHtml('batteryId', battOptions({ freeOnly: true, keepId: a.batteryId, emptyLabel: '— без АКБ —' }), a.batteryId || ''),
      'Один АКБ — один борт; занятые в списке не показываются')}
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

/* ---------- Мини-карта выбора точки (OSM, online) ----------
   Тайлы tile.openstreetmap.org, схема slippy z/x/y (Web Mercator).
   Математика проверена контрольными точками, живой тайл — curl 200
   image/png (2026-08-25). Атрибуция OSM обязательна — ссылка в блоке.
   Тап по карте вписывает координаты прямо в поле формы. */
const MAP_TILES = 'https://tile.openstreetmap.org';
const MAP_TILE = 256;
function mapLon2x(lon, z) { return (lon + 180) / 360 * Math.pow(2, z); }
function mapLat2y(lat, z) {
  const r = lat * Math.PI / 180;
  return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * Math.pow(2, z);
}
function mapX2lon(x, z) { return x / Math.pow(2, z) * 360 - 180; }
function mapY2lat(y, z) {
  const n = Math.PI - 2 * Math.PI * y / Math.pow(2, z);
  return 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}

function openMapPicker(box, form) {
  const c = parseCoords(new FormData(form).get('coords'));
  // Меркатор не рисует |широту| > 85° — такие координаты валидны для
  // сохранения, но карту центрируем на Москве.
  const has = c && Math.abs(c.lat) <= 85;
  const st = {
    lat: has ? c.lat : 55.7558, lon: has ? c.lon : 37.6176, z: has ? 15 : 11,
    mLat: has ? c.lat : null, mLon: has ? c.lon : null,
  };
  box.innerHTML = `<div class="mp">
    <div class="mp-search">
      <input type="text" class="mp-q" placeholder="Найти место (город, деревня…)" enterkeyhint="search">
      <button type="button" class="mp-go">Найти</button>
    </div>
    <div class="mp-found small muted" hidden></div>
    <div class="mp-view"><div class="mp-layer"></div><div class="mp-pin" hidden>${ICONS.sites}</div>
      <div class="mp-zoom">
        <button type="button" class="mp-zi" aria-label="Ближе">+</button>
        <button type="button" class="mp-zo" aria-label="Дальше">−</button>
      </div></div>
    <div class="mp-bar">
      <span class="small muted mp-hint">Тап — поставить точку</span>
      <a class="small mp-ya" href="#" target="_blank" rel="noopener noreferrer">Я.Карты</a>
      <a class="small" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OSM</a>
    </div></div>`;
  const view = $('.mp-view', box);
  const layer = $('.mp-layer', box);
  const pin = $('.mp-pin', box);
  const ya = $('.mp-ya', box);

  // Кэш тайлов на время жизни карты: при панораме/зуме докладываются
  // только недостающие картинки, уже декодированные не пересоздаются
  // (без этого каждый жест мигал перерисовкой всей сетки).
  const tiles = new Map(); // 'z/x/y' → img
  function draw() {
    const w = view.clientWidth, h = view.clientHeight;
    const cx = mapLon2x(st.lon, st.z), cy = mapLat2y(st.lat, st.z);
    const max = Math.pow(2, st.z);
    layer.style.transform = '';
    const x0 = Math.floor(cx - w / 2 / MAP_TILE), x1 = Math.floor(cx + w / 2 / MAP_TILE);
    const y0 = Math.floor(cy - h / 2 / MAP_TILE), y1 = Math.floor(cy + h / 2 / MAP_TILE);
    const need = new Set();
    for (let x = x0; x <= x1; x++) {
      for (let y = Math.max(0, y0); y <= Math.min(max - 1, y1); y++) {
        const wx = ((x % max) + max) % max; // долгота заворачивается
        const key = st.z + '/' + wx + '/' + y + '@' + x;
        need.add(key);
        let img = tiles.get(key);
        if (!img) {
          img = document.createElement('img');
          img.src = MAP_TILES + '/' + st.z + '/' + wx + '/' + y + '.png';
          img.width = MAP_TILE; img.height = MAP_TILE;
          img.draggable = false; img.alt = '';
          img.style.position = 'absolute';
          tiles.set(key, img);
          layer.appendChild(img);
        }
        img.style.left = Math.round((x - cx) * MAP_TILE + w / 2) + 'px';
        img.style.top = Math.round((y - cy) * MAP_TILE + h / 2) + 'px';
      }
    }
    for (const [key, img] of tiles) {
      if (!need.has(key)) { img.remove(); tiles.delete(key); }
    }
    if (st.mLat != null) {
      pin.hidden = false;
      pin.style.left = ((mapLon2x(st.mLon, st.z) - cx) * MAP_TILE + w / 2) + 'px';
      pin.style.top = ((mapLat2y(st.mLat, st.z) - cy) * MAP_TILE + h / 2) + 'px';
    } else pin.hidden = true;
    // Открыть точку (или центр) в Яндекс.Картах: на телефоне ссылка
    // сама поднимает установленное приложение, на десктопе — сайт.
    const yLat = st.mLat != null ? st.mLat : st.lat;
    const yLon = st.mLon != null ? st.mLon : st.lon;
    ya.href = yaMapUrl(yLat.toFixed(5), yLon.toFixed(5), st.z);
  }

  // Поиск места — Nominatim (OSM), только по кнопке/Enter: политика
  // сервиса запрещает автодополнение и чаще 1 запроса в секунду.
  const qInput = $('.mp-q', box);
  const found = $('.mp-found', box);
  let searching = false;
  async function search() {
    const q = qInput.value.trim();
    if (!q || searching) return;
    searching = true;
    found.hidden = false;
    found.textContent = 'Ищу…';
    try {
      const res = await fetch('https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&accept-language=ru&q=' + encodeURIComponent(q));
      const list = await res.json();
      if (list.length) {
        st.lat = parseFloat(list[0].lat);
        st.lon = parseFloat(list[0].lon);
        st.z = Math.max(st.z, 12);
        found.textContent = list[0].display_name;
        draw();
      } else {
        found.textContent = 'Не нашлось — уточните запрос.';
      }
    } catch (e) {
      found.textContent = 'Поиск недоступен офлайн.';
    }
    searching = false;
  }
  $('.mp-go', box).addEventListener('click', search);
  qInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); search(); } });

  // Перетаскивание: слой едет transform'ом, центр фиксируется на отпускании.
  let drag = null;
  view.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.mp-zoom')) return; // кнопки зума — не перетаскивание
    drag = { x: e.clientX, y: e.clientY, moved: false };
    view.setPointerCapture(e.pointerId);
  });
  view.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 6) drag.moved = true;
    if (drag.moved) layer.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
  });
  view.addEventListener('pointerup', (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (drag.moved) {
      st.lon = mapX2lon(mapLon2x(st.lon, st.z) - dx / MAP_TILE, st.z);
      st.lat = mapY2lat(mapLat2y(st.lat, st.z) - dy / MAP_TILE, st.z);
      draw();
    } else {
      // тап: точка под пальцем — в поле координат
      const r = view.getBoundingClientRect();
      const lon = mapX2lon(mapLon2x(st.lon, st.z) + (e.clientX - r.left - r.width / 2) / MAP_TILE, st.z);
      const lat = mapY2lat(mapLat2y(st.lat, st.z) + (e.clientY - r.top - r.height / 2) / MAP_TILE, st.z);
      st.mLat = lat; st.mLon = lon;
      const input = form.querySelector('input[name="coords"]');
      if (input) input.value = lat.toFixed(5) + ', ' + lon.toFixed(5);
      draw();
    }
    drag = null;
  });
  view.addEventListener('pointercancel', () => { drag = null; layer.style.transform = ''; });
  $('.mp-zi', box).addEventListener('click', () => { if (st.z < 18) { st.z++; draw(); } });
  $('.mp-zo', box).addEventListener('click', () => { if (st.z > 3) { st.z--; draw(); } });
  draw();
}

// showMap — открыть форму сразу с раскрытой мини-картой.
function openSiteForm(s, showMap) {
  const isNew = !s;
  s = s || {};
  openModal(isNew ? 'Новая локация' : 'Изменить локацию', `<form data-form="site" ${s.id ? `data-id="${s.id}"` : ''}>
    ${field('Название', `<input type="text" name="name" required value="${esc(s.name || '')}" placeholder="напр. Поле за деревней">`)}
    ${field('Где это', `<input type="text" name="place" value="${esc(s.place || '')}" placeholder="адрес или описание">`)}
    ${field('Координаты', `<div style="display:flex;gap:8px">
      <input type="text" name="coords" inputmode="text" value="${s.lat != null ? s.lat + ', ' + s.lon : ''}" placeholder="55.7558, 37.6176" style="flex:1;min-width:0">
      <button type="button" class="map-btn" data-act="site-paste" aria-label="Вставить из буфера">${ICONS.paste}</button>
    </div>`, 'Скопируйте из карт (широта, долгота) и нажмите кнопку вставки')}
    <div class="btn-line">
      <button class="btn" type="button" data-act="site-gps">GPS</button>
      <button class="btn" type="button" data-act="site-map">Карта <span class="badge online">online</span></button>
      <a class="btn site-ya-link" href="${s.lat != null ? yaMapUrl(s.lat, s.lon) : 'https://yandex.ru/maps/'}"
        target="_blank" rel="noopener noreferrer">Я.Карты <span class="badge online">online</span></a>
    </div>
    <div class="site-map-box" hidden></div>
    <div class="hint" style="margin:6px 0 10px">Координаты нужны для окон погоды. GPS работает без
      интернета; на карте тапните точку — координаты впишутся сами.</div>
    ${field('Заметки', `<textarea name="notes" placeholder="подъезд, ЛЭП, запретные зоны рядом">${esc(s.notes || '')}</textarea>`)}
    ${field('', `<label style="display:flex;gap:10px;align-items:center;color:var(--text);font-size:16px">
      <input type="checkbox" name="isDefault" ${s.isDefault ? 'checked' : ''} style="width:22px;height:22px"> Основная локация</label>`)}
    <button class="btn btn-primary" type="submit">Сохранить</button>
    ${s.id ? `<button class="btn btn-danger" type="button" data-act="del-site" data-id="${s.id}">Удалить</button>` : ''}
  </form>`);
  if (showMap) {
    toggleBox($('#modal-root .site-map-box'), (b) => openMapPicker(b, b.closest('form')));
  }
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
    ${field('Стоит в борте', selectHtml('inModel',
      [['', '— не в борте —']].concat(S.aircraft.map((a) => [a.id, a.name])),
      (battOwner(b.id) || {}).id || ''),
      'Поставить или снять можно и здесь, и в карточке борта')}
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
// Один строитель списка АКБ на все селекты: freeOnly скрывает занятые
// (keepId — текущая остаётся), addNew добавляет «+ Добавить…».
function battOptions(o) {
  o = o || {};
  return [['', o.emptyLabel || '—']]
    .concat(S.batteries
      .filter((b) => b.status !== 'retired' && (!o.freeOnly || b.id === o.keepId || !battOwner(b.id)))
      .map((b) => [b.id, b.label + (b.weight ? ' · ' + b.weight + ' г' : '')]))
    .concat(o.addNew ? [[NEW_OPT, '+ Добавить аккумулятор…']] : []);
}
function siteOptions(list, o) {
  o = o || {};
  return [['', o.emptyLabel || '—']]
    .concat((list || S.sites).map((x) => [x.id, x.name]))
    .concat(o.pre || [])
    .concat([[NEW_OPT, '+ Добавить локацию…']]);
}

// saved — значения формы, если её прервали ради «+ Добавить…».
function openFinishForm(sessionId, saved) {
  const s = S.sessions.find((x) => x.id === sessionId);
  if (!s) return;
  const v = saved || {};
  const elapsed = Math.round((Date.now() - s.start) / 60000);
  // Забытый полёт: не подставляем абсурдные «480 мин» — пусть пилот
  // впишет фактическую длительность сам.
  const forgotten = elapsed > STALE_FLIGHT_MIN;
  const mins = v.durationMin != null ? v.durationMin : forgotten ? '' : Math.max(1, elapsed);
  openModal('Итог полёта', `<form data-form="finish" data-id="${s.id}">
    <div class="grid2">
      ${field('Длительность, мин', `<input type="number" name="durationMin" min="0" value="${esc(mins)}" ${forgotten ? 'placeholder="сколько летали?"' : ''}>`,
        forgotten ? 'полёт выглядит забытым — впишите фактическое время' : '')}
      ${field('Результат', selectHtml('result', Object.entries(RESULTS), v.result || 'normal'))}
    </div>
    ${field('Аккумулятор', selectHtml('batteryId', battOptions({ addNew: true }),
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
// Стэш — замыкание «как переоткрыть прерванную форму»: dismissModal и
// afterNested не знают, ЧТО за форма прервана, — новая прерываемая форма
// добавляется одним таким замыканием, без веток по kind.
function openFromFinish(form, which) {
  const sessionId = form.dataset.id;
  const values = Object.fromEntries(new FormData(form));
  UI.modalReturn = {
    field: which === 'site' ? 'siteId' : 'batteryId',
    reopen: (patch) => openFinishForm(sessionId, Object.assign({}, values, patch)),
  };
  if (which === 'site') openSiteForm(null); else openBattForm(null);
}

// После сохранения локации/АКБ, открытой из другого места: подставить
// новую запись туда, откуда её вызвали. true — вернули форму сами.
async function afterNested(what, id) {
  const r = UI.modalReturn;
  if (r && r.reopen) {
    UI.modalReturn = null;
    r.reopen({ [r.field]: id });
    return true;
  }
  if (UI.view === 'prep' && UI.prep) {
    if (what === 'site') UI.prep.siteId = id;
    // «+ Добавить…» с чек-листа тоже ставит АКБ в борт (если её
    // не отдали другому борту прямо в форме через «Стоит в борте»)
    else if (!battOwner(id)) await installBattery(UI.prep.aircraftId, id);
  } else if (UI.view === 'model' && what === 'batt') {
    // «+ Добавить…» из карточки борта: новая АКБ ставится в этот борт
    if (!battOwner(id)) await installBattery(UI.arg, id);
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
    a.batteryId = fd.get('batteryId') || null;
    // releaseBattery пишет напрямую в RCDB; S.aircraft обновит общий put(a) ниже
    if (a.batteryId) await releaseBattery(a.batteryId, a.id);
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
    const c = parseCoords(fd.get('coords'));
    s.lat = c ? +c.lat.toFixed(5) : null;
    s.lon = c ? +c.lon.toFixed(5) : null;
    s.notes = fd.get('notes').trim();
    s.isDefault = !!fd.get('isDefault');
    if (s.isDefault) {
      for (const other of S.sites.filter((x) => x.isDefault && x.id !== s.id)) {
        other.isDefault = false;
        await RCDB.put('sites', other);
      }
    }
    await put('sites', s);
    if (await afterNested('site', s.id)) return;
    closeModal();
    render();
  },
  group: async (form) => {
    const fd = new FormData(form);
    const name = String(fd.get('name') || '').trim();
    if (!name) return;
    const groups = S.settings.fleetGroups || (S.settings.fleetGroups = []);
    const g = form.dataset.id ? groups.find((x) => x.id === form.dataset.id) : { id: uid(), parentId: null };
    if (!g) return;
    g.name = name;
    if (fd.get('parentId') != null) g.parentId = fd.get('parentId') || null;
    if (!form.dataset.id) groups.push(g);
    await saveSettings();
    // «+ Новая группа…» из переноса борта: сразу переносим его сюда
    const aid = form.dataset.moveAid;
    if (aid) {
      const a = S.aircraft.find((x) => x.id === aid);
      if (a) { a.groupId = g.id; await put('aircraft', a); }
    }
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
    // «Стоит в модели»: снять с прежней и поставить в выбранную.
    // Списанная АКБ в модели стоять не может — снимается принудительно
    // (иначе модель с ней числилась бы «собранной» в окнах погоды).
    const owner = (battOwner(b.id) || {}).id || '';
    const target = b.status === 'retired' ? ''
      : fd.get('inModel') != null ? String(fd.get('inModel')) : owner;
    if (target !== owner) {
      if (!target) await installBattery(owner, null);
      else await installBattery(target, b.id);
    }
    if (await afterNested('batt', b.id)) return;
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
    const elapsedMin = Math.round((s.end - s.start) / 60000);
    s.durationMin = +fd.get('durationMin') || (elapsedMin > STALE_FLIGHT_MIN ? null : elapsedMin);
    s.result = fd.get('result');
    s.batteryId = fd.get('batteryId');
    s.siteId = fd.get('siteId');
    s.weather = fd.get('weather').trim();
    s.notes = fd.get('notes').trim();
    s.problems = fd.get('problems').trim();
    await put('sessions', s);
    const b = S.batteries.find((x) => x.id === s.batteryId);
    if (b) {
      b.cycles = (b.cycles || 0) + 1;
      b.charge = 'flown'; // разряжен полётом — подпись станет синей
      await put('batteries', b);
    }
    // Любой не-нормальный итог (краш, аварийная, проблема, обслуживание)
    // запускает одну и ту же цепочку: осмотр → «Выполнено» → «Готова».
    const trouble = s.result && s.result !== 'normal';
    const ta = S.aircraft.find((x) => x.id === s.aircraftId);
    if (trouble) {
      await put('maintenance', {
        id: uid(), aircraftId: s.aircraftId, date: todayISO(), kind: 'inspection',
        title: s.result === 'crash' ? 'Осмотр после краша' : 'Осмотр после полёта #' + s.flightNo,
        reason: s.problems || RESULTS[s.result], next: '', done: false, createdAt: Date.now(),
      });
      // борт с проблемой не может оставаться «подготовленным»
      if (ta && ta.prepared) { ta.prepared = null; await put('aircraft', ta); }
    }
    if (!trouble) {
      closeModal();
      go('#/model/' + s.aircraftId);
      return;
    }
    // Дорожная карта после проблемы — чтобы было очевидно, что дальше.
    // Переход по кнопке (go() закрыл бы это окно через onRoute).
    render();
    openModal('Что дальше', `<p>Борт переведён в <b>«Обслуживание»</b> — создан
      ${s.result === 'crash' ? 'осмотр после краша' : 'осмотр после полёта'}.</p>
      <p class="small muted" style="margin-top:8px">План простой:</p>
      <ol class="small" style="padding-left:18px;margin-top:4px">
        <li>Осмотрите «${esc(ta ? ta.name : '')}» и почините, что нужно.</li>
        <li>Откройте работу в карточке борта и отметьте «Выполнено».</li>
        <li>Статус сам вернётся в «Готова» — борт снова можно готовить к полёту.</li>
      </ol>
      <button class="btn btn-primary" data-nav="#/model/${s.aircraftId}" style="margin-top:12px">К карточке борта</button>
      <button class="btn" data-act="close-modal">Позже</button>`);
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
      (${parsed.scope === 'aircraft' ? 'экспорт одного борта' : 'полная копия'} от ${esc((parsed.exported || '').slice(0, 10))}).</p>
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
  // Чип «Обслуживание» — ссылка к работам борта (лежит внутри кнопки
  // строки, поэтому перехватываем до data-nav/data-act).
  const cl = e.target.closest('.chip-link');
  if (cl) { e.preventDefault(); go(cl.dataset.goto); return; }
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
  // «+ Добавить…» обрабатывается ОДНИМ гардом для всех селектов:
  // вернуть прежний выбор и открыть нужную форму. Ветки ниже про
  // NEW_OPT знать не обязаны.
  if (el.value === NEW_OPT) {
    if (kind === 'finish-site' || kind === 'finish-batt') {
      const form = el.closest('form');
      if (form) openFromFinish(form, kind === 'finish-site' ? 'site' : 'batt');
      return;
    }
    el.value = kind === 'prep-site' ? (UI.prep && UI.prep.siteId) || ''
      : kind === 'prep-batt' ? (armedBattery(S.aircraft.find((x) => x.id === (UI.prep || {}).aircraftId)) || {}).id || ''
      : kind === 'model-batt' ? ((S.aircraft.find((x) => x.id === el.dataset.id) || {}).batteryId || '')
      : kind === 'weather-site' ? UI.wx.siteId || '' : '';
    (kind.endsWith('site') ? openSiteForm : openBattForm)(null);
    return;
  }
  if (kind === 'status-manual') {
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
  } else if (kind === 'batt-preset') {
    const p = RC.BATTERY_PRESETS.find((x) => x.id === el.value);
    if (p) openBattForm({ label: p.label, chem: p.chem, cells: p.cells, p: p.p, capacity: p.capacity, weight: p.weight, status: 'ok' }, p.id);
  } else if (kind === 'fleet-sort') {
    S.settings.fleetSort = el.value;
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
    render(true);
  } else if (kind === 'weather-batt') {
    UI.wx.batteryId = el.value;
    render(true);
  } else if (kind === 'weather-day') {
    UI.wx.day = +el.value || 0;
    render(true);
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
