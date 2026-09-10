// Набор 6: экраны с ПОСЕЯННЫМИ данными по public/. Аудит (набор 2)
// гоняет пустую базу, на ней большинство экранов — пустые состояния;
// здесь сеются три борта, четыре АКБ, 14 полётов, открытая работа,
// поддельный кэш прогноза и просроченная резервная копия — и проходятся
// все экраны, «Сегодня» — во всех четырёх состояниях дня.
// Проверки: ошибок консоли нет, горизонтальной прокрутки нет, кнопки,
// строки и селекты не ниже порога касания, «Взлёт» есть ровно на поле,
// «Посадка» — на активном полёте, баннер копии — при копии 20 дней назад.
// Скриншоты — test/shots/seeded/ (для проверки глазами до/после выкладки).
// Наружу ничего не ходит: прогноз — поддельный кэш в settings.
// Данные вымышленные; имя пилота — «Пилот».
'use strict';

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { ok, finish, serve, newPage } = require('./helpers');

const PUB = path.join(__dirname, '..', 'public');
const OUT = path.join(__dirname, 'shots', 'seeded');

// Порог касания: 44 px, в перчатках 52 — для ВСЕХ кнопок, ссылок-кнопок,
// строк и селектов без исключений. Токен --seg (сегменты, малые кнопки,
// чипы, пилюли, кнопки шапки) поднят до тех же 44/52 по финальному
// ревью 2.0: прежнее исключение «по токену» отключало порог для самых
// частых кнопок («Чек-лист», сегменты, «Назад», «Открыть» в каталоге).
const TAP_MIN = 44;
const TAP_MIN_GLOVES = 52;

// Поддельный прогноз на 7 дней от «сегодня» по МСК: тот же формат, что
// отдаёт Open-Meteo, — приложение читает его из кэша без запросов.
// Барические уровни — с геопотенциалом НАД УРОВНЕМ МОРЯ (как у API):
// высота над землёй = геопотенциал минус ELEV, и она «дышит» от часа
// к часу — код обязан считать её по часу, а не брать из таблицы.
// Числа взяты из живого замера 2026-09-10 (975 гПа ≈ 166 м над землёй,
// 700 гПа ≈ 2937 м).
const ELEV = 152;
const PRES = [[975, 318], [950, 541], [925, 770], [900, 1003], [875, 1245],
  [850, 1486], [825, 1740], [800, 1993], [775, 2260], [750, 2530], [700, 3089], [650, 3681]];
function fakeForecast() {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Moscow' });
  const d = new Date(today);
  const days = [];
  for (let i = 0; i < 7; i++) { const x = new Date(d); x.setDate(d.getDate() + i); days.push(x.toISOString().slice(0, 10)); }
  const H = { time: [], temperature_2m: [], wind_speed_10m: [], wind_gusts_10m: [], wind_speed_80m: [], wind_speed_120m: [], wind_speed_180m: [], wind_speed_200m: [], precipitation: [], precipitation_probability: [], weather_code: [] };
  for (const [hpa] of PRES) { H['wind_speed_' + hpa + 'hPa'] = []; H['geopotential_height_' + hpa + 'hPa'] = []; }
  days.forEach((day, di) => {
    for (let h = 0; h < 24; h++) {
      const w = 3 + 6 * Math.abs(Math.sin((h + di * 3) / 5));
      H.time.push(day + 'T' + String(h).padStart(2, '0') + ':00');
      H.temperature_2m.push(Math.round(12 + 8 * Math.sin((h - 6) / 24 * Math.PI * 2)));
      H.wind_speed_10m.push(+w.toFixed(1));
      H.wind_gusts_10m.push(+(w * 1.5).toFixed(1));
      H.wind_speed_80m.push(+(w * 1.3).toFixed(1));
      H.wind_speed_120m.push(+(w * 1.45).toFixed(1));
      H.wind_speed_180m.push(+(w * 1.6).toFixed(1));
      H.wind_speed_200m.push(+(w * 1.65).toFixed(1));
      PRES.forEach(([hpa, g]) => {
        const agl = g - ELEV;
        H['wind_speed_' + hpa + 'hPa'].push(+(w * (1 + agl / 900)).toFixed(1));
        H['geopotential_height_' + hpa + 'hPa'].push(g + Math.round(14 * Math.sin((h + di) / 3)));
      });
      H.precipitation.push(h >= 16 && h <= 18 && di === 0 ? 0.4 : 0);
      H.precipitation_probability.push(h >= 15 && h <= 19 && di === 0 ? 60 : 5);
      H.weather_code.push(h >= 16 && h <= 18 && di === 0 ? 61 : h < 8 ? 2 : 1);
    }
  });
  return { fetched: Date.now() - 20 * 60000, place: 'Поле у реки', json: {
    latitude: 55.6, longitude: 37.9, elevation: ELEV, hourly: H,
    daily: { time: days, sunrise: days.map((x) => x + 'T05:41'), sunset: days.map((x) => x + 'T19:22') },
  } };
}

// Посев: состояние «дома» — без подготовленного борта, без полётов за
// сегодня, без активного полёта. Остальные состояния дня получаются
// дописыванием (см. поток ниже). Копия — 20 дней назад: баннер обязан быть.
async function seed(page) {
  await page.evaluate(async (wx) => {
    const now = Date.now(), day = 86400000;
    const iso = (t) => new Date(t).toLocaleDateString('en-CA');
    const put = (s, o) => window.RCDB.put(s, o);
    await put('sites', { id: 'site-1', name: 'Поле у реки', place: 'Подмосковье', lat: 55.6, lon: 37.9, isDefault: true });
    await put('sites', { id: 'site-2', name: 'Склон', place: 'Крылатское', lat: 55.76, lon: 37.43 });
    await put('batteries', { id: 'b1', label: 'LiPo 6S 1300 #1', chem: 'LiPo', cells: 6, p: 1, capacity: 1300, weight: 220, cycles: 41, charge: 'ready', status: 'ok' });
    await put('batteries', { id: 'b2', label: 'LiPo 6S 1300 #2', chem: 'LiPo', cells: 6, p: 1, capacity: 1300, weight: 220, cycles: 38, charge: 'flown', status: 'ok' });
    await put('batteries', { id: 'b3', label: 'Li-Ion 6S2P 7000', chem: 'Li-Ion', cells: 6, p: 2, capacity: 7000, weight: 610, cycles: 12, charge: 'ready', status: 'ok' });
    await put('batteries', { id: 'b4', label: 'LiPo 4S 1500', chem: 'LiPo', cells: 4, p: 1, capacity: 1500, weight: 180, cycles: 97, charge: '', status: 'watch' });
    await put('aircraft', { id: 'a1', name: 'Apex 5″', type: 'quad', manufacturer: 'ImpulseRC', weight: 520, wingspan: 225, maxWind: 20, maxAlt: 60, batteryId: 'b1', components: { motor: { name: 'T-Motor F60 Pro V 2550KV' }, esc: { name: 'Hobbywing 60A 4in1' }, fc: { name: 'Speedybee F405 V4', fw: 'Betaflight 4.5.1' }, rx: { name: 'ELRS EP1', fw: '3.5.1' }, vtx: { name: 'Walksnail Avatar V2', fw: '38.44.13' } }, svcEvery: 10, createdAt: now - 60 * day, notes: 'Новые PID после замены моторов' });
    await put('aircraft', { id: 'a2', name: 'Mini Talon', type: 'plane', manufacturer: 'X-UAV', weight: 1100, wingspan: 1300, maxAlt: 150, batteryId: 'b3', components: { motor: { name: 'SunnySky 2216 1250KV' }, fc: { name: 'Matek F405-WTE', fw: 'INAV 7.1' }, gps: { name: 'M10' } }, svcEveryMin: 180, createdAt: now - 90 * day });
    await put('aircraft', { id: 'a3', name: 'Крыло AR Wing Pro', type: 'wing', manufacturer: 'SonicModell', weight: 700, wingspan: 900, batteryId: null, components: {}, createdAt: now - 30 * day });
    let no = 0;
    for (let i = 13; i >= 0; i--) {
      // 14 полётов за последние четыре недели, последний — вчера; f7 — краш
      const t = now - (i * 2 + 1) * day - 3600000 * (i % 4);
      const aid = ['a1', 'a1', 'a2', 'a3'][i % 4];
      await put('sessions', { id: 'f' + i, aircraftId: aid, date: iso(t), start: t, end: t + 6 * 60000, landedAt: t + 6 * 60000, durationMin: aid === 'a2' ? 22 : 6, flightNo: ++no, batteryId: aid === 'a2' ? 'b3' : 'b1', siteId: i % 3 ? 'site-1' : 'site-2', weather: 'ветер 4 м/с, +17°', result: i === 7 ? 'crash' : 'normal', notes: i === 0 ? 'Отлично летал, новые PID' : '', problems: i === 7 ? 'Порвал луч о ветку' : '' });
    }
    await put('maintenance', { id: 'm1', aircraftId: 'a3', title: 'Замена луча №2', kind: 'repair', date: iso(now - 15 * day), reason: 'краш об ветку', next: 'заказать луч', done: false, createdAt: now - 15 * day });
    await put('maintenance', { id: 'm2', aircraftId: 'a1', title: 'Осмотр после сезона', kind: 'inspection', date: iso(now - 40 * day), done: true, createdAt: now - 40 * day, doneAt: now - 40 * day });
    await put('runs', { id: 'r1', aircraftId: 'a1', date: iso(now), templateName: 'FPV квадрокоптер', items: [{ t: 'Пропеллеры', state: 'ok' }, { t: 'Моторы', state: 'ok' }] });
    const st = (await window.RCDB.get('settings', 'main')) || { id: 'main', pilot: '', favTools: [] };
    st.pilot = 'Пилот'; st.weatherCache = wx; st.favTools = ['betaflight-app', 'elrs-web-flasher'];
    st.lastBackupAt = now - 20 * day;
    await put('settings', st);
    // Фото для просмотра во весь экран: рисуем canvas'ом — посев остаётся
    // офлайн и не тянет файлов. Кадры НЕ квадратные: вписывание в рамку
    // и ограничение панорамы иначе не проверить.
    const shot = (w, h, bg, text) => new Promise((res) => {
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const g = c.getContext('2d');
      g.fillStyle = bg; g.fillRect(0, 0, w, h);
      g.fillStyle = '#fff'; g.font = 'bold 120px sans-serif'; g.textBaseline = 'middle';
      g.fillText(text, 60, h / 2);
      c.toBlob(res, 'image/png');
    });
    const a1rec = await window.RCDB.get('aircraft', 'a1');
    a1rec.photo = await shot(1200, 800, '#2b6cb0', 'APEX');
    await put('aircraft', a1rec);
    const m2rec = await window.RCDB.get('maintenance', 'm2');
    m2rec.photo = await shot(900, 1200, '#9b2c2c', 'DMG');
    await put('maintenance', m2rec);
    localStorage.setItem('rcp.hi', '1');
    await window.loadAll();
  }, fakeForecast());
}

// Переходы состояний дня — прямой записью в базу (как это сделали бы
// действия приложения), затем loadAll(). Гард takeoffReady не обходится:
// «Взлёт» рисует только он.
const STATE_STEPS = {
  // поле: чек-лист пройден только что, основная локация
  field: async (page) => page.evaluate(async () => {
    const a = await window.RCDB.get('aircraft', 'a1');
    a.prepared = { runId: 'r1', at: Date.now(), siteId: 'site-1' };
    await window.RCDB.put('aircraft', a);
    await window.loadAll();
  }),
  // в полёте: взлёт снял подготовку, полёт идёт две с половиной минуты
  flying: async (page) => page.evaluate(async () => {
    const a = await window.RCDB.get('aircraft', 'a1');
    delete a.prepared;
    await window.RCDB.put('aircraft', a);
    await window.RCDB.put('sessions', { id: 'live', aircraftId: 'a1', date: new Date().toLocaleDateString('en-CA'), start: Date.now() - 154000, end: null, durationMin: null, flightNo: 15, batteryId: 'b1', siteId: 'site-1', weather: '', result: '', notes: '', problems: '', checklistRunId: 'r1' });
    await window.loadAll();
  }),
  // разбор: полёт записан, АКБ разряжена — «Разобраться» непустой
  debrief: async (page) => page.evaluate(async () => {
    const s = await window.RCDB.get('sessions', 'live');
    s.landedAt = s.landedAt || Date.now();
    s.end = s.landedAt; s.durationMin = Math.max(1, Math.round((s.end - s.start) / 60000));
    s.result = 'normal';
    await window.RCDB.put('sessions', s);
    const b = await window.RCDB.get('batteries', 'b1');
    b.charge = 'flown';
    await window.RCDB.put('batteries', b);
    await window.loadAll();
  }),
};

// Проверки одного экрана: горизонтальная прокрутка и размеры касания.
async function checkScreen(page, tag, name, viewport, gloves) {
  const r = await page.evaluate((min) => {
    const hscroll = document.scrollingElement.scrollWidth - window.innerWidth;
    // Только то, что нарисовано: скрытые (hidden/display:none) и
    // нулевые по размеру элементы пользователь не нажимает. a.btn —
    // ссылки-кнопки каталога инструментов («Открыть»); label.check-row —
    // строка чекбокса в формах («Выполнено», «Основная локация»): сам
    // input 22 px, цель касания — подпись (ревью 2.0, раунд 2).
    const els = [...document.querySelectorAll('button, a.btn, .row, select, label.check-row')];
    const short = [];
    els.forEach((el) => {
      const b = el.getBoundingClientRect();
      if (!b.height || !b.width) return;
      if (b.height < min - 0.5) {
        const id = el.dataset.act || el.dataset.nav || el.name || el.className || el.tagName;
        short.push(`${el.tagName.toLowerCase()}[${id}] ${Math.round(b.height)}px < ${min}`);
      }
    });
    return { hscroll, short };
  }, gloves ? TAP_MIN_GLOVES : TAP_MIN);
  ok(r.hscroll <= 1, `${tag}/${name}: без горизонтальной прокрутки`);
  ok(r.short.length === 0, `${tag}/${name}: кнопки, строки и селекты не ниже порога касания` +
    (r.short.length ? ` — ${r.short.length}: ${r.short.slice(0, 6).join('; ')}` : ''));
}

// Печать журнала (2.0.3): printLog() вставляет #print-area, @media print
// прячет остальное. Проверяем под эмуляцией печатного носителя и на
// настоящем PDF: лист белый (тёмный фон тела иначе уходит на холст листа
// и печатается чёрным в обеих темах), на листе только таблица, в ней все
// полёты, длинная заметка без пробелов не уводит таблицу за край листа
// (текст молча обрезался). Утверждения о ЧИСЛЕ страниц нет: оно одинаково
// до и после починки (замер 2026-09-07), как регрессия бесполезно.
async function checkPrint(page, tag, viewport) {
  await page.setViewportSize({ width: 794, height: 1123 }); // A4 в CSS-пикселях
  await page.evaluate(async () => {
    const long = 'Ж'.repeat(90); // длинное слово без пробелов — проба на обрезку
    const s = await window.RCDB.get('sessions', 'f0');
    const a = await window.RCDB.get('aircraft', 'a1');
    const b = await window.RCDB.get('batteries', 'b1');
    const site = await window.RCDB.get('sites', 'site-1');
    window.__was = { notes: s.notes, name: a.name, label: b.label, site: site.name };
    s.notes = long; a.name = long; b.label = long; site.name = long;
    for (const [store, rec] of [['sessions', s], ['aircraft', a], ['batteries', b], ['sites', site]]) await window.RCDB.put(store, rec);
    await window.loadAll();
    window.__print = window.print; // системный диалог в headless не нужен
    window.print = () => {};
    window.printLog();
  });
  await page.emulateMedia({ media: 'print' });
  const r = await page.evaluate(() => {
    const cs = (el) => getComputedStyle(el);
    const clear = (c) => c === 'transparent' || c === 'rgba(0, 0, 0, 0)';
    const area = document.getElementById('print-area');
    const table = area && area.querySelector('table');
    const html = cs(document.documentElement).backgroundColor;
    const body = cs(document.body).backgroundColor;
    return {
      html, body,
      // холст листа красится фоном html, а при прозрачном html — фоном body
      canvas: clear(html) ? body : html,
      area: area ? cs(area).display : 'нет',
      views: cs(document.getElementById('views')).display,
      tabbar: cs(document.getElementById('tabbar')).display,
      rows: area ? area.querySelectorAll('tbody tr').length : 0,
      done: S.sessions.filter((x) => x.end).length,
      tableW: table ? Math.round(table.getBoundingClientRect().width) : 0,
      sheetW: document.documentElement.clientWidth,
      // Шапка в одну строку: разреши перенос по буквам всем ячейкам —
      // колонки сожмутся до минимума и порежут слова («Лока/ция»)
      headH: table ? Math.round(table.querySelector('thead tr').getBoundingClientRect().height) : 0,
    };
  });
  ok(r.area === 'block' && r.views === 'none' && r.tabbar === 'none',
    `${tag}: печать — на листе только таблица журнала`);
  ok(r.rows === r.done && r.rows >= 14, `${tag}: печать — в таблице все полёты (${r.rows} из ${r.done})`);
  ok(r.canvas === 'rgb(255, 255, 255)', `${tag}: печать — лист белый (html ${r.html}, body ${r.body})`);
  ok(r.tableW <= r.sheetW, `${tag}: печать — длинные имя борта, АКБ, локации и заметка не уводят таблицу за край листа (${r.tableW} при листе ${r.sheetW})`);
  ok(r.headH <= 40, `${tag}: печать — заголовки колонок не разрезаны переносом (шапка ${r.headH} px)`);
  await page.emulateMedia({ media: null });
  await page.evaluate(() => { window.dispatchEvent(new Event('afterprint')); });
  ok(await page.evaluate(() => !document.getElementById('print-area')),
    `${tag}: печать — после печати область убрана со страницы`);
  // Настоящий PDF: БЕЗ printBackground тёмной заливки в файле нет вовсе,
  // и проверка была бы зелёной на сломанном коде. Область готовим заново —
  // page.pdf сам возбуждает события печати и убирает её обработчиком.
  await page.evaluate(() => { window.printLog(); });
  await page.pdf({ path: path.join(OUT, `${tag}-print-journal.pdf`), format: 'A4', printBackground: true });
  await page.evaluate(async () => {
    window.dispatchEvent(new Event('afterprint'));
    window.print = window.__print; delete window.__print;
    const w = window.__was; delete window.__was;
    const s = await window.RCDB.get('sessions', 'f0');
    const a = await window.RCDB.get('aircraft', 'a1');
    const b = await window.RCDB.get('batteries', 'b1');
    const site = await window.RCDB.get('sites', 'site-1');
    s.notes = w.notes; a.name = w.name; b.label = w.label; site.name = w.site;
    for (const [store, rec] of [['sessions', s], ['aircraft', a], ['batteries', b], ['sites', site]]) await window.RCDB.put(store, rec);
    await window.loadAll();
  });
  await page.setViewportSize(viewport);
}

// Ожидание перерисовки вместо пауз: paint() заменяет содержимое #views
// целиком, поэтому новый первый потомок — признак, что она случилась.
// С анимациями (RCP_MOTION=1) разметка меняется в колбэке View
// Transition, не сразу после клика, — читать DOM без ожидания нельзя.
const stamp = (page) => page.evaluate(() => { window.__seedMark = document.querySelector('#views').firstElementChild; });
const painted = (page) => page.waitForFunction(() => document.querySelector('#views').firstElementChild !== window.__seedMark);

// Переход — через go(): при том же адресе он перерисовывает экран сам
// (onRoute пропускает hashchange на прежний маршрут).
async function nav(page, hash) {
  await stamp(page);
  await page.evaluate((h) => { window.go(h); }, hash);
  await painted(page);
}

// Один прогон: тема · размер · перчатки. Список экранов один на все прогоны.
async function run(browser, tag, opts) {
  const { context, page, errors } = await newPage(browser, { viewport: opts.viewport, colorScheme: opts.theme, deviceScaleFactor: opts.scale || 1 });
  await page.goto(opts.url);
  await page.waitForSelector('#tabbar .tab');
  await seed(page);
  await page.evaluate(({ theme, gloves }) => {
    localStorage.setItem('rcp.theme', theme);
    if (gloves) localStorage.setItem('rcp.gloves', '1'); else localStorage.removeItem('rcp.gloves');
    window.applyTheme();
  }, { theme: opts.theme, gloves: !!opts.gloves });
  if (opts.gloves) ok(await page.evaluate(() => document.documentElement.hasAttribute('data-gloves')), `${tag}: режим «В перчатках» включён`);

  const shot = async (name, hash, pre, opts2) => {
    await nav(page, hash);
    if (pre) await pre(page);
    await checkScreen(page, tag, name, opts.viewport, !!opts.gloves);
    await page.screenshot({ path: path.join(OUT, `${tag}-${name}.png`), fullPage: !(opts2 && opts2.viewportOnly) });
  };
  const has = (sel) => page.evaluate((s) => !!document.querySelector(s), sel);
  const count = (sel) => page.evaluate((s) => document.querySelectorAll(s).length, sel);

  // --- Сегодня: дома ---
  await shot('today-home', '#/today');
  ok(!(await has('[data-act="takeoff-prepared"]')), `${tag}: дома кнопки «Взлёт» нет`);
  ok(await has('.banner.backup'), `${tag}: баннер резервной копии показан (копия 20 дней назад)`);
  ok(await has('.wx-hero'), `${tag}: герой погоды из кэша на «Сегодня»`);

  // --- Флот, карточка борта (четыре сегмента) ---
  await shot('fleet', '#/fleet');
  ok((await count('#views .row')) >= 3, `${tag}: во флоте три борта`);
  ok(await has('.head .head-help[data-nav="#/help/fleet"]') && await has('.head .head-act'),
    `${tag}: в шапке «Флота» кнопка «?» рядом с «Добавить»`);
  await shot('model-overview', '#/model/a1');
  ok(await has('.model-tabs [data-tab="overview"][aria-pressed="true"]'), `${tag}: карточка борта открывается на «Обзоре»`);
  ok(await has('.hero-batt button.chip[data-act="batt-charge"][data-id="b1"]'),
    `${tag}: в карточке борта чип заряда рядом с пилюлей АКБ`);
  for (const t of ['components', 'maint', 'history']) {
    await shot('model-' + t, '#/model/a1', async (p) => {
      await p.click(`[data-act="model-tab"][data-tab="${t}"]`);
      await p.waitForSelector(`.model-tabs [data-tab="${t}"][aria-pressed="true"]`);
    });
    ok(await has(`.model-tabs [data-tab="${t}"][aria-pressed="true"]`), `${tag}: сегмент «${t}» включается`);
  }
  await shot('model-plane', '#/model/a2');

  // Слоты оборудования зависят от типа борта (2.1): трубка Пито и ПАК —
  // только у самолёта и крыла, убранного «Передатчика» нет ни у кого.
  const compKeys = async (id) => {
    await nav(page, '#/model/' + id);
    await page.click('[data-act="model-tab"][data-tab="components"]');
    await page.waitForSelector('.model-tabs [data-tab="components"][aria-pressed="true"]');
    return page.evaluate(() => [...document.querySelectorAll('[data-act="edit-comp"]')].map((b) => b.dataset.key));
  };
  const quadKeys = await compKeys('a1');
  ok(!quadKeys.includes('pitot') && !quadKeys.includes('pak'),
    `${tag}: у квада нет слотов «Трубка Пито» и «ПАК»`);
  ok(quadKeys.length === 9, `${tag}: у квада девять строк компонентов (${quadKeys.length})`);
  const planeKeys = await compKeys('a2');
  ok(planeKeys.includes('pitot') && planeKeys.includes('pak'),
    `${tag}: у самолёта есть «Трубка Пито» и «ПАК»`);
  ok(planeKeys.length === 11, `${tag}: у самолёта одиннадцать строк компонентов (${planeKeys.length})`);
  ok(!quadKeys.includes('tx') && !planeKeys.includes('tx'),
    `${tag}: убранного слота «Передатчик» нет ни у квада, ни у самолёта`);
  await shot('model-plane-components', '#/model/a2', async (p) => {
    await p.click('[data-act="model-tab"][data-tab="components"]');
    await p.waitForSelector('.model-tabs [data-tab="components"][aria-pressed="true"]');
  });

  // --- Фото во весь экран ---
  await nav(page, '#/model/a1');
  await page.click('.model-hero [data-photo="aircraft"]');
  await page.waitForSelector('dialog.photo[open] .pv-img');
  ok(await page.evaluate(() => {
    const d = document.querySelector('dialog.photo');
    return Math.abs(d.getBoundingClientRect().height - window.innerHeight) < 2;
  }), `${tag}: просмотр фото — на весь экран, а не лист на 92 %`);
  ok(await page.evaluate(() => {
    const img = document.querySelector('.pv-img'), v = img.parentElement;
    const r = img.getBoundingClientRect(), b = v.getBoundingClientRect();
    return r.width <= b.width + 1 && r.height <= b.height + 1 && r.width > b.width * 0.5;
  }), `${tag}: снимок вписан в рамку целиком`);
  ok(await page.evaluate(() => {
    const t = document.querySelector('#views img.thumb, #views .thumb-btn img');
    return !t || t.src === document.querySelector('.pv-img').src;
  }), `${tag}: просмотр берёт ссылку из общего кэша, нового URL не создаёт`);
  await checkScreen(page, tag, 'photo-view', opts.viewport, !!opts.gloves);
  await page.screenshot({ path: path.join(OUT, `${tag}-photo-view.png`) });

  await page.click('[data-act="photo-zoom"][data-d="1"]');
  await page.waitForFunction(() => /scale\(2\)/.test(document.querySelector('.pv-img').style.transform));
  ok((await page.textContent('.pv-scale')) === '200%', `${tag}: «+» увеличивает вдвое, масштаб подписан`);
  await page.click('[data-act="photo-zoom"][data-d="-1"]');
  await page.waitForFunction(() => {
    const t = document.querySelector('.pv-img').style.transform;
    return /scale\(1\)/.test(t) && /translate\(0px, 0px\)/.test(t);
  });
  ok(true, `${tag}: «−» возвращает 100 % и сбрасывает панораму`);

  // Щипок двумя пальцами идёт теми же pointer-обработчиками
  const pinched = await page.evaluate(() => {
    const v = document.querySelector('.pv-view'), r = v.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const ev = (t, id, x, y) => v.dispatchEvent(new PointerEvent(t, {
      pointerId: id, pointerType: 'touch', clientX: x, clientY: y, bubbles: true, isPrimary: id === 1 }));
    ev('pointerdown', 1, cx - 40, cy); ev('pointerdown', 2, cx + 40, cy);
    ev('pointermove', 1, cx - 120, cy); ev('pointermove', 2, cx + 120, cy);
    ev('pointerup', 1, cx - 120, cy); ev('pointerup', 2, cx + 120, cy);
    return document.querySelector('.pv-img').style.transform;
  });
  ok(/scale\((?:[2-9]|1\.[5-9])/.test(pinched), `${tag}: щипок двумя пальцами увеличивает фото (${pinched})`);

  await page.keyboard.press('Escape');
  await page.waitForSelector('dialog', { state: 'detached' });
  ok(!(await page.evaluate(() => document.body.classList.contains('locked'))),
    `${tag}: Esc закрывает просмотр и снимает замок страницы`);

  // Тап по снимку в строке «Флота» открывает просмотр, а не карточку борта
  await nav(page, '#/fleet');
  await page.click('.fleet-row img[data-photo="aircraft"]');
  await page.waitForSelector('dialog.photo[open]');
  ok((await page.evaluate(() => location.hash)) === '#/fleet',
    `${tag}: тап по снимку в строке не уводит в карточку борта`);
  await page.keyboard.press('Escape');
  await page.waitForSelector('dialog', { state: 'detached' });

  // Снимок повреждения в истории работ лежит внутри кнопки записи
  await nav(page, '#/model/a1');
  await page.click('[data-act="model-tab"][data-tab="maint"]');
  await page.waitForSelector('img[data-photo="maintenance"]');
  await page.click('img[data-photo="maintenance"]');
  await page.waitForSelector('dialog.photo[open] .pv-img');
  ok((await page.locator('dialog form[data-form="maint"]').count()) === 0,
    `${tag}: снимок в истории работ открывает просмотр, а не форму записи`);
  await page.keyboard.press('Escape');
  await page.waitForSelector('dialog', { state: 'detached' });

  // --- Полёт, выбор борта, чек-лист ---
  await shot('flight', '#/flight');
  ok(await has('[data-act="start-prep"]'), `${tag}: на «Полёте» есть «Начать полёт»`);
  await shot('prep', '#/prep');
  ok((await count('[data-act="prep-model"]')) === 3, `${tag}: выбор борта — три строки`);
  await shot('checklist', '#/prep', async (p) => {
    await p.click('[data-act="prep-model"][data-id="a2"]');
    await p.waitForSelector('.ck-main[data-i="0"]');
    await p.click('.ck-main[data-i="0"]');
    await p.waitForSelector('.ck[data-state="ok"] > .ck-main[data-i="0"]');
    await p.click('.ck-main[data-i="1"]');
    await p.waitForSelector('.ck[data-state="ok"] > .ck-main[data-i="1"]');
    await p.click('.st[data-act="ck-menu"][data-i="2"]');
    await p.waitForSelector('.ck-menu');
    await p.click('[data-act="ck-set"][data-i="2"][data-state="fail"]');
    await p.waitForSelector('.ck[data-state="fail"]');
  });
  ok((await count('.ck[data-state="ok"]')) === 2 && (await count('.ck[data-state="fail"]')) === 1,
    `${tag}: чек-лист — два «ок» и одна «проблема»`);
  ok(await has('.act-bar'), `${tag}: липкая панель действий чек-листа на месте`);
  ok(await has('.prep-batt button.chip.st-ready[data-id="b3"]'),
    `${tag}: на чек-листе виден чип заряда АКБ — «заряжен»`);
  ok(await has('[data-act="start-flight"]'), `${tag}: с отмеченным зарядом «Начать полёт» есть`);
  // АКБ без состояния (b4 посеяна с пустым charge): полёт не начать,
  // «Отметить готовым» остаётся; тап по чипу возвращает кнопку.
  // Чек-лист уже открыт (UI.prep жив): адрес тот же, борт выбирать не надо
  await shot('checklist-nocharge', '#/prep', async (p) => {
    await p.selectOption('select[name="prepBatt"]', 'b4');
    await p.waitForSelector('.act-bar .banner.nocharge');
  });
  ok(!(await has('[data-act="start-flight"]')), `${tag}: АКБ без отметки заряда — «Начать полёт» нет`);
  ok(await has('[data-act="prep-done"]'), `${tag}: «Отметить готовым» остаётся и без отметки заряда`);
  ok(await has('.prep-batt button.chip.st-unknown[data-id="b4"]'), `${tag}: чип «заряд?» у АКБ без состояния`);
  await page.click('.prep-batt button.chip[data-act="batt-charge"]');
  await page.waitForSelector('[data-act="start-flight"]');
  ok(await has('.prep-batt button.chip.st-ready[data-id="b4"]'),
    `${tag}: тап по чипу — «заряжен», «Начать полёт» появилась`);
  // Вернуть посев: b3 обратно в борт, b4 снова без состояния
  await page.selectOption('select[name="prepBatt"]', 'b3');
  await page.waitForSelector('.prep-batt button.chip.st-ready[data-id="b3"]');
  await page.evaluate(async () => {
    const b = await window.RCDB.get('batteries', 'b4');
    b.charge = ''; await window.RCDB.put('batteries', b); await window.loadAll();
  });
  await stamp(page);
  await page.click('[data-act="cancel-prep"]');
  await painted(page);
  ok(await has('[data-act="start-prep"]'), `${tag}: отмена подготовки возвращает на «Полёт»`);

  // --- Подготовка не сбрасывается: отметки живут до взлёта или сброса ---
  // Сценарий владельца: прошли чек-лист, отметили готовым, ушли, вернулись.
  await nav(page, '#/prep');
  await page.click('[data-act="prep-model"][data-id="a2"]');
  await page.waitForSelector('.ck-main[data-i="0"]');
  await page.click('.ck-main[data-i="0"]');
  await page.waitForSelector('.ck[data-state="ok"] > .ck-main[data-i="0"]');
  await page.click('.ck-main[data-i="1"]');
  await page.waitForSelector('.ck[data-state="ok"] > .ck-main[data-i="1"]');
  await stamp(page);
  await page.click('[data-act="prep-done"]');
  await painted(page);
  await page.waitForSelector('[data-act="prep-model"][data-id="a2"]');
  ok((await page.textContent('[data-act="prep-model"][data-id="a2"]')).includes('подготовлен в'),
    `${tag}: после «Отметить готовым» борт помечен подготовленным`);
  await shot('checklist-kept', '#/prep', async (p) => {
    await p.click('[data-act="prep-model"][data-id="a2"]');
    await p.waitForSelector('[data-act="cancel-prep"]');
  });
  ok((await count('.ck[data-state="ok"]')) === 2, `${tag}: чек-лист открыт снова — обе отметки на месте`);
  ok((await page.textContent('[data-act="cancel-prep"]')).includes('Сбросить'),
    `${tag}: у подготовленного борта кнопка «Сбросить подготовку»`);
  await page.reload();
  await page.waitForSelector('#tabbar .tab');
  await nav(page, '#/prep');
  await page.click('[data-act="prep-model"][data-id="a2"]');
  await page.waitForSelector('.ck-main[data-i="0"]');
  ok((await count('.ck[data-state="ok"]')) === 2, `${tag}: отметки пережили перезапуск приложения`);
  // Сброс — с подтверждением: снимает пометку, удаляет прогон, открывает чистый
  await page.click('[data-act="cancel-prep"]');
  await page.waitForSelector('dialog[open] [data-act="cancel-prep-reset"]');
  await page.click('[data-act="cancel-prep-reset"]');
  await page.waitForSelector('dialog', { state: 'detached' });
  await page.waitForFunction(() => document.querySelector('.ck-main[data-i="0"]') && !document.querySelector('.ck[data-state="ok"]'));
  ok(await page.evaluate(async () => !(await window.RCDB.get('aircraft', 'a2')).prepared),
    `${tag}: сброс снял пометку «подготовлен» в базе`);
  ok(await page.evaluate(() => !S.runs.some((r) => r.aircraftId === 'a2') && S.runs.some((r) => r.id === 'r1')),
    `${tag}: сброс удалил прогон борта, чужие прогоны целы`);
  ok(!(await page.textContent('[data-act="cancel-prep"]')).includes('Сбросить'),
    `${tag}: после сброса кнопка снова «Отменить подготовку»`);
  await stamp(page);
  await page.click('[data-act="cancel-prep"]');
  await painted(page);
  ok(await has('[data-act="start-prep"]') && !(await page.textContent('#views')).includes('Подготовка не закончена'),
    `${tag}: отмена возвращает на «Полёт» без баннера незаконченной подготовки`);

  // --- Сегодня: на поле ---
  await STATE_STEPS.field(page);
  await shot('today-field', '#/today');
  ok((await count('[data-act="takeoff-prepared"]')) >= 1, `${tag}: на поле есть кнопка «Взлёт»`);
  ok(await has('.card.hero'), `${tag}: на поле герой — подготовленный борт`);
  ok(await has('.banner.backup'), `${tag}: баннер копии виден и на поле`);
  // Взлёт тоже начинает полёт: без отметки заряда вместо кнопки чип,
  // но борт остаётся героем «на поле» (решение владельца 2026-09-07).
  await page.evaluate(async () => {
    const b = await window.RCDB.get('batteries', 'b1');
    b.charge = ''; await window.RCDB.put('batteries', b); await window.loadAll();
  });
  await nav(page, '#/today');
  ok(!(await has('[data-act="takeoff-prepared"]')), `${tag}: без отметки заряда кнопки «Взлёт» нет`);
  ok(await has('.card.hero'), `${tag}: борт без отметки заряда остаётся героем «на поле»`);
  ok(await has('.card.hero .banner.nocharge button.chip[data-act="batt-charge"]'),
    `${tag}: в герое — подсказка и чип заряда`);
  await checkScreen(page, tag, 'today-field-nocharge', opts.viewport, !!opts.gloves);
  await page.screenshot({ path: path.join(OUT, `${tag}-today-field-nocharge.png`), fullPage: true });
  await nav(page, '#/flight');
  ok(await has('.card.flat button.chip[data-act="batt-charge"][data-id="b1"]') && !(await has('[data-act="takeoff-prepared"]')),
    `${tag}: в «Готовы к вылету» вместо «Взлёт» тот же чип`);
  await nav(page, '#/today');
  // Промашка двойным касанием: кнопка «Взлёт» появляется РОВНО на месте
  // чипа, и второе касание начинало полёт мимо гарда (ревью 2.0.3).
  const chipBox = await page.locator('.card.hero .banner.nocharge button.chip').boundingBox();
  await page.mouse.click(chipBox.x + chipBox.width / 2, chipBox.y + chipBox.height / 2);
  await page.waitForTimeout(150);
  await page.mouse.click(chipBox.x + chipBox.width / 2, chipBox.y + chipBox.height / 2);
  await page.waitForTimeout(500);
  ok(await page.evaluate(() => !S.sessions.some((s) => !s.end) && !location.hash.startsWith('#/session/')),
    `${tag}: двойное касание по чипу не начинает полёт`);
  ok(await page.evaluate(() => (S.batteries.find((b) => b.id === 'b1') || {}).charge === 'ready'),
    `${tag}: двойное касание не переводит свежий «заряжен» в «после полёта»`);
  ok(await has('[data-act="takeoff-prepared"]'), `${tag}: тап по чипу вернул кнопку «Взлёт»`);

  // --- Сегодня: в полёте; экран полёта; посадка ---
  await STATE_STEPS.flying(page);
  await shot('today-flying', '#/today');
  ok(!(await has('[data-act="takeoff-prepared"]')), `${tag}: в полёте кнопки «Взлёт» нет`);
  ok(await has('#timer'), `${tag}: в полёте на «Сегодня» живой таймер`);
  ok(await has('[data-act="land-flight"]'), `${tag}: в полёте на «Сегодня» есть «Посадка»`);
  await shot('session', '#/session/live');
  ok(await has('[data-act="land-flight"]'), `${tag}: на активном полёте есть кнопка «Посадка»`);
  ok(await has('.ring'), `${tag}: кольцо таймера на экране полёта`);
  await shot('session-landed', '#/session/live', async (p) => {
    await p.click('[data-act="land-flight"]');
    await p.waitForSelector('[data-act="resume-flight"]');
  });
  ok(await has('[data-act="finish-flight"]') && await has('[data-act="resume-flight"]'),
    `${tag}: после посадки — «Записать итог» и «Продолжить полёт»`);
  ok(!(await has('[data-act="land-flight"]')), `${tag}: после посадки кнопки «Посадка» нет`);

  // --- Сегодня: разбор ---
  await STATE_STEPS.debrief(page);
  await shot('today-debrief', '#/today');
  ok(!(await has('[data-act="takeoff-prepared"]')), `${tag}: в разборе кнопки «Взлёт» нет`);
  ok(await has('.stat-line'), `${tag}: в разборе плитки дня`);
  ok(await has('[data-act="batt-charge"], [data-act="batts-charged-all"]'), `${tag}: в «Разобраться» — зарядить АКБ`);

  // --- Журнал: полёты, статистика, меню ---
  await shot('journal-log', '#/journal');
  ok((await count('#views .row')) >= 10, `${tag}: журнал показывает полёты`);
  await shot('journal-stats', '#/journal', async (p) => {
    await p.click('[data-act="journal-tab"][data-tab="stats"]');
    await p.waitForSelector('[data-act="journal-tab"][data-tab="stats"][aria-pressed="true"]');
  });
  ok(await has('[data-act="journal-tab"][data-tab="stats"][aria-pressed="true"]'), `${tag}: вкладка «Статистика» включается`);
  const menuOpen = () => { const m = document.getElementById('journal-menu'); return !!m && (typeof m.togglePopover === 'function' ? m.matches(':popover-open') : !m.hidden); };
  await shot('journal-menu', '#/journal', async (p) => {
    await p.click('[data-act="journal-tab"][data-tab="log"]');
    await p.waitForSelector('[data-act="journal-tab"][data-tab="log"][aria-pressed="true"]');
    await p.click('[data-act="journal-menu"]');
    await p.waitForFunction(menuOpen);
  }, { viewportOnly: true });
  ok(await page.evaluate(menuOpen), `${tag}: меню журнала открывается`);
  await page.keyboard.press('Escape');
  await checkPrint(page, tag, opts.viewport);

  // --- Окна для полётов: кэш, чипы дней, полоска часов ---
  await shot('weather', '#/weather', async (p) => {
    await stamp(p);
    await p.selectOption('select[name="wxmodel"]', 'a1');
    await painted(p);
    // weather-site только запоминает выбор (без render) — ждать нечего
    await p.selectOption('select[name="wxsite"]', 'site-1');
  });
  ok((await count('[data-act="weather-day"]')) === 7, `${tag}: окна — семь чипов дней`);
  ok((await count('.strip.tap [data-act="weather-hour"]')) === 24, `${tag}: окна — полоска из 24 часов`);

  // Высота полёта: меню значений и расчёт по барическим уровням (2.1)
  ok((await count('[data-act="wx-alt-menu"]')) === 1, `${tag}: окна — кнопка выбора высоты`);
  await page.click('[data-act="wx-alt-menu"]');
  await page.waitForFunction(() => {
    const m = document.getElementById('wx-alt-menu');
    return m && (typeof m.togglePopover === 'function' ? m.matches(':popover-open') : !m.hidden);
  });
  ok((await count('#wx-alt-menu [data-act="wx-alt-set"]')) === 31,
    `${tag}: в меню высоты тридцать значений и «по карточке борта»`);
  ok(await page.evaluate(() => {
    const r = document.getElementById('wx-alt-menu').getBoundingClientRect();
    return r.top >= 0 && r.bottom <= window.innerHeight + 1;
  }), `${tag}: меню высоты помещается на экран целиком`);
  await checkScreen(page, tag, 'weather-alt-menu', opts.viewport, !!opts.gloves);
  await page.screenshot({ path: path.join(OUT, `${tag}-weather-alt-menu.png`) });
  await page.click('#wx-alt-menu [data-alt="1500"]');
  await painted(page);
  ok((await page.textContent('.wx-strip-sub')).includes('до 1500 м (выбрано)'),
    `${tag}: выбранная высота видна в подписи полоски`);
  ok(/На 1[0-9]{3} м/.test(await page.textContent('.wx-hour .kv')),
    `${tag}: карточка часа считает ветер на барическом уровне`);
  // Высота уровня обязана меняться по часам: одинаковая на все 24 часа
  // означала бы, что её взяли из таблицы, а не из геопотенциала.
  ok(await page.evaluate(() => {
    const j = UI.wx.data.json;
    const i = (j.daily.time || []).indexOf(wxTodayISO());
    return new Set(wxDay(j, i, 16, 1500).hours.map((x) => x.top)).size > 1;
  }), `${tag}: высота барического уровня пересчитывается по каждому часу`);
  // Выбор экрана в карточку борта не протекает
  ok(await page.evaluate(() => (S.aircraft.find((a) => a.id === 'a1') || {}).maxAlt === 60),
    `${tag}: высота в карточке борта не изменилась`);
  await page.selectOption('select[name="wxmodel"]', 'a2');
  await painted(page);
  ok((await page.textContent('[data-act="wx-alt-menu"]')).includes('По карточке борта'),
    `${tag}: смена борта сбрасывает выбранную высоту`);

  // --- Остальные экраны ---
  await shot('packing', '#/packing');
  // Набор сборов: пункт — кнопка .ck-main высотой с клетку (финальное
  // ревью 2.0: 40-пиксельная полоса внутри строки 65 px — тап мимо).
  const packId = await page.evaluate(() => S.packing[0] && S.packing[0].id);
  ok(!!packId, `${tag}: стартовые наборы сборов посеяны`);
  await shot('pack', '#/pack/' + packId);
  ok((await count('.ck > .ck-main[data-act="pack-toggle"]')) >= 3, `${tag}: пункты набора — кнопки на всю строку`);
  await shot('more', '#/more');
  await shot('tools', '#/tools');
  await shot('batteries', '#/batteries');
  ok((await count('#views .row')) >= 4, `${tag}: четыре АКБ в списке`);
  await shot('sites', '#/sites');
  await shot('backup', '#/backup');
  ok(await page.evaluate(() => document.body.textContent.includes('Последняя копия')), `${tag}: «Данные» показывают дату последней копии`);
  await shot('privacy', '#/privacy');
  // Инструкция: без id открыт первый раздел; #/help/<id> — только он,
  // и страница прокручена к нему (кнопка «?» экрана).
  await shot('help', '#/help');
  ok((await count('.help details.fold')) >= 14 && (await count('.help details.fold[open]')) === 1
    && await has('#help-start[open]'), `${tag}: «Инструкция» — разделы свёрнуты, открыт первый`);
  await shot('help-section', '#/help/flight', null, { viewportOnly: true });
  ok((await count('.help details.fold[open]')) === 1 && await has('#help-flight[open]'), `${tag}: #/help/flight открывает раздел «Чек-лист и полёт»`);
  ok(await page.evaluate(() => Math.abs(document.getElementById('help-flight').getBoundingClientRect().top) < 60),
    `${tag}: страница прокручена к открытому разделу`);
  await shot('form-model', '#/model/a1', async (p) => { await p.click('[data-act="edit-model"]'); await p.waitForSelector('dialog[open]'); }, { viewportOnly: true });
  // prefers-reduced-motion обязан гасить и затемнение под окном: ::backdrop —
  // псевдоэлемент, универсальный * его не выбирает (финальное ревью 2.0).
  // С RCP_MOTION=1 контекст без reduce — там проверять нечего.
  if (!process.env.RCP_MOTION) {
    const dur = await page.evaluate(() => {
      const d = document.querySelector('dialog[open]');
      return d ? getComputedStyle(d).transitionDuration + ' | ' + getComputedStyle(d, '::backdrop').transitionDuration : 'нет окна';
    });
    ok(dur === '0s | 0s', `${tag}: при reduced-motion окно и ::backdrop без переходов (${dur})`);
  }
  await page.keyboard.press('Escape');
  // Формы с чекбоксами: «Основная локация» и «Выполнено» — их строки
  // тоже обязаны быть не ниже порога касания (label.check-row в выборке).
  await shot('form-site', '#/sites', async (p) => { await p.click('[data-act="edit-site"][data-id="site-1"]'); await p.waitForSelector('dialog[open] label.check-row'); }, { viewportOnly: true });
  ok(await has('dialog[open] input[name="isDefault"]:checked'), `${tag}: форма локации — «Основная локация» отмечена`);
  await page.keyboard.press('Escape');
  await shot('form-maint', '#/model/a3', async (p) => {
    await p.click('[data-act="model-tab"][data-tab="maint"]');
    await p.waitForSelector('[data-act="edit-maint"][data-id="m1"]');
    await p.click('[data-act="edit-maint"][data-id="m1"]');
    await p.waitForSelector('dialog[open] label.check-row');
  }, { viewportOnly: true });
  ok(await has('dialog[open] input[name="done"]'), `${tag}: форма обслуживания — чекбокс «Выполнено» на месте`);
  await page.keyboard.press('Escape');

  ok(errors.length === 0, `${tag}: ошибок консоли нет` + (errors.length ? ': ' + errors.slice(0, 3).join('; ') : ''));
  await context.close();
}

(async () => {
  // Папка снимков чистится: устаревшие файлы от прежних прогонов не должны
  // выдавать себя за свежие (и не должны раздувать счётчик в конце).
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await serve(PUB);
  const browser = await chromium.launch();
  const phone = { width: 390, height: 844 };
  await run(browser, 'dark', { url: srv.url, viewport: phone, theme: 'dark', scale: 2 });
  await run(browser, 'light', { url: srv.url, viewport: phone, theme: 'light', scale: 2 });
  await run(browser, 'gloves', { url: srv.url, viewport: phone, theme: 'dark', gloves: true, scale: 2 });
  await run(browser, 'desktop', { url: srv.url, viewport: { width: 1280, height: 800 }, theme: 'dark' });

  // Приветствие первого запуска: контекст без rcp.hi (welcome: true —
  // helpers не гасят окно). Три шага, «Дальше» → «Начать» засчитывает
  // просмотр, крестик — тоже; «Начало работы» на пустой базе — пять шагов.
  {
    const { context, page, errors } = await newPage(browser, { viewport: phone, colorScheme: 'dark', deviceScaleFactor: 2, welcome: true });
    await page.goto(srv.url);
    await page.waitForSelector('dialog.welcome[open]');
    ok((await page.locator('dialog.welcome .dots i').count()) === 3, 'приветствие: три шага');
    ok((await page.locator('dialog.welcome .dots i.on').count()) === 1, 'приветствие: отмечен первый шаг');
    ok(!(await page.locator('#views .banner').count()), 'приветствие: старого баннера «Понятно» на «Сегодня» нет');
    await page.screenshot({ path: path.join(OUT, 'dark-welcome.png') });
    await page.click('dialog.welcome [data-act="welcome-next"]');
    await page.waitForSelector('dialog.welcome [data-act="welcome-next"][data-step="2"]');
    await page.click('dialog.welcome [data-act="welcome-next"]');
    await page.waitForSelector('dialog.welcome [data-act="welcome-done"]');
    ok((await page.locator('dialog.welcome .dots i.on').count()) === 1, 'приветствие: на третьем шаге кнопка «Начать»');
    await page.click('dialog.welcome [data-act="welcome-done"]');
    await page.waitForSelector('dialog', { state: 'detached' });
    ok(await page.evaluate(() => localStorage.getItem('rcp.hi') === '1'), 'после «Начать» приветствие засчитано');
    ok(await page.evaluate(() => document.body.textContent.includes('Начало работы · осталось 5 из 5')),
      '«Начало работы» на «Сегодня» — пять шагов');
    ok((await page.locator('[data-act="export-all"]').count()) === 1, 'пятый шаг — резервная копия — ведёт к действию');
    await page.evaluate(() => { localStorage.removeItem('rcp.hi'); });
    await page.reload();
    await page.waitForSelector('dialog.welcome[open]');
    await page.click('dialog.welcome .dlg-close');
    await page.waitForSelector('dialog', { state: 'detached' });
    ok(await page.evaluate(() => localStorage.getItem('rcp.hi') === '1'), 'закрытие крестиком тоже засчитывается');
    await page.reload();
    await page.waitForSelector('#tabbar .tab');
    await page.waitForTimeout(150);
    ok(!(await page.locator('dialog.welcome').count()), 'после закрытия приветствие при запуске не возвращается');
    // «Пройти обучение заново» открывает приветствие поверх «Ещё»
    await page.evaluate(() => { location.hash = '#/more'; });
    await page.waitForSelector('[data-act="restart-tour"]');
    await page.click('[data-act="restart-tour"]');
    await page.waitForSelector('dialog.welcome[open]');
    ok(true, '«Пройти обучение заново» открывает приветствие');
    ok(errors.length === 0, 'приветствие: ошибок консоли нет' + (errors.length ? ': ' + errors.slice(0, 3).join('; ') : ''));
    await context.close();
  }

  // «Пройти обучение заново» на ПОЛНОЙ базе: у опытного пилота все пять
  // шагов давно сделаны, поэтому обучение считает только сделанное после
  // перезапуска — иначе блок был бы бессмысленным. Проверяем весь путь:
  // пять из пяти → шаг пройден и зачёркнут → блок исчез, метка снята.
  {
    const { context, page, errors } = await newPage(browser, { viewport: phone, colorScheme: 'dark', deviceScaleFactor: 2 });
    await page.goto(srv.url);
    await page.waitForSelector('#tabbar .tab');
    await seed(page);
    const text = () => page.evaluate(() => document.body.textContent);
    const cnt = (sel) => page.evaluate((s) => document.querySelectorAll(s).length, sel);
    await nav(page, '#/more');
    await page.click('[data-act="restart-tour"]');
    await page.waitForSelector('dialog.welcome[open]');
    await page.click('dialog.welcome [data-act="welcome-next"]');
    await page.waitForSelector('dialog.welcome [data-act="welcome-next"][data-step="2"]');
    await page.click('dialog.welcome [data-act="welcome-next"]');
    await page.waitForSelector('dialog.welcome [data-act="welcome-done"]');
    await page.click('dialog.welcome [data-act="welcome-done"]');
    await page.waitForSelector('[data-act="dismiss-tour"]');
    ok(await page.evaluate(() => +localStorage.getItem('rcp.tour') > 1e12), 'обучение: в rcp.tour метка времени перезапуска');
    ok((await text()).includes('Обучение · осталось 5 из 5'), 'обучение: на полной базе пять шагов заново');
    ok((await cnt('#views .t[style*="line-through"]')) === 0, 'обучение: старые записи не засчитываются');
    await page.screenshot({ path: path.join(OUT, 'dark-tour.png'), fullPage: true });
    // Шаг «Добавьте борт» проходим руками — по пути проверяем баннер карточки
    await page.click('#views [data-act="add-model"]');
    await page.waitForSelector('dialog [data-act="model-preset"][data-i="0"]');
    await page.click('dialog [data-act="model-preset"][data-i="0"]');
    await page.waitForSelector('dialog form[data-form="model"]');
    await page.click('dialog form[data-form="model"] button[type="submit"]');
    await page.waitForSelector('.banner.ok [data-nav="#/today"]');
    const tops = await page.evaluate(() => [...document.querySelectorAll('.banner.ok .btn')].map((b) => Math.round(b.getBoundingClientRect().top)));
    ok(tops.length === 2 && tops[0] === tops[1], 'обучение: «Во «Флот»» и «К обучению» на одной высоте (' + tops.join(', ') + ')');
    await page.screenshot({ path: path.join(OUT, 'dark-model-created.png'), fullPage: true });
    await stamp(page);
    await page.click('.banner.ok [data-nav="#/today"]');
    await painted(page);
    ok((await text()).includes('Обучение · осталось 4 из 5'), 'обучение: шаг с бортом засчитан');
    ok((await cnt('#views .t[style*="line-through"]')) === 1, 'обучение: пройденный шаг зачёркнут');
    // Остальные шаги — записью в базу (как это сделали бы действия приложения)
    await page.evaluate(async () => {
      const now = Date.now();
      const a = S.aircraft.slice().sort((x, y) => (+y.createdAt || 0) - (+x.createdAt || 0))[0];
      await window.RCDB.put('batteries', { id: 'tour-b', label: 'LiPo 4S 1800', chem: 'LiPo', cells: 4, p: 1, capacity: 1800, weight: 210, cycles: 0, charge: 'ready', status: 'ok', createdAt: now });
      a.batteryId = 'tour-b';
      await window.RCDB.put('aircraft', a);
      await window.RCDB.put('sites', { id: 'tour-s', name: 'Новое поле', place: 'Рядом', lat: 55.5, lon: 37.5, createdAt: now });
      // дата вчерашняя: состояние дня должно остаться «дома», считается end
      const day = new Date(now - 86400000).toLocaleDateString('en-CA');
      await window.RCDB.put('sessions', { id: 'tour-f', aircraftId: a.id, date: day, start: now - 300000, end: now, landedAt: now, durationMin: 5, flightNo: 1, batteryId: 'tour-b', siteId: 'tour-s', weather: '', result: 'normal', notes: '', problems: '' });
      const st = await window.RCDB.get('settings', 'main');
      st.lastBackupAt = now;
      await window.RCDB.put('settings', st);
      await window.loadAll();
    });
    await nav(page, '#/today');
    const done = await text();
    ok(!done.includes('Обучение · осталось') && !(await cnt('[data-act="dismiss-tour"]')),
      'обучение: после всех пяти шагов блок исчез');
    ok(await page.evaluate(() => !localStorage.getItem('rcp.tour')), 'обучение: метка снята сама');
    ok(errors.length === 0, 'обучение: ошибок консоли нет' + (errors.length ? ': ' + errors.slice(0, 3).join('; ') : ''));
    await context.close();
  }
  await browser.close();
  await srv.close();
  const shots = fs.readdirSync(OUT).filter((f) => f.endsWith('.png'));
  ok(shots.length >= 100, `скриншоты записаны в test/shots/seeded/ (${shots.length})`);
  finish('test:seeded');
})().catch((e) => { console.error(e); process.exit(1); });
