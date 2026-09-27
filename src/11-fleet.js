// RC Planner · Флот: группы, строки бортов, комплектация, установка АКБ.
'use strict';

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
  // Имя не ужимается: кнопке имени — не меньше 45 % строки; чип статуса
  // с короткой подписью (short), чтобы не резаться многоточием.
  return `<div class="row fleet-row">
    <button class="grow row-main" data-nav="#/model/${a.id}">
      ${aircraftThumb(a)}<span class="grow"><span class="t">${esc(a.name)}</span>
      <span class="d">${TYPES[a.type] || ''}${a.manufacturer ? ' · ' + esc(a.manufacturer) : ''}${b ? ' · ' + battTag(b) : ''}</span></span></button>
    ${chip(statusOf(a), a.id, true)}
    <button class="row-move" data-act="move-model" data-id="${a.id}" aria-label="Переместить в группу">${ICONS.move}</button>
  </div>`;
}

function viewFleet() {
  let h = pageHead('Флот', { act: 'add-model', actLabel: 'Добавить', help: 'fleet' }) + fleetSeg('fleet');
  if (!S.aircraft.length) {
    return h + emptyState('Пока нет ни одного борта.', 'add-model', 'Добавить борт', 'fleet');
  }
  const groups = fleetGroups();
  h += `<div class="fleet-bar">
    ${selectHtml('fleetSort', [['name', 'По названию'], ['status', 'По статусу'], ['type', 'По типу']],
      S.settings.fleetSort || 'name', 'data-change="fleet-sort" style="flex:1;min-height:var(--seg)"')}
    <button class="btn btn-sm" data-act="add-group">${ICONS.plus}Группа</button>
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
  openModal(isNew ? 'Новая группа' : 'Группа', `<form data-form="group" ${g.id ? `data-id="${esc(g.id)}"` : ''} ${moveAid ? `data-move-aid="${esc(moveAid)}"` : ''}>
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
  const row = (gid, label, sub) => rowBtn(`data-act="move-model-to" data-id="${esc(a.id)}" data-gid="${esc(gid)}" ${sub ? 'style="padding-left:28px"' : ''}`,
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

/* Слоты оборудования: [ключ, подпись, опции]. Опции: types — типы бортов,
   которым слот положен (нет опций — положен всем; ПУСТОЙ список — слот
   убран, но подпись сохранена ради старых записей); hint — подсказка под
   полем «Название / модель».

   Правило показа — compSlots: слот виден, если положен типу борта ИЛИ
   в нём у ЭТОГО борта уже что-то записано. Второе условие обязательно:
   приложение опубликовано, и у чужих бортов в слоте «Передатчик» лежат
   настоящие записи — их не прячем, не переносим и не переписываем.
   Тот же приём, что у легаси-заметки АКБ в compBatteryRow.

   Типы пишем литералами, без TYPES: test/checks.js исполняет этот блок
   в песочнице и сверяет по нему ключи пресетов — блок самодостаточен. */
const COMPONENTS = [
  ['motor', 'Мотор'], ['esc', 'ESC'], ['fc', 'Полётный контроллер'],
  ['rx', 'Приёмник (RX)'], ['gps', 'GPS'], ['servo', 'Сервоприводы'],
  ['prop', 'Пропеллер'], ['vtx', 'VTX'], ['camera', 'Камера'],
  ['pitot', 'Трубка Пито', { types: ['plane', 'wing'],
    hint: 'Датчик воздушной скорости: трубка, шланги, модуль давления' }],
  ['pak', 'ПАК', { types: ['plane', 'wing'],
    hint: 'Программно-аппаратный комплекс: модуль идентификации и трекинга' }],
  ['tx', 'Передатчик (старое поле)', { types: [],
    hint: 'Слот заменён на «ПАК». Перенесите запись и очистите поля — строка исчезнет.' }],
  ['battery', 'Аккумулятор'],
];

// Слоты этого борта. a.components из копии может быть чем угодно
// (validateBackup проверяет только id): индексируем своими ключами,
// поэтому строка или массив на месте объекта даёт undefined.
function compSlots(a) {
  const comps = (a && a.components) || {};
  const filled = (k) => !!(comps[k] && (comps[k].name || comps[k].fw || comps[k].notes));
  // (o.types || []) — слот с опциями, но без списка типов, не роняет
  // карточку борта: он просто никому не положен и виден только там,
  // где уже заполнен. Наличие списка сторожит test/checks.js.
  return COMPONENTS.filter(([key, , o]) => !o || (o.types || []).includes(a && a.type) || filled(key));
}

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

// Состояние заряда отмечено — любое из двух. Без отметки полёт не начать
// (решение владельца 2026-09-07): «после полёта» тоже годится, второй
// вылет на той же банке приложение разрешает осознанно (цикл за него
// не считается). Гард требует посмотреть на банку, а не решает за пилота.
const chargeKnown = (b) => !!(b && CHARGE_LABEL[b.charge]);

// Тап по чипу перерисовывает экран, и НА МЕСТЕ чипа появляется главная
// кнопка («Взлёт» в герое и строках борта, «Начать полёт» на чек-листе).
// В перчатках промашка «два касания подряд» вторым тапом начинала полёт —
// замер ревью: одинаково при паузах 80, 150 и 300 мс, во всех трёх местах.
// Полсекунды после отметки касание сюда не считается: и полёт не начнётся,
// и повторный тап не переведёт свежий «заряжен» в «после полёта» (это
// стоило бы цикла АКБ). Приём тот же, что «UI.prep = null до await».
const CHARGE_TAP_MS = 500;
let chargeTapAt = 0;
const chargeJustTapped = () => Date.now() - chargeTapAt < CHARGE_TAP_MS;

// Чип заряда — переключатель batt-charge: зелёный «заряжен», синий
// «после полёта», серый «заряд?» (не отмечено). Одна разметка на карточку
// борта, список АКБ, чек-лист и «Взлёт» подготовленного борта. Решение
// «списанной АКБ чипа не даём» остаётся у вызывающего (battRow).
function chargeChip(b) {
  if (!b) return '';
  const cls = b.charge === 'ready' ? 'st-ready' : b.charge === 'flown' ? 'st-flown' : 'st-unknown';
  return `<button class="chip ${cls}" data-act="batt-charge" data-id="${b.id}">${CHARGE_LABEL[b.charge] || 'заряд?'}</button>`;
}

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

// АКБ «заперта», пока её борт в воздухе: перестановка сломала бы и
// подсчёт циклов, и связь полёта с батареей. Возвращает имя борта-помехи.
function battLockedBy(aId, bId) {
  const flying = (x) => x && activeSessionOf(x.id) && x;
  const owner = bId && battOwner(bId);
  return (flying(S.aircraft.find((x) => x.id === aId)) || (owner && owner.id !== aId && flying(owner)) || {}).name || '';
}

// Единая установка/снятие: bId в модель aId (aId пустой — просто снять
// отовсюду). Все места (карточка модели, форма модели, форма АКБ,
// чек-лист) проходят через неё либо через releaseBattery.
// Store перечитывается ОДИН раз в конце, а не после каждой записи.
async function installBattery(aId, bId) {
  const lock = battLockedBy(aId, bId);
  if (lock) { alert(`«${lock}» сейчас в полёте — аккумулятор можно переставить после посадки.`); return; }
  if (bId) await releaseBattery(bId, aId);
  const a = aId && S.aircraft.find((x) => x.id === aId);
  if (a) { a.batteryId = bId || null; await RCDB.put('aircraft', a); }
  await refresh('aircraft');
}
