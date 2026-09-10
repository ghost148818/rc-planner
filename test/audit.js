// Набор 2: аудит экранов по dist/rc-planner.html (file://).
// Все экраны отрисовываются без ошибок консоли; пользовательский
// текст экранируется (XSS-проба).
'use strict';

const path = require('path');
const { chromium } = require('playwright');
const { ok, finish, newPage } = require('./helpers');

const DIST = path.join(__dirname, '..', 'dist', 'rc-planner.html');

// Экраны без обязательного аргумента. Должен совпадать со списком в app.js —
// новый экран добавлять и туда, и сюда, иначе его никто не проверит.
const VIEWS = ['today', 'fleet', 'flight', 'prep', 'journal', 'log', 'stats', 'packing', 'weather',
  'more', 'tools', 'sites', 'batteries', 'templates', 'backup', 'privacy', 'help'];

(async () => {
  const browser = await chromium.launch();
  const { page, errors } = await newPage(browser);
  await page.goto('file://' + DIST);
  await page.waitForSelector('#tabbar .tab');
  ok(true, 'приложение стартовало по file://');

  for (const v of VIEWS) {
    await page.evaluate((hash) => { location.hash = hash; }, '#/' + v);
    await page.waitForTimeout(60);
    const len = await page.evaluate(() => document.getElementById('views').innerHTML.length);
    ok(len > 100, 'экран ' + v + ' отрисован (' + len + ' байт)');
  }

  // XSS-проба: имя модели с внедрённым тегом.
  const payload = '<img src=x onerror="window.__xss=1">Проба';
  await page.evaluate(() => { location.hash = '#/fleet'; });
  await page.click('[data-act="add-model"]');
  await page.click('[data-act="model-empty"]');
  await page.fill('dialog input[name="name"]', payload);
  await page.click('dialog button[type="submit"]');
  await page.waitForSelector('.head h1');
  await page.waitForTimeout(120);
  const xss = await page.evaluate(() => window.__xss);
  ok(!xss, 'внедрённый тег не исполнился');
  const title = await page.textContent('.head h1');
  ok(title.includes('Проба'), 'имя показано как текст');

  // XSS-проба вторая: числовые поля форм. Значения приходят из
  // резервной копии, где validateBackup проверяет только id, и попадают
  // прямо в атрибут value= — строка вида `" onfocus="…` из атрибута
  // вырывалась и исполнялась (найдено ревью 1.4, закрыто numVal).
  const attrPayload = '" onfocus="window.__xss2=1" autofocus x="';
  await page.evaluate(async (payload) => {
    await window.RCDB.put('aircraft', {
      id: 'attr-probe', name: 'Проба атрибута', type: 'plane', components: {},
      weight: payload, wingspan: payload, maxWind: payload, maxAlt: payload,
      svcEvery: payload, svcEveryMin: payload,
    });
    await window.RCDB.put('batteries', {
      id: 'attr-batt', label: 'Проба АКБ', chem: 'lipo',
      cells: payload, p: payload, capacity: payload, weight: payload, cycles: payload,
    });
    await window.loadAll();
    location.hash = '#/model/attr-probe';
  }, attrPayload);
  // Проверяем по DOM, а не регуляркой по innerHTML: экранированная
  // кавычка в тексте <option> при сериализации возвращается сырой,
  // и поиск «onfocus=» в разметке даёт ложную тревогу на безобидный текст.
  // Вырвавшийся атрибут виден только как настоящий атрибут элемента.
  const injected = async () => page.evaluate(() => {
    const dlg = document.querySelector('dialog');
    if (!dlg) return 'окно не открылось';
    const bad = dlg.querySelectorAll('[onfocus], [autofocus], [x]');
    // Заодно проводим фокус по всем полям: подложенный обработчик сработал бы.
    dlg.querySelectorAll('input, select, textarea').forEach((el) => el.focus());
    return bad.length;
  });

  await page.waitForTimeout(150);
  await page.click('[data-act="edit-model"]');
  await page.waitForTimeout(200);
  ok((await injected()) === 0, 'форма борта: мусор из копии не вырвался из value=');
  await page.click('.dlg-close');

  await page.evaluate(() => {
    openBattForm(S.batteries.find((b) => b.id === 'attr-batt'));
  });
  await page.waitForTimeout(200);
  ok((await injected()) === 0, 'форма АКБ: мусор из копии не вырвался из value=');
  await page.click('.dlg-close');
  ok(!(await page.evaluate(() => window.__xss2)), 'подложенный обработчик не исполнился');

  // XSS-проба третья: номер полёта. flightNo из копии — не обязательно
  // число; журнал (#/journal) рисует его первым (закрыто flightNoText).
  await page.evaluate(async () => {
    await window.RCDB.put('sessions', {
      id: 'no-probe', aircraftId: 'attr-probe', date: '2026-01-01', start: 1, end: 2,
      durationMin: 3, flightNo: '<img src=x onerror="window.__xss3=1">', result: 'normal',
    });
    await window.loadAll();
    location.hash = '#/log'; // старый адрес: открывает журнал на «Полётах» (после обхода VIEWS сегмент стоит на «Статистике»)
  });
  await page.waitForTimeout(200);
  ok((await page.evaluate(() => document.querySelectorAll('#views img[src="x"]').length)) === 0,
    'журнал: номер полёта из копии не стал тегом');
  ok(!(await page.evaluate(() => window.__xss3)), 'обработчик в номере полёта не исполнился');
  ok((await page.textContent('#views')).includes('#—'), 'нечисловой номер полёта показан как «#—»');
  await page.evaluate(async () => { await window.RCDB.del('sessions', 'no-probe'); await window.loadAll(); });

  // XSS-проба четвёртая: «Сегодня» с героем погоды из кэша. Порог ветра
  // борта (maxWind) и циклы АКБ идут в разметку стартового экрана без
  // esc(), а из копии приходят непроверенными (закрыто нормализацией
  // в loadAll, ревью пакета 3). Заодно: null в почасовых данных кэша
  // (так Open-Meteo отдаёт пропуски) не должен ронять «Сегодня» и «Окна».
  await page.evaluate(async () => {
    const today = wxTodayISO();
    const keys = ['temperature_2m', 'wind_speed_10m', 'wind_gusts_10m', 'wind_speed_80m',
      'wind_speed_120m', 'wind_speed_180m', 'precipitation', 'precipitation_probability', 'weather_code'];
    const H = { time: [] };
    keys.forEach((k) => { H[k] = []; });
    for (let h = 0; h < 24; h++) {
      H.time.push(today + 'T' + String(h).padStart(2, '0') + ':00');
      keys.forEach((k) => H[k].push(k === 'weather_code' ? 1 : k === 'temperature_2m' ? 15 : 3));
    }
    H.wind_speed_10m[wxNowHour()] = null; // пропуск именно в текущем часе — его читает герой
    const json = { latitude: 55.7, longitude: 37.6, hourly: H,
      daily: { time: [today], sunrise: [today + 'T05:00'], sunset: [today + 'T20:00'] } };
    const tag = '<img src=x onerror="window.__xss4=1">';
    await window.RCDB.put('sites', { id: 'wx-site', name: 'Проба места', isDefault: true, lat: 55.7, lon: 37.6 });
    await window.RCDB.put('batteries', { id: 'xss-batt', label: 'Проба циклов', chem: 'lipo', charge: 'flown', cycles: tag });
    await window.RCDB.put('aircraft', { id: 'xss-wind', name: 'Проба ветра', type: 'plane', components: {},
      batteryId: 'xss-batt', maxWind: tag, maxAlt: tag });
    S.settings.weatherCache = { fetched: Date.now(), place: 'Проба места', json };
    await saveSettings();
    await window.loadAll();
    location.hash = '#/today';
  });
  await page.waitForTimeout(250);
  const todayHtml = await page.evaluate(() => document.getElementById('views').innerHTML);
  ok(todayHtml.includes('wx-hero'), '«Сегодня»: герой погоды собран из кэша с пропуском в часе');
  ok(todayHtml.includes('Зарядить: Проба циклов'), '«Сегодня»: строка «Зарядить» показана');
  ok((await page.evaluate(() => document.querySelectorAll('#views img[src="x"]').length)) === 0,
    '«Сегодня»: порог ветра и циклы из копии не стали тегом');
  ok(!(await page.evaluate(() => window.__xss4)), 'обработчик в maxWind/cycles не исполнился');
  // Путь put() → перечитка store: нормализация обязана держаться не только
  // в loadAll. Тап по чипу заряда ДРУГОЙ (чистой) АКБ перечитывает
  // batteries из базы, где циклы xss-batt лежат сырым тегом (ревью 2.0,
  // раунд 2: после первого же действия тег возвращался в разметку).
  await page.evaluate(() => { location.hash = '#/batteries'; });
  await page.waitForTimeout(200);
  await page.click('[data-act="batt-charge"][data-id="attr-batt"]');
  await page.waitForTimeout(200);
  ok((await page.evaluate(() => S.batteries.find((b) => b.id === 'xss-batt').cycles)) === 0,
    'после put() циклы из копии снова число, а не строка');
  ok((await page.evaluate(() => document.querySelectorAll('#views img[src="x"]').length)) === 0,
    'АКБ: после перечитки store тег из копии не вернулся в разметку');
  ok(!(await page.evaluate(() => window.__xss4)), 'обработчик в циклах не исполнился и после put()');
  await page.evaluate(() => { location.hash = '#/weather'; });
  await page.waitForTimeout(250);
  const wxHtml = await page.evaluate(() => document.getElementById('views').innerHTML);
  ok(wxHtml.includes('ветер у земли —'), '«Окна»: пропуск в кэше показан как «—», экран не упал');
  // «Окна» 2.0: чипы дней, полоска с выбором часа, карточка часа, fold «Все часы».
  ok((await page.locator('.day-chip').count()) === 7, '«Окна»: семь чипов дней');
  ok((await page.locator('.day-chip[aria-pressed="true"][data-day="0"]').count()) === 1, '«Окна»: активный чип — «Сегодня»');
  ok((await page.locator('.strip.tap button[data-act="weather-hour"]').count()) === 24, '«Окна»: полоска из 24 сегментов-кнопок');
  ok((await page.locator('.strip.tap button.now').count()) === 1, '«Окна»: ровно один выбранный час на полоске');
  ok((await page.locator('details.wx-fold:not([open])').count()) === 1, '«Окна»: полный список часов свёрнут в «Все часы»');
  await page.click('.strip.tap button[data-h="5"]');
  await page.waitForTimeout(120);
  ok((await page.locator('.strip.tap button.now[data-h="5"]').count()) === 1, '«Окна»: тап по сегменту выбирает час');
  ok((await page.evaluate(() => document.querySelector('.card.wx-hour').previousElementSibling.textContent)).includes('05:00'),
    '«Окна»: карточка выбранного часа перерисована на 05:00');
  ok((await page.textContent('.wxr.sel .mono')).trim() === '05:00', '«Окна»: час выделен и в полном списке');
  // Клавиатура: после Enter на сегменте/чипе разметка пересобирается,
  // paint() обязан вернуть фокус тому же элементу (ключи data-h/data-day,
  // ревью пакета 5) — иначе стрелками следующий час не выбрать.
  await page.focus('.strip.tap button[data-h="7"]');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(150);
  ok((await page.evaluate(() => document.activeElement && document.activeElement.dataset.h)) === '7',
    '«Окна»: после Enter на сегменте фокус остался на том же часе');
  await page.focus('.day-chip[data-day="0"]');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(150);
  ok((await page.evaluate(() => document.activeElement && document.activeElement.dataset.day)) === '0',
    '«Окна»: после Enter на чипе дня фокус остался на чипе');
  await page.click('.day-chip[data-day="1"]');
  await page.waitForTimeout(120);
  ok((await page.locator('.day-chip[aria-pressed="true"][data-day="1"]').count()) === 1, '«Окна»: чип дня переключает день');
  ok((await page.textContent('#views')).includes('не покрывает эту дату'), '«Окна»: день вне кэша — честный баннер, а не пустой экран');
  await page.click('.day-chip[data-day="0"]');
  await page.waitForTimeout(120);
  ok((await page.locator('.strip.tap button.now').count()) === 1 && (await page.locator('.strip.tap button.now[data-h="5"]').count()) === 0,
    '«Окна»: смена дня сбрасывает выбранный час на умолчание');
  // XSS-проба пятая: координаты кэша прогноза. latitude/longitude из
  // копии идут в data-атрибуты кнопки Windy; строка с `" autofocus
  // onfocus=` исполнялась без единого касания (финальное ревью 2.0).
  // Закрыто дважды: loadAll выбрасывает кэш с нечисловыми координатами,
  // а шаблон пишет их только через numVal — проверяем оба пути.
  const latPayload = '" autofocus onfocus="window.__xss5=1" x="';
  await page.evaluate(async (payload) => {
    const c = S.settings.weatherCache;
    S.settings.weatherCache = { fetched: c.fetched, place: c.place, json: Object.assign({}, c.json, { latitude: payload }) };
    await saveSettings();
    await window.loadAll();
    UI.wx.data = null; // как после перезагрузки: экран берёт кэш из настроек
    window.go('#/weather'); // адрес тот же — go() перерисовывает, hash сам не сработал бы
  }, latPayload);
  await page.waitForTimeout(250);
  ok(await page.evaluate(() => !S.settings.weatherCache), '«Окна»: кэш с нечисловой широтой выброшен в loadAll');
  ok((await page.locator('[data-act="wx-windy"]').count()) === 0 && (await page.locator('#views [onfocus], #views [autofocus]').count()) === 0,
    '«Окна»: кнопки Windy нет, мусор из координат не стал атрибутом');
  await page.evaluate(async (payload) => {
    // Обход loadAll: объект прогноза прямо в UI.wx (как из прошлого прогона)
    const H = { time: [], temperature_2m: [], wind_speed_10m: [], wind_gusts_10m: [], precipitation: [], precipitation_probability: [], weather_code: [] };
    const today = wxTodayISO();
    for (let h = 0; h < 24; h++) { H.time.push(today + 'T' + String(h).padStart(2, '0') + ':00'); H.temperature_2m.push(15); H.wind_speed_10m.push(3); H.wind_gusts_10m.push(4); H.precipitation.push(0); H.precipitation_probability.push(0); H.weather_code.push(1); }
    UI.wx.data = { fetched: Date.now(), place: 'Проба места', json: { latitude: payload, longitude: 37.6, hourly: H,
      daily: { time: [today], sunrise: [today + 'T05:00'], sunset: [today + 'T20:00'] } } };
    render();
  }, latPayload);
  await page.waitForTimeout(250);
  ok((await page.locator('.strip.tap button[data-act="weather-hour"]').count()) === 24, '«Окна»: прогноз с битой широтой показан');
  ok((await page.locator('[data-act="wx-windy"]').count()) === 0 && (await page.locator('#views [onfocus], #views [autofocus]').count()) === 0,
    '«Окна»: без числовых координат кнопки Windy нет, атрибут не вырвался');
  ok(!(await page.evaluate(() => window.__xss5)), 'обработчик в координатах кэша не исполнился');
  await page.evaluate(async () => {
    await window.RCDB.del('sites', 'wx-site');
    await window.RCDB.del('aircraft', 'xss-wind');
    await window.RCDB.del('batteries', 'xss-batt');
    delete S.settings.weatherCache;
    UI.wx.data = null;
    await saveSettings();
    await window.loadAll();
  });

  // Проба шестая: result полёта — ключ прототипа Object. `RESULTS[...]`
  // отдавал функцию, `.toLowerCase()` ронял «Сегодня» на старте (ревью
  // 2.0, раунд 2). Сегодняшняя дата — чтобы экран был в состоянии «разбор».
  await page.evaluate(async () => {
    const t = Date.now() - 3600000;
    await window.RCDB.put('sessions', { id: 'res-probe', aircraftId: 'attr-probe', date: todayISO(),
      start: t, end: t + 300000, durationMin: 5, flightNo: 2, result: 'constructor' });
    await window.loadAll();
    location.hash = '#/today';
  });
  await page.waitForTimeout(250);
  ok(await page.evaluate(() => !!document.querySelector('#views .stat-line')), '«Сегодня»: разбор отрисован при result «constructor»');
  ok(await page.evaluate(() => S.sessions.find((s) => s.id === 'res-probe').result === null), 'незнакомый result приведён к null');
  ok(await page.evaluate(() => resultLabel({ result: 'toString' }) === '—' && resultLabel({ result: 'crash' }) === 'Краш'),
    'resultLabel: ключ прототипа — «—», свой ключ — подпись');
  ok(errors.length === 0, 'после пробы result ошибок консоли нет' + (errors.length ? ': ' + errors.join('; ') : ''));

  // Проба седьмая: дата-тег в полёте и в работе. fmtDate возвращал
  // неразобранную строку как есть — без esc() в журнал и карточку борта.
  const dateTag = '<img src=x onerror="window.__xss7=1">';
  await page.evaluate(async (tag) => {
    await window.RCDB.put('sessions', { id: 'date-probe', aircraftId: 'attr-probe', date: tag,
      start: 10, end: 20, durationMin: 1, flightNo: 3, result: 'normal' });
    await window.RCDB.put('maintenance', { id: 'date-maint', aircraftId: 'attr-probe', title: 'Проба даты',
      kind: 'repair', date: tag, done: false, createdAt: 10 });
    await window.loadAll();
    location.hash = '#/log';
  }, dateTag);
  await page.waitForTimeout(250);
  ok((await page.evaluate(() => document.querySelectorAll('#views img[src="x"]').length)) === 0, 'журнал: дата из копии не стала тегом');
  ok(await page.evaluate(() => S.sessions.find((s) => s.id === 'date-probe').date === null), 'дата не по маске приведена к null');
  ok(await page.evaluate((tag) => !fmtDate(tag).includes('<'), dateTag), 'fmtDate: неразобранная строка экранирована');
  await page.evaluate(() => { location.hash = '#/model/attr-probe'; });
  await page.waitForTimeout(200);
  await page.click('[data-act="model-tab"][data-tab="maint"]');
  await page.waitForTimeout(200);
  ok((await page.evaluate(() => document.querySelectorAll('#views img[src="x"]').length)) === 0, 'обслуживание: дата из копии не стала тегом');
  ok(!(await page.evaluate(() => window.__xss7)), 'обработчик в дате не исполнился');
  await page.evaluate(async () => {
    await window.RCDB.del('sessions', 'res-probe');
    await window.RCDB.del('sessions', 'date-probe');
    await window.RCDB.del('maintenance', 'date-maint');
    await window.loadAll();
  });

  // Проба восьмая (аудит 2026-09-05): состояние пункта прогона чек-листа
  // идёт в data-state без esc() — строка `"><img onerror=…>` из копии
  // исполнялась в окне деталей полёта. NORM.runs оставляет только ok/fail/skip.
  const statePayload = '"><img src=x onerror="window.__xss8=1">';
  await page.evaluate(async (tag) => {
    await window.RCDB.put('runs', { id: 'state-run', aircraftId: 'attr-probe', date: todayISO(),
      items: [{ t: 'пункт', state: tag }, null, 'мусор'] });
    await window.RCDB.put('sessions', { id: 'state-sess', aircraftId: 'attr-probe', checklistRunId: 'state-run',
      date: todayISO(), start: 10, end: 20, durationMin: 1, flightNo: 4, result: 'normal' });
    await window.loadAll();
    location.hash = '#/journal';
  }, statePayload);
  await page.waitForSelector('[data-act="session-info"][data-id="state-sess"]');
  await page.click('[data-act="session-info"][data-id="state-sess"]');
  await page.waitForSelector('dialog .ck', { state: 'attached' });
  ok((await page.evaluate(() => document.querySelectorAll('dialog [onerror], dialog img[src="x"]').length)) === 0 && !(await page.evaluate(() => window.__xss8)),
    'детали полёта: состояние пункта из копии не стало тегом');
  ok(await page.evaluate(() => { const r = S.runs.find((x) => x.id === 'state-run'); return r.items.length === 1 && r.items[0].state === null; }),
    'NORM.runs: чужое состояние → null, не-объекты выброшены');
  await page.click('.dlg-close');
  await page.waitForSelector('dialog', { state: 'detached' });

  // Проба девятая: ключи прототипа в type/charge/kind/statusManual —
  // TYPES['constructor'] отдавал исходник функции в разметку как текст.
  await page.evaluate(async () => {
    await window.RCDB.put('aircraft', { id: 'proto-air', name: 'Проба ключа', type: 'constructor', statusManual: 'toString', components: {}, prepared: { runId: 42, at: 'вчера', siteId: {} } });
    await window.RCDB.put('batteries', { id: 'proto-batt', label: 'Проба заряда', chem: 'lipo', charge: 'constructor', cycles: 0 });
    await window.RCDB.put('maintenance', { id: 'proto-maint', aircraftId: 'proto-air', title: 'Проба вида', kind: 'valueOf', done: false, createdAt: 10 });
    await window.loadAll();
  });
  for (const v of ['fleet', 'batteries', 'model/proto-air']) {
    await page.evaluate((h) => { location.hash = '#/' + h; }, v);
    await page.waitForTimeout(200);
    ok(!(await page.evaluate(() => document.getElementById('views').innerText.includes('native code'))), 'экран ' + v + ': ключ прототипа не показан как функция');
  }
  ok(await page.evaluate(() => { const a = S.aircraft.find((x) => x.id === 'proto-air'); const b = S.batteries.find((x) => x.id === 'proto-batt');
    const m = S.maintenance.find((x) => x.id === 'proto-maint'); return a.type === null && a.statusManual === '' && a.prepared === null && b.charge === null && m.kind === null; }),
    'NORM: ключи прототипа и битая пометка «подготовлен» приведены к null');

  // Проба десятая: кэш прогноза с нестроковым восходом — wxDay резал его
  // slice() и ронял «Окна» (pageerror, экран не менялся). Кэш выбрасывается.
  await page.evaluate(async () => {
    const hours = Array.from({ length: 24 }, (_, i) => '2026-09-05T' + String(i).padStart(2, '0') + ':00');
    const z = hours.map(() => 0);
    S.settings.weatherCache = { fetched: Date.now(), place: 'Проба', json: { latitude: 55.7, longitude: 37.6,
      hourly: { time: hours, temperature_2m: z, wind_speed_10m: z, wind_gusts_10m: z, weather_code: z },
      daily: { time: ['2026-09-05'], sunrise: [12345], sunset: [{}] } } };
    await saveSettings();
    await window.loadAll();
    location.hash = '#/weather';
  });
  await page.waitForTimeout(250);
  ok(await page.evaluate(() => !S.settings.weatherCache), '«Окна»: кэш с нестроковым восходом выброшен в loadAll');
  ok(await page.evaluate(() => UI.view === 'weather' && document.getElementById('views').innerHTML.length > 100), '«Окна» отрисованы после порчи кэша');
  ok(errors.length === 0, 'после проб 8–10 ошибок консоли нет' + (errors.length ? ': ' + errors.join('; ') : ''));

  // Проба двенадцатая: убранный слот «Передатчик» (заменён на «ПАК» в 2.1).
  // Запись пользователя не прячем и не переписываем: строка есть у того
  // борта, где в слоте что-то лежит, и её нет у соседа того же типа.
  // Плюс components не объектом — validateBackup проверяет только id.
  await page.evaluate(async () => {
    await window.RCDB.put('aircraft', { id: 'tx-old', name: 'Борт со старым TX', type: 'plane',
      components: { tx: { name: 'RadioMaster TX16S', fw: '', notes: '' } } });
    await window.RCDB.put('aircraft', { id: 'tx-none', name: 'Борт без TX', type: 'plane', components: {} });
    await window.RCDB.put('aircraft', { id: 'tx-junk', name: 'Борт с мусором', type: 'plane', components: 'строка' });
    await window.loadAll();
  });
  const compsOn = async (id) => {
    await page.evaluate((h) => { location.hash = h; }, '#/model/' + id);
    await page.waitForTimeout(80);
    await page.click('[data-act="model-tab"][data-tab="components"]');
    await page.waitForTimeout(150);
    return page.evaluate(() => ({
      keys: [...document.querySelectorAll('[data-act="edit-comp"]')].map((b) => b.dataset.key),
      text: document.getElementById('views').textContent,
    }));
  };
  const txOld = await compsOn('tx-old');
  ok(txOld.keys.includes('tx') && txOld.text.includes('RadioMaster TX16S'),
    'старая запись «Передатчик» видна на своём борту');
  ok(!(await compsOn('tx-none')).keys.includes('tx'),
    'у соседа того же типа строки «Передатчик» нет');
  ok((await compsOn('tx-junk')).keys.length === 11,
    'components не объектом не роняет сегмент «Компоненты»');
  // Падало не на отрисовке, а на записи: в strict mode присваивание
  // свойства строке бросает TypeError — компонент не сохранялся молча.
  await page.click('[data-act="edit-comp"][data-key="motor"]');
  await page.waitForSelector('dialog form[data-form="comp"]');
  await page.fill('dialog input[name="name"]', 'Мотор после мусора');
  await page.click('dialog button[type="submit"]');
  await page.waitForSelector('dialog', { state: 'detached' });
  ok(await page.evaluate(() => {
    const a = S.aircraft.find((x) => x.id === 'tx-junk');
    return a.components && typeof a.components === 'object' && a.components.motor.name === 'Мотор после мусора';
  }), 'компонент сохраняется, даже если components из копии пришли строкой');

  // Очищенный слот уходит со строки сам — на этом держится вся затея
  // с сохранением старых записей.
  await page.evaluate((h) => { location.hash = h; }, '#/model/tx-old');
  await page.waitForTimeout(80);
  await page.click('[data-act="model-tab"][data-tab="components"]');
  await page.waitForTimeout(150);
  await page.click('[data-act="edit-comp"][data-key="tx"]');
  await page.waitForSelector('dialog form[data-form="comp"]');
  await page.fill('dialog input[name="name"]', '');
  await page.click('dialog button[type="submit"]');
  await page.waitForSelector('dialog', { state: 'detached' });
  ok((await page.locator('[data-act="edit-comp"][data-key="tx"]').count()) === 0,
    'очищенное старое поле «Передатчик» уходит со строки само');
  ok(await page.evaluate(() => !('tx' in S.aircraft.find((x) => x.id === 'tx-old').components)),
    'пустая запись компонента не остаётся в базе');

  // Проба тринадцатая: комплектация копии из чужой резервной копии.
  // validateBackup проверяет только id, поэтому значения произвольны:
  // копия обязана получить только строки, а мусор не тащить. Мелкая
  // копия (components образца как есть) протащила бы объект и число.
  await page.evaluate(async () => {
    await window.RCDB.put('aircraft', { id: 'clone-src', name: 'Образец с мусором', type: 'plane',
      components: { motor: { name: { bad: 1 }, fw: 5, notes: null }, prop: 'строка' } });
    await window.loadAll();
    location.hash = '#/model/clone-src';
  });
  await page.waitForTimeout(150);
  await page.click('[data-act="clone-model"]');
  await page.waitForSelector('dialog form[data-form="model"][data-clone]');
  await page.click('dialog button[type="submit"]');
  await page.waitForTimeout(250);
  ok(await page.evaluate(() => {
    const c = S.aircraft.find((a) => a.id !== 'clone-src' && String(a.name).startsWith('Образец с мусором'));
    if (!c || !c.components) return false;
    const m = c.components.motor || {};
    return typeof m.name === 'string' && typeof m.fw === 'string' && typeof m.notes === 'string'
      && !('prop' in c.components);
  }), 'комплектация копии приведена к строкам, мусор не протащен');

  // Проба одиннадцатая: свой шаблон чек-листа из копии. Пункты не массивом
  // роняли «Шаблоны» (t.items.length), форму шаблона и смену шаблона на
  // чек-листе; ключ прототипа в типе показывал исходник функции, как в
  // пробе 9; нестроковый текст пункта ронял перечисление проблем (lower).
  await page.evaluate(async () => {
    await window.RCDB.put('templates', { id: 'bad-tpl', name: 'Проба шаблона', type: 'constructor', builtin: true, items: 'не массив' });
    await window.RCDB.put('templates', { id: 'bad-tpl2', name: 'Проба пунктов', type: 'any', items: [{ t: {} }, null, 'строка', { t: 'Целый пункт' }] });
    await window.RCDB.put('aircraft', { id: 'tpl-air', name: 'Борт для шаблона', type: 'quad', batteryId: null, components: {} });
    await window.loadAll();
    location.hash = '#/templates';
  });
  await page.waitForTimeout(250);
  ok(await page.evaluate(() => UI.view === 'templates' && document.getElementById('views').innerText.includes('Проба шаблона')),
    '«Шаблоны» отрисованы со сломанным шаблоном из копии');
  ok(!(await page.evaluate(() => document.getElementById('views').innerText.includes('native code'))),
    '«Шаблоны»: ключ прототипа в типе не показан как функция');
  ok(await page.evaluate(() => {
    const t = S.templates.find((x) => x.id === 'bad-tpl'); const t2 = S.templates.find((x) => x.id === 'bad-tpl2');
    return Array.isArray(t.items) && t.items.length === 0 && t.type === 'any' && t.builtin !== true
      && t2.items.length === 1 && t2.items[0].t === 'Целый пункт';
  }), 'NORM: пункты шаблона — массив объектов со строковым текстом, тип из словаря');
  // Форма шаблона и подготовка на сломанном шаблоне
  await page.click('[data-act="edit-template"][data-id="bad-tpl"]');
  ok(await page.waitForSelector('dialog[open] textarea[name="items"]', { timeout: 3000 }).then(() => true, () => false),
    'форма своего шаблона открывается со сломанными пунктами');
  await page.keyboard.press('Escape');
  await page.waitForSelector('dialog', { state: 'detached' });
  await page.evaluate(() => { location.hash = '#/prep'; });
  await page.waitForSelector('[data-act="prep-model"][data-id="tpl-air"]');
  await page.click('[data-act="prep-model"][data-id="tpl-air"]');
  await page.waitForSelector('select[name="tpl"]');
  await page.selectOption('select[name="tpl"]', 'bad-tpl2');
  await page.waitForTimeout(250);
  ok(await page.evaluate(() => UI.prep && UI.prep.tplId === 'bad-tpl2' && document.querySelectorAll('.ck').length === 1),
    'чек-лист на своём шаблоне из копии: остался один целый пункт');
  await page.click('.st[data-act="ck-menu"][data-i="0"]');
  await page.waitForSelector('.ck-menu [data-act="ck-set"][data-state="fail"]');
  await page.click('.ck-menu [data-act="ck-set"][data-state="fail"]');
  await page.waitForTimeout(250);
  ok(await page.evaluate(() => document.querySelector('.act-bar .banner.warn') !== null),
    'перечисление проблем не падает на пункте из копии');
  ok(errors.length === 0, 'после пробы 11 ошибок консоли нет' + (errors.length ? ': ' + errors.join('; ') : ''));

  await page.evaluate(async () => {
    UI.prep = null;
    for (const [st, id] of [['runs', 'state-run'], ['sessions', 'state-sess'], ['aircraft', 'proto-air'], ['batteries', 'proto-batt'], ['maintenance', 'proto-maint'], ['templates', 'bad-tpl'], ['templates', 'bad-tpl2'], ['aircraft', 'tpl-air']]) await window.RCDB.del(st, id);
    await window.loadAll();
  });

  // Модальное окно закрывается.
  await page.evaluate(() => { location.hash = '#/more'; });
  await page.click('[data-act="whatsnew"]');
  ok(await page.isVisible('dialog'), 'окно «Что нового» открылось');
  await page.click('.dlg-close');
  // С анимациями окно уезжает до 200 мс и только потом удаляется — ждём узел.
  const closed = await page.waitForSelector('dialog', { state: 'detached', timeout: 3000 }).then(() => true, () => false);
  ok(closed, 'окно закрылось');

  ok(errors.length === 0, 'ошибок консоли нет' + (errors.length ? ': ' + errors.join('; ') : ''));

  // CSP с хэшами (2.0.1): inline-обработчик, попавший в разметку мимо
  // esc(), браузер обязан не исполнить. Проба — последняя: отказ CSP
  // пишется в консоль как ошибка, и это здесь ожидаемо.
  const before = errors.length;
  await page.evaluate(() => {
    const d = document.createElement('div');
    d.innerHTML = '<img src=x onerror="window.__cspProbe=1">';
    document.body.appendChild(d);
  });
  await page.waitForTimeout(300);
  ok(!(await page.evaluate(() => window.__cspProbe)), 'CSP: inline-обработчик onerror не исполнился');
  ok(errors.slice(before).some((e) => /Content Security Policy/i.test(e)), 'CSP: отказ зафиксирован в консоли');
  await browser.close();
  finish('test:audit');
})().catch((e) => { console.error(e); process.exit(1); });
