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
function fakeForecast() {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Moscow' });
  const d = new Date(today);
  const days = [];
  for (let i = 0; i < 7; i++) { const x = new Date(d); x.setDate(d.getDate() + i); days.push(x.toISOString().slice(0, 10)); }
  const H = { time: [], temperature_2m: [], wind_speed_10m: [], wind_gusts_10m: [], wind_speed_80m: [], wind_speed_120m: [], wind_speed_180m: [], precipitation: [], precipitation_probability: [], weather_code: [] };
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
      H.precipitation.push(h >= 16 && h <= 18 && di === 0 ? 0.4 : 0);
      H.precipitation_probability.push(h >= 15 && h <= 19 && di === 0 ? 60 : 5);
      H.weather_code.push(h >= 16 && h <= 18 && di === 0 ? 61 : h < 8 ? 2 : 1);
    }
  });
  return { fetched: Date.now() - 20 * 60000, place: 'Поле у реки', json: {
    latitude: 55.6, longitude: 37.9, hourly: H,
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
  await shot('model-overview', '#/model/a1');
  ok(await has('.model-tabs [data-tab="overview"][aria-pressed="true"]'), `${tag}: карточка борта открывается на «Обзоре»`);
  for (const t of ['components', 'maint', 'history']) {
    await shot('model-' + t, '#/model/a1', async (p) => {
      await p.click(`[data-act="model-tab"][data-tab="${t}"]`);
      await p.waitForSelector(`.model-tabs [data-tab="${t}"][aria-pressed="true"]`);
    });
    ok(await has(`.model-tabs [data-tab="${t}"][aria-pressed="true"]`), `${tag}: сегмент «${t}» включается`);
  }
  await shot('model-plane', '#/model/a2');

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
  await stamp(page);
  await page.click('[data-act="cancel-prep"]');
  await painted(page);
  ok(await has('[data-act="start-prep"]'), `${tag}: отмена подготовки возвращает на «Полёт»`);

  // --- Сегодня: на поле ---
  await STATE_STEPS.field(page);
  await shot('today-field', '#/today');
  ok((await count('[data-act="takeoff-prepared"]')) >= 1, `${tag}: на поле есть кнопка «Взлёт»`);
  ok(await has('.card.hero'), `${tag}: на поле герой — подготовленный борт`);
  ok(await has('.banner.backup'), `${tag}: баннер копии виден и на поле`);

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
  await browser.close();
  await srv.close();
  const shots = fs.readdirSync(OUT).filter((f) => f.endsWith('.png'));
  ok(shots.length >= 100, `скриншоты записаны в test/shots/seeded/ (${shots.length})`);
  finish('test:seeded');
})().catch((e) => { console.error(e); process.exit(1); });
