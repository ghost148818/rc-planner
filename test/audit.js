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
  'more', 'tools', 'sites', 'batteries', 'templates', 'backup', 'privacy'];

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
    location.hash = '#/log'; // не #/journal: после обхода экранов сегмент стоит на «Статистике»
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
  await page.evaluate(() => { location.hash = '#/weather'; });
  await page.waitForTimeout(250);
  const wxHtml = await page.evaluate(() => document.getElementById('views').innerHTML);
  ok(wxHtml.includes('ветер у земли —'), '«Окна»: пропуск в кэше показан как «—», экран не упал');
  await page.evaluate(async () => {
    await window.RCDB.del('sites', 'wx-site');
    await window.RCDB.del('aircraft', 'xss-wind');
    await window.RCDB.del('batteries', 'xss-batt');
    delete S.settings.weatherCache;
    await saveSettings();
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
  await browser.close();
  finish('test:audit');
})().catch((e) => { console.error(e); process.exit(1); });
