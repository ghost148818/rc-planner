// RC Planner · Утилиты: экранирование, даты, файлы, тема, Wake Lock.
'use strict';

/* ============================================================
   2. УТИЛИТЫ
============================================================ */

const $ = (sel, el) => (el || document).querySelector(sel);

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Числовое значение в атрибут value= формы. Данные могут прийти
// из импортированной копии, где их никто не проверял: validateBackup
// стережёт только id записей. Не число — пустая клетка, иначе строка
// вида `" onfocus="…` вырывается из атрибута и исполняется (проверено
// живой пробой на dist). Числовые поля через esc() не гоняем: пустое
// поле честнее, чем мусор в поле «Вес, г».
function numVal(v) {
  return v == null || v === '' || !isFinite(+v) ? '' : +v;
}

// Номер полёта в разметку — та же идея, что numVal: flightNo приходит
// из копии непроверенным, строка `<img onerror=…>` в этом поле
// исполнялась (ревью 2.0, живая проба на #/journal). Целое число —
// «#007», всё остальное — «#—».
function flightNoText(s) {
  const n = s && s.flightNo;
  return '#' + (n != null && n !== '' && Number.isInteger(+n) ? String(+n).padStart(3, '0') : '—');
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

// Дата не по маске возвращается как текст — обязательно через esc():
// date полётов, работ и конфигураций приезжает из копии непроверенной,
// а вызывающие вставляют результат в разметку как есть (ревью 2.0, раунд 2).
// Основная защита — нормализация в NORM (не-дата → null), это второй рубеж.
function fmtDate(iso) {
  if (!iso) return '—';
  const [y, m, d] = String(iso).split('-').map(Number);
  if (!y || !m || !d || m > 12) return esc(String(iso));
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
  // trim снаружи: у круглых часов иначе оставался хвостовой пробел («3 ч »)
  return (Math.floor(min / 60) + ' ч ' + (min % 60 ? (min % 60) + ' мин' : '')).trim();
}

// Короткий налёт для узких плиток: «48 мин», «1,1 ч», «12,5 ч» — иначе
// «1 ч 6 мин» не влезает в плитку героя на телефоне.
function fmtDurShort(min) {
  if (min == null || isNaN(min)) return '—';
  min = Math.round(min);
  if (min < 60) return min + ' мин';
  return (min / 60).toFixed(1).replace('.', ',').replace(',0', '') + ' ч';
}

function fmtClock(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return (mm < 100 ? String(mm).padStart(2, '0') : mm) + ':' + String(ss).padStart(2, '0');
}

// Таймер на экране: мигает только двоеточие (span.colon), цифры стоят.
function clockHtml(ms) {
  const [mm, ss] = fmtClock(ms).split(':');
  return mm + '<span class="colon">:</span>' + ss;
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

// Сохранить файл на устройство. На телефоне — системный лист
// «Поделиться» (Web Share с файлами): куда положить копию, решает
// пользователь; приложение само ничего никуда не отправляет. Без
// поддержки — обычная загрузка. Возвращает true, если файл ушёл
// (по нему ставится дата резервной копии); закрытый лист — false.
// Лист — только на сенсорных устройствах: настольный Safari тоже умеет
// Web Share с файлами, но в его листе нет «Сохранить в файл» — копию
// на диск с Mac было бы не положить (ревью пакета 3).
function touchDevice() {
  try {
    return navigator.maxTouchPoints > 0 || matchMedia('(pointer: coarse)').matches;
  } catch (e) { return false; }
}
async function saveFile(name, blob) {
  let file = null;
  try { file = new File([blob], name, { type: blob.type }); } catch (e) { /* нет File — только download */ }
  if (file && touchDevice() && navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name });
      return true;
    } catch (e) {
      if (e && e.name === 'AbortError') return false; // пользователь закрыл лист — тихо
      // любая другая ошибка (нет жеста, лист не поддержал тип) — обычная загрузка
    }
  }
  download(name, blob);
  return true;
}

// Резервная копия просрочена: данные есть, а копии не было или она
// старше двух недель. Баннер на «Сегодня» и строка в «Разобраться».
const BACKUP_DUE_DAYS = 14;
function backupDue() {
  const hasData = S.aircraft.length > 0 || S.sessions.some((s) => s.end);
  const at = +S.settings.lastBackupAt || 0;
  return hasData && (!at || Date.now() - at > BACKUP_DUE_DAYS * 86400000);
}
function backupAgeDays() {
  const at = +S.settings.lastBackupAt || 0;
  return at ? Math.floor((Date.now() - at) / 86400000) : null;
}
// Полёты, завершённые после последней копии (нет копии — все).
function flightsSinceBackup() {
  const at = +S.settings.lastBackupAt || 0;
  return S.sessions.filter((s) => s.end && s.end > at).length;
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
function lsDel(k) { try { localStorage.removeItem(k); } catch (e) {} }

// Тема и режим интерфейса — только UI-предпочтения в localStorage.
// rcp.theme: light|dark, отсутствует — как в системе.
// rcp.ui: gloves|max, отсутствует — «Стандарт». До 3.0 режим «В перчатках»
// хранился в rcp.gloves='1' — переводится на новый ключ при первом чтении.
// Тот же расчёт продублирован инлайн-скриптом в index.html, чтобы первая
// отрисовка не мигала; здесь — источник для настроек и смены темы системы.
const THEME_COLOR = { dark: '#0b1017', light: '#eef2f7' };
const UI_MODES = ['gloves', 'standard', 'max'];
function themePref() {
  const t = lsGet('rcp.theme');
  return t === 'light' || t === 'dark' ? t : 'system';
}
function uiMode() {
  let u = lsGet('rcp.ui');
  if (!u && lsGet('rcp.gloves') === '1') {
    u = 'gloves';
    lsSet('rcp.ui', u);
    lsDel('rcp.gloves');
  }
  return UI_MODES.includes(u) ? u : 'standard';
}
function applyTheme() {
  let t = themePref();
  if (t === 'system') {
    t = window.matchMedia && matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  const root = document.documentElement;
  root.dataset.theme = t;
  root.dataset.ui = uiMode();
  const meta = $('meta[name="theme-color"]');
  if (meta) meta.content = THEME_COLOR[t];
}
function reducedMotion() {
  return !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
}

// Wake Lock: экран не гаснет, пока на экране полёта идёт полёт (борт в
// воздухе, посадки ещё нет). Прогрессивное улучшение: без API ничего не
// происходит. Локальный API — никуда ничего не отправляет. Систему не
// обманываем: замок отпускается при посадке, отмене и уходе с экрана
// (syncWakeLock из paint), а при уходе вкладки в фон его снимает сам
// браузер — по возвращении (visibilitychange) запрашиваем заново.
// Индикатор «экран не гаснет» показывается только когда замок реально
// получен: request асинхронный и может быть отклонён (низкий заряд).
function wakeLockWanted() {
  if (UI.view !== 'session') return false;
  const s = S.sessions.find((x) => x.id === UI.arg);
  return !!(s && !s.end && !s.landedAt);
}
async function requestWakeLock() {
  if (!navigator.wakeLock || UI.wakeLock || UI.wakeLockPending || document.hidden) return;
  UI.wakeLockPending = true;
  try {
    const lock = await navigator.wakeLock.request('screen');
    UI.wakeLockPending = false;
    // Пока ждали, экран могли покинуть — замок не нужен, отдаём сразу
    if (!wakeLockWanted()) { lock.release().catch(() => {}); return; }
    UI.wakeLock = lock;
    lock.addEventListener('release', () => {
      if (UI.wakeLock === lock) UI.wakeLock = null;
      wakeIndicator();
    });
  } catch (e) {
    UI.wakeLockPending = false;
    UI.wakeLock = null;
  }
  wakeIndicator();
}
function releaseWakeLock() {
  const lock = UI.wakeLock;
  UI.wakeLock = null;
  if (lock) lock.release().catch(() => {});
  wakeIndicator();
}
function syncWakeLock() {
  if (wakeLockWanted()) requestWakeLock(); else releaseWakeLock();
}
// Индикатор в шапке экрана полёта правится точечно, без render():
// перерисовка ради одной надписи заново собирала бы экран.
function wakeIndicator() {
  const el = $('#wake-ind');
  if (el) el.hidden = !UI.wakeLock;
}
