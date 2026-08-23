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
};

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

/* ============================================================
   5. ПРИМИТИВЫ РАЗМЕТКИ
============================================================ */

const ICONS = {
  today: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-8 9 8"/><path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5"/></svg>',
  fleet: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4z"/></svg>',
  flight: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="14" r="7.5"/><path d="M12 14v-4"/><path d="M9.5 2.5h5"/></svg>',
  packing: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6.5 7.5h11L19 20a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1z"/><path d="M9 7.5a3 3 0 0 1 6 0"/></svg>',
  more: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.9"/><circle cx="12" cy="12" r="1.9"/><circle cx="19" cy="12" r="1.9"/></svg>',
  chev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg>',
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6 9 12l6 6"/></svg>',
  plane: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4z"/></svg>',
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
  today: 'today',
  fleet: 'fleet', model: 'fleet',
  flight: 'flight', prep: 'flight', session: 'flight', log: 'flight',
  packing: 'packing', pack: 'packing',
  more: 'more', tools: 'more', sites: 'more', batteries: 'more',
  backup: 'more', privacy: 'more', templates: 'more',
};

function pageHead(title, opts) {
  opts = opts || {};
  return `<div class="head">
    ${opts.back ? `<button class="back" data-nav="${opts.back}" aria-label="Назад">${ICONS.back}</button>` : ''}
    <div class="grow"><h1>${title}</h1>${opts.sub ? `<div class="sub">${opts.sub}</div>` : ''}</div>
    ${opts.act ? `<button class="head-act" data-act="${opts.act}">${opts.actLabel}</button>` : ''}
  </div>`;
}

function rowBtn(attrs, inner) {
  return `<button class="row" ${attrs}>${inner}<span class="chev">${ICONS.chev}</span></button>`;
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
  d.addEventListener('cancel', (ev) => { ev.preventDefault(); closeModal(); });
  d.addEventListener('click', (ev) => { if (ev.target === d) closeModal(); });
}

function closeModal() {
  const d = $('#modal-root dialog');
  if (d) { try { d.close(); } catch (e) {} d.remove(); }
  document.body.classList.remove('locked');
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
    : `<span class="thumb ph">${ICONS.plane}</span>`;
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

function viewFleet() {
  let h = pageHead('Мои модели', { act: 'add-model', actLabel: 'Добавить' });
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

/* ---------- Ещё ---------- */

function viewMore() {
  const ver = ($('meta[name="build"]') || {}).content || 'dev';
  let h = pageHead('Ещё');
  h += '<div class="card flat">';
  h += rowBtn('data-nav="#/tools"', `<span class="grow"><span class="t">Инструменты</span><span class="d">Конфигураторы, прошивки, калькуляторы</span></span>`);
  h += rowBtn('data-nav="#/sites"', `<span class="grow"><span class="t">Локации</span><span class="d">Запомненные места полётов</span></span>`);
  h += rowBtn('data-nav="#/batteries"', `<span class="grow"><span class="t">Аккумуляторы</span><span class="d">Парк батарей и циклы</span></span>`);
  h += rowBtn('data-nav="#/templates"', `<span class="grow"><span class="t">Шаблоны чек-листов</span><span class="d">Свои предполётные проверки</span></span>`);
  h += rowBtn('data-nav="#/backup"', `<span class="grow"><span class="t">Данные и резервная копия</span><span class="d">Экспорт, импорт, восстановление</span></span>`);
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
    h += rowBtn('data-act="update-app"', `<span class="grow"><span class="t" style="color:var(--ok)">Обновить приложение</span><span class="d">Новая версия готова</span></span>`);
  }
  h += rowBtn('data-act="whatsnew"', `<span class="grow"><span class="t">Что нового</span><span class="d">История изменений</span></span>`);
  h += rowBtn('data-nav="#/privacy"', `<span class="grow"><span class="t">Приватность</span><span class="d">Где живут ваши данные</span></span>`);
  h += '</div>';

  h += `<p class="small muted center" style="margin-top:16px">RC Planner · сборка <span class="mono">${esc(ver)}</span><br>
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
    h += `<details class="fold" ${!favTools.length && cat.id === 'config' ? 'open' : ''}><summary>${esc(cat.name)} (${list.length})</summary>
      <div class="fold-body"><div class="card flat">${list.map(toolRow).join('')}</div></div></details>`;
  });
  h += `<p class="small muted" style="margin-top:12px">Каталог — ссылки на официальные источники.
    Приложение не копирует сторонние сервисы и не распространяет чужие прошивки.</p>`;
  return h;
}

function viewSites() {
  let h = pageHead('Локации', { back: '#/more', act: 'add-site', actLabel: 'Добавить' });
  if (!S.sites.length) return h + emptyState('Запомните места, где летаете: поле, парк, склон.', 'add-site', 'Добавить локацию');
  h += '<div class="card flat">';
  h += S.sites.map((s) => rowBtn(`data-act="edit-site" data-id="${s.id}"`,
    `<span class="grow"><span class="t">${esc(s.name)}${s.isDefault ? ' <span class="badge">основная</span>' : ''}</span>
     <span class="d">${esc(s.place || '')}</span></span>`)).join('');
  h += '</div>';
  return h;
}

function viewBatteries() {
  let h = pageHead('Аккумуляторы', { back: '#/more', act: 'add-batt', actLabel: 'Добавить' });
  if (!S.batteries.length) return h + emptyState('Заведите парк батарей — циклы будут считаться по полётам.', 'add-batt', 'Добавить АКБ');
  h += '<div class="card flat">';
  h += S.batteries.map((b) => rowBtn(`data-act="edit-batt" data-id="${b.id}"`,
    `<span class="grow"><span class="t">${esc(b.label)}</span>
     <span class="d">${esc(b.chem || '')} ${b.cells ? b.cells + 'S' : ''} ${b.capacity ? '· ' + b.capacity + ' мА·ч' : ''} · ${b.cycles || 0} циклов</span></span>
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
  'close-modal': () => closeModal(),
  'dismiss-hi': () => { lsSet('rcp.hi', '1'); render(); },

  /* --- Модели --- */
  'add-model': () => openModelForm(null),
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
      batteryId: '', siteId: (S.sites.find((x) => x.isDefault) || {}).id || '',
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
  };
}

/* ============================================================
   8. ФОРМЫ
============================================================ */

function openModelForm(a) {
  const isNew = !a;
  a = a || { type: 'quad' };
  openModal(isNew ? 'Новая модель' : 'Изменить модель', `<form data-form="model" ${a.id ? `data-id="${a.id}"` : ''}>
    ${field('Название', `<input type="text" name="name" required value="${esc(a.name || '')}" placeholder="напр. Mini Talon">`)}
    ${field('Тип', selectHtml('type', Object.entries(TYPES), a.type))}
    <div class="grid2">
      ${field('Производитель', `<input type="text" name="manufacturer" value="${esc(a.manufacturer || '')}">`)}
      ${field('Вес, г', `<input type="number" name="weight" min="0" value="${a.weight || ''}">`)}
    </div>
    ${field('Размах / диагональ, мм', `<input type="number" name="wingspan" min="0" value="${a.wingspan || ''}">`)}
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
    ${field('Где это', `<input type="text" name="place" value="${esc(s.place || '')}" placeholder="адрес, координаты или описание">`)}
    ${field('Заметки', `<textarea name="notes" placeholder="подъезд, ЛЭП, запретные зоны рядом">${esc(s.notes || '')}</textarea>`)}
    ${field('', `<label style="display:flex;gap:10px;align-items:center;color:var(--text);font-size:16px">
      <input type="checkbox" name="isDefault" ${s.isDefault ? 'checked' : ''} style="width:22px;height:22px"> Основная локация</label>`)}
    <button class="btn btn-primary" type="submit">Сохранить</button>
    ${s.id ? `<button class="btn btn-danger" type="button" data-act="del-site" data-id="${s.id}">Удалить</button>` : ''}
  </form>`);
}

function openBattForm(b) {
  const isNew = !b;
  b = b || { chem: 'LiPo', status: 'ok' };
  openModal(isNew ? 'Новый аккумулятор' : 'Аккумулятор', `<form data-form="batt" ${b.id ? `data-id="${b.id}"` : ''}>
    ${field('Метка', `<input type="text" name="label" required value="${esc(b.label || '')}" placeholder="напр. LiPo 4S #3">`)}
    <div class="grid2">
      ${field('Химия', selectHtml('chem', [['LiPo', 'LiPo'], ['Li-Ion', 'Li-Ion'], ['LiFe', 'LiFe'], ['NiMH', 'NiMH']], b.chem))}
      ${field('Банки (S)', `<input type="number" name="cells" min="1" max="14" value="${b.cells || ''}">`)}
    </div>
    <div class="grid2">
      ${field('Ёмкость, мА·ч', `<input type="number" name="capacity" min="0" value="${b.capacity || ''}">`)}
      ${field('Циклы', `<input type="number" name="cycles" min="0" value="${b.cycles || 0}">`, 'Растут сами после каждого полёта')}
    </div>
    ${field('Состояние', selectHtml('status', [['ok', 'В строю'], ['watch', 'Следить'], ['retired', 'Списан']], b.status))}
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

function openFinishForm(sessionId) {
  const s = S.sessions.find((x) => x.id === sessionId);
  if (!s) return;
  const mins = Math.max(1, Math.round((Date.now() - s.start) / 60000));
  openModal('Итог полёта', `<form data-form="finish" data-id="${s.id}">
    <div class="grid2">
      ${field('Длительность, мин', `<input type="number" name="durationMin" min="0" value="${mins}">`)}
      ${field('Результат', selectHtml('result', Object.entries(RESULTS), 'normal'))}
    </div>
    ${field('Аккумулятор', selectHtml('batteryId',
      [['', '—']].concat(S.batteries.filter((b) => b.status !== 'retired').map((b) => [b.id, b.label])), s.batteryId),
      S.batteries.length ? 'Циклы выбранной АКБ вырастут на 1' : 'Парк батарей — в разделе «Ещё»')}
    ${field('Локация', selectHtml('siteId',
      [['', '—']].concat(S.sites.map((x) => [x.id, x.name])), s.siteId),
      S.sites.length ? '' : 'Локации запоминаются в разделе «Ещё»')}
    ${field('Погода', `<input type="text" name="weather" placeholder="напр. ветер 5 м/с, +18°, ясно">`)}
    ${field('Заметки', `<textarea name="notes" placeholder="как летела, что понравилось"></textarea>`)}
    ${field('Проблемы', `<textarea name="problems" placeholder="что сломалось или насторожило"></textarea>`)}
    <button class="btn btn-primary" type="submit">Записать полёт</button>
  </form>`);
}

const FORMS = {
  model: async (form) => {
    const fd = new FormData(form);
    const id = form.dataset.id;
    const a = id ? S.aircraft.find((x) => x.id === id) : {
      id: uid(), components: {}, statusManual: '', createdAt: Date.now(),
    };
    a.name = fd.get('name').trim();
    a.type = fd.get('type');
    a.manufacturer = fd.get('manufacturer').trim();
    a.weight = +fd.get('weight') || null;
    a.wingspan = +fd.get('wingspan') || null;
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
    s.notes = fd.get('notes').trim();
    s.isDefault = !!fd.get('isDefault');
    if (s.isDefault) {
      for (const other of S.sites.filter((x) => x.isDefault && x.id !== s.id)) {
        other.isDefault = false;
        await RCDB.put('sites', other);
      }
    }
    await put('sites', s);
    closeModal();
    render();
  },
  batt: async (form) => {
    const fd = new FormData(form);
    const b = form.dataset.id ? S.batteries.find((x) => x.id === form.dataset.id) : { id: uid() };
    b.label = fd.get('label').trim();
    b.chem = fd.get('chem');
    b.cells = +fd.get('cells') || null;
    b.capacity = +fd.get('capacity') || null;
    b.cycles = +fd.get('cycles') || 0;
    b.status = fd.get('status');
    b.notes = fd.get('notes').trim();
    await put('batteries', b);
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
    s.batteryId = fd.get('batteryId');
    s.siteId = fd.get('siteId');
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
  packing: viewPacking, pack: viewPack,
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
  } else if (kind === 'import-file') {
    handleImportFile(el);
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
      <strong>Версия ${c.v}</strong><span class="small muted">${fmtDate(c.date)}</span></div>
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

function maybeWhatsNew() {
  const latest = RC.CHANGELOG[0];
  if (!latest) return;
  const seen = +(lsGet('rcp.seen') || 0);
  if (!seen) { lsSet('rcp.seen', String(latest.v)); return; } // первый запуск — без окна
  if (latest.v > seen) { showWhatsNew(false); lsSet('rcp.seen', String(latest.v)); }
}

/* ============================================================
   12. СТАРТ
============================================================ */

(async function start() {
  try {
    await loadAll();
    await seedIfNeeded();
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
