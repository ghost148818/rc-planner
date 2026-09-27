// RC Planner · Формы (FORMS) по data-form и их окна.
'use strict';

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

// saved — значения формы, если её прервали ради «+ Добавить АКБ…»
// (фото через стэш не переживает — единственное поле-файл).
function openModelForm(a, presetId, saved, cloneId) {
  const isNew = !a || !a.id;
  a = a || { type: 'quad' };
  if (saved) a = Object.assign({}, a, saved);
  // Заголовок уходит в <h2> БЕЗ esc() (openModal) — только литералы,
  // имя образца в него не попадает.
  const title = a.id ? 'Изменить борт'
    : cloneId ? 'Копия борта · проверьте поля'
    : presetId ? 'Новый борт · проверьте ТТХ' : 'Новый борт';
  openModal(title, `<form data-form="model" ${a.id ? `data-id="${a.id}"` : ''} ${presetId ? `data-preset="${presetId}"` : ''} ${cloneId ? `data-clone="${esc(cloneId)}"` : ''}>
    ${field('Название', `<input type="text" name="name" required value="${esc(a.name || '')}" placeholder="напр. Mini Talon">`)}
    ${field('Тип', typePicker(a.type))}
    <div class="grid2">
      ${field('Производитель', `<input type="text" name="manufacturer" value="${esc(a.manufacturer || '')}">`)}
      ${field('Вес, г', `<input type="number" name="weight" min="0" value="${numVal(a.weight)}">`)}
    </div>
    ${field('Размах / диагональ, мм', `<input type="number" name="wingspan" min="0" value="${numVal(a.wingspan)}">`)}
    ${field('Аккумулятор борта', selectHtml('batteryId',
      battOptions({ freeOnly: true, keepId: a.batteryId, emptyLabel: '— без АКБ —', addNew: true }),
      a.batteryId || '', `data-change="form-model-batt" data-prev="${esc(a.batteryId || '')}"`),
      'Один АКБ — один борт; занятые в списке не показываются')}
    <div class="grid2">
      ${field('Макс. ветер, м/с', `<input type="number" name="maxWind" min="1" max="60" step="0.5" value="${numVal(a.maxWind)}" placeholder="≈${wxEstimate(a)}">`, 'пусто — оценка по ТТХ')}
      ${field('Высота полёта, м', `<input type="number" name="maxAlt" min="10" max="${WX_ALT_MAX}" step="10" value="${numVal(a.maxAlt)}" placeholder="${WX_DEFAULT_ALT[a.type] || 100}">`, 'для окон погоды, до 3000')}
    </div>
    <div class="grid2">
      ${field('Осмотр каждые, полётов', `<input type="number" name="svcEvery" min="1" max="999" step="1" value="${numVal(a.svcEvery)}" placeholder="напр. 10">`)}
      ${field('Осмотр каждые, минут налёта', `<input type="number" name="svcEveryMin" min="1" max="99999" step="1" value="${numVal(a.svcEveryMin)}" placeholder="напр. 180">`)}
    </div>
    <div class="small muted" style="margin:-6px 0 10px">Напоминание на «Сегодня» и в чек-листе; счёт заново после выполненной работы.
      Можно задать оба — сработает тот, что подойдёт раньше. Пусто — без напоминаний.</div>
    ${field('Фото', `<input type="file" name="photo" accept="image/*">`,
      a.photo ? 'Фото уже есть — новое заменит его'
        : cloneId ? 'Фото образца не копируется — снимите новое' : '')}
    ${field('Заметки', `<textarea name="notes">${esc(a.notes || '')}</textarea>`)}
    <button class="btn btn-primary" type="submit">${isNew ? 'Добавить' : 'Сохранить'}</button>
  </form>`);
}

// preset — {title, kind} для новой записи (осмотр с «Сегодня»).
function openMaintForm(m, aircraftId, preset) {
  const isNew = !m;
  preset = preset || {};
  m = m || { aircraftId, date: todayISO(), kind: MAINT_KINDS[preset.kind] ? preset.kind : 'repair', title: preset.title || '' };
  openModal(isNew ? 'Обслуживание' : 'Изменить запись', `<form data-form="maint" ${m.id ? `data-id="${m.id}"` : `data-aid="${m.aircraftId}"`}>
    ${field('Что сделано / нужно сделать', `<input type="text" name="title" required value="${esc(m.title || '')}" placeholder="напр. Замена мотора №3">`)}
    <div class="grid2">
      ${field('Тип', selectHtml('kind', Object.entries(MAINT_KINDS), m.kind))}
      ${field('Дата', `<input type="date" name="date" value="${esc(m.date || todayISO())}">`)}
    </div>
    ${field('Причина', `<input type="text" name="reason" value="${esc(m.reason || '')}" placeholder="напр. шум подшипника">`)}
    ${field('Следующее действие', `<input type="text" name="next" value="${esc(m.next || '')}" placeholder="напр. заказать подшипники">`)}
    ${m.photo ? `<img src="${photoURL(m)}" alt="" style="width:100%;max-height:200px;object-fit:cover;border-radius:12px;margin-bottom:8px">` : ''}
    ${field('Фото повреждения', `<input type="file" name="photo" accept="image/*">`,
      m.photo ? 'Фото уже есть — новое заменит его' : 'Снимок хранится на устройстве и попадает в резервную копию')}
    ${m.photo ? field('', `<label class="check-row"><input type="checkbox" name="dropPhoto"> Удалить фото</label>`) : ''}
    ${field('', `<label class="check-row"><input type="checkbox" name="done" ${m.done ? 'checked' : ''}> Выполнено</label>`)}
    <button class="btn btn-primary" type="submit">Сохранить</button>
    ${m.id ? `<button class="btn btn-danger" type="button" data-act="del-maint" data-id="${m.id}">Удалить</button>` : ''}
  </form>`);
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
    ${field('', `<label class="check-row"><input type="checkbox" name="isDefault" ${s.isDefault ? 'checked' : ''}> Основная локация</label>`)}
    <button class="btn btn-primary" type="submit">Сохранить</button>
    ${s.id ? `<button class="btn btn-danger" type="button" data-act="del-site" data-id="${s.id}">Удалить</button>` : ''}
  </form>`);
  if (showMap) {
    toggleBox($('#modal-root .site-map-box'), (b) => openMapPicker(b, b.closest('form')));
  }
}

/* Химия аккумуляторов — ЕДИНСТВЕННЫЙ источник: из него строится и селект
   формы, и оценка веса, и инвариант в test/checks.js. Второе число —
   типовая удельная энергия пакета с проводами (Вт·ч/кг).

   LiHV — тот же LiPo, заряжаемый до 4.35 В на банку (владелец, 10 сен):
   по массе от LiPo не отличается, разница в напряжении, а напряжение
   приложение не считает вовсе. Порядок строк — порядок в селекте.

   Список массивом, а не объектом: поиск идёт find'ом, и химия из чужой
   резервной копии («constructor») не достаёт значение из прототипа. */
const BATT_CHEM = [
  ['LiPo', 145], ['LiHV', 145], ['Li-Ion', 220], ['LiFe', 110], ['NiMH', 75],
];

// Оценка веса пакета (г) по химии, банкам и ёмкости. Всегда правится
// вручную в форме.
function battEstimateWeight(chem, cells, capacity) {
  if (!cells || !capacity) return 0;
  const row = BATT_CHEM.find(([k]) => k === chem);
  const dens = row ? row[1] : 145;
  const wh = capacity / 1000 * cells * 3.7;
  return Math.round(wh / dens * 1000 / 10) * 10;
}

// Новый аккумулятор — как новый борт: сначала выбор «пустой или готовая
// сборка», потом форма. Единственный вход: кнопка «Добавить», пустое
// состояние, шаг обучения и «+ Добавить аккумулятор…» из селектов.
// UI.modalReturn окно переживает: крестик и Esc идут через dismissModal
// и возвращают прерванную форму, выбор строки — через closeModal.
function openBattPicker() {
  openModal('Новый аккумулятор', `<div class="card flat">` +
    rowBtn('data-act="batt-empty"',
      `<span class="grow"><span class="t">Пустой аккумулятор</span><span class="d">Заполню сам</span></span>`, 'batteries') +
    RC.BATTERY_PRESETS.map((p, i) => rowBtn(`data-act="batt-pick" data-i="${i}"`,
      `<span class="grow"><span class="t">${esc(p.label)}</span><span class="d">${esc(p.desc)}</span></span>`, 'batteries')).join('') +
    `</div><p class="small muted" style="margin-top:8px">Готовая сборка заполняет химию, банки,
    ёмкость и вес — всё можно поменять в форме.</p>`);
}

function openBattForm(b, presetId) {
  b = b || { chem: 'LiPo', status: 'ok' };
  const title = b.id ? 'Аккумулятор' : presetId ? 'Новый аккумулятор · проверьте' : 'Новый аккумулятор';
  // «Стоит в борте»: у заведённой АКБ — её борт; у новой, заведённой
  // с «Сегодня» (шаг обучения «…и поставьте в борт»), — новейший борт
  // без АКБ, иначе шаг не засчитать, не уходя с экрана. Выбор меняется.
  const owner = b.id ? (battOwner(b.id) || {}).id || ''
    : UI.view === 'today' ? (S.aircraft.filter((a) => !armedBattery(a))
      .sort((x, y) => (+y.createdAt || 0) - (+x.createdAt || 0))[0] || {}).id || '' : '';
  openModal(title, `<form data-form="batt" ${b.id ? `data-id="${b.id}"` : ''}>
    ${field('Метка', `<input type="text" name="label" required value="${esc(b.label || '')}" placeholder="напр. LiPo 4S #3">`)}
    <div class="grid2">
      ${field('Химия', selectHtml('chem', BATT_CHEM.map(([k]) => [k, k]), b.chem))}
      ${field('Банки (S / P)', `<div style="display:flex;gap:8px;align-items:center">
        <input type="number" name="cells" min="1" max="14" value="${numVal(b.cells)}" placeholder="6" style="flex:1">
        <span class="muted">S ×</span>
        <input type="number" name="p" min="1" max="10" value="${numVal(b.p)}" placeholder="1" style="flex:1">
        <span class="muted">P</span></div>`)}
    </div>
    <div class="grid2">
      ${field('Ёмкость, мА·ч', `<input type="number" name="capacity" min="0" value="${numVal(b.capacity)}">`)}
      ${field('Вес, г', `<input type="number" name="weight" min="0" value="${numVal(b.weight)}" placeholder="${battEstimateWeight(b.chem, b.cells, b.capacity) || 'оценю сам'}">`,
        'пусто — оценка по химии и ёмкости')}
    </div>
    <div class="grid2">
      ${field('Циклы', `<input type="number" name="cycles" min="0" value="${numVal(b.cycles) || 0}">`, '+1 за первый полёт после отметки «заряжен»')}
      ${field('Состояние', selectHtml('status', [['ok', 'В строю'], ['watch', 'Следить'], ['retired', 'Списан']], b.status))}
    </div>
    ${field('Стоит в борте', selectHtml('inModel',
      [['', '— не в борте —']].concat(S.aircraft.map((a) => [a.id, a.name])), owner),
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
      .map((b) => [b.id, b.label + (b.weight && !o.noWeight ? ' · ' + b.weight + ' г' : '')]))
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
  const v = saved || (s.end ? s : {}); // завершённый полёт — правка итога
  const elapsed = Math.round(((s.end || s.landedAt || Date.now()) - s.start) / 60000);
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
  if (which === 'site') openSiteForm(null); else openBattPicker();
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

// Имя копии: «Apex 5″» → «Apex 5″ (2)»; копия копии — «(3)», а не
// «Apex 5″ (2) (2)». Свободный номер ищется по всему флоту, сравнение
// без регистра и краевых пробелов — иначе вторая копия того же борта
// заводила бы второй «(2)».
function cloneName(name) {
  const base = String(name || 'Борт').replace(/\s*\(\d+\)\s*$/, '').trim() || 'Борт';
  const taken = new Set(S.aircraft.map((x) => String(x.name || '').trim().toLowerCase()));
  for (let n = 2; n <= 99; n++) {
    const cand = base + ' (' + n + ')';
    if (!taken.has(cand.toLowerCase())) return cand;
  }
  return base + ' (копия)';
}

// Комплектация нового борта — от образца или от готовой платформы.
// Копия ГЛУБОКАЯ: клон правит свои компоненты, образец цел. Берём только
// собственные ключи и только три строковых поля: запись из чужой копии
// произвольна, а ключи прототипа в этом проекте уже дважды протаскивали
// в разметку исходник функции. Нет комплектации — пустой словарь.
function copyComponents(srcObj) {
  const out = {};
  const c = srcObj && srcObj.components;
  if (!c || typeof c !== 'object') return out;
  for (const k of Object.keys(c)) {
    const v = c[k];
    if (v && typeof v === 'object') {
      out[k] = { name: String(v.name || ''), fw: String(v.fw || ''), notes: String(v.notes || '') };
    }
  }
  return out;
}

const FORMS = {
  model: async (form) => {
    const fd = new FormData(form);
    const id = form.dataset.id;
    const preset = RC.AIRCRAFT_PRESETS.find((p) => p.id === form.dataset.preset);
    // Копия борта: комплектация приходит от образца, а не от платформы.
    const src = form.dataset.clone ? S.aircraft.find((x) => x.id === form.dataset.clone) : null;
    const a = id ? S.aircraft.find((x) => x.id === id) : {
      id: uid(), statusManual: '', createdAt: Date.now(),
      components: copyComponents(src || preset),
    };
    a.name = fd.get('name').trim();
    a.type = fd.get('type');
    a.manufacturer = fd.get('manufacturer').trim();
    a.weight = +fd.get('weight') || null;
    a.wingspan = +fd.get('wingspan') || null;
    // Замок летящего борта проверяем ДО мутации: a — живой объект из
    // S.aircraft, и преждевременное присваивание ломало и проверку,
    // и «откат» (battOwner видел уже изменённое значение).
    let newBatt = fd.get('batteryId') || null;
    if (newBatt === NEW_OPT) newBatt = null; // страховка от застрявшего «__new»
    if (newBatt !== (a.batteryId || null)) {
      const lock = battLockedBy(a.id, newBatt);
      if (lock) {
        alert(`«${lock}» сейчас в полёте — аккумулятор останется прежним до посадки.`);
      } else {
        a.batteryId = newBatt;
        // releaseBattery пишет напрямую в RCDB; S.aircraft обновит общий put(a) ниже
        if (newBatt) await releaseBattery(newBatt, a.id);
      }
    }
    a.maxWind = +String(fd.get('maxWind')).replace(',', '.') || null;
    const maxAlt = +fd.get('maxAlt');
    a.maxAlt = maxAlt ? Math.min(WX_ALT_MAX, Math.max(10, maxAlt)) : null;
    const svcEvery = Math.round(+fd.get('svcEvery'));
    a.svcEvery = svcEvery > 0 ? Math.min(999, svcEvery) : null;
    const svcEveryMin = Math.round(+fd.get('svcEveryMin'));
    a.svcEveryMin = svcEveryMin > 0 ? Math.min(99999, svcEveryMin) : null;
    a.notes = fd.get('notes').trim();
    const photo = fd.get('photo');
    if (photo && photo.size) { a.photo = photo; dropPhotoURL(a.id); }
    await put('aircraft', a);
    // Конфигурации копии — своими записями: тот же файл и текст, новые
    // id и владелец. Полёты, работы и прогоны не копируются никогда.
    if (!id && src) {
      for (const c of S.configs.filter((x) => x.aircraftId === src.id)) {
        await put('configs', Object.assign({}, c, { id: uid(), aircraftId: a.id, createdAt: Date.now() }));
      }
    }
    closeModal();
    if (!id) UI.justCreated = a.id; // баннер «что дальше» на карточке
    go('#/model/' + a.id);
  },
  comp: async (form) => {
    const a = S.aircraft.find((x) => x.id === form.dataset.id);
    const fd = new FormData(form);
    const c = {
      name: fd.get('name').trim(),
      fw: (fd.get('fw') || '').trim(), // версия прошивки компонента (2.0)
      notes: fd.get('notes').trim(),
    };
    // components из копии проверяет только validateBackup (там лишь id):
    // строка на месте объекта роняла запись в strict mode.
    a.components = a.components && typeof a.components === 'object' ? a.components : {};
    // Пустая запись ключ не занимает: очищенный убранный слот («Передатчик»)
    // уходит со строки насовсем, а не остаётся объектом из пустых строк.
    if (c.name || c.fw || c.notes) a.components[form.dataset.key] = c;
    else delete a.components[form.dataset.key];
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
    // m — живой объект из S.maintenance: старое значение читаем ДО присваивания,
    // иначе «когда закрыли» затрётся при каждом сохранении записи.
    const wasDone = !!m.done;
    m.done = !!fd.get('done');
    if (m.done && !wasDone) m.doneAt = Date.now();
    if (!m.done) m.doneAt = null;
    const photo = fd.get('photo');
    if (photo && photo.size) { m.photo = photo; dropPhotoURL(m.id); }
    else if (fd.get('dropPhoto')) { m.photo = null; dropPhotoURL(m.id); }
    await put('maintenance', m);
    closeModal();
    render();
  },
  site: async (form) => {
    const fd = new FormData(form);
    const s = form.dataset.id ? S.sites.find((x) => x.id === form.dataset.id) : { id: uid(), createdAt: Date.now() };
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
    const b = form.dataset.id ? S.batteries.find((x) => x.id === form.dataset.id) : { id: uid(), createdAt: Date.now() };
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
    const firstFinish = !s.end; // ДО присваивания end, иначе всегда false
    s.end = s.end || s.landedAt || Date.now(); // правка итога не сдвигает конец
    s.landedAt = null;
    const elapsedMin = Math.round((s.end - s.start) / 60000);
    // Явный «0» — валидная длительность (прервали на взлёте); пустое
    // поле у забытого полёта — честное «неизвестно» (правится позже).
    const rawDur = String(fd.get('durationMin')).trim();
    s.durationMin = rawDur !== '' && isFinite(+rawDur)
      ? Math.max(0, Math.round(+rawDur))
      : (elapsedMin > STALE_FLIGHT_MIN ? null : elapsedMin);
    s.result = fd.get('result');
    s.batteryId = fd.get('batteryId');
    s.siteId = fd.get('siteId');
    s.weather = fd.get('weather').trim();
    s.notes = fd.get('notes').trim();
    s.problems = fd.get('problems').trim();
    await put('sessions', s);
    const b = S.batteries.find((x) => x.id === s.batteryId);
    if (b && firstFinish) {
      // Цикл = заряд→разряд: +1 только за ПЕРВЫЙ полёт после зарядки.
      // Короткий полёт и второй вылет на той же банке цикл не добавляют.
      // Правка уже записанного итога циклы не трогает.
      if (b.charge !== 'flown') b.cycles = (b.cycles || 0) + 1;
      b.charge = 'flown'; // разряжена полётом — подпись станет синей
      await put('batteries', b);
    }
    // Любой не-нормальный итог (краш, аварийная, проблема, обслуживание)
    // запускает одну и ту же цепочку: осмотр → «Выполнено» → «Готов».
    const trouble = firstFinish && s.result && s.result !== 'normal';
    const ta = S.aircraft.find((x) => x.id === s.aircraftId);
    if (trouble) {
      await put('maintenance', {
        id: uid(), aircraftId: s.aircraftId, date: todayISO(), kind: 'inspection',
        title: s.result === 'crash' ? 'Осмотр после краша' : 'Осмотр после полёта #' + s.flightNo,
        reason: s.problems || resultLabel(s), next: '', done: false, createdAt: Date.now(),
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
        <li>Статус сам вернётся в «Готов» — борт снова можно готовить к полёту.</li>
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
