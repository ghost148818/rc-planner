// RC Planner · Статусы бортов, регламент осмотра, активные полёты.
'use strict';

/* ============================================================
   3. СТАТУСЫ МОДЕЛЕЙ
============================================================ */

// short — подпись чипа в тесных строках списков (флот, выбор борта):
// «Обслуживание» и «Полёты запрещены» рядом с именем на телефоне резались
// многоточием, а статус — главное в строке. Без short берётся label.
const STATUS = {
  ready: { label: 'Готов', cls: 'st-ready' },
  check: { label: 'Проверить', cls: 'st-check' },
  maintenance: { label: 'Обслуживание', short: 'ТО', cls: 'st-maintenance' },
  grounded: { label: 'Полёты запрещены', short: 'Запрет', cls: 'st-grounded' },
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

// Подпись результата полёта — только по СОБСТВЕННОМУ ключу словаря.
// `RESULTS[s.result]` с ключом прототипа ('constructor', 'toString')
// из копии отдавал функцию, и `.toLowerCase()` ронял «Сегодня» на
// старте (ревью 2.0, раунд 2). NORM приводит result к известным ключам,
// здесь — второй рубеж для сессий, собранных в памяти.
function resultLabel(s, dflt) {
  const k = s && s.result;
  return Object.prototype.hasOwnProperty.call(RESULTS, k) ? RESULTS[k] : (dflt == null ? '—' : dflt);
}

function sessionsOf(id) {
  return S.sessions.filter((s) => s.aircraftId === id).sort((a, b) => b.start - a.start);
}

// Цепочка после краша/аварии очевидна: полёт с проблемой → «Обслуживание»
// (создан осмотр) → осмотр отмечен выполненным → снова «Готов».
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

// Регламент осмотра: два независимых счётчика — a.svcEvery «каждые N
// полётов» и a.svcEveryMin «каждые N минут налёта» (для самолётов
// с долгими вылетами полёты — плохая мера износа). Задать можно любой
// из них или оба; при двух срабатывает тот, что подошёл раньше.
// Счёт идёт от последней ЗАКРЫТОЙ работы (m.doneAt, у записей до 1.3 —
// m.createdAt): отметили работу выполненной — счётчик пошёл заново.
// Статус борта регламент не меняет: это напоминание, а не запрет.
function svcState(a) {
  const every = Math.round(+a.svcEvery) || 0;
  const everyMin = Math.round(+a.svcEveryMin) || 0;
  if (every < 1 && everyMin < 1) return null;
  const since = S.maintenance.reduce((t, m) =>
    m.aircraftId === a.id && m.done ? Math.max(t, m.doneAt || m.createdAt || 0) : t, 0);
  const after = sessionsOf(a.id).filter((s) => s.end && s.start >= since);
  const flights = after.length;
  const minutes = after.reduce((n, s) => n + (s.durationMin || 0), 0);
  return {
    every, everyMin, flights, minutes, since,
    left: every ? every - flights : null,
    leftMin: everyMin ? everyMin - minutes : null,
    due: (every > 0 && flights >= every) || (everyMin > 0 && minutes >= everyMin),
  };
}

// Тексты регламента живут рядом с расчётом — иначе формулировки на
// «Сегодня», в карточке и в чек-листе разъедутся между собой.
// Показываем только настроенные счётчики: пустой пользователю не нужен.
function svcSinceText(sv) {
  const parts = [];
  if (sv.every) parts.push(`${sv.flights} ${plural(sv.flights, 'полёт', 'полёта', 'полётов')}`);
  if (sv.everyMin) parts.push(`${fmtDur(sv.minutes)} налёта`);
  return parts.join(' и ');
}
// «каждые» согласуется с числом: при единице нужна другая форма,
// иначе выходит «каждые 1 полёт». Поле разрешает 1 — случай живой.
function svcEveryText(sv) {
  const parts = [];
  if (sv.every) {
    parts.push(sv.every === 1 ? 'каждый полёт'
      : `каждые ${sv.every} ${plural(sv.every, 'полёт', 'полёта', 'полётов')}`);
  }
  if (sv.everyMin) {
    parts.push(sv.everyMin === 60 ? 'каждый час налёта'
      : sv.everyMin === 1 ? 'каждую минуту налёта'
      : `каждые ${fmtDur(sv.everyMin)} налёта`);
  }
  return parts.join(' или ');
}
// «Сколько осталось» — по каждому счётчику; наступит тот, что раньше.
function svcLeftText(sv) {
  const parts = [];
  if (sv.every) parts.push(`${sv.left} ${plural(sv.left, 'полёт', 'полёта', 'полётов')}`);
  if (sv.everyMin) parts.push(`${fmtDur(sv.leftMin)} налёта`);
  return parts.join(' или ');
}

// gotoHash: чип «Обслуживание» становится ссылкой к работам борта —
// клик перехватывается делегатом раньше родительской кнопки строки.
// aircraftId: чип «Обслуживание» кликабелен — открывает запись работы
// (одна открытая — сразу «Изменить запись», несколько — карточку борта).
// Подпись — в своём span (.cl): в строке флота чип ограничен 40 % ширины
// и длинный статус обрезается многоточием, а не выдавливает имя борта.
// short — короткая подпись для строк списков (см. STATUS); полная остаётся
// в title, чтобы «ТО» можно было прочитать по долгому нажатию/наведению.
function chip(st, aircraftId, short) {
  const s = STATUS[st] || STATUS.unknown;
  const link = st === 'maintenance' && aircraftId;
  const label = short && s.short ? s.short : s.label;
  return `<span class="chip ${s.cls}${link ? ' chip-link' : ''}"${link ? ` data-aid="${esc(aircraftId)}"` : ''}${label !== s.label ? ` title="${s.label}"` : ''}><span class="cl">${label}</span></span>`;
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
// exceptId — полёт, который экран уже показал героем (карточка на
// «Сегодня» в состоянии «в полёте»): баннер о нём был бы дублем.
function activeFlightBanners(exceptId) {
  return activeSessions().filter((s) => s.id !== exceptId).map((s) => {
    const a = S.aircraft.find((x) => x.id === s.aircraftId);
    if (s.landedAt) {
      // сел, но итог не записан — не «идёт полёт» и не «забыли завершить»
      const mins = Math.round((s.landedAt - s.start) / 60000);
      return `<div class="banner">Сел: ${esc(a ? a.name : '')} · ${fmtDur(mins)}. Осталось записать итог.
        <button class="btn-sm btn right" data-act="finish-flight" data-id="${s.id}">Итог</button></div>`;
    }
    const mins = Math.round((Date.now() - s.start) / 60000);
    return staleSession(s)
      ? `<div class="banner warn">Полёт «${esc(a ? a.name : '')}» идёт уже ${fmtDur(mins)} — забыли завершить?
          <button class="btn-sm btn right" data-act="finish-flight" data-id="${s.id}">Завершить</button>
          <button class="btn-sm btn right" data-act="discard-flight" data-id="${s.id}">Удалить</button></div>`
      : `<div class="banner warn">Идёт полёт: ${esc(a ? a.name : '')} · ${fmtDur(mins)}.
          <button class="btn-sm btn right" data-nav="#/session/${s.id}">Открыть</button></div>`;
  }).join('');
}
