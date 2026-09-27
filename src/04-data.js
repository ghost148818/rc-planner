// RC Planner · Данные: нормализация записей (NORM), загрузка, запись, миграции.
'use strict';

/* ============================================================
   4. ДАННЫЕ
============================================================ */

// Нормализация записей из базы. Резервная копия проверяется только по
// id (validateBackup), а поля идут в разметку без esc(): числа бортов и
// АКБ, координаты локаций (в value и href), даты полётов/работ/конфигураций,
// результат полёта как ключ словаря RESULTS. Правило: всё, что попадает
// в S из RCDB, проходит через normalizeStore — и в loadAll, и в refresh()
// после каждой записи. Ревью 2.0 (раунд 2): нормализация только в loadAll
// держалась до первого put() — перечитка store возвращала сырые строки.
const numOrNull = (v) => (v == null || v === '' || !isFinite(+v) ? null : +v);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const dateOrNull = (v) => (typeof v === 'string' && DATE_RE.test(v) ? v : null);
// Значение-ключ словаря (тип борта, заряд АКБ, вид работы, состояние
// пункта): только собственный ключ словаря, иначе null. Ключ прототипа
// ('constructor') отдавал бы функцию: её исходник попадал в разметку
// как текст «function Object() { [native code] }» (аудит 2026-09-05).
const keyOrNull = (dict, v) =>
  (typeof v === 'string' && Object.prototype.hasOwnProperty.call(dict, v) ? v : null);
const NORM = {
  sites(s) {
    s.lat = numOrNull(s.lat);
    s.lon = numOrNull(s.lon);
    if (s.lat == null || s.lon == null) { s.lat = null; s.lon = null; }
  },
  aircraft(a) {
    for (const k of ['weight', 'wingspan', 'maxWind', 'maxAlt', 'svcEvery', 'svcEveryMin', 'alarmMin']) a[k] = numOrNull(a[k]);
    // Сигнал таймера — только в пределах поля формы (0,5…120 мин)
    if (a.alarmMin != null && !(a.alarmMin > 0 && a.alarmMin <= 120)) a.alarmMin = null;
    a.type = keyOrNull(TYPES, a.type);
    a.statusManual = keyOrNull(STATUS, a.statusManual) || '';
    // Пометка «подготовлен» из копии: объект со строковым runId и числовым
    // at, иначе null. Испорченная пометка давала «Invalid Date» в герое
    // «Сегодня» и NaN в сортировке подготовленных бортов.
    const p = a.prepared;
    a.prepared = p && typeof p === 'object' && typeof p.runId === 'string' && isFinite(+p.at)
      ? { runId: p.runId, at: +p.at, siteId: typeof p.siteId === 'string' ? p.siteId : '' }
      : null;
  },
  batteries(b) {
    for (const k of ['cells', 'p', 'capacity', 'weight']) b[k] = numOrNull(b[k]);
    b.cycles = Math.max(0, Math.round(numOrNull(b.cycles) || 0));
    b.charge = keyOrNull(CHARGE_LABEL, b.charge);
  },
  sessions(s) {
    s.date = dateOrNull(s.date);
    // Незнакомый результат — «—», а не выдуманный «Нормальный»
    if (s.result != null && s.result !== '' && !Object.prototype.hasOwnProperty.call(RESULTS, s.result)) s.result = null;
  },
  maintenance(m) { m.date = dateOrNull(m.date); m.kind = keyOrNull(MAINT_KINDS, m.kind); },
  // Свой шаблон чек-листа из копии. Пункты не массивом роняли экран
  // «Шаблоны», форму шаблона и смену шаблона на чек-листе (t.items.map),
  // пункт-не-объект — перечисление проблем, а ключ прототипа в типе
  // отдавал исходник функции через TYPES[t.type] (аудит 2026-09-07).
  // Неизвестный тип становится «любым»: это значение по умолчанию формы.
  templates(t) {
    t.type = keyOrNull(TYPES, t.type) || 'any';
    t.builtin = false; // встроенные живут в RC.CHECKLISTS, свой им не притворяется
    t.items = (Array.isArray(t.items) ? t.items : [])
      .filter((i) => i && typeof i.t === 'string')
      .map((i) => ({ t: i.t, hint: typeof i.hint === 'string' ? i.hint : '' }));
  },
  configs(c) { c.date = dateOrNull(c.date); },
  // Состояние пункта прогона идёт в data-state без esc(): строка
  // `"><img onerror=…>` из копии исполнялась в деталях полёта
  // (аудит 2026-09-05, живая проба). Только ok/fail/skip, иначе null.
  runs(r) {
    r.date = dateOrNull(r.date);
    r.items = (Array.isArray(r.items) ? r.items : []).filter((it) => it && typeof it === 'object');
    for (const it of r.items) it.state = keyOrNull(CK_MARK, it.state);
  },
};

function normalizeStore(store, list) {
  const f = NORM[store];
  if (f) for (const r of list) if (r) f(r);
  return list;
}

// Единственный способ перечитать store из базы в S.
async function refresh(store) {
  S[store] = normalizeStore(store, await RCDB.all(store));
}

async function loadAll() {
  const snap = await RCDB.snapshot();
  Object.keys(snap).forEach((k) => {
    if (k === 'settings') return;
    S[k] = normalizeStore(k, snap[k]);
  });
  const st = snap.settings.find((x) => x.id === 'main');
  if (st) S.settings = Object.assign({ favTools: [] }, st);
  // Кэш прогноза тоже приезжает из копии: его latitude/longitude идут
  // в data-атрибуты кнопки Windy (финальное ревью 2.0: строка с
  // `" autofocus onfocus=` исполнялась без единого касания). Координаты —
  // строго числа; иначе кэш целиком в мусор — «Окна» запросят прогноз заново.
  const wc = S.settings.weatherCache;
  if (wc) {
    const j = wc.json;
    const lat = j && numOrNull(j.latitude), lon = j && numOrNull(j.longitude);
    // Восход/закат и часы — строки вида 2026-09-05T06:12: wxDay режет их
    // slice(), нестрока роняла отрисовку «Окон» и «Сегодня» целиком.
    const isoList = (l) => Array.isArray(l) && l.every((v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/.test(v));
    const shapeOk = j && j.hourly && j.daily && isoList(j.hourly.time) &&
      isoList(j.daily.time) && isoList(j.daily.sunrise) && isoList(j.daily.sunset);
    if (lat == null || lon == null || !shapeOk) delete S.settings.weatherCache;
    else {
      j.latitude = lat; j.longitude = lon;
      // elevation идёт в арифметику (высота барического уровня над
      // землёй), а не в разметку: нечисловое значение даёт NaN в подписи,
      // а не инъекцию. Кэш из-за него не выбрасываем — приземные уровни
      // всё ещё годные.
      j.elevation = numOrNull(j.elevation);
    }
  }
  // Группы флота из импортированной копии: только валидные записи
  // (id/parentId — безопасные строки, name — строка).
  const idOk = (v) => typeof v === 'string' && /^[\w-]{1,64}$/.test(v);
  S.settings.fleetGroups = (Array.isArray(S.settings.fleetGroups) ? S.settings.fleetGroups : [])
    .filter((g) => g && idOk(g.id) && typeof g.name === 'string')
    .map((g) => ({ id: g.id, name: g.name, parentId: idOk(g.parentId) ? g.parentId : null }));
  const gIds = new Set(S.settings.fleetGroups.map((g) => g.id));
  for (const g of S.settings.fleetGroups) if (g.parentId && !gIds.has(g.parentId)) g.parentId = null;
  // Осиротевший groupId (экспорт борта без настроек, слитая копия)
  // прятал бы борт из всех групп — возвращаем в «Без группы».
  for (const a of S.aircraft || []) {
    if (a.groupId && !gIds.has(a.groupId)) a.groupId = null;
  }
}

async function put(store, obj) {
  await RCDB.put(store, obj);
  if (store !== 'settings') await refresh(store);
}

async function del(store, id) {
  await RCDB.del(store, id);
  await refresh(store);
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
  if (!S.settings.migrPack1) {
    // Обновление стартовых сборов доезжает и до уже засеянных наборов:
    // старые формулировки переименовываются, новые пункты дописываются
    // в наборы с пресетными именами (свои наборы и правки не трогаем).
    // Map вместо объекта: пункт с именем вроде 'constructor' не должен
    // подтянуть функцию из прототипа и уронить запись в базу.
    const renames = new Map([
      ['Передатчик (заряжен)', 'Аппаратура управления (заряжена)'],
      ['Передатчик', 'Аппаратура управления (заряжена)'],
    ]);
    // Дописываем ТОЛЬКО пункты этого обновления — не весь пресет:
    // иначе воскресим то, что пользователь удалял осознанно.
    const additions = new Map([['FPV-сессия', ['VRX-нашлёпка (видеоприёмник на очки)']]]);
    for (const p of S.packing) {
      let changed = false;
      for (const it of p.items) {
        if (renames.has(it.t)) { it.t = renames.get(it.t); changed = true; }
      }
      // «Передатчик» + «Передатчик (заряжен)» дали бы дубль — схлопываем
      p.items = p.items.filter((it, i) => {
        const dup = it.t === 'Аппаратура управления (заряжена)' &&
          p.items.findIndex((x) => x.t === it.t) !== i;
        if (dup) changed = true;
        return !dup;
      });
      for (const t of additions.get(p.name) || []) {
        if (!p.items.some((it) => it.t === t)) { p.items.push({ t, done: false }); changed = true; }
      }
      if (changed) await RCDB.put('packing', p);
    }
    await refresh('packing');
    S.settings.migrPack1 = true;
    touched = true;
  }
  if (!S.settings.migrWx3) {
    // Формат прогноза изменился: добавились барические уровни, их
    // геопотенциальные высоты и elevation. Старый кэш выбрасываем один
    // раз — иначе он ещё шесть часов будет говорить «выше 200 м данных
    // нет» там, где данные есть.
    delete S.settings.weatherCache;
    S.settings.migrWx3 = true;
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
